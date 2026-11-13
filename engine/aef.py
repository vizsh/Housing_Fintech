"""AlphaEarth Foundations satellite embeddings (Google DeepMind, CC-BY 4.0).

64-dim unit vectors summarising a year of multi-sensor satellite observation per 10 m pixel.
We read the shipped COG overview at 1/32 (~320 m pixels): a neighbourhood-scale "what does this
place look like from space" descriptor. Tiles are cached locally after the first read, so any new
location in India is served after one ~5 s fetch.
"""
from __future__ import annotations

import os
import threading
from pathlib import Path

import numpy as np
import pandas as pd

os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
os.environ.setdefault("GDAL_HTTP_MULTIRANGE", "YES")
os.environ.setdefault("GDAL_HTTP_MERGE_CONSECUTIVE_RANGES", "YES")
import rasterio  # noqa: E402
from pyproj import Transformer  # noqa: E402

from common import PROC, RAW  # noqa: E402

YEAR = 2024
OVR = 32
SIZE = 8192 // OVR
CACHE = RAW / "aef" / f"tiles_{YEAR}_o{OVR}"
CACHE.mkdir(parents=True, exist_ok=True)
DIM = 64

_index = None
_lock = threading.Lock()
_mem: dict[str, tuple] = {}


def index() -> pd.DataFrame:
    global _index
    if _index is None:
        small = PROC / "aef_index_india.parquet"  # India-only slice, shipped with the repo
        if small.exists():
            _index = pd.read_parquet(small)
        else:
            d = pd.read_parquet(RAW / "aef" / "aef_index.parquet",
                                columns=["crs", "path", "year", "wgs84_west", "wgs84_south", "wgs84_east", "wgs84_north"])
            _index = d[(d.year == YEAR) & (d.wgs84_west < 98) & (d.wgs84_east > 67) & (d.wgs84_south < 38) & (d.wgs84_north > 5)].reset_index(drop=True)
            _index.to_parquet(small)
    return _index


def tiles_for(lat: float, lon: float) -> pd.DataFrame:
    d = index()
    return d[(d.wgs84_west <= lon) & (d.wgs84_east >= lon) & (d.wgs84_south <= lat) & (d.wgs84_north >= lat)]


def _load_tile(path: str, crs: str):
    key = Path(path).stem
    if key in _mem:
        return _mem[key]
    f = CACHE / f"{key}.npz"
    if f.exists():
        z = np.load(f)
        arr, tr = z["a"], tuple(z["t"])
    else:
        url = path.replace("gs://", "/vsicurl/https://storage.googleapis.com/")
        with rasterio.open(url) as s:
            arr = s.read(out_shape=(DIM, SIZE, SIZE))
            t = s.transform
            # transform of the overview grid
            tr = (t.a * OVR, t.b, t.c, t.d, t.e * OVR, t.f)
        np.savez_compressed(f, a=arr, t=np.array(tr))
    fwd = Transformer.from_crs("EPSG:4326", crs, always_xy=True)
    with _lock:
        _mem[key] = (arr, tr, fwd)
    return _mem[key]


def dequant(v: np.ndarray) -> np.ndarray:
    v = v.astype(np.float32)
    return (v / 127.5) ** 2 * np.sign(v)


def embed(lat: float, lon: float):
    """Return a 64-d embedding (3x3 neighbourhood mean, ~1 km) or None."""
    for r in tiles_for(lat, lon).itertuples():
        arr, tr, fwd = _load_tile(r.path, r.crs)
        x, y = fwd.transform(lon, lat)
        col = int((x - tr[2]) / tr[0])
        row = int((y - tr[5]) / tr[4])
        if 0 <= row < SIZE and 0 <= col < SIZE:
            win = arr[:, max(0, row - 1):row + 2, max(0, col - 1):col + 2].reshape(DIM, -1)
            ok = win[0] != -128
            if ok.sum() == 0:
                continue
            v = dequant(win[:, ok]).mean(axis=1)
            n = np.linalg.norm(v)
            return v / n if n > 0 else v
    return None


def embed_many(latlon: np.ndarray, workers: int = 8, log_every: int = 200) -> np.ndarray:
    """Embed unique coordinates, fetching each tile once (parallel across tiles)."""
    from concurrent.futures import ThreadPoolExecutor

    out = np.full((len(latlon), DIM), np.nan, dtype=np.float32)
    # group points by first tile so tiles are fetched in parallel, once each
    groups: dict[str, list[int]] = {}
    for i, (la, lo) in enumerate(latlon):
        t = tiles_for(la, lo)
        if len(t):
            groups.setdefault(t.iloc[0].path, []).append(i)
    print(f"[aef] {len(latlon)} points across {len(groups)} tiles")
    done = [0]

    def work(item):
        _, idx = item
        for i in idx:
            v = embed(*latlon[i])
            if v is not None:
                out[i] = v
        done[0] += 1
        if done[0] % 10 == 0:
            print(f"[aef] tiles done {done[0]}/{len(groups)}", flush=True)

    with ThreadPoolExecutor(workers) as ex:
        list(ex.map(work, groups.items()))
    return out
