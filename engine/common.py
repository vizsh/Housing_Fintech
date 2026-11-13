"""Shared paths, constants and text normalisation."""
from __future__ import annotations

import math
import re
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
PROC = ROOT / "data" / "processed"
ART = ROOT / "artifacts"
PROC.mkdir(parents=True, exist_ok=True)
ART.mkdir(parents=True, exist_ok=True)

INDIA_BBOX = (6.0, 68.0, 37.5, 97.5)  # lat_min, lon_min, lat_max, lon_max

# Market assumptions. Every one of these is surfaced in the UI and the report.
ASSUMPTIONS = {
    # Asking (listing) price -> expected transaction price. Listing portals in India
    # typically close 3-10% below ask; mid-point used.
    "ask_to_txn_discount": 0.06,
    # Annual appreciation used to roll each source forward to the valuation date.
    # Conservative blend of RBI all-India HPI growth (low-mid single digits) and
    # post-2022 metro listing growth. Overridden per source by learned offsets.
    "annual_appreciation": 0.06,
    "valuation_date": "2026-11-01",
    # Forced-sale (distress) haircut for lending: SARFAESI auctions in India
    # commonly clear 15-30% below market.
    "distress_haircut": 0.22,
}

# Source year (approximate scrape date) for each public dataset.
SOURCE_YEAR = {"mb2023": 2023.5, "hppc": 2020.5, "metro": 2020.8, "blr": 2017.5}

CITY_ALIASES = {
    "bengaluru": "bangalore", "new delhi": "delhi", "new-delhi": "delhi", "gurugram": "gurgaon",
    "navi-mumbai": "navi mumbai", "greater-noida": "greater noida", "secunderabad": "hyderabad",
    "mysuru": "mysore", "bombay": "mumbai", "calcutta": "kolkata", "madras": "chennai",
    "trivandrum": "thiruvananthapuram", "vizag": "visakhapatnam", "baroda": "vadodara",
    "prayagraj": "allahabad", "cochin": "kochi", "ernakulam": "kochi", "pondicherry": "puducherry",
    "mangaluru": "mangalore", "belagavi": "belgaum", "kalyan-dombivali": "kalyan",
}

_ws = re.compile(r"\s+")
_nonalnum = re.compile(r"[^a-z0-9 ]+")
_dir = re.compile(r"\b(east|west|north|south|e|w|n|s)\b")


def norm_city(s: str) -> str:
    s = str(s).strip().lower().replace("_", " ")
    s = CITY_ALIASES.get(s, s)
    s = s.replace("-", " ")
    return CITY_ALIASES.get(s, s)


def norm_loc(s: str) -> str:
    s = str(s).lower().replace("&", " and ")
    s = _nonalnum.sub(" ", s)
    s = re.sub(r"\bsec\b|\bsect\b", "sector", s)
    s = re.sub(r"\bph\b", "phase", s)
    s = re.sub(r"\b(road|rd)\b", "road", s)
    return _ws.sub(" ", s).strip()


def norm_loc_loose(s: str) -> str:
    """Drop compass suffixes ('Andheri West' -> 'andheri') for a second-chance match."""
    return _ws.sub(" ", _dir.sub(" ", norm_loc(s))).strip()


def haversine_km(lat1, lon1, lat2, lon2):
    lat1, lon1, lat2, lon2 = map(np.radians, (lat1, lon1, lat2, lon2))
    a = np.sin((lat2 - lat1) / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin((lon2 - lon1) / 2) ** 2
    return 6371.0 * 2 * np.arcsin(np.sqrt(a))


def in_india(lat, lon):
    return (lat > INDIA_BBOX[0]) & (lat < INDIA_BBOX[2]) & (lon > INDIA_BBOX[1]) & (lon < INDIA_BBOX[3])


def years_between(y0: float, y1: float) -> float:
    return max(0.0, y1 - y0)


def valuation_year() -> float:
    y, m, _ = ASSUMPTIONS["valuation_date"].split("-")
    return int(y) + (int(m) - 0.5) / 12


def safe_float(x):
    try:
        v = float(x)
        return v if math.isfinite(v) else None
    except (TypeError, ValueError):
        return None
