"""Loan-book revaluation: revalue every loan's collateral, track LTV drift, score valuers, find double pledges.

The demo book is synthetic: 600 loans placed on real listing locations, with origination valuations
drawn from the model's own back-cast plus valuer noise, and two valuers given a systematic upward bias
and five properties pledged twice, so the detectors have something to find. Uploading a CSV runs the
same pipeline on a real book.
"""
from __future__ import annotations

import io

import numpy as np
import pandas as pd
from sklearn.neighbors import BallTree

R = 6371.0
NOW = 2026.9
RATE, TENOR = 0.09, 20
VALUERS = [f"V{i:02d}" for i in range(1, 15)]
BIASED = {"V07": 0.15, "V11": 0.22}  # planted inflation, for the demo scorecard


def ltv_cap(loan):
    return np.where(loan <= 30e5, 0.90, np.where(loan <= 75e5, 0.80, 0.75))


def outstanding(principal, years):
    r, n = RATE / 12, TENOR * 12
    k = np.clip(np.round(years * 12), 0, n)
    emi = principal * r / (1 - (1 + r) ** -n)
    return principal * (1 + r) ** k - emi * ((1 + r) ** k - 1) / r


def sample_book(listings: pd.DataFrame, n=600, seed=11) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    L = listings[(listings.ptype == "flat") & listings.area_sqft.between(450, 2600) & listings.bhk.between(1, 4)].copy()
    top = L.city.value_counts().head(24).index
    L = L[L.city.isin(top)]
    b = L.sample(n, random_state=seed).reset_index(drop=True)
    book = pd.DataFrame({
        "loan_id": [f"HL-{int(y) % 100:02d}-{i:05d}" for i, y in enumerate(rng.integers(2018, 2026, n) * 0 + 2025)],
        "city": b.city.str.title(), "locality": b.locality.fillna(""), "lat": b.lat.values, "lon": b.lon.values,
        "area_sqft": b.area_sqft.round().values, "bhk": b.bhk.values,
        "floor": b.floor.fillna(3).values, "total_floors": b.total_floors.fillna(10).values,
        "orig_year": rng.integers(2018, 2026, n) + rng.random(n).round(2),
        "valuer": rng.choice(VALUERS, n),
        "legal_status": rng.choice(["freehold", "society_share", "leasehold", "lal_dora"], n, p=[0.6, 0.3, 0.07, 0.03]),
    })
    book["loan_id"] = [f"HL-{int(y) % 100:02d}-{i:05d}" for i, y in enumerate(book.orig_year)]
    # listings are geocoded to their locality; spread them to plausible individual addresses
    book["lat"] += rng.normal(0, 0.0025, n)
    book["lon"] += rng.normal(0, 0.0025, n)
    # five properties pledged a second time on a later loan
    d = book.sample(5, random_state=seed + 1).copy()
    d["loan_id"] = [f"HL-{int(y) % 100:02d}-{9000 + i:05d}" for i, y in enumerate(np.minimum(d.orig_year + 1.5, 2026.5))]
    d["orig_year"] = np.minimum(d.orig_year + 1.5, 2026.5)
    d["lat"] += 0.00008
    d["valuer"] = "V11"
    return pd.concat([book, d], ignore_index=True)


def finish(book: pd.DataFrame, val: pd.DataFrame, growth: float, synthetic: bool, seed=11) -> dict:
    """book + current valuation (value, lo68, hi68, fsd, band, city_km) -> loans, scorecard, alerts, summary."""
    rng = np.random.default_rng(seed)
    b = pd.concat([book.reset_index(drop=True), val.reset_index(drop=True)], axis=1)
    yrs = (NOW - b.orig_year).clip(lower=0.1)
    backcast = b.value / (1 + growth) ** yrs  # model's estimate of market value at origination
    if synthetic:
        bias = b.valuer.map(BIASED).fillna(0.0)
        b["orig_valuation"] = backcast * np.exp(rng.normal(0, 0.06, len(b))) * (1 + bias)
        b["sanctioned"] = b.orig_valuation * rng.uniform(0.65, 0.85, len(b))
        b["outstanding"] = outstanding(b.sanctioned, yrs)
    b["orig_vs_model"] = b.orig_valuation / backcast - 1
    b["ltv_orig"] = b.sanctioned / b.orig_valuation
    b["ltv_now"] = b.outstanding / b.value
    b["ltv_lendable"] = b.outstanding / b.lo68
    b["cap"] = ltv_cap(b.sanctioned)
    b["drift_pts"] = (b.ltv_now - b.ltv_orig) * 100

    # double pledges: same point (< 50 m), similar area, different loans
    tree = BallTree(np.radians(b[["lat", "lon"]].values), metric="haversine")
    idx, dist = tree.query_radius(np.radians(b[["lat", "lon"]].values), r=0.05 / R, return_distance=True)
    dup = [[] for _ in range(len(b))]
    for i, (nb, dd) in enumerate(zip(idx, dist)):
        for j, d in zip(nb, dd):
            if j != i and abs(b.area_sqft[j] / b.area_sqft[i] - 1) < 0.05 and abs(b.lat[j] - b.lat[i]) + abs(b.lon[j] - b.lon[i]) < 5e-4:
                dup[i].append(b.loan_id[j])
    # listings geocoded to a locality share a point; only near-identical size and an exact neighbour count
    b["duplicate_of"] = [",".join(x) if x and len(x) <= 2 else "" for x in dup]

    def alerts_for(r):
        a = []
        if r.duplicate_of:
            a.append(("DOUBLE_PLEDGE", "high", f"Same collateral as {r.duplicate_of}"))
        if r.ltv_now > r.cap:
            a.append(("LTV_BREACH", "high", f"LTV {r.ltv_now:.0%} above the {r.cap:.0%} cap"))
        elif r.drift_pts > 8:
            a.append(("LTV_DRIFT", "medium", f"LTV up {r.drift_pts:.0f} pts since sanction"))
        if r.orig_vs_model > 0.18:
            a.append(("INFLATED_AT_ORIGIN", "medium", f"Origination valuation {r.orig_vs_model:+.0%} above the model's back-cast"))
        if r.legal_status == "lal_dora":
            a.append(("WEAK_TITLE", "medium", "Lal Dora collateral"))
        if r.band == "red":
            a.append(("THIN_EVIDENCE", "low", "Model range wide: verify on site"))
        return a

    b["alerts"] = [alerts_for(r) for r in b.itertuples()]
    b["risk"] = [max((3 if s == "high" else 2 if s == "medium" else 1) for _, s, _ in a) if a else 0 for a in b.alerts]

    sc = b.groupby("valuer").agg(n=("loan_id", "size"), median_bias=("orig_vs_model", "median"),
                                 share_high=("orig_vs_model", lambda s: float((s > 0.15).mean())), exposure=("outstanding", "sum")).reset_index()
    sc["flag"] = (sc.median_bias > 0.08) & (sc.n >= 10)
    sc = sc.sort_values("median_bias", ascending=False)

    cities = b.groupby("city").agg(n=("loan_id", "size"), exposure=("outstanding", "sum"), value=("value", "sum"),
                                   lat=("lat", "median"), lon=("lon", "median")).reset_index()
    cities["ltv"] = cities.exposure / cities.value

    summary = {
        "loans": int(len(b)), "exposure": float(b.outstanding.sum()), "collateral": float(b.value.sum()),
        "wtd_ltv": float(b.outstanding.sum() / b.value.sum()),
        "breaches": int((b.ltv_now > b.cap).sum()), "double_pledges": int((b.duplicate_of != "").sum()),
        "flagged_valuers": int(sc.flag.sum()), "alerts_high": int((b.risk == 3).sum()), "alerts_medium": int((b.risk == 2).sum()),
        "growth_assumed": growth, "synthetic": synthetic,
    }
    keep = ["loan_id", "city", "locality", "lat", "lon", "area_sqft", "bhk", "orig_year", "valuer", "legal_status", "orig_valuation",
            "sanctioned", "outstanding", "value", "lo68", "hi68", "fsd", "band", "ltv_orig", "ltv_now", "ltv_lendable", "cap",
            "drift_pts", "orig_vs_model", "duplicate_of", "risk"]
    loans = b[keep].to_dict("records")
    for rec, a in zip(loans, b.alerts):
        rec["alerts"] = [{"code": c, "severity": s, "text": t} for c, s, t in a]
    return {"summary": summary, "loans": loans, "valuers": sc.to_dict("records"), "cities": cities.to_dict("records")}


def parse_csv(text: str) -> pd.DataFrame:
    df = pd.read_csv(io.StringIO(text))
    df.columns = [c.strip().lower() for c in df.columns]
    need = {"lat", "lon", "area_sqft", "outstanding", "orig_valuation"}
    miss = need - set(df.columns)
    if miss:
        raise ValueError(f"CSV is missing columns: {', '.join(sorted(miss))}")
    df = df.head(5000)
    n = len(df)
    df["loan_id"] = df.get("loan_id", pd.Series([f"UP-{i:05d}" for i in range(n)])).astype(str)
    df["bhk"] = pd.to_numeric(df.get("bhk", 2), errors="coerce").fillna(2)
    df["floor"] = pd.to_numeric(df.get("floor", 3), errors="coerce").fillna(3)
    df["total_floors"] = pd.to_numeric(df.get("total_floors", 10), errors="coerce").fillna(10)
    df["orig_year"] = pd.to_numeric(df.get("orig_year", 2022), errors="coerce").fillna(2022)
    df["valuer"] = df.get("valuer", "unknown")
    df["legal_status"] = df.get("legal_status", "freehold")
    df["sanctioned"] = pd.to_numeric(df.get("sanctioned", df["outstanding"]), errors="coerce")
    df["locality"] = df.get("locality", "")
    df["city"] = df.get("city", "")
    return df
