# The valuation model

How Naksha turns public listings, maps and satellite imagery into a value with a range you can trust, and how that claim was tested.

**Contents**
1. [Problem framing](#1-problem-framing)
2. [Data](#2-data)
3. [Features](#3-features)
4. [Models](#4-models)
5. [Calibrated ranges](#5-calibrated-ranges)
6. [Explanation](#6-explanation)
7. [Evaluation](#7-evaluation)
8. [Limitations and what would improve it](#8-limitations-and-what-would-improve-it)

---

## 1. Problem framing

The target is **log ₹ per sq ft of carpet area, at the valuation date, on a transaction basis**.

- **Log price per sq ft** makes errors proportional and comparable across a ₹30 lakh flat in Nashik and a ₹6 crore flat in Worli.
- **Carpet area** is the RERA basis. Built-up and super built-up inputs are converted (0.88 and 0.78), so a buyer quoting super area is not over-valued.
- **The valuation date** matters because sources span 2017–2023. Each is rolled forward at a stated 6% a year, and the model also learns a per-source offset on top.
- **Transaction basis:** listings are asking prices. A stated 6% ask-to-transaction discount converts them.

Every one of these assumptions is in `engine/common.py → ASSUMPTIONS` and is printed in the interface next to the value.

## 2. Data

| Source | Rows after cleaning | Year | Geocoding |
|---|---:|---|---|
| Magicbricks listings 2023 (Kaggle `juhibhojani/house-price`) | 47,810 | 2023 | Locality → gazetteer |
| House-price prediction challenge (`anmolkumar/...`) | 22,388 | 2020 | Point coordinates¹ |
| Housing prices in metropolitan areas (`ruchi798/...`) | 21,955 | 2020 | Locality → gazetteer |
| Bengaluru house prices (`amitabhajoy/...`) | 11,309 | 2017 | Locality → gazetteer |
| **Total** | **103,462** | | **250 cities · 9,293 localities** |

¹ The source's latitude and longitude columns are swapped; `load_hppc` corrects this.

**Geocoding.** Most listings name a locality, not a point. A gazetteer built from OpenStreetMap places plus the challenge dataset's own coordinates resolves names in three passes:

1. Exact match.
2. Loose match: punctuation and suffixes stripped.
3. Fuzzy match (`difflib`, cutoff 0.88).

Each pass is recorded in a `geo` precision feature, so the model knows how much to trust a location.

**Cleaning.**
- Duplicates removed.
- Prices and areas parsed out of free text.
- Locality-level robust trim: a listing is dropped when it sits more than 3 MAD from its own locality's median, in localities with 5+ listings. This removed 3,448 rows (3.2%), mostly area or price typos and plots listed as flats.

**Context data.**
- **OpenStreetMap via Overpass:** 10 point-of-interest categories (metro, rail, airport, school, college, hospital, mall, park, commercial land, industrial land) and 304k named places for search.
- **AlphaEarth Foundations Satellite Embedding, 2024:** 64-dimensional annual embeddings of every 10 m pixel on Earth, from Google and Google DeepMind. They are read from the public Cloud-Optimised GeoTIFFs at overview 1/32 (about 320 m) and averaged over a 3 × 3 window around each point.

## 3. Features

| Block | Features | Why |
|---|---|---|
| **Comparables** | Distance-weighted mean and median-of-10 log ₹/sq ft of nearby listings, dispersion, distance to 1st and 10th comparable, counts within 1 and 3 km | The price level of a micro-market. It is the strongest single signal, so the model is constrained to be **monotone** in it. |
| **Access** | Nearest distance and counts within 1 and 3 km for each of the 10 POI categories; distance to city centre | Transit and amenity premium, and industrial-land discount |
| **Satellite** | 16 PCA components of the AlphaEarth embedding | Built density, greenery, water, construction: context that exists where listings don't |
| **Unit** | Area, BHK, area per bedroom, bathrooms, floor, total floors, relative floor, furnishing, facing, new or resale, amenities | Unit-level adjustments |
| **Source** | Listing source, posted-by, geocode precision | Lets the model learn each source's bias, so the sources act as several **biased witnesses** |

### Leakage control: out-of-fold comparables

A listing's comparables never include itself, and in training they come from other folds only. Two augmentations then teach the model to value places it has never seen:

- **Cold-city rows:** 15% of training rows get comparables drawn only from other cities. The model learns to lean on satellite and access features when comparables are missing or far away.
- **Cold-locality rows:** 20% of training rows, and 30% of calibration rows, exclude their own locality from the comparable set.

## 4. Models

**Point model.** LightGBM with a Huber loss (robust to listing noise) on log ₹/sq ft.

- Settings: 2,200 rounds, learning rate 0.03, 127 leaves, `feature_fraction` 0.7, bagging 0.8, L2 regularisation 3.0.
- Monotone constraints on `knn_wmean` and `knn_med10`: a pricier neighbourhood can never lower the estimate.

**Scale model.** A second LightGBM, trained on the log of the point model's absolute out-of-fold residual. It predicts *how wrong the estimate is likely to be* for this property. Thin data, unusual attributes and noisy micro-markets raise it.

## 5. Calibrated ranges

The engine uses **normalised Mondrian split-conformal prediction**:

1. Hold out a calibration set: 15% of rows, never used for fitting.
2. For each calibration row, compute the score `|y − ŷ| / σ̂`, where σ̂ is the scale model's prediction.
3. Bin rows by distance to the nearest comparable (`knn_d1` thresholds 0.05 / 1 / 4 km). Within each bin, take the 68th, 80th and 90th percentiles of the score.
4. For a new property, the range is `ŷ ± q_bin · σ̂`.

Binning by comparable density means a property 6 km from the nearest listing is calibrated against other remote properties, not against dense Mumbai.

**Outputs:**
- **FSD** (forecast standard deviation) is half the 68% range width divided by the value.
- **Confidence** is `1 − FSD`.
- **Lendable value** is the lower bound of the 68% range.

## 6. Explanation

**Factor waterfall.** LightGBM's exact per-prediction contributions (`pred_contrib`, TreeSHAP) are grouped into eight evidence blocks and converted from log space into rupee steps from the base value:

- micro-market comparables;
- satellite context;
- transit and amenities;
- distance to centre;
- size and layout;
- floor and building;
- project amenities;
- listing and title attributes.

**Source reconciliation.** The same property is re-priced as if each source had listed it, which shows each source's bias, and then reconciled.

**Comparables.** The ten nearest similar listings are shown with distance, size, source, and the value each implies for the subject. Outliers more than 0.45 log away from the local level are dropped from the display.

**Land and structure.** A cost-approach split: replacement cost of the structure, depreciated 1.5% a year, with the land share as the residual.

**Facing effects.** The unit re-priced facing each of the eight directions. In this data facing moves value by about ±2%.

## 7. Evaluation

Three splits, each answering a different question. Every method is scored on exactly the same held-out rows.

| Split | Question | Test rows |
|---|---|---:|
| **Random** | How good is it where we have data? | 15,519 (15%) |
| **Unseen localities** | Can it value a neighbourhood it has never seen? | 13,780 (15% of localities held out) |
| **Unseen cities** | Can it value a whole new city? | 4,262 (Lucknow, Coimbatore, Nagpur, Indore, Bhubaneswar, Dehradun, Raipur, Vijayawada) |

### Baselines

- **City median:** the city's median ₹/sq ft × area.
- **Locality median:** how portal "locality rates" work; falls back to the city median when the locality is unknown.
- **Hedonic ridge regression:** the classic econometric AVM.
- **Attributes-only GBM:** the same LightGBM without comparables, satellite or OSM. This isolates what the location evidence adds.

### Accuracy

Each cell gives the median absolute % error, with the share of valuations within 10% of the price in brackets.

| | Naksha | Attributes-only ML | Locality median | Hedonic | City median |
|---|---|---|---|---|---|
| Random | **14.7%** (36.8%) | 16.2% (33.1%) | 18.3% (30.3%) | 24.2% (21.9%) | 25.2% (21.6%) |
| Unseen localities | 20.5% (26.6%) | **19.4%** (27.6%) | 25.2% (21.5%) | 24.2% (22.0%) | 25.2% (21.5%) |
| Unseen cities | **18.9%** (27.3%) | 25.7% (17.3%) | 33.1% (17.8%) | 21.8% (22.8%) | 33.1% (17.8%) |

### Coverage of the conformal ranges

| Promised | Random | Unseen localities | Unseen cities |
|---|---:|---:|---:|
| 68% | 68.1% | 55.6% | 55.3% |
| 80% | 80.5% | 67.9% | 68.0% |
| 90% | 90.2% | 80.2% | 80.9% |

On the distribution it was calibrated for, coverage is essentially exact. On unseen localities and cities it under-covers by about 10 points.

The engine handles this in the decision layer, not by hiding it:
- a property far from comparables gets a `THIN_DATA` flag;
- a point far from covered cities gets `OUTSIDE_COVERAGE`;
- either flag forces a physical visit.

### Ablations (random split, retrained without one block)

| Removed | Median error | Change |
|---|---:|---:|
| Nothing | 14.7% | |
| Satellite embeddings | 15.1% | +0.4 pts |
| OpenStreetMap access | 15.0% | +0.3 pts |
| Comparable features | 14.9% | +0.2 pts |

Where comparables are dense, the blocks substitute for each other, so removing any one costs little. The location blocks matter most where comparables are missing: on the unseen-cities split, Naksha's error is 18.9% against 25.7% for the attributes-only model.

### Top features

By mean absolute contribution: local comparable price level, median of 10 comparables, bathrooms, building height, area per bedroom, area, listing source, commercial land within 3 km, latitude, distance to centre.

## 8. Limitations and what would improve it

| Limitation | Effect | Fix with lender data |
|---|---|---|
| Ground truth is asking prices | Listing noise (±10–15%) is irreducible error; ranges are wider than a production AVM's | Registry transactions (IGR portals) or the lender's own past valuations as another source |
| Locality-level geocoding | Listings in a locality share a point, hurting unseen-locality transfer | Point geocodes from registry or loan files |
| Under-coverage on unseen areas | 90% ranges hold about 80% there | Calibrate per city tier; add distance-to-coverage to the scale model |
| No circle rates, title or legal data | No floor value or encumbrance check | Plug in state circle-rate tables and title-search APIs as features and flags |

The thresholds (waive at FSD ≤ 16%, desk review at ≤ 26%) are set for listing-price ground truth. With transaction ground truth, typical AVM bands of 10% and 20% become reachable.

**Reproduce:** `python engine/train.py` writes `artifacts/engine.pkl` and `artifacts/report.json`. See [DATA.md](DATA.md) for the raw inputs.
