# Problem Statement 1 — AI property valuation engine for India: ideation base

Hero Housing Finance challenge. Written 13 Nov 2026. Research is from web searches; items marked **[unverified]** need a primary-source check before they go on a slide.

## 1. The problem, read as a lender reads it

A housing finance company (HFC) does not want a consumer price estimate. It wants an answer to: *how much can I safely lend against this collateral, and do I need to send a valuer?*

How it works today:

- An empanelled valuer visits the property and writes a report. Days of turnaround, a fee per report, and results that vary by valuer.
- RBI's HFC directions require two valuation reports for loans of ₹50 lakh and above (at least one independent), and two independent reports at ₹75 lakh and above; the lender uses the lower figure. **[thresholds conflict across sources — check the July 2025 Master Direction annex]**
- LTV caps are set by loan size, so the valuation directly sets the loan amount.
- Human valuation is biased toward the deal price. US evidence: over 90% of appraisals submitted to Fannie Mae came in at or above the contract price, about a third exactly at it; appraisers who knew the price valued 4–8% higher than those who did not. No equivalent Indian study turned up, but the incentive is the same.

So the objective in the brief (less physical valuation, faster turnaround, better accuracy, risk-based lending) reduces to one design target: **a value plus a trustworthy statement of how wrong it could be, good enough to decide which cases skip the site visit.**

## 2. Why existing AVMs fall short in India

| Gap | What goes wrong | Evidence |
|---|---|---|
| No ground truth | Registered prices cluster at the circle rate (under-reporting to save stamp duty); listing prices are asking prices; there is no MLS | Circle rates trail market in most urban corridors; informal estimates put registry values 30–50% below true price in some markets |
| Anchoring on circle rates | Models inherit the lag and coarseness of government rates | Kubera's public whitepaper: circle-rate anchored, 453 cities, ~18% median error, "general reference only" |
| Locality averages | Portals publish ₹/sqft per locality; no property-level adjustment | Housing.com's AVM: tree model on its own listings since 2016, ~10% MAPE self-reported, top cities only |
| Heterogeneous stock | Self-built plotted houses are a majority of affordable-segment lending (62% in a 2018 FSG report); carpet vs built-up vs super built-up; legal status (Lal Dora, gram panchayat, unauthorised) moves value and lendability | Lenders cap Lal Dora LTV at roughly 50–70% |
| Thin data outside metros | Few transactions per neighbourhood in tier 2/3, exactly where Hero-type lenders grow | Home First describes valuation in smaller cities as a bottleneck |
| Point estimate only | No calibrated confidence, so a credit team cannot act on it | Global lender-grade AVMs all ship FSD/confidence; Indian ones mostly do not |
| No lending output | Value is not translated into lendable value, distress value, or a waive/visit decision | Valocity and peers digitise the valuer workflow rather than replace it |

What has worked elsewhere, and what we take from it:

- **Zillow neural Zestimate** (6.9% median error off-market): one national model beats ~1,000 local models because sales are sparse locally. *Take:* one India-wide model with location embeddings, not city-by-city models.
- **Opendoor**: structural inductive biases (comps, adjustments) inside the network. *Take:* build the valuer's logic into the model structure.
- **Zillow Offers collapse** ($569M write-downs): forecasting error, adverse selection, non-standard homes. *Take:* know when not to trust the model; abstain and escalate.
- **GNN benchmark (2024)**: gradient-boosted trees with neighbour features beat graph neural networks for house prices. *Take:* don't build a GNN; feed neighbour aggregates to trees.
- **LLMs for appraisal (ECML-PKDD 2025)**: competitive with ten well-chosen comps, but overconfident intervals and weak spatial reasoning. *Take:* the LLM explains, it never produces the number.

## 3. The approach: five ideas that differentiate

### Idea 1 — Treat fair value as hidden, and every data source as a biased witness

This is the core. Instead of training on one noisy label, model the true price as a latent variable observed through several sources, each with its own known distortion:

| Source | Distortion | How the model treats it |
|---|---|---|
| Listing asking price | Biased upward | Learn a negotiation discount by city/segment |
| Registered consideration | Censored: when it sits at the circle rate, true price is *at least* that | Censored (Tobit-style) likelihood, not a plain regression target |
| Circle rate / ready reckoner | Stale floor, coarse zones | Lower-bound prior; available everywhere |
| RERA declared prices | New-build only, developer-reported | Clean anchor for apartment projects |
| Lender's own valuations and resale/auction outcomes | Small volume, closest to truth | Calibration set in production (Hero's data; simulated in the prototype) |

Why this works: each source is wrong in a *different, modellable* direction. Where two or three overlap on the same building or street, their biases can be estimated, then applied where only one source exists. Every Indian AVM found in this research picks one source and inherits its error.

### Idea 2 — Value the way an Indian valuer does: land + structure

Value = land value (location surface × plot area or undivided share) + depreciated construction cost (built-up area × quality × age) + a market premium for project, floor, amenities.

- Works for self-built houses, where apartment comps do not exist.
- Extends to commercial by swapping the structure term for an income approach (rent × yield).
- Each term is separately explainable and separately checkable.
- Monotonic constraints (more area never lowers value, more age never raises it) keep outputs sane on odd inputs, which matters when judges type anything.

### Idea 3 — A national location-value surface from satellite foundation embeddings

Thin transaction data is beaten by features that exist for every square of India:

- **AlphaEarth Foundations embeddings** — 64-dim vector per 10 m cell, annual 2017–2025, CC-BY 4.0, on Earth Engine (`GOOGLE/SATELLITE_EMBEDDING/V1/ANNUAL`).
- **Open Buildings 2.5D Temporal** — building presence and height, annual 2016–2023, covers South Asia. Gives built density, floors, and *growth rate* of a neighbourhood.
- **VIIRS night lights**, **OSM / Overture** roads and POIs, distance to metro, highway, CBD, schools, hospitals.
- **RBI HPI / NHB RESIDEX** for the city-level time trend.

Train the surface where labels are dense (metros), transfer to places with only circle rates. Hexagonal grid (H3) cells as the unit. This is the answer to "how you extend to the rest of India".

### Idea 4 — Calibrated uncertainty that drives a lending decision

- Conformalized quantile regression gives intervals with guaranteed coverage; plain quantile regression badly under-covers (Bastos & Paquette 2025).
- Coverage must be calibrated *locally*, since spatial dependence breaks naive conformal (Hjort et al., Oslo data).
- Output is a triage:

| Band | Meaning | Action |
|---|---|---|
| Green | Narrow interval, dense comps, clean flags | Waive physical valuation |
| Amber | Moderate interval or one flag | Desktop / photo-assisted review |
| Red | Wide interval, sparse data, or legal/physical flag | Full physical valuation |

- Lendable value is taken from the conservative end of the interval, so LTV is computed on a number the lender can defend.
- The headline business metric becomes: *what share of cases go Green at what realised error* — a direct measure of physical valuations avoided.

### Idea 5 — Explanations in the valuer's own format

Three layers, all derived from the model rather than written freely:

1. **Comparable grid** — the 5–8 nearest evidence points with adjustments, as in a sales-comparison report.
2. **Factor contributions** — SHAP on the land / structure / premium terms.
3. **Narrative report** — an LLM turns layers 1–2 and the risk flags into a draft valuation report; it is given the numbers and may not change them.

Plus a lending layer that existing tools lack: distress-sale value, marketability score, risk flags (flood exposure, unauthorised-colony boundary, does a building of the claimed height actually exist on the plot per satellite), mismatch between declared and modelled value as a fraud signal, and whole-portfolio revaluation.

## 4. Model stack

1. **Resolve** — free-text address → geocode → H3 cell → match to project/society where one exists.
2. **Location surface** — gradient-boosted trees on embeddings + geo features + time-decayed neighbour price aggregates → land ₹/sqft with uncertainty.
3. **Property model** — LightGBM/CatBoost on log ₹/sqft with monotonic constraints, trained under the multi-source noise model. In thin markets, blend with a tabular foundation model (TabPFN-2.5 / TabICL) run in-context on the k nearest comps — these are strong on small data.
4. **Time adjustment** — micro-market hedonic index to bring every comp to the valuation date.
5. **Conformal layer** — locally weighted intervals → FSD, confidence band, lendable value.
6. **Explain + report** — comps grid, SHAP, generated report.

## 5. How accuracy is proved

"Significantly higher than existing AVMs" needs a like-for-like test, since vendor numbers use different metrics and are not comparable.

- **Metrics:** MdAPE, PPE10 / PPE20, interval coverage, FSD, hit rate, plus COD and PRD (does the model over-value cheap homes).
- **Splits:** train on the past, test on the most recent months; and hold out whole localities, to test transfer.
- **Baselines on the same test set:** circle rate × city multiplier; locality median ₹/sqft (what portals do); plain hedonic regression; untuned XGBoost on attributes only.
- **Ablations:** show the lift from each idea (multi-source labels, satellite embeddings, land+structure).
- **Reference points:** Kubera ~18% median error; Housing.com ~10% MAPE (own listings); Zillow 6.9% off-market; a lender-grade bar often quoted is PPE10 ≥ 80% (US).

Honest limit: without lender or registry ground truth the test set is itself noisy. State this, and report results on the cleanest subset (RERA projects, cross-source agreeing records).

## 6. Prototype scope that survives "test it on anything"

- **Depth tier:** 4–6 cities with everything (e.g. Mumbai MMR, Pune, Bengaluru, Delhi NCR, Hyderabad, plus one tier-2 such as Jaipur or Lucknow).
- **Breadth tier:** all India via satellite surface + circle rates, with visibly wider intervals.
- The engine never refuses and never bluffs: an obscure address returns a value, a wide band, and a Red routing. That behaviour *is* the lending workflow, and it is what makes open testing safe.
- UI: address or map pin + a few attributes (type, area, age, floor) → value, range, confidence band, comps on a map, factor breakdown, lendable value and LTV, downloadable report.

## 7. Risks and open items

- **Data access is the real constraint, not modelling.** Listing portals' terms may forbid scraping; IGR Maharashtra's free search is view-only. Public Kaggle/GitHub sets exist (e.g. ~27k MagicBricks records) but are small and may lack coordinates. Decide the acquisition route first.
- No public bulk API found for NGDRS / ULPIN parcel data. Position these as production integrations, not prototype inputs.
- Whether RBI permits waiving physical valuation for any loan band is **[unverified]**. Safer framing: AVM as the second valuation, as pre-screening, and for portfolio monitoring. RBI's June 2026 draft model-risk guidance covers AI/ML models, so governance (validation, monitoring, board approval) belongs in the pitch.
- Commercial property: little public Indian data found; prototype can demonstrate method on a narrow slice (shops/offices from listings with rent and price).
- Hero Housing Finance's own segment numbers (ticket size, geography mix) were not found; check its annual report.

## 8. Sources

**AVMs and lender practice**
- Zillow neural Zestimate — https://www.zillowgroup.com/news/meet-the-brains-behind-the-new-zestimate ; https://www.deeplearning.ai/the-batch/home-sweet-ai-appraised-home
- Opendoor, structural inductive biases — https://medium.com/opendoor-labs/accurately-valuing-homes-with-deep-learning-and-structural-inductive-biases-18232ede1efd
- Zillow Offers post-mortem (Stanford GSB) — https://gsb.stanford.edu/insights/flip-flop-why-zillows-algorithmic-home-buying-venture-imploded
- AVM metrics glossary (Clear Capital) — https://www.clearcapital.com/blog-avm-testing-glossary/
- Freddie Mac, metrics matter — https://my.sf.freddiemac.com/docs/pdf/fact-sheets/dougwhitepaper_metricsmatter.pdf
- US interagency AVM quality-control rule (OCC 2024-17) — https://occ.gov/news-issuances/bulletins/2024/bulletin-2024-17.html
- Appraisal bias (Fannie Mae) — https://fanniemae.com/portal/research-insights/perspectives/102816-palim-rosenblatt.html ; Philadelphia Fed WP 18-28 — https://www.philadelphiafed.org/-/media/FRBP/Assets/working-papers/2018/wp18-28.pdf

**India market and products**
- Housing.com AVM — https://medium.com/engineering-housing/auto-valuation-model-7e00c04f4bec
- Kubera methodology — https://kuberarealestate.com/methodology
- Valocity India — https://www.valocityglobal.com/en-in/
- Home First, affordable housing finance trends — https://homefirstindia.com/blog/article/trends-in-affordable-housing-financing-in-india-2026
- FSG, low-income housing finance 2018 — https://www.fsg.org/wp-content/uploads/2021/08/State-of-the-Low-Income-Housing-Market_0.pdf
- Circle vs market rate — https://1acre.in/research/circle-rate-vs-market-value-guidance-value-stamp-duty
- Under-reporting — https://housing.com/news/undervaluation-of-property-during-registration-in-india
- IIMB WP 477, housing price indices in India — https://www.iimb.ac.in/sites/default/files/2018-08/WP%20No.%20477.pdf
- RBI House Price Index method — https://www.rbi.org.in/scripts/BS_ViewBulletin.aspx?Id=15182
- Data source overview — https://mzzi.in/insights/real-estate-data-sources-india/

**Regulation**
- RBI Master Direction, HFCs — https://website.rbi.org.in/documents/87730/39016390/MD100017022021_A.pdf
- NHB valuation circular 2017 — https://www.nhb.org.in/wp-content/uploads/2017/12/NHB(ND)-DRS-Policy%20Circular%20No.86-2017-18.pdf
- RBI draft model risk guidance 2026 (summary) — https://vinodkothari.com/2026/06/rbi-draft-model-risk-management-guidelines-2026/
- DILRMP / ULPIN — https://dolr.gov.in/en/department-of-land-resources-govt-of-india-is-implementing-digital-india-land-records-modernization-program-through-state-ut-governments/

**Papers**
- Conformal quantile regression for house prices (Bastos & Paquette) — https://rem.rc.iseg.ulisboa.pt/wps/pdf/REM_WP_0314_2024.pdf
- Locally weighted conformal for AVMs (Hjort et al.) — https://arxiv.org/abs/2312.06531
- LLMs for real estate appraisal (Geerts et al.) — https://arxiv.org/abs/2506.11812
- GNNs for house prices: do or don't — https://link.springer.com/article/10.1007/s41060-024-00682-y
- ReGram neighbour-relation graph — https://arxiv.org/html/2212.12190
- POI integration and areal embedding — https://arxiv.org/pdf/2311.11812
- Cross-city meta-transfer appraisal — https://arxiv.org/pdf/2410.08947
- Multi-modal house price prediction (code: github.com/4P0N/mhpp) — https://arxiv.org/abs/2409.05335
- Multi-head gated attention with imagery — https://arxiv.org/pdf/2405.07456
- Street view + satellite for house prices — https://arxiv.org/pdf/1807.07155
- TabPFN (Nature 2025) repo — https://github.com/PriorLabs/tabpfn ; TabPFN-2.5 — https://arxiv.org/pdf/2511.08667 ; TabICL — https://arxiv.org/pdf/2502.05564

**Geospatial data**
- AlphaEarth Foundations embeddings — https://developers.google.com/earth-engine/guides/aef_on_gcs_readme ; https://deepmind.google/blog/alphaearth-foundations-helps-map-our-planet-in-unprecedented-detail/
- Open Buildings 2.5D Temporal — https://developers.google.com/earth-engine/datasets/catalog/GOOGLE_Research_open-buildings-temporal_v1
- Overture Maps — https://docs.overturemaps.org/
- Google Street View India coverage — https://geospatialworld.net/prime/technology-and-innovation/google-launches-street-view-in-10-indian-cities/

**Repos and datasets**
- MagicBricks scraped set (~27k) — https://github.com/Rajarshi12321/House_prices_scraped
- 99acres Mumbai project — https://github.com/shanuhalli/Project-Real-Estate-Price-Prediction
- Multi-city locality rates — https://github.com/sarangjaiswal/property-rates-india
- Pune collector (FlatNama, MahaRERA, IGR) — https://github.com/DataScienceEnthusiastic/real_estate
- Hyderabad listings (Kaggle) — https://www.kaggle.com/datasets/faisal012/hyderabad-house-price
