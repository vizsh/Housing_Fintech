<div align="center">

<img src="docs/img/mark.svg" width="72" alt="Naksha mark: a plot outline with the subject unit in amber" />

# Naksha

### AI collateral valuation engine for Indian housing finance

**Address or map pin in → fair value, calibrated range, confidence, the reasons behind it, and a lending decision: waive the site visit, desk review, or physical valuation.**

*Naksha* (नक्शा) is Hindi for map, or plan: the drawing an architect submits for sanction.

![Python 3.11](https://img.shields.io/badge/Python-3.11-0b2a4a?style=flat-square&labelColor=071f38)
![LightGBM](https://img.shields.io/badge/LightGBM-conformal-0b2a4a?style=flat-square&labelColor=071f38)
![FastAPI](https://img.shields.io/badge/FastAPI-service-0b2a4a?style=flat-square&labelColor=071f38)
![React 19](https://img.shields.io/badge/React_19-Vite-0b2a4a?style=flat-square&labelColor=071f38)
![three.js](https://img.shields.io/badge/three.js-deck.gl-0b2a4a?style=flat-square&labelColor=071f38)
![Data](https://img.shields.io/badge/data-public_only-f2b233?style=flat-square&labelColor=071f38)

Built for **Hero Housing Finance · Problem Statement 1: AI-Powered Digital Property Valuation Engine for India**

</div>

---

![The valuation sheet: input title block, 3D wireframe elevation with sun study, 3D site plan of comparables, value drawn as a dimension with its calibrated range, and the lending decision](docs/img/valuation.png)

## Why this exists

A housing-finance lender in India pays for a physical valuation on almost every loan. The valuer is often anchored to the circle rate or a single property portal. The report states one number and gives no sense of how far to trust it.

The automated valuation models (AVMs) that exist mostly read one data source and return a bare point estimate. That doesn't help a credit officer decide whether a site visit can be skipped.

Naksha is built around that decision. Every valuation ships with three things:

1. **A value with a calibrated range.** A conformal 90% range holds the true price 90.2% of the time on held-out listings. When the data is thin, the range widens and the routing gets stricter instead of bluffing.
2. **The reasons behind it.**
   - Exact factor attribution.
   - The comparable listings it leaned on.
   - What each data source would have said.
   - A land and structure split.
   - Risk flags.
3. **A lending answer in the officer's terms.** Lendable value, maximum loan under the RBI LTV caps, distress value, and a routing decision: **waive / desk review / physical visit**.

It answers for **any point in India**. Deep coverage spans 250 cities with listings; elsewhere it still values the property, with wider ranges, flags, and physical-visit routing.

## Results

Median absolute error against held-out listings (lower is better). Every method is scored on the same rows. Full method in [docs/MODEL.md](docs/MODEL.md).

| Held-out test | **Naksha** | Attributes-only ML | Locality median *(portal-style)* | Hedonic regression | City median |
|---|:---:|:---:|:---:|:---:|:---:|
| Random holdout (15,519 listings) | **14.7%** | 16.2% | 18.3% | 24.2% | 25.2% |
| Unseen localities (13,780) | 20.5% | **19.4%** | 25.2% | 24.2% | 25.2% |
| Unseen tier-2 cities (4,262 · 8 cities) | **18.9%** | 25.7% | 33.1% | 21.8% | 33.1% |

| Range promised | Observed coverage: random | Unseen localities | Unseen cities |
|---|:---:|:---:|:---:|
| 68% | 68.1% | 55.6% | 55.3% |
| 80% | 80.5% | 67.9% | 68.0% |
| 90% | **90.2%** | 80.2% | 80.9% |

> [!NOTE]
> **Read these numbers honestly.**
> - **Ground truth is asking prices, not registered sales.** These are public listings rolled to the valuation date, with a 6% ask-to-sale discount. No public registry data exists.
> - **One loss:** on whole unseen localities, a simpler attributes-only model beats Naksha by about one point. The likely cause is locality-level geocoding of many listings.
> - **Ranges under-cover on unseen areas.** That is why unseen areas raise thin-data flags and route to a physical visit.
>
> The *Model evidence* sheet in the app shows all of this.

## What's inside

| | Sheet | What a credit officer gets |
|---|---|---|
| **VAL** | **Valuation** | <ul><li>Value as a measured dimension with 68/80/90% bands</li><li>Confidence and forecast standard deviation (FSD)</li><li>Lending decision</li><li>3D wireframe elevation with the subject floor in amber, a sun path and cast shadow</li><li>3D site plan of comparables extruded by ₹/sq ft</li><li>Factor waterfall, source reconciliation, comparables table, land and structure split, risk flags</li><li>Printable report</li></ul> |
| | **Drawing set** | <ul><li>Generated unit plan</li><li>RERA area statement with a loading check</li><li>Orientation study: value and sunlight by facing</li><li>Construction-linked disbursement for under-construction homes, with the 3D building drawn to the current slab</li></ul> |
| **CRE** | **Commercial income** | <ul><li>Office, retail or warehouse valued by direct capitalisation plus a ten-year discounted cash flow (DCF)</li><li>3D cash-flow columns and a cap-rate × rent sensitivity grid</li><li>Loan sizing for lease rental discounting (LRD)</li></ul> |
| **MKT** | **Market surface** | A 3D H3 hexagon price surface of India. Fly into any of 18 major cities. |
| **EVD** | **Model evidence** | <ul><li>Benchmark against four baselines on three splits</li><li>Calibration plot and ablations</li><li>Training data and pipeline</li></ul> |

<table>
<tr>
<td width="50%"><img src="docs/img/drawings.png" alt="Drawing set: unit plan, RERA area statement, orientation rose" /><br/><sub><b>Drawing set.</b> Generated unit plan, RERA area statement, value and sunlight by facing.</sub></td>
<td width="50%"><img src="docs/img/commercial.png" alt="Commercial income sheet: 3D ten-year cash flow and sensitivity grid" /><br/><sub><b>Commercial income.</b> Ten-year net operating income (NOI) drawn in 3D, cap-rate × rent sensitivity, LRD loan sizing.</sub></td>
</tr>
<tr>
<td width="50%"><img src="docs/img/market.png" alt="3D hexagon price surface of India" /><br/><sub><b>Market surface.</b> 103k listings as a 3D H3 price surface.</sub></td>
<td width="50%"><img src="docs/img/evidence.png" alt="Model evidence: benchmark bars, calibration plot, ablations" /><br/><sub><b>Model evidence.</b> Every claim on this page, measured.</sub></td>
</tr>
</table>

![Construction-linked disbursement: stage slider, tranche figures and exposure chart](docs/img/construction.png)
<sub><b>Construction-linked disbursement.</b> Drag through the payment-plan stages. Each stage shows the builder's demand, the borrower's margin paid first, the lender's tranche, and what the collateral would realise if the project stalled.</sub>

## How it works

```mermaid
flowchart LR
    subgraph Sources["Public data"]
        A1[Magicbricks 2023<br/>47,810 listings]
        A2[Listing challenge 2020<br/>22,388]
        A3[Six-metro 2020<br/>21,955]
        A4[Bengaluru 2017<br/>11,309]
        B[OpenStreetMap<br/>places · transit · schools<br/>hospitals · malls · land use]
        C[AlphaEarth satellite<br/>embeddings, 64-d, 2024]
    end
    subgraph Engine["engine/ · Python"]
        D[Unify, geocode,<br/>time-align, trim]
        E[Features: out-of-fold comparables,<br/>OSM access, satellite PCA,<br/>attributes, source]
        F[LightGBM point model<br/>Huber, monotone in comps]
        G[LightGBM scale model<br/>on residual size]
        H[Mondrian split-conformal<br/>68 / 80 / 90%]
        I[Decision layer<br/>RBI LTV · FSD routing · flags]
    end
    subgraph Web["web/ · React + three.js + deck.gl"]
        J[Valuation · Drawing set<br/>Commercial · Market · Evidence]
    end
    A1 & A2 & A3 & A4 --> D --> E
    B --> E
    C --> E
    E --> F --> H
    E --> G --> H --> I -->|FastAPI JSON| J
```

- **Several biased witnesses, one verdict.** Each listing source has its own year, area basis and bias. The model learns a per-source offset, and every valuation shows what each source would have said before reconciling them.
- **Comparables as features, not as the answer.** Distance-weighted ₹/sq ft of nearby listings is computed out-of-fold, so the model cannot memorise. Training also deliberately hides the subject's own locality or city on part of the rows, which teaches it to value places it has never seen.
- **Satellite and map context for thin-data places.** AlphaEarth embeddings and OpenStreetMap access let the model price a village outside Nashik even though no listing there exists.
- **Ranges that keep their promise.** A second model predicts how wrong the first is likely to be. Split-conformal calibration, binned by comparable density, turns that into ranges with measured coverage.
- **Decisions, not just numbers.**

  | Route | Condition |
  |---|---|
  | **Waive** the site visit | FSD ≤ 16%, 8 or more comparables within 1 km, and no flags |
  | **Desk review** | FSD ≤ 26% |
  | **Physical visit** | Everything else |

  Lending uses the lower 68% bound under the RBI LTV caps (90 / 80 / 75%). Details in [docs/LENDING.md](docs/LENDING.md).

## Quick start

**Prerequisites:** Python 3.11 and Node 22. The trained model (`artifacts/engine.pkl`) and the processed data (`data/processed/`) are committed, so no training or raw data is needed to run the app.

1. Clone the repository:

   ```bash
   git clone https://github.com/vizsh/Housing_Fintech.git
   ```

2. Install the engine's Python dependencies:

   ```bash
   pip install -r Housing_Fintech/engine/requirements.txt
   ```

3. Start the engine on port 8000. It takes about 20 s to load.

   ```bash
   cd Housing_Fintech && python -m uvicorn --app-dir engine api:app --port 8000
   ```

4. In a second terminal, from the `Housing_Fintech` folder, install the web dependencies:

   ```bash
   npm --prefix web install
   ```

5. Start the web app on port 5173:

   ```bash
   npm --prefix web run dev
   ```

Open **http://localhost:5173**. Deep links: `#income`, `#market`, `#evidence`, `#drawings`, `#construction`.

The first valuation in a new area takes about 10–15 s while its satellite tile streams from Google Cloud Storage. After that, valuations take about 0.5–1 s. To rebuild everything from raw data, see [docs/DATA.md](docs/DATA.md).

**Try these:**
- **Thin data:** pick the *Nashik outskirts* preset. It shows wide ranges, a THIN_DATA flag and physical-visit routing.
- **Unseen city:** pick *Gomti Nagar, Lucknow*, a city the evaluation held out.
- **Under construction:** switch to *Under construction* and drag the stage slider in the Drawing set.
- **Commercial:** on the CRE sheet, enter a lease rent 40% above market and watch the routing change.

## Documentation

| Document | Contents |
|---|---|
| [docs/MODEL.md](docs/MODEL.md) | Data, features, training, conformal calibration, benchmark, ablations, limitations |
| [docs/LENDING.md](docs/LENDING.md) | The decision layer: routing, LTV, flags, commercial LRD, construction-linked disbursement |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, request lifecycle, frontend structure, performance |
| [docs/API.md](docs/API.md) | Every endpoint with request and response examples |
| [docs/DATA.md](docs/DATA.md) | Sources, licences, what is committed, how to rebuild from raw |
| [docs/GUIDE.md](docs/GUIDE.md) | A guided tour of every sheet, for judges and credit officers |
| [docs/RESEARCH.md](docs/RESEARCH.md) | The research base: problem, existing AVMs, gaps, approach, references |
| [DESIGN.md](DESIGN.md) | The *Sanction Blueprint* design system |
| [PRODUCT.md](PRODUCT.md) | Product brief: users, purpose, principles, constraints |

## Repository layout

```
Housing_Fintech/
├── engine/                 Python valuation engine
│   ├── build_dataset.py    unify four listing sources, geocode, clean
│   ├── embed_points.py     sample AlphaEarth satellite embeddings
│   ├── aef.py              satellite tile reader (public GCS COGs, cached)
│   ├── features.py         comparables, OSM access, feature frame
│   ├── train.py            train, calibrate, benchmark → artifacts/
│   ├── api.py              FastAPI service (value, income, search, surface)
│   └── requirements.txt
├── web/                    React 19 + Vite + TypeScript console
│   └── src/
│       ├── sheets/         Valuation, Commercial income, Market, Evidence
│       ├── components/     Elevation (three.js), SitePlan (deck.gl), UnitPlan,
│       │                   Construction, CashflowSkyline, ValueDimension, …
│       └── arch.ts         solar geometry, unit layout, RERA areas, payment stages
├── artifacts/              engine.pkl (trained model), report.json (benchmark)
├── data/processed/         listings, POIs, gazetteer, satellite points, indexes
└── docs/                   documentation and screenshots
```

## Limitations

- **Asking prices, not transactions.** The architecture accepts registry or lender outcomes as another source (another witness), and the decision thresholds would tighten with them.
- **Commercial valuation is a method demo.** No public Indian commercial dataset was found. Office rents and cap rates come from published 2025–26 broker and REIT reports, the rest are stated assumptions, and its range is a sensitivity band rather than a calibrated interval.
- **The unit plan is indicative.** It checks the declared area against the declared rooms; it is not the sanctioned drawing.
- **No registry, circle-rate, title or lender data** is used anywhere. Every assumption is stated in the interface.

## Credits

- Listing data: Kaggle datasets by `juhibhojani`, `anmolkumar`, `ruchi798`, `amitabhajoy`.
- Map data © OpenStreetMap contributors (ODbL); map tiles by OpenFreeMap / OpenMapTiles.
- Satellite: *AlphaEarth Foundations Satellite Embedding*, Google and Google DeepMind (CC-BY 4.0).
- Office rent benchmarks: Anarock (2025) and Business Standard (May 2025). Cap rates: Brookfield India REIT valuation summary, FY26.

Built for the Hero Housing Finance challenge. Not affiliated with or endorsed by Hero Housing Finance.
