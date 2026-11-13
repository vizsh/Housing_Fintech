"""Feature engineering shared by training and the live API.

Location block:  distance to city centre, OpenStreetMap accessibility (transit, schools, hospitals,
                 malls, parks, commercial/industrial land), AlphaEarth satellite embedding (PCA).
Comparables block: distance-weighted neighbour price statistics (out-of-fold in training).
Property block:  size, configuration, floor, project amenities, transaction type, ownership.
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd
from sklearn.neighbors import BallTree

from common import PROC, RAW, haversine_km

R_EARTH = 6371.0
POI_CATS = ["metro", "rail", "airport", "school", "college", "hospital", "mall", "park", "commercial", "industrial"]
NUM_COLS = ["area_sqft", "bhk", "bathrooms", "balcony", "parking", "covered_parking", "floor", "total_floors",
            "overlook_park", "overlook_main_road", "amenity_score", "gymnasium", "swimmingpool", "liftavailable",
            "clubhouse", "secsecurity", "rera", "under_construction"]
CAT_COLS = ["ptype", "furnishing", "transaction", "ownership", "facing", "source", "posted_by", "geo"]
N_AE = 16


# --------------------------------------------------------------------------- POIs
def build_poi_table():
    rows = []
    for fname in ("rail", "edu", "health", "park", "landuse"):
        for e in json.load(open(RAW / "osm" / f"{fname}.json", encoding="utf-8"))["elements"]:
            t = e.get("tags", {})
            lat = e.get("lat", e.get("center", {}).get("lat"))
            lon = e.get("lon", e.get("center", {}).get("lon"))
            if lat is None:
                continue
            if t.get("aeroway") == "aerodrome":
                cat = "airport"
            elif t.get("station") == "subway" or t.get("subway") == "yes" or "metro" in str(t.get("network", "")).lower() \
                    or "metro" in str(t.get("name", "")).lower():
                cat = "metro"
            elif t.get("railway") == "station":
                cat = "rail"
            elif t.get("amenity") == "school":
                cat = "school"
            elif t.get("amenity") in ("college", "university"):
                cat = "college"
            elif t.get("amenity") == "hospital":
                cat = "hospital"
            elif t.get("shop") == "mall":
                cat = "mall"
            elif t.get("leisure") == "park":
                cat = "park"
            elif t.get("landuse") in ("commercial", "industrial"):
                cat = t["landuse"]
            else:
                continue
            rows.append((cat, lat, lon, t.get("name", "")))
    p = pd.DataFrame(rows, columns=["cat", "lat", "lon", "name"]).drop_duplicates(["cat", "lat", "lon"])
    p.to_parquet(PROC / "pois.parquet")
    return p


class PoiIndex:
    def __init__(self, pois: pd.DataFrame):
        self.trees, self.names, self.coords = {}, {}, {}
        for c in POI_CATS:
            s = pois[pois.cat == c]
            if len(s):
                self.trees[c] = BallTree(np.radians(s[["lat", "lon"]].values), metric="haversine")
                self.names[c] = s["name"].values
                self.coords[c] = s[["lat", "lon"]].values

    def features(self, lat: np.ndarray, lon: np.ndarray) -> pd.DataFrame:
        X = np.radians(np.c_[lat, lon])
        out = {}
        for c in POI_CATS:
            if c not in self.trees:
                continue
            t = self.trees[c]
            d, _ = t.query(X, k=1)
            out[f"d_{c}"] = np.minimum(d[:, 0] * R_EARTH, 50.0)
            if c in ("school", "hospital", "park", "commercial", "mall", "metro", "college"):
                out[f"n1_{c}"] = t.query_radius(X, r=1.0 / R_EARTH, count_only=True)
                out[f"n3_{c}"] = t.query_radius(X, r=3.0 / R_EARTH, count_only=True)
        return pd.DataFrame(out)

    def nearest(self, lat: float, lon: float, cats=("metro", "rail", "school", "hospital", "mall", "park", "airport")):
        res = []
        for c in cats:
            if c not in self.trees:
                continue
            d, i = self.trees[c].query(np.radians([[lat, lon]]), k=1)
            j = int(i[0, 0])
            res.append({"cat": c, "km": round(float(d[0, 0] * R_EARTH), 2), "name": str(self.names[c][j]) or c.title(),
                        "lat": float(self.coords[c][j, 0]), "lon": float(self.coords[c][j, 1])})
        return res


# --------------------------------------------------------------------------- comparables
class CompsIndex:
    """Neighbour price signal from a reference set of listings (log ppsf already time-adjusted)."""

    def __init__(self, lat, lon, logp, w=None):
        self.tree = BallTree(np.radians(np.c_[lat, lon]), metric="haversine")
        self.logp = np.asarray(logp)
        self.w = np.ones_like(self.logp) if w is None else np.asarray(w)

    def features(self, lat, lon, k=40, exclude_self=False, own_keys=None, ref_keys=None):
        X = np.radians(np.c_[lat, lon])
        if own_keys is not None:
            # drop neighbours from the row's own locality (simulates an unseen locality)
            kk = min(k * 6, len(self.logp))
            d, idx = self.tree.query(X, k=kk)
            ok = np.asarray(ref_keys, dtype=object)[idx] != np.asarray(own_keys, dtype=object)[:, None]
            order = np.argsort(~ok, axis=1, kind="stable")[:, :k]
            d, idx = np.take_along_axis(d, order, 1), np.take_along_axis(idx, order, 1)
        else:
            kk = min(k + int(exclude_self), len(self.logp))
            d, idx = self.tree.query(X, k=kk)
            if exclude_self:
                d, idx = d[:, 1:], idx[:, 1:]
        d = d * R_EARTH
        lp = self.logp[idx]
        wt = self.w[idx] / (d + 0.5) ** 2
        out = {
            "knn_wmean": (lp * wt).sum(1) / wt.sum(1),
            "knn_med10": np.median(lp[:, :10], axis=1),
            "knn_std": lp[:, :20].std(1),
            "knn_d1": d[:, 0],
            "knn_d10": d[:, min(9, d.shape[1] - 1)],
            "knn_n1km": (d < 1.0).sum(1),
            "knn_n3km": (d < 3.0).sum(1),
        }
        return pd.DataFrame(out)


def oof_comps(df: pd.DataFrame, logp: np.ndarray, folds: np.ndarray) -> pd.DataFrame:
    """Out-of-fold neighbour features so the target never leaks into its own comps."""
    parts = []
    for f in np.unique(folds):
        tr, te = folds != f, folds == f
        ci = CompsIndex(df.lat.values[tr], df.lon.values[tr], logp[tr])
        p = ci.features(df.lat.values[te], df.lon.values[te])
        p.index = np.where(te)[0]
        parts.append(p)
    return pd.concat(parts).sort_index()


# --------------------------------------------------------------------------- assemble
def base_frame(df: pd.DataFrame) -> pd.DataFrame:
    X = pd.DataFrame(index=df.index)
    for c in NUM_COLS:
        X[c] = pd.to_numeric(df.get(c), errors="coerce") if c in df else np.nan
    X["log_area"] = np.log(X["area_sqft"])
    X["area_per_bhk"] = X["area_sqft"] / X["bhk"].clip(lower=0.5)
    X["floor_ratio"] = X["floor"] / X["total_floors"].replace(0, np.nan)
    X["high_rise"] = (X["total_floors"] >= 12).astype(float).where(X["total_floors"].notna())
    X["d_centre"] = haversine_km(df.lat.values, df.lon.values, df.centre_lat.values, df.centre_lon.values)
    X["lat"], X["lon"] = df.lat.values, df.lon.values
    for c in CAT_COLS:
        X[c] = df[c].astype(str).fillna("nan").astype("category") if c in df else "nan"
    return X
