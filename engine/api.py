"""FastAPI service for the valuation engine.  Run:  uvicorn api:app --port 8000  (from engine/)."""
from __future__ import annotations

import json
import os
import pickle
import sys
import threading
import time
import uuid
from datetime import datetime, timezone
from functools import lru_cache

import h3
import numpy as np
import pandas as pd
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import aef
import features as F
import narrative as N
import portfolio as PF
import reality as RL
import train as T  # noqa: F401  (Engine class must be importable for unpickling)
from common import ART, PROC, RAW, haversine_km, norm_loc

sys.modules["__main__"].Engine = T.Engine  # pickled from train.py run as __main__
ENG: T.Engine = pickle.load(open(ART / "engine.pkl", "rb"))
POIS = F.PoiIndex(pd.read_parquet(PROC / "pois.parquet"))
REF = ENG.comps_ref.reset_index(drop=True)
COMPS = F.CompsIndex(REF.lat.values, REF.lon.values, REF.y.values)
STATES = {"maharashtra", "karnataka", "gujarat", "kerala", "punjab", "haryana", "rajasthan", "tamil nadu", "telangana",
          "andhra pradesh", "uttar pradesh", "madhya pradesh", "west bengal", "bihar", "odisha", "assam", "jharkhand",
          "uttarakhand", "himachal pradesh", "chhattisgarh"}
CITIES = ENG.city_stats.dropna(subset=["lat"])
CITIES = CITIES[~CITIES.city.isin(STATES)].reset_index(drop=True)
GAZ = pd.read_parquet(PROC / "gazetteer.parquet")
LISTINGS = pd.read_parquet(PROC / "listings.parquet", columns=["city", "lat", "lon", "ppsf", "source"])
A = ENG.assumptions
T_WAIVE, T_DESK = 0.16, 0.26
GROUPS = [
    ("Micro-market comparables", lambda c: c.startswith("knn_")),
    ("Satellite context", lambda c: c.startswith("sat")),
    ("Transit & amenities access", lambda c: c.startswith(("d_", "n1_", "n3_")) and c != "d_centre"),
    ("Distance to city centre", lambda c: c in ("d_centre", "lat", "lon")),
    ("Size & layout", lambda c: c in ("area_sqft", "log_area", "bhk", "area_per_bhk", "bathrooms", "balcony")),
    ("Floor & building", lambda c: c in ("floor", "total_floors", "floor_ratio", "high_rise")),
    ("Project amenities", lambda c: c in ("amenity_score", "gymnasium", "swimmingpool", "liftavailable", "clubhouse",
                                          "secsecurity", "parking", "covered_parking", "overlook_park", "overlook_main_road")),
    ("Listing & title attributes", lambda c: True),
]


def _build_place_index():
    """Local place search: our gazetteer + all OSM place names (no external geocoder)."""
    import json
    cache = PROC / "places.parquet"  # compact extract of OSM places, shipped with the repo
    if cache.exists():
        p = pd.read_parquet(cache)
    else:
        els = json.load(open(RAW / "osm" / "places.json", encoding="utf-8"))["elements"]
        rows = [(e["tags"].get("name:en") or e["tags"].get("name"), e["tags"].get("place"), e["lat"], e["lon"])
                for e in els if e.get("lat") and (e["tags"].get("name:en") or e["tags"].get("name"))]
        p = pd.DataFrame(rows, columns=["name", "place", "lat", "lon"])
        p.to_parquet(cache)
    p = p[p.name.str.contains(r"[A-Za-z]", regex=True)]
    rank = {"city": 0, "town": 1, "suburb": 2, "neighbourhood": 3, "quarter": 3, "locality": 4, "village": 5, "hamlet": 6}
    p["rank"] = p.place.map(rank).fillna(7)
    p["key"] = p.name.map(norm_loc)
    # nearest covered city for context
    tree = F.BallTree(np.radians(CITIES[["lat", "lon"]].values), metric="haversine")
    d, i = tree.query(np.radians(p[["lat", "lon"]].values), k=1)
    p["city"] = CITIES.city.values[i[:, 0]]
    p["city_km"] = d[:, 0] * F.R_EARTH
    # listing density boosts places we actually know
    known = set(zip(REF.city, REF.locality.fillna("").map(norm_loc)))  # localities with listing evidence
    p["known"] = [(c, k) in known for c, k in zip(p.city, p.key)]
    return p.reset_index(drop=True)


PLACES = _build_place_index()

app = FastAPI(title="Naksha valuation engine")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class ValueIn(BaseModel):
    lat: float
    lon: float
    area_sqft: float = Field(950, ge=150, le=15000)
    area_basis: str = "carpet"  # carpet | builtup | super
    bhk: float = Field(2, ge=0.5, le=8)
    ptype: str = "flat"  # flat | independent house | villa | penthouse | studio apartment
    floor: float | None = 4
    total_floors: float | None = 12
    transaction: str = "resale"
    furnishing: str = "Semi-Furnished"
    bathrooms: float | None = 2
    parking: float | None = 1
    covered_parking: float | None = 1
    amenities: list[str] = []  # gymnasium, swimmingpool, liftavailable, clubhouse, secsecurity, overlook_park
    age_years: float | None = None
    loan_amount: float | None = None
    facing: str = "Unknown"  # North | North - East | East | South - East | South | South -West | West | North - West
    label: str | None = None
    # market reality: facts the model cannot see (all optional)
    legal_status: str = "freehold"
    oc_status: str = "oc"
    rera_status: str = "registered"
    builder: str = "regional"
    factors: list[str] = []
    declared_value: float | None = None
    valuer_value: float | None = None
    prev_price: float | None = None
    prev_year: float | None = None
    related_party: bool = False


FACINGS = ["North", "North - East", "East", "South - East", "South", "South -West", "West", "North - West"]


def clean(o):
    """Make a response JSON-safe: NaN/inf -> None, numpy scalars -> python."""
    if isinstance(o, dict):
        return {k: clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [clean(v) for v in o]
    if isinstance(o, (np.floating, float)):
        f = float(o)
        return f if np.isfinite(f) else None
    if isinstance(o, np.integer):
        return int(o)
    return o


def nearest_city(lat, lon):
    d = haversine_km(lat, lon, CITIES.lat.values, CITIES.lon.values)
    i = int(np.argmin(d))
    return CITIES.iloc[i], float(d[i])


def frame_for(q: ValueIn, city_row, source="mb2023") -> pd.DataFrame:
    basis = {"carpet": 1.0, "builtup": 0.88, "super": 0.78}.get(q.area_basis, 1.0)
    row = {
        "lat": q.lat, "lon": q.lon, "city": city_row.city, "centre_lat": city_row.lat, "centre_lon": city_row.lon,
        "area_sqft": q.area_sqft * basis, "bhk": q.bhk, "ptype": q.ptype, "floor": q.floor, "total_floors": q.total_floors,
        "bathrooms": q.bathrooms, "parking": q.parking, "covered_parking": q.covered_parking,
        "furnishing": q.furnishing, "transaction": q.transaction, "ownership": "Freehold", "facing": q.facing if q.facing in FACINGS else "Unknown",
        "source": source, "posted_by": "nan", "geo": "loc_exact" if source != "hppc" else "point",
        "overlook_park": 1.0 if "overlook_park" in q.amenities else 0.0, "overlook_main_road": 0.0,
        "rera": 1.0, "under_construction": 1.0 if q.transaction == "new" else 0.0,
    }
    am = ["gymnasium", "swimmingpool", "liftavailable", "clubhouse", "secsecurity"]
    for a in am:
        row[a] = 1.0 if a in q.amenities else 0.0
    row["amenity_score"] = np.mean([row[a] for a in am]) if q.amenities else np.nan
    return pd.DataFrame([row])


@lru_cache(maxsize=4096)
def sat_vec(lat: float, lon: float):
    v = aef.embed(lat, lon)
    return None if v is None else tuple(float(x) for x in v)


def assemble(df: pd.DataFrame, comps: pd.DataFrame, poi: pd.DataFrame, sat) -> pd.DataFrame:
    X = F.base_frame(df)
    Z = np.full((1, F.N_AE), np.nan)
    if sat is not None:
        Z = ENG.pca.transform(np.array(sat)[None, :])
    X = pd.concat([X, comps.reset_index(drop=True), poi.reset_index(drop=True),
                   pd.DataFrame(Z, columns=[f"sat{i:02d}" for i in range(F.N_AE)])], axis=1)
    X = X.reindex(columns=ENG.X_cols)
    for c, cats in ENG.cats.items():
        X[c] = pd.Categorical(X[c].astype(str), categories=cats)
    return X


def predict(X):
    mu = float(ENG.model.predict(X)[0])
    sig = float(np.exp(ENG.scale.predict(X)[0]))
    b = int(T.density_bin(X["knn_d1"].values)[0])
    iv = {k: (mu - ENG.qs[k].get(b, ENG.qs[k]["global"]) * sig, mu + ENG.qs[k].get(b, ENG.qs[k]["global"]) * sig)
          for k in T.LEVELS}
    return mu, sig, iv, b


def ltv_cap(loan):
    # RBI LTV ceilings for individual housing loans
    if loan <= 30e5:
        return 0.90
    if loan <= 75e5:
        return 0.80
    return 0.75


CITY_TREE = F.BallTree(np.radians(CITIES[["lat", "lon"]].values), metric="haversine")
AEF = pd.read_parquet(PROC / "aef_points.parquet")
AEF_IDX = {(round(a, 4), round(b, 4)): i for i, (a, b) in enumerate(zip(AEF.lat, AEF.lon))}
AEF_M = AEF[[c for c in AEF.columns if c.startswith("ae")]].values
DISC = 1 - A["ask_to_txn_discount"]


def value_batch(rows: pd.DataFrame, exclude_self=False) -> pd.DataFrame:
    """Vectorised valuation of many properties (portfolio revaluation, monitoring replays)."""
    n = len(rows)
    lat, lon = rows.lat.values.astype(float), rows.lon.values.astype(float)
    d, i = CITY_TREE.query(np.radians(np.c_[lat, lon]), k=1)
    cr = CITIES.iloc[i[:, 0]].reset_index(drop=True)
    city_km = d[:, 0] * F.R_EARTH
    df = pd.DataFrame({
        "lat": lat, "lon": lon, "city": cr.city.values, "centre_lat": cr.lat.values, "centre_lon": cr.lon.values,
        "area_sqft": rows.area_sqft.values.astype(float), "bhk": rows.bhk.values.astype(float), "ptype": "flat",
        "floor": rows.floor.values.astype(float), "total_floors": rows.total_floors.values.astype(float),
        "bathrooms": rows.bhk.values.astype(float), "parking": 1.0, "covered_parking": 1.0, "furnishing": "Semi-Furnished",
        "transaction": "resale", "ownership": "Freehold", "facing": "Unknown", "source": "mb2023", "posted_by": "nan",
        "geo": "loc_exact", "overlook_park": 0.0, "overlook_main_road": 0.0, "rera": 1.0, "under_construction": 0.0,
        "gymnasium": 0.0, "swimmingpool": 0.0, "liftavailable": 1.0, "clubhouse": 0.0, "secsecurity": 1.0, "amenity_score": np.nan,
    })
    comps = COMPS.features(lat, lon, exclude_self=exclude_self)
    poi = POIS.features(lat, lon)
    Z = np.full((n, F.N_AE), np.nan)
    hit = [AEF_IDX.get((round(a, 4), round(b, 4))) for a, b in zip(lat, lon)]
    have = [k for k, h in enumerate(hit) if h is not None]
    if have:
        Z[have] = ENG.pca.transform(AEF_M[[hit[k] for k in have]])
    X = F.base_frame(df)
    X = pd.concat([X, comps.reset_index(drop=True), poi.reset_index(drop=True),
                   pd.DataFrame(Z, columns=[f"sat{i:02d}" for i in range(F.N_AE)])], axis=1).reindex(columns=ENG.X_cols)
    for c, cats in ENG.cats.items():
        X[c] = pd.Categorical(X[c].astype(str), categories=cats)
    mu = ENG.model.predict(X)
    sig = np.exp(ENG.scale.predict(X))
    b = T.density_bin(X["knn_d1"].values)
    q = {k: np.array([ENG.qs[k].get(int(bb), ENG.qs[k]["global"]) for bb in b]) for k in T.LEVELS}
    area = df.area_sqft.values
    val = np.exp(mu) * area * DISC
    out = pd.DataFrame({"value": val, "city_km": city_km, "density_bin": b, "knn_n1km": comps.knn_n1km.values,
                        "knn_d1": comps.knn_d1.values, "knn_wmean": comps.knn_wmean.values, "has_sat": [h is not None for h in hit]})
    for k in T.LEVELS:
        out[f"lo{k[1:]}"] = np.exp(mu - q[k] * sig) * area * DISC
        out[f"hi{k[1:]}"] = np.exp(mu + q[k] * sig) * area * DISC
    out["fsd"] = (out.hi68 - out.lo68) / 2 / out.value
    ok = (out.density_bin < 3) & (out.city_km <= 40)
    out["band"] = np.where((out.fsd <= T_WAIVE) & (out.knn_n1km >= 8) & ok, "green",
                           np.where((out.fsd <= T_DESK) & ok, "amber", "red"))
    return out


# ---------------------------------------------------------------- request log (model monitoring)
LOG = ART / "requests.jsonl"
_log_lock = threading.Lock()


def log_request(rec: dict):
    with _log_lock, open(LOG, "a", encoding="utf-8") as f:
        f.write(json.dumps(clean(rec)) + "\n")


@app.get("/api/meta")
def meta():
    r = ENG.report
    return {"assumptions": A, "report": {k: r[k] for k in ("random", "unseen_locality", "unseen_city", "holdout_cities", "data")},
            "importance": dict(list(r["importance"].items())[:25]),
            "cities": CITIES.sort_values("n", ascending=False)[["city", "lat", "lon", "n"]].head(120).to_dict("records")}


@app.get("/api/search")
def search(q: str, limit: int = 8):
    k = norm_loc(q)
    if len(k) < 2:
        return []
    toks = k.split()
    m = PLACES[PLACES.key.str.startswith(toks[0])] if toks else PLACES
    for t in toks[1:]:
        m = m[m.key.str.contains(rf"\b{t}", regex=True) | m.city.str.contains(t)]
    if len(m) == 0:
        m = PLACES[PLACES.key.str.contains(k, regex=False)]
    m = m.assign(score=(m.key == k) * -1.5 + m["rank"] * 0.5 - m.known * 2.5 + np.clip(m.city_km, 0, 300) / 40 + m.key.str.len() / 60)
    m = m.sort_values("score").drop_duplicates(["key", "city"]).head(limit)
    return [{"label": r.name, "place": r.place, "city": r.city.title(), "near_city_km": round(r.city_km, 1),
             "lat": r.lat, "lon": r.lon, "known": bool(r.known)} for r in m.itertuples()]


@app.post("/api/value")
def value(q: ValueIn):
    t0 = time.time()
    if not (6 < q.lat < 37.5 and 68 < q.lon < 97.5):
        raise HTTPException(400, "That point is outside India. Pick a location within India.")
    city_row, city_km = nearest_city(q.lat, q.lon)
    df = frame_for(q, city_row)
    comps = COMPS.features(np.array([q.lat]), np.array([q.lon]))
    poi = POIS.features(np.array([q.lat]), np.array([q.lon]))
    sat = sat_vec(round(q.lat, 4), round(q.lon, 4))
    X = assemble(df, comps, poi, sat)
    mu, sig, iv, dens = predict(X)
    area = float(df.area_sqft.iloc[0])
    disc = 1 - A["ask_to_txn_discount"]
    to_val = lambda lp: float(np.exp(lp) * area * disc)  # noqa: E731
    value = to_val(mu)
    lo68, hi68 = map(to_val, iv["p68"])
    lo80, hi80 = map(to_val, iv["p80"])
    lo90, hi90 = map(to_val, iv["p90"])
    fsd = float((hi68 - lo68) / 2 / value)
    confidence = max(0.0, min(0.99, 1 - fsd))

    # factor waterfall (log-space contributions -> rupee steps)
    contrib = ENG.model.predict(X, pred_contrib=True)[0]
    base, cvals = float(contrib[-1]), contrib[:-1]
    groups = []
    assigned = set()
    for name, fn in GROUPS:
        cols = [c for c in ENG.X_cols if c not in assigned and fn(c)]
        assigned |= set(cols)
        s = float(sum(cvals[ENG.X_cols.index(c)] for c in cols))
        top = sorted(((c, float(cvals[ENG.X_cols.index(c)])) for c in cols), key=lambda t: -abs(t[1]))[:3]
        groups.append({"group": name, "log_effect": s, "pct": float(np.exp(s) - 1), "drivers": top})
    running = base
    steps = []
    for g in sorted(groups, key=lambda g: -abs(g["log_effect"])):
        start = to_val(running)
        running += g["log_effect"]
        steps.append({**g, "from": start, "to": to_val(running)})

    # witnesses: same property as each listing source would price it (rolled to the valuation date)
    witnesses = []
    for s in ("mb2023", "metro", "hppc", "blr"):
        Xs = assemble(frame_for(q, city_row, source=s), comps, poi, sat)
        witnesses.append({"source": s, "value": to_val(float(ENG.model.predict(Xs)[0]))})

    # orientation: the same unit priced facing each of the eight directions
    facing_fx = []
    for fc in FACINGS:
        Xf = assemble(frame_for(q.model_copy(update={"facing": fc}), city_row), comps, poi, sat)
        facing_fx.append({"facing": fc, "value": to_val(float(ENG.model.predict(Xf)[0]))})
    fx_mean = float(np.mean([f["value"] for f in facing_fx]))
    for f in facing_fx:
        f["pct"] = f["value"] / fx_mean - 1

    # comparables
    d = haversine_km(q.lat, q.lon, REF.lat.values, REF.lon.values)
    near = np.argsort(d)[:60]
    cand = REF.iloc[near].assign(km=d[near])
    # Comparable selection: near, similar size/config, recent source; drop listings that sit far
    # outside the local price level (likely unit or typo errors in the listing).
    dev = np.abs(cand.y - comps.knn_wmean.iloc[0])
    cand = cand[dev < 0.45] if (dev < 0.45).sum() >= 5 else cand
    cand = cand.assign(sim=cand.km / 1.5 + np.abs(np.log(cand.area_sqft / area)) * 2
                       + np.abs(cand.bhk.fillna(2) - q.bhk) * 0.3 + (cand.source != "mb2023") * 0.25)
    cand = cand.sort_values("sim").head(10)
    # listings geocoded to a locality share one point; fan them out slightly for display only
    ang = np.linspace(0, 2 * np.pi, len(cand), endpoint=False)
    dup = cand.duplicated(["lat", "lon"], keep=False).values
    cand = cand.assign(dlat=np.where(dup, cand.lat + 0.0012 * np.sin(ang), cand.lat),
                       dlon=np.where(dup, cand.lon + 0.0012 * np.cos(ang), cand.lon))
    comp_rows = [{"lat": r.dlat, "lon": r.dlon, "km": round(r.km, 2), "geocode": "point" if r.source == "hppc" else "locality", "locality": r.locality, "society": r.society or None,
                  "bhk": r.bhk, "area_sqft": round(r.area_sqft), "source": r.source, "listed_price": r.price,
                  "ppsf_today": float(np.exp(r.y) * disc), "indicated_value": float(np.exp(r.y) * disc * area)}
                 for r in cand.itertuples()]

    # cost approach cross-check (structure vs land)
    age = q.age_years if q.age_years is not None else (0 if q.transaction == "new" else 10)
    spec = 2800 if (q.amenities and len(q.amenities) >= 3) else 2200
    builtup = area / 0.80
    structure = builtup * spec * max(0.3, 1 - 0.015 * age)
    structure = min(structure, value * 0.85)
    land = max(value - structure, 0)

    # flags and lending decision
    flags = []
    if dens >= 3:
        flags.append({"code": "THIN_DATA", "text": f"Nearest 10 comparable listings are {X.knn_d10.iloc[0]:.1f} km away"})
    if city_km > 40:
        flags.append({"code": "OUTSIDE_COVERAGE", "text": f"{city_km:.0f} km from the nearest covered city ({city_row.city.title()})"})
    if sat is None:
        flags.append({"code": "NO_SATELLITE", "text": "No satellite embedding available for this point"})
    apb = area / max(q.bhk, 0.5)
    if apb < 180 or apb > 1600:
        flags.append({"code": "ATTRIBUTE_CHECK", "text": f"{apb:.0f} sq ft per bedroom is unusual; verify the area and BHK"})
    if poi.d_industrial.iloc[0] < 0.25:
        flags.append({"code": "INDUSTRIAL_ADJ", "text": "Industrial land within 250 m"})
    knn_val = float(np.exp(comps.knn_wmean.iloc[0]) * area * disc)
    if abs(np.log(value / knn_val)) > 0.35:
        flags.append({"code": "MODEL_VS_COMPS", "text": "Model value differs from the local comparable level by more than 35%"})
    hard = {"THIN_DATA", "OUTSIDE_COVERAGE", "ATTRIBUTE_CHECK"}
    # Thresholds are set for listing-price ground truth, whose own noise widens every range;
    # with registry or lender outcomes as ground truth they tighten (typical AVM bands: 10% / 20%).
    if fsd <= T_WAIVE and comps.knn_n1km.iloc[0] >= 8 and not flags:
        decision = {"band": "green", "action": "Waive physical valuation", "detail": "Tight range, dense comparables, no flags."}
    elif fsd <= T_DESK and not any(f["code"] in hard for f in flags):
        decision = {"band": "amber", "action": "Desk review", "detail": "Valuer checks photos and documents; no site visit."}
    else:
        decision = {"band": "red", "action": "Physical valuation", "detail": "Range too wide or data too thin to lend on the model alone."}
    lendable = lo68
    loan = q.loan_amount or lendable * 0.75
    cap = ltv_cap(loan)
    lending = {"lendable_value": lendable, "distress_value": lendable * (1 - A["distress_haircut"]),
               "ltv_cap": cap, "max_loan": lendable * cap, "loan_amount": loan, "ltv": loan / lendable,
               "two_valuations_required": loan >= 50e5,
               "note": "RBI directions require two valuation reports for loans of Rs 50 lakh and above; the engine can serve as one."}

    out = {
        "input": q.model_dump(), "city": city_row.city.title(), "city_km": round(city_km, 1),
        "value": value, "ppsf": value / area, "area_carpet_sqft": area,
        "range": {"p68": [lo68, hi68], "p80": [lo80, hi80], "p90": [lo90, hi90]},
        "fsd": fsd, "confidence": confidence, "density_bin": dens,
        "comps_signal": {"knn_value": knn_val, "n_within_1km": int(comps.knn_n1km.iloc[0]),
                         "n_within_3km": int(comps.knn_n3km.iloc[0]), "d10_km": float(comps.knn_d10.iloc[0])},
        "waterfall": {"base": to_val(base), "steps": steps}, "witnesses": witnesses,
        "facing_effects": facing_fx, "comparables": comp_rows, "access": POIS.nearest(q.lat, q.lon),
        "cost_approach": {"structure": structure, "land": land, "spec_rate": spec, "age_years": age, "builtup_sqft": builtup},
        "satellite": {"available": sat is not None, "vector": list(sat[:16]) if sat else None},
        "flags": flags, "decision": decision, "lending": lending, "assumptions": A, "thresholds": {"waive_fsd": T_WAIVE, "desk_fsd": T_DESK},
    }
    # market reality: title, approvals, nuisances, two prices, fraud signals
    city_ppsf = float(np.exp(city_row.med_y)) * DISC if pd.notna(city_row.med_y) else value / area
    loc_ix = float(np.clip((value / area) / city_ppsf, 0.4, 2.5))
    state = RL.state_for(city_row.city, q.lat, q.lon, CITIES)
    dupes = book_duplicates(q.lat, q.lon, area) if q.declared_value or q.valuer_value else []
    out["reality"] = RL.assess(q.model_dump(), out, loc_ix, state, dupes)
    out["model_decision"] = decision
    if out["reality"]["route_override"]:
        out["decision"] = out["reality"]["route_override"]
    out["latency_ms"] = int((time.time() - t0) * 1000)
    out["model_version"] = MODEL_VERSION
    log_request({"t": time.time(), "src": "api", "lat": q.lat, "lon": q.lon, "city": out["city"], "city_km": city_km,
                 "area_sqft": area, "knn_d1": float(comps.knn_d1.iloc[0]), "knn_wmean": float(comps.knn_wmean.iloc[0]),
                 "knn_n1km": int(comps.knn_n1km.iloc[0]), "fsd": fsd, "band": out["decision"]["band"],
                 "has_sat": sat is not None, "latency_ms": out["latency_ms"]})
    return clean(out)


# ---------------------------------------------------------------- commercial: income approach
# Method demo. No public Indian commercial transaction or lease dataset exists, so market rent and
# cap rate start from published benchmarks and are always overridable with the actual lease.
# Office rents, Rs/sqft/month (2025): Anarock Annual Office Update 2025 (MMR 148), Business Standard
# May 2025 (NCR 110, Bengaluru 95, Pune 80, Hyderabad 72, Chennai 72). Kolkata and Ahmedabad: our assumption.
OFFICE_RENT = {"mumbai": 148, "thane": 148, "navi mumbai": 148, "gurgaon": 110, "noida": 110, "delhi": 110,
               "new delhi": 110, "greater noida": 110, "faridabad": 110, "ghaziabad": 110, "bangalore": 95,
               "bengaluru": 95, "pune": 80, "hyderabad": 72, "chennai": 72, "kolkata": 55, "ahmedabad": 55}
# Office cap rates: Brookfield India REIT valuation summary, FY26 (7.75% Bengaluru, 8.0% Mumbai/NCR/Kolkata).
CRE = {
    "office":    {"cap": 0.080, "occ": 0.90, "opex": 0.06, "rent_mult": 1.00, "loc_exp": 0.6, "esc": 0.15},
    "retail":    {"cap": 0.085, "occ": 0.92, "opex": 0.08, "rent_mult": 1.45, "loc_exp": 0.8, "esc": 0.15},
    "warehouse": {"cap": 0.080, "occ": 0.95, "opex": 0.04, "rent_mult": None, "loc_exp": 0.2, "esc": 0.15},
}
WAREHOUSE_RENT = 24  # Rs/sqft/month, Grade A logistics, our assumption
TENANT = {"A": {"spread": 0.0, "dscr": 1.25, "t": "Listed / MNC"}, "B": {"spread": 0.005, "dscr": 1.40, "t": "Established private"},
          "C": {"spread": 0.010, "dscr": 1.60, "t": "Small or unrated"}}
CRE_LTV, LRD_RATE, DISC_SPREAD, EXIT_SPREAD, MKT_GROWTH = 0.65, 0.0925, 0.035, 0.0025, 0.04


class IncomeIn(BaseModel):
    lat: float
    lon: float
    asset: str = "office"  # office | retail | warehouse
    area_sqft: float = Field(12000, ge=500, le=2_000_000)  # leasable
    rent: float | None = Field(None, ge=1, le=2000)  # passing rent, Rs/sqft/month
    occupancy: float | None = Field(None, ge=0.3, le=1.0)
    escalation: float | None = Field(None, ge=0, le=0.4)  # per 3 years
    wale: float = Field(6, ge=0.5, le=30)  # years left on the lease
    tenant: str = "A"
    cap_rate: float | None = Field(None, ge=0.04, le=0.16)
    loan_amount: float | None = None
    label: str | None = None


def _emi_pv(pmt, r, n):
    return pmt * (1 - (1 + r) ** -n) / r


@app.post("/api/income")
def income(q: IncomeIn):
    t0 = time.time()
    if not (6 < q.lat < 37.5 and 68 < q.lon < 97.5):
        raise HTTPException(400, "That point is outside India. Pick a location within India.")
    if q.asset not in CRE or q.tenant not in TENANT:
        raise HTTPException(400, "Unknown asset class or tenant grade.")
    P, Tn = CRE[q.asset], TENANT[q.tenant]
    city_row, city_km = nearest_city(q.lat, q.lon)
    city = city_row.city
    # Location index from the residential engine: how this point prices against its city.
    res = value(ValueIn(lat=q.lat, lon=q.lon, area_sqft=1000, bhk=2))
    city_ppsf = float(np.exp(city_row.med_y)) * (1 - A["ask_to_txn_discount"]) if pd.notna(city_row.med_y) else None
    loc_ix = float(np.clip(res["ppsf"] / city_ppsf, 0.5, 2.2)) if city_ppsf else 1.0
    flags = []
    if q.asset == "warehouse":
        bench, bench_src = WAREHOUSE_RENT, "Assumed Grade A logistics rent"
    elif city in OFFICE_RENT:
        bench, bench_src = OFFICE_RENT[city] * P["rent_mult"], "Published city office average"
    else:
        # Outside the benchmarked metros: scale from the local residential price level.
        bench, bench_src = res["ppsf"] * 0.0085 * P["rent_mult"] / loc_ix, "Derived from local residential prices"
        flags.append({"code": "NO_RENT_BENCHMARK", "text": f"No published office rent for {city.title()}; market rent derived from residential prices"})
    market_rent = bench * loc_ix ** P["loc_exp"]
    rent = q.rent or market_rent
    if q.rent is None:
        flags.append({"code": "NO_LEASE", "text": "No lease rent entered; valued on estimated market rent"})
    occ = q.occupancy if q.occupancy is not None else P["occ"]
    esc = q.escalation if q.escalation is not None else P["esc"]
    tier2 = city not in OFFICE_RENT
    cap = q.cap_rate or (P["cap"] + Tn["spread"] + (0.005 if tier2 else 0) + (0.0025 if q.wale < 3 else 0))
    disc = cap + DISC_SPREAD

    # Direct capitalisation (year-1 stabilised NOI).
    gri = rent * q.area_sqft * 12
    vac = gri * (1 - occ)
    egi = gri - vac
    opex = egi * P["opex"]
    noi = egi - opex
    direct = noi / cap

    # 10-year DCF: passing rent escalates every 3 years until lease expiry, then reverts to market
    # (grown at MKT_GROWTH) after a 6-month void; exit at cap + 25 bp on year-11 NOI.
    def noi_year(y):  # y = 1..11
        if y <= q.wale:
            r = rent * (1 + esc) ** ((y - 1) // 3)
            void = 0.0
        else:
            r = market_rent * (1 + MKT_GROWTH) ** (y - 1)
            void = 0.5 if y == int(np.floor(q.wale)) + 1 else 0.0
        g = r * q.area_sqft * 12 * occ * (1 - void)
        return g * (1 - P["opex"]), r, void
    flows = []
    pv = 0.0
    for y in range(1, 11):
        n, r, void = noi_year(y)
        df_ = (1 + disc) ** -y
        flows.append({"year": y, "noi": n, "rent": r, "pv": n * df_, "void": void > 0, "leased": y <= q.wale})
        pv += n * df_
    exit_val = noi_year(11)[0] / (cap + EXIT_SPREAD)
    pv_exit = exit_val * (1 + disc) ** -10
    dcf = pv + pv_exit
    mv = 0.5 * direct + 0.5 * dcf

    # Sensitivity: cap rate +-50 bp x rent +-10%.
    caps = [cap - 0.005, cap - 0.0025, cap, cap + 0.0025, cap + 0.005]
    rents = [0.90, 0.95, 1.0, 1.05, 1.10]
    grid = [[(noi * m / c) * (mv / direct) for c in caps] for m in rents]
    inner = [grid[i][j] for i in (1, 2, 3) for j in (1, 2, 3)]
    rng = [min(inner), max(inner)]
    outer = [min(min(r) for r in grid), max(max(r) for r in grid)]
    fsd = (rng[1] - rng[0]) / 2 / mv

    # Cross-check: same floor area at the location's residential price.
    resi_value = res["ppsf"] * q.area_sqft
    rent_gap = rent / market_rent - 1
    if q.rent is not None and abs(rent_gap) > 0.25:
        flags.append({"code": "RENT_VS_MARKET", "text": f"Lease rent is {rent_gap:+.0%} against estimated market rent; check for over-rent or a related-party lease"})
    if q.wale < 3:
        flags.append({"code": "SHORT_WALE", "text": f"{q.wale:.1f} years left on the lease; re-letting risk inside the loan tenor"})
    if q.tenant == "C":
        flags.append({"code": "TENANT_CREDIT", "text": "Small or unrated tenant; rental cash flow less certain"})
    for f in res["flags"]:
        if f["code"] in ("THIN_DATA", "OUTSIDE_COVERAGE"):
            flags.append(f)

    # Lease rental discounting (LRD) loan sizing.
    tenor = int(np.clip(np.floor(q.wale), 3, 12))
    rm = LRD_RATE / 12
    emi_cap = noi / Tn["dscr"] / 12
    loan_dscr = _emi_pv(emi_cap, rm, tenor * 12)
    loan_ltv = CRE_LTV * rng[0]
    max_loan = min(loan_dscr, loan_ltv)
    loan = q.loan_amount or max_loan * 0.9
    emi = loan * rm / (1 - (1 + rm) ** -(tenor * 12))
    dscr = noi / (emi * 12)
    hard = {"NO_LEASE", "RENT_VS_MARKET", "SHORT_WALE", "TENANT_CREDIT", "THIN_DATA", "OUTSIDE_COVERAGE"}
    if not any(f["code"] in hard for f in flags) and dscr >= Tn["dscr"] and loan <= loan_ltv:
        decision = {"band": "amber", "action": "Desk review", "detail": "Verify the lease deed, tenant and escrow; site visit not needed for the value."}
    else:
        decision = {"band": "red", "action": "Physical valuation", "detail": "Lease evidence, tenant risk or loan cover needs a valuer on site."}

    return clean({
        "input": q.model_dump(), "city": city.title(), "city_km": round(city_km, 1), "asset": q.asset,
        "value": mv, "ppsf": mv / q.area_sqft, "range": {"inner": rng, "outer": outer}, "fsd": fsd,
        "direct": direct, "dcf": dcf, "dcf_parts": {"pv_flows": pv, "pv_exit": pv_exit, "exit_value": exit_val},
        "income": {"gri": gri, "vacancy": vac, "egi": egi, "opex": opex, "noi": noi, "rent": rent, "occupancy": occ,
                   "opex_ratio": P["opex"], "escalation": esc},
        "market_rent": {"value": market_rent, "benchmark": bench, "source": bench_src, "location_index": loc_ix,
                        "gap": rent_gap if q.rent is not None else None},
        "rates": {"cap": cap, "discount": disc, "exit_cap": cap + EXIT_SPREAD, "base_cap": P["cap"],
                  "tenant_spread": Tn["spread"], "tier2_spread": 0.005 if tier2 else 0.0},
        "flows": flows, "sensitivity": {"caps": caps, "rent_mult": rents, "grid": grid},
        "residential_check": {"value": resi_value, "ppsf": res["ppsf"], "ratio": mv / resi_value if resi_value else None},
        "lending": {"tenor_years": tenor, "rate": LRD_RATE, "dscr_min": Tn["dscr"], "ltv_cap": CRE_LTV,
                    "loan_by_dscr": loan_dscr, "loan_by_ltv": loan_ltv, "max_loan": max_loan, "loan_amount": loan,
                    "emi": emi, "dscr": dscr, "ltv": loan / mv, "two_valuations_required": loan >= 50e5},
        "tenant": Tn["t"], "flags": flags, "decision": decision,
        "latency_ms": int((time.time() - t0) * 1000),
    })


@app.get("/api/surface")
def surface(res: int = 6, city: str | None = None):
    """H3 hexagons of median Rs/sqft (time-aligned, transaction basis) from listings."""
    return _surface(res, city)


@lru_cache(maxsize=32)
def _surface(res, city):
    d = LISTINGS if city is None else LISTINGS[LISTINGS.city == city.lower()]
    d = d.assign(h=[h3.latlng_to_cell(a, b, res) for a, b in zip(d.lat, d.lon)])
    g = d.groupby("h").agg(ppsf=("ppsf", "median"), n=("ppsf", "size"), city=("city", "first")).reset_index()
    g = g[g.n >= (2 if city else 3)]
    return [{"h": r.h, "ppsf": round(float(r.ppsf)), "n": int(r.n), "city": r.city.title()} for r in g.itertuples()]


MODEL_VERSION = f"naksha-lgbm-{int((ART / 'engine.pkl').stat().st_mtime)}"


# ---------------------------------------------------------------- catalogue (factor pickers, state rules)
@app.get("/api/reality/catalogue")
def reality_catalogue():
    return RL.catalogue()


# ---------------------------------------------------------------- portfolio
_book = {"data": None, "frame": None}


def _run_book(book: pd.DataFrame, synthetic: bool):
    val = value_batch(book, exclude_self=False)
    res = PF.finish(book, val, A["annual_appreciation"], synthetic)
    return res


def book_duplicates(lat, lon, area):
    fr = _book["frame"]
    if fr is None:
        return []
    d = haversine_km(lat, lon, fr.lat.values, fr.lon.values)
    m = (d < 0.05) & (np.abs(fr.area_sqft.values / area - 1) < 0.05)
    return [{"loan_id": r.loan_id, "km": float(dd), "area_sqft": int(r.area_sqft)} for r, dd in zip(fr[m].itertuples(), d[m])][:3]


@app.get("/api/portfolio")
def portfolio():
    if _book["data"] is None:
        L = pd.read_parquet(PROC / "listings.parquet")
        book = PF.sample_book(L)
        _book["data"] = clean(_run_book(book, synthetic=True))
        _book["frame"] = pd.DataFrame(_book["data"]["loans"])[["loan_id", "lat", "lon", "area_sqft"]]
    return _book["data"]


class BookIn(BaseModel):
    csv: str


@app.post("/api/portfolio/upload")
def portfolio_upload(b: BookIn):
    try:
        book = PF.parse_csv(b.csv)
    except Exception as e:
        raise HTTPException(400, f"Could not read the CSV: {e}")
    return clean(_run_book(book, synthetic=False))


# ---------------------------------------------------------------- monitoring
_ref = {}


def _reference():
    if not _ref:
        smp = REF.sample(3000, random_state=5)
        c = COMPS.features(smp.lat.values, smp.lon.values, exclude_self=True)
        d, _ = CITY_TREE.query(np.radians(smp[["lat", "lon"]].values), k=1)
        _ref.update({"knn_d1": np.log1p(c.knn_d1.values), "knn_wmean": c.knn_wmean.values, "area_sqft": np.log(smp.area_sqft.values),
                     "city_km": np.log1p(d[:, 0] * F.R_EARTH), "knn_n1km": c.knn_n1km.values.astype(float)})
    return _ref


def psi(ref, cur, bins=10):
    if len(cur) == 0:
        return 0.0, [], []
    edges = np.unique(np.quantile(ref, np.linspace(0, 1, bins + 1)))
    if len(edges) < 4:
        lo, hi = min(ref.min(), cur.min()), max(ref.max(), cur.max())
        edges = np.linspace(lo, hi + 1e-9, bins + 1)
    e = np.histogram(np.clip(ref, edges[0], edges[-1]), edges)[0] / len(ref)
    a = np.histogram(np.clip(cur, edges[0], edges[-1]), edges)[0] / len(cur)
    e, a = np.clip(e, 1e-4, None), np.clip(a, 1e-4, None)
    return float(((a - e) * np.log(a / e)).sum()), e.tolist(), a.tolist()


@app.get("/api/monitor")
def monitor():
    recs = []
    if LOG.exists():
        with open(LOG, encoding="utf-8") as f:
            recs = [json.loads(line) for line in f if line.strip()][-5000:]
    ref = _reference()
    df = pd.DataFrame(recs)
    feats = []
    tf = {"knn_d1": np.log1p, "knn_wmean": lambda x: x, "area_sqft": np.log, "city_km": np.log1p, "knn_n1km": lambda x: x}
    names = {"knn_d1": "Distance to nearest comparable", "knn_wmean": "Local price level", "area_sqft": "Carpet area",
             "city_km": "Distance from covered city", "knn_n1km": "Comparables within 1 km"}
    for k in tf:
        cur = tf[k](df[k].astype(float).values) if len(df) and k in df else np.array([])
        v, e, a = psi(ref[k], cur)
        feats.append({"key": k, "name": names[k], "psi": v, "status": "stable" if v < 0.1 else "watch" if v < 0.25 else "drift",
                      "ref": e, "cur": a})
    by_day, bands, lat_ms = [], {}, {}
    if len(df):
        df["day"] = pd.to_datetime(df.t, unit="s").dt.strftime("%Y-%m-%d")
        by_day = df.groupby("day").size().reset_index(name="n").to_dict("records")
        bands = df.band.value_counts(normalize=True).to_dict()
        live = df[df.src == "api"] if "src" in df else df
        lat_ms = {"p50": float(live.latency_ms.median()), "p90": float(live.latency_ms.quantile(0.9))} if len(live) else {}
    r = ENG.report
    return clean({
        "n": len(df), "by_day": by_day, "bands": bands, "latency": lat_ms,
        "fsd_median": float(df.fsd.median()) if len(df) else None, "sat_share": float(df.has_sat.mean()) if len(df) else None,
        "features": feats,
        "recent": df.tail(12)[["t", "city", "band", "fsd", "latency_ms", "src"]].to_dict("records") if len(df) else [],
        "model_card": {"version": MODEL_VERSION, "trained_rows": r["data"]["rows"], "cities": r["data"]["cities"],
                       "objective": "LightGBM Huber on log Rs/sq ft, monotone in comparables; LightGBM error model; Mondrian split-conformal 68/80/90%",
                       "validation": {k: {"MdAPE": r[k]["engine"]["MdAPE"], "cover_p90": r[k]["engine"].get("cover_p90")} for k in ("random", "unseen_locality", "unseen_city")},
                       "thresholds": {"waive_fsd": T_WAIVE, "desk_fsd": T_DESK}, "assumptions": A},
    })


@app.post("/api/monitor/replay")
def monitor_replay(n: int = 200):
    """Send a batch of realistic requests (named places across India) through the engine and log them."""
    rs = np.random.default_rng(int(time.time()) % 10000)
    pool = PLACES[PLACES.place.isin(["suburb", "neighbourhood", "quarter", "town", "village"])]
    near, far = pool[pool.city_km < 25], pool[pool.city_km >= 25]
    k = min(n, 1000)
    P = pd.concat([near.sample(int(k * 0.75), random_state=int(rs.integers(1e6))), far.sample(k - int(k * 0.75), random_state=int(rs.integers(1e6)))])
    bhk = rs.choice([1, 2, 3, 4], len(P), p=[0.2, 0.45, 0.28, 0.07]).astype(float)
    rows = pd.DataFrame({"lat": P.lat.values, "lon": P.lon.values, "area_sqft": np.round(bhk * rs.lognormal(np.log(430), 0.22, len(P))),
                         "bhk": bhk, "floor": rs.integers(0, 15, len(P)).astype(float), "total_floors": 15.0})
    t0 = time.time()
    v = value_batch(rows)
    per = (time.time() - t0) * 1000 / max(len(rows), 1)
    now = time.time()
    for k, (r, x) in enumerate(zip(rows.itertuples(), v.itertuples())):
        log_request({"t": now - (len(rows) - k) * 37, "src": "replay", "lat": r.lat, "lon": r.lon, "city": P.city.values[k].title(),
                     "city_km": x.city_km, "area_sqft": r.area_sqft, "knn_d1": x.knn_d1, "knn_wmean": x.knn_wmean,
                     "knn_n1km": int(x.knn_n1km), "fsd": x.fsd, "band": x.band, "has_sat": bool(x.has_sat), "latency_ms": per})
    return {"logged": len(rows)}


# ---------------------------------------------------------------- report narrative
class NarrIn(BaseModel):
    valuation: dict
    llm: bool = True


@app.post("/api/report/narrative")
def report_narrative(b: NarrIn):
    return N.report(b.valuation, use_llm=b.llm)


# ---------------------------------------------------------------- v1: loan-origination-system integration
_store: dict[str, dict] = {}
KEYS = {k.strip() for k in os.environ.get("NAKSHA_API_KEYS", "").split(",") if k.strip()}


class V1In(ValueIn):
    application_id: str | None = None


def _auth(key):
    if KEYS and key not in KEYS:
        raise HTTPException(401, "Missing or invalid X-API-Key.")


@app.post("/api/v1/valuations", status_code=201)
def v1_create(q: V1In, x_api_key: str | None = Header(default=None)):
    _auth(x_api_key)
    v = value(ValueIn(**q.model_dump(exclude={"application_id"})))
    vid = "val_" + uuid.uuid4().hex[:16]
    r = v["reality"]
    doc = {
        "id": vid, "object": "valuation", "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "application_id": q.application_id, "model_version": v["model_version"],
        "property": {"lat": q.lat, "lon": q.lon, "city": v["city"], "carpet_sqft": v["area_carpet_sqft"], "bhk": q.bhk, "type": q.ptype},
        "value": {"market": v["value"], "adjusted": r["adjusted_value"], "per_sqft": v["ppsf"], "range_68": v["range"]["p68"],
                  "range_90": v["range"]["p90"], "fsd": v["fsd"], "confidence": v["confidence"]},
        "decision": v["decision"], "lending": {**v["lending"], "reality": r["lending"]},
        "integrity": r["integrity"], "flags": v["flags"] + r["flags"],
        "two_prices": r["two_prices"], "latency_ms": v["latency_ms"],
        "links": {"self": f"/api/v1/valuations/{vid}", "report": f"/report?id={vid}"},
    }
    _store[vid] = {"doc": clean(doc), "full": v}
    return _store[vid]["doc"]


@app.get("/api/v1/valuations/{vid}")
def v1_get(vid: str, full: bool = False, x_api_key: str | None = Header(default=None)):
    _auth(x_api_key)
    if vid not in _store:
        raise HTTPException(404, "No valuation with that id.")
    return _store[vid]["full"] if full else _store[vid]["doc"]


@app.get("/api/health")
def health():
    return {"ok": True}
