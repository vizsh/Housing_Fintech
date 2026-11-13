# Data

Everything Naksha uses is public. The repository ships the **processed** data and the **trained model**, so the app runs straight after cloning. The raw inputs (about 1 GB) are re-downloadable and are not committed.

## What is committed

| Path | Size | Contents |
|---|---:|---|
| `artifacts/engine.pkl` | 42 MB | Point model, scale model, conformal quantiles, PCA, comparables reference, city stats, benchmark report |
| `artifacts/report.json` | 7 KB | Benchmark: three splits × five methods, ablations, coverage, importance |
| `data/processed/listings.parquet` | 2.8 MB | 106,910 unified, geocoded listings, before the training trim |
| `data/processed/pois.parquet` | 6.5 MB | OSM points of interest, 10 categories |
| `data/processed/places.parquet` | 8 MB | 304k named OSM places for search |
| `data/processed/gazetteer.parquet` | 2.2 MB | Locality → coordinate lookup used in geocoding |
| `data/processed/aef_points.parquet` | 2.1 MB | 64-d satellite embeddings at 5,708 unique listing coordinates |
| `data/processed/aef_index_india.parquet` | 57 KB | AlphaEarth tile index for India, 2024 |
| `data/processed/city_centres.parquet` | 6 KB | City centre coordinates |

## Sources and licences

| Source | Used for | Licence or terms |
|---|---|---|
| Kaggle [`juhibhojani/house-price`](https://www.kaggle.com/datasets/juhibhojani/house-price) | 2023 Magicbricks listings | Per Kaggle dataset page |
| Kaggle [`anmolkumar/house-price-prediction-challenge`](https://www.kaggle.com/datasets/anmolkumar/house-price-prediction-challenge) | 2020 listings with coordinates | Per Kaggle dataset page |
| Kaggle [`ruchi798/housing-prices-in-metropolitan-areas-of-india`](https://www.kaggle.com/datasets/ruchi798/housing-prices-in-metropolitan-areas-of-india) | 2020 six-metro listings | Per Kaggle dataset page |
| Kaggle [`amitabhajoy/bengaluru-house-price-data`](https://www.kaggle.com/datasets/amitabhajoy/bengaluru-house-price-data) | 2017 Bengaluru listings | Per Kaggle dataset page |
| OpenStreetMap via Overpass API | Places, transit, schools, hospitals, malls, parks, land use | © OpenStreetMap contributors, ODbL |
| AlphaEarth Foundations Satellite Embedding (`gs://alphaearth_foundations`) | Satellite context | Google and Google DeepMind, CC-BY 4.0 |
| OpenFreeMap / OpenMapTiles | Base map in the browser | OpenFreeMap terms; © OpenMapTiles, © OSM |
| Anarock, Business Standard, Brookfield India REIT | Commercial rent and cap-rate benchmarks | Figures cited, not redistributed |

## Rebuild from raw

### 1. Download the four Kaggle datasets

Put them in `data/raw/{mb2023,hppc,metro,blr}/`. With a Kaggle API token (`~/.kaggle/access_token`), each download looks like this:

```bash
curl -L -H "Authorization: Bearer $(cat ~/.kaggle/access_token)" -o mb2023.zip https://www.kaggle.com/api/v1/datasets/download/juhibhojani/house-price
```

### 2. Fetch OpenStreetMap data

Fetch these layers for India through Overpass into `data/raw/osm/`:
- `places.json`
- `rail.json`
- `edu.json`
- `health.json`
- `park.json`
- `landuse.json`

### 3. Get the AlphaEarth tile index

Download the AlphaEarth tile index (`aef_index.parquet`, published with the dataset) into `data/raw/aef/`.

### 4. Run the pipeline

Run these from `engine/`:

1. Unify, geocode and clean the listings into `listings.parquet`, `gazetteer.parquet` and `city_centres.parquet`:

   ```bash
   python build_dataset.py
   ```

2. Sample satellite embeddings at every listing coordinate into `aef_points.parquet`. This streams from public GCS.

   ```bash
   python embed_points.py
   ```

3. Build the point-of-interest table, `pois.parquet`:

   ```bash
   python -c "import features; features.build_poi_table()"
   ```

4. Train, calibrate and benchmark. This writes `artifacts/engine.pkl` and `artifacts/report.json`.

   ```bash
   python train.py
   ```

Training takes about 15–20 minutes on a laptop CPU.

## Satellite tiles at run time

The engine reads AlphaEarth tiles on demand with rasterio over HTTPS. It reads only overview level 1/32 (about 320 m), and only the window it needs. Tiles are cached in `data/raw/aef/tiles_2024_o32/`, which is git-ignored, so the first valuation in a new area takes 10–15 s and repeat valuations take milliseconds. With no network, the engine still answers. It drops the satellite block and raises a `NO_SATELLITE` flag.

## Stated assumptions

These are set in `engine/common.py` and shown in the interface:

| Assumption | Value | Basis |
|---|---:|---|
| Annual appreciation used to roll listings forward | 6% | Blend of RBI all-India HPI growth and post-2022 metro listing growth |
| Ask → transaction discount | 6% | Indian portals typically close 3–10% below ask |
| Distress haircut | 22% | SARFAESI auctions commonly clear 15–30% below market |
| Valuation date | 2026-11-01 | |
