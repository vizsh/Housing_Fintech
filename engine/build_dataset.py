"""Unify the public Indian listing datasets into one geocoded table.

Sources (Kaggle, public):
  mb2023  juhibhojani/house-price                    ~187k Magicbricks listings (2023), 81 cities
  hppc    anmolkumar/house-price-prediction-challenge ~29k listings with coordinates (2020)
  metro   ruchi798/housing-prices-in-metropolitan-areas-of-india  6 metros with amenities
  blr     amitabhajoy/bengaluru-house-price-data     Bengaluru (2017)
Geocoding: locality gazetteer from hppc coordinates (98k rows incl. unlabeled test set)
plus OpenStreetMap place nodes (Overpass).
"""
from __future__ import annotations

import difflib
import json
import re
from collections import defaultdict

import numpy as np
import pandas as pd

from common import PROC, RAW, haversine_km, in_india, norm_city, norm_loc, norm_loc_loose

CITY_RADIUS_KM = 45.0
SQFT = {"sqft": 1.0, "sqyrd": 9.0, "sqm": 10.7639}
BASIS_TO_CARPET = {"carpet": 1.0, "builtup": 0.88, "super": 0.78}


# --------------------------------------------------------------------------- gazetteer
def load_osm_places():
    els = json.load(open(RAW / "osm" / "places.json", encoding="utf-8"))["elements"]
    rows = []
    for e in els:
        t = e.get("tags", {})
        lat, lon = e.get("lat"), e.get("lon")
        if lat is None:
            continue
        pop = re.sub(r"[^0-9]", "", str(t.get("population", "")))
        names = {t.get("name"), t.get("name:en"), t.get("alt_name"), t.get("old_name"), t.get("official_name")}
        for n in names:
            if n and re.search(r"[A-Za-z]", n):
                rows.append((n, t.get("place"), lat, lon, int(pop) if pop else 0))
    return pd.DataFrame(rows, columns=["name", "place", "lat", "lon", "pop"])


def city_centres(osm: pd.DataFrame, hppc: pd.DataFrame, cities: set[str]) -> dict:
    osm = osm.assign(nc=osm["name"].map(norm_city))
    big = osm[osm.place.isin(["city", "town"])]
    rank = {"city": 2, "town": 1}
    centres = {}
    hp_med = hppc.groupby("city")[["lat", "lon"]].median()
    for c in cities:
        cand = big[big.nc == c]
        if len(cand):
            cand = cand.assign(r=cand.place.map(rank)).sort_values(["r", "pop"], ascending=False)
            centres[c] = (float(cand.iloc[0].lat), float(cand.iloc[0].lon))
        elif c in hp_med.index:
            centres[c] = tuple(map(float, hp_med.loc[c]))
    # Prefer hppc median when OSM picked a same-name town far away from where listings are.
    for c, (la, lo) in list(centres.items()):
        if c in hp_med.index:
            hl, ho = hp_med.loc[c]
            if haversine_km(la, lo, hl, ho) > 60:
                centres[c] = (float(hl), float(ho))
    return centres


class Gazetteer:
    def __init__(self, centres, osm, hppc):
        self.centres = centres
        self.exact = defaultdict(dict)  # city -> norm name -> (lat, lon, weight, src)
        self.loose = defaultdict(dict)
        prio = {"suburb": 5, "neighbourhood": 5, "quarter": 5, "locality": 4, "town": 3, "city": 3, "village": 2, "hamlet": 1}
        for c, (clat, clon) in centres.items():
            d = haversine_km(clat, clon, osm.lat.values, osm.lon.values)
            near = osm[d < CITY_RADIUS_KM].assign(dist=d[d < CITY_RADIUS_KM], p=lambda x: x.place.map(prio))
            near = near.sort_values(["p", "dist"], ascending=[False, True])
            for r in near.itertuples():
                k = norm_loc(r.name)
                if k and k not in self.exact[c]:
                    self.exact[c][k] = (r.lat, r.lon, 1, "osm")
                kl = norm_loc_loose(r.name)
                if kl and kl not in self.loose[c]:
                    self.loose[c][kl] = (r.lat, r.lon, 1, "osm")
        # hppc observed coordinates override OSM (they are where listings actually are)
        g = hppc.groupby(["city", "lockey"]).agg(lat=("lat", "median"), lon=("lon", "median"), n=("lat", "size")).reset_index()
        for r in g.itertuples():
            if r.city in centres:
                self.exact[r.city][r.lockey] = (r.lat, r.lon, r.n, "hppc")
                kl = norm_loc_loose(r.lockey)
                if kl not in self.loose[r.city] or self.loose[r.city][kl][3] == "osm":
                    self.loose[r.city][kl] = (r.lat, r.lon, r.n, "hppc")
        self.keys = {c: list(v.keys()) for c, v in self.exact.items()}

    def lookup(self, city: str, loc: str):
        if city not in self.centres or not loc:
            return None
        k = norm_loc(loc)
        if not k:
            return None
        if k in self.exact[city]:
            return self.exact[city][k] + ("exact",)
        kl = norm_loc_loose(loc)
        if kl and kl in self.loose[city]:
            return self.loose[city][kl] + ("loose",)
        m = difflib.get_close_matches(k, self.keys.get(city, []), n=1, cutoff=0.88)
        if m:
            return self.exact[city][m[0]] + ("fuzzy",)
        return None

    def lookup_parts(self, city: str, parts: list[str]):
        for p in parts:
            hit = self.lookup(city, p)
            if hit:
                return p, hit
        return None, None


# --------------------------------------------------------------------------- loaders
def load_hppc():
    frames = []
    for f, has_y in (("train.csv", True), ("test.csv", False)):
        d = pd.read_csv(RAW / "hppc" / f)
        d["labeled"] = has_y
        frames.append(d)
    d = pd.concat(frames, ignore_index=True)
    # Columns are swapped in the source: LONGITUDE holds latitude.
    d["lat"], d["lon"] = d["LONGITUDE"], d["LATITUDE"]
    parts = d["ADDRESS"].astype(str).str.rsplit(",", n=1)
    d["locality"] = parts.str[0].str.strip()
    d["city"] = parts.str[-1].map(norm_city)
    d["lockey"] = d["locality"].map(norm_loc)
    d = d[in_india(d.lat, d.lon)].copy()
    # keep coordinates that sit near the city's bulk of listings
    med = d.groupby("city")[["lat", "lon"]].transform("median")
    d = d[haversine_km(d.lat, d.lon, med.lat, med.lon) < CITY_RADIUS_KM]
    return d


def parse_amount(s):
    m = re.match(r"\s*([\d.]+)\s*(Lac|Cr)", str(s))
    if not m:
        return np.nan
    return float(m.group(1)) * (1e5 if m.group(2) == "Lac" else 1e7)


def parse_area(s):
    m = re.match(r"\s*([\d.,]+)\s*(sqft|sqyrd|sqm)\b", str(s))
    if not m:
        return np.nan
    return float(m.group(1).replace(",", "")) * SQFT[m.group(2)]


def parse_floor(s):
    s = str(s)
    m = re.match(r"\s*(\w+(?: \w+)?) out of (\d+)", s)
    if not m:
        m2 = re.match(r"\s*(\d+)\s*$", s)
        return (float(m2.group(1)), np.nan) if m2 else (np.nan, np.nan)
    f = m.group(1).lower()
    fl = {"ground": 0, "upper basement": -1, "lower basement": -2}.get(f)
    if fl is None:
        fl = float(f) if f.isdigit() else np.nan
    return fl, float(m.group(2))


def load_mb2023():
    d = pd.read_csv(RAW / "mb2023" / "house_prices.csv", low_memory=False).drop(columns=["Index"])
    d = d.drop_duplicates()
    d["price"] = d["Amount(in rupees)"].map(parse_amount)
    carpet = d["Carpet Area"].map(parse_area)
    sup = d["Super Area"].map(parse_area)
    d["area_raw"] = carpet.fillna(sup)
    d["area_basis"] = np.where(carpet.notna(), "carpet", np.where(sup.notna(), "super", None))
    d["city"] = d["location"].map(norm_city)
    t = d["Title"].astype(str)
    d["bhk"] = pd.to_numeric(t.str.extract(r"^(\d+)\s*BHK", expand=False), errors="coerce")
    d["ptype"] = t.str.extract(r"(?:Occupy|BHK)\s+(.+?)\s+for sale", expand=False).str.lower().str.strip()
    rest = t.str.extract(r"for sale\s+(.*)$", expand=False).fillna("")
    soc = d["Society"].fillna("")

    def loc_parts(r, s, city):
        if s and r.lower().startswith("in " + s.lower()):
            r = r[3 + len(s):]
        elif r.lower().startswith("in "):
            r = r[3:]
        r = re.sub(rf"\b{re.escape(city)}\b", " ", r, flags=re.I)
        bits = [b.strip() for b in r.split(",") if b.strip()]
        # try the last comma part (usually the locality), then the others, then society
        out = bits[::-1] + ([s] if s else [])
        # also try the last 1-3 words of each part (titles often append the locality)
        extra = []
        for b in bits[::-1]:
            w = b.split()
            extra += [" ".join(w[-k:]) for k in (3, 2, 1) if len(w) > k]
        return out + extra

    d["loc_parts"] = [loc_parts(r, s, c) for r, s, c in zip(rest, soc, d["city"].str.replace(" ", "-"))]
    fl = d["Floor"].map(parse_floor)
    d["floor"] = fl.str[0]
    d["total_floors"] = fl.str[1]
    d["bathrooms"] = pd.to_numeric(d["Bathroom"].astype(str).str.extract(r"(\d+)", expand=False), errors="coerce")
    d["balcony"] = pd.to_numeric(d["Balcony"].astype(str).str.extract(r"(\d+)", expand=False), errors="coerce")
    d["parking"] = pd.to_numeric(d["Car Parking"].astype(str).str.extract(r"(\d+)", expand=False), errors="coerce").clip(upper=6)
    d["covered_parking"] = d["Car Parking"].astype(str).str.contains("Covered").astype(float)
    d["furnishing"] = d["Furnishing"].fillna("Unknown")
    d["transaction"] = np.where(d["Transaction"] == "New Property", "new", "resale")
    d["ownership"] = d["Ownership"].fillna("Unknown")
    d["facing"] = d["facing"].fillna("Unknown")
    d["overlook_park"] = d["overlooking"].astype(str).str.contains("Garden|Park").astype(float)
    d["overlook_main_road"] = d["overlooking"].astype(str).str.contains("Main Road").astype(float)
    d["society"] = soc
    d["source"] = "mb2023"
    return d


def load_metro():
    frames = []
    for f in (RAW / "metro").glob("*.csv"):
        d = pd.read_csv(f)
        d["city"] = norm_city(f.stem)
        frames.append(d)
    d = pd.concat(frames, ignore_index=True)
    amen = [c for c in d.columns if c not in ("Price", "Area", "Location", "No. of Bedrooms", "Resale", "city")]
    d = d.replace(9, np.nan)
    d["amenity_score"] = d[amen].mean(axis=1)
    d = d.rename(columns={"Price": "price", "Area": "area_raw", "No. of Bedrooms": "bhk"})
    d["area_basis"] = "super"
    d["transaction"] = np.where(d["Resale"] == 1, "resale", "new")
    d["loc_parts"] = d["Location"].astype(str).map(lambda s: [s] + [b.strip() for b in s.split(",")][::-1])
    for k in ("Gymnasium", "SwimmingPool", "LiftAvailable", "ClubHouse", "24X7Security"):
        d[k.lower().replace("24x7", "sec")] = d[k]
    d["source"] = "metro"
    return d


def load_blr():
    d = pd.read_csv(RAW / "blr" / "Bengaluru_House_Data.csv")

    def sqft(s):
        s = str(s)
        if "-" in s:
            a, b = s.split("-")[:2]
            try:
                return (float(a) + float(b)) / 2
            except ValueError:
                return np.nan
        return parse_area(s) if re.search(r"[a-z]", s) else pd.to_numeric(s, errors="coerce")

    d["area_raw"] = d["total_sqft"].map(sqft)
    d["price"] = d["price"] * 1e5
    d["bhk"] = pd.to_numeric(d["size"].astype(str).str.extract(r"(\d+)", expand=False), errors="coerce")
    d["ptype"] = np.where(d["area_type"].str.contains("Plot"), "independent house", "flat")
    d["area_basis"] = np.where(d["area_type"].str.contains("Carpet"), "carpet", np.where(d["area_type"].str.contains("Super"), "super", "builtup"))
    d["bathrooms"] = d["bath"]
    d["transaction"] = np.where(d["availability"] == "Ready To Move", "resale", "new")
    d["city"] = "bangalore"
    d["loc_parts"] = d["location"].astype(str).map(lambda s: [s])
    d["society"] = d["society"].fillna("")
    d["source"] = "blr"
    return d


def hppc_labeled(hp):
    d = hp[hp.labeled].copy()
    d["price"] = d["TARGET(PRICE_IN_LACS)"] * 1e5
    d["area_raw"] = d["SQUARE_FT"]
    d["area_basis"] = "super"
    d["bhk"] = np.where(d["BHK_OR_RK"] == "RK", 0.5, d["BHK_NO."])
    d["transaction"] = np.where(d["RESALE"] == 1, "resale", "new")
    d["rera"] = d["RERA"].astype(float)
    d["under_construction"] = d["UNDER_CONSTRUCTION"].astype(float)
    d["posted_by"] = d["POSTED_BY"]
    d["source"] = "hppc"
    d["geo"] = "point"
    return d


# --------------------------------------------------------------------------- main
def main():
    hp = load_hppc()
    osm = load_osm_places()
    mb, me, bl = load_mb2023(), load_metro(), load_blr()
    cities = set(mb.city) | set(me.city) | set(bl.city) | set(hp.city.value_counts()[lambda s: s >= 40].index)
    centres = city_centres(osm, hp, cities)
    print(f"cities with centres: {len(centres)} / {len(cities)}")
    gz = Gazetteer(centres, osm, hp)

    out = []
    for d in (mb, me, bl):
        hits = [gz.lookup_parts(c, p) for c, p in zip(d.city, d.loc_parts)]
        d["locality"] = [h[0] for h in hits]
        d["lat"] = [h[1][0] if h[1] else np.nan for h in hits]
        d["lon"] = [h[1][1] if h[1] else np.nan for h in hits]
        d["geo"] = [("loc_" + h[1][4]) if h[1] else None for h in hits]
        print(d.source.iloc[0], "rows", len(d), "geocoded", round(d.lat.notna().mean(), 3),
              d.geo.value_counts(normalize=True).round(3).to_dict())
        out.append(d)
    out.append(hppc_labeled(hp))

    cols = ["source", "city", "locality", "lat", "lon", "geo", "price", "area_raw", "area_basis", "bhk", "ptype",
            "floor", "total_floors", "bathrooms", "balcony", "parking", "covered_parking", "furnishing", "transaction",
            "ownership", "facing", "overlook_park", "overlook_main_road", "society", "amenity_score", "gymnasium",
            "swimmingpool", "liftavailable", "clubhouse", "secsecurity", "rera", "under_construction", "posted_by"]
    df = pd.concat([d.reindex(columns=cols) for d in out], ignore_index=True)
    df["ptype"] = df["ptype"].fillna("flat").replace({"residential plot": "plot"})
    df["area_sqft"] = df["area_raw"] * df["area_basis"].map(BASIS_TO_CARPET).fillna(0.8)
    df = df.dropna(subset=["lat", "lon", "price", "area_sqft"])
    df = df[(df.area_sqft >= 150) & (df.area_sqft <= 12000) & (df.price >= 3e5) & (df.price <= 5e8)]
    df["ppsf"] = df.price / df.area_sqft
    df = df[(df.ppsf > 800) & (df.ppsf < 150000)]
    # robust per-city outlier trim on log ppsf
    lp = np.log(df.ppsf)
    med = lp.groupby(df.city).transform("median")
    mad = (lp - med).abs().groupby(df.city).transform("median") * 1.4826 + 1e-6
    df = df[((lp - med) / mad).abs() < 4.0]
    df["bhk"] = df["bhk"].clip(0.5, 8)
    df = df.drop_duplicates(subset=["city", "locality", "price", "area_sqft", "bhk", "floor", "source"])
    df["centre_lat"] = df.city.map(lambda c: centres.get(c, (np.nan, np.nan))[0])
    df["centre_lon"] = df.city.map(lambda c: centres.get(c, (np.nan, np.nan))[1])
    df = df.reset_index(drop=True)
    df.to_parquet(PROC / "listings.parquet")
    pd.DataFrame([(c, a, b) for c, (a, b) in centres.items()], columns=["city", "lat", "lon"]).to_parquet(PROC / "city_centres.parquet")
    # gazetteer for the API (address/locality search)
    rows = []
    for c, m in gz.exact.items():
        for k, (la, lo, n, src) in m.items():
            rows.append((c, k, la, lo, n, src))
    pd.DataFrame(rows, columns=["city", "key", "lat", "lon", "n", "src"]).to_parquet(PROC / "gazetteer.parquet")
    print("final rows", len(df))
    print(df.groupby("source").size().to_dict())
    print(df.city.value_counts().head(30).to_dict())


if __name__ == "__main__":
    main()
