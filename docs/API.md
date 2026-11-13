# Engine API

Base URL: `http://127.0.0.1:8000`. The web app reads it from `VITE_API`.

Interactive OpenAPI docs are served at `/docs` while the engine runs.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/value` | Residential valuation with range, explanation and lending decision |
| `POST` | `/api/income` | Commercial income-approach valuation with LRD sizing |
| `GET` | `/api/search?q=` | Local place search (OSM names + gazetteer); no external geocoder |
| `GET` | `/api/surface?res=&city=` | H3 hexagons of median ₹/sq ft |
| `GET` | `/api/meta` | Benchmark report, assumptions, top features, covered cities |
| `GET` | `/api/health` | Liveness |

---

## `POST /api/value`

### Request

```json
{
  "lat": 19.1176, "lon": 72.906,
  "area_sqft": 850, "area_basis": "carpet",
  "bhk": 2, "ptype": "flat", "floor": 9, "total_floors": 22,
  "transaction": "resale", "furnishing": "Semi-Furnished",
  "bathrooms": 2, "parking": 1, "covered_parking": 1,
  "amenities": ["liftavailable", "secsecurity", "gymnasium"],
  "facing": "East", "age_years": null, "loan_amount": null
}
```

| Field | Values |
|---|---|
| `area_basis` | `carpet` · `builtup` · `super` (converted to carpet at 1.0 / 0.88 / 0.78) |
| `ptype` | `flat` · `independent house` · `villa` |
| `transaction` | `resale` · `new` |
| `facing` | `North` · `North - East` · `East` · `South - East` · `South` · `South -West` · `West` · `North - West` · `Unknown` |
| `amenities` | any of `gymnasium`, `swimmingpool`, `liftavailable`, `clubhouse`, `secsecurity`, `overlook_park` |
| `loan_amount` | ₹; if null, 75% of lendable value is assumed for the LTV display |

### Response (abridged; values illustrative)

```json
{
  "city": "Mumbai", "city_km": 3.1,
  "value": 28200000, "ppsf": 33151, "area_carpet_sqft": 850,
  "range": { "p68": [22500000, 34600000], "p80": [...], "p90": [18700000, 42500000] },
  "fsd": 0.225, "confidence": 0.77, "density_bin": 0,
  "comps_signal": { "knn_value": 27900000, "n_within_1km": 40, "n_within_3km": 412, "d10_km": 0.4 },
  "waterfall": { "base": 7700000, "steps": [ { "group": "Micro-market comparables", "pct": 1.779, "from": 7700000, "to": 21400000, "drivers": [["knn_wmean", 0.96]] } ] },
  "witnesses": [ { "source": "mb2023", "value": 27900000 } ],
  "facing_effects": [ { "facing": "North", "value": 28500000, "pct": 0.002 } ],
  "comparables": [ { "km": 0.21, "society": "…", "bhk": 2, "area_sqft": 800, "source": "mb2023", "ppsf_today": 31900, "indicated_value": 27100000 } ],
  "access": [ { "cat": "metro", "km": 2.5, "name": "…", "lat": 19.1, "lon": 72.9 } ],
  "cost_approach": { "structure": 2600000, "land": 25600000, "spec_rate": 2800, "age_years": 10, "builtup_sqft": 1062 },
  "flags": [],
  "decision": { "band": "amber", "action": "Desk review", "detail": "Valuer checks photos and documents; no site visit." },
  "lending": { "lendable_value": 22500000, "max_loan": 16900000, "ltv_cap": 0.75, "distress_value": 17600000, "ltv": 0.75, "two_valuations_required": true },
  "thresholds": { "waive_fsd": 0.16, "desk_fsd": 0.26 },
  "assumptions": { "ask_to_txn_discount": 0.06, "annual_appreciation": 0.06, "distress_haircut": 0.22, "valuation_date": "2026-11-01" },
  "latency_ms": 640
}
```

Errors return `400` with a plain-language `detail`, for example a point outside India.

## `POST /api/income`

### Request

```json
{
  "lat": 19.0662, "lon": 72.8679, "asset": "office",
  "area_sqft": 25000, "rent": 165, "occupancy": null, "escalation": null,
  "wale": 6, "tenant": "A", "cap_rate": null, "loan_amount": null
}
```

| Field | Values |
|---|---|
| `asset` | `office` · `retail` · `warehouse` |
| `rent` | Passing rent in ₹/sq ft/month; null values the asset at estimated market rent |
| `wale` | Years left on the lease |
| `tenant` | `A` listed or MNC · `B` established private · `C` small or unrated |

### Response fields

| Field | Contents |
|---|---|
| `value`, `ppsf` | Market value and value per sq ft |
| `direct`, `dcf` | The two methods before reconciliation |
| `range.inner`, `range.outer` | Sensitivity bands |
| `income` | GRI, vacancy, EGI, opex and NOI |
| `market_rent` | Benchmark, location index, market rent and gap to lease rent |
| `rates` | Cap, discount, exit and spreads |
| `flows[10]` | Year-by-year NOI, rent, PV, void and leased flags |
| `sensitivity` | 5 × 5 grid of value by cap rate and rent |
| `residential_check` | The same area valued at residential prices |
| `lending` | DSCR- and LTV-bound loans, EMI, DSCR, LTV |
| `flags`, `decision` | Risk flags and routing |

## `GET /api/search?q=powai`

Returns up to 8 places, ranked by:
- exact match;
- place rank (city > town > suburb > …);
- whether listing evidence exists there;
- distance to a covered city.

```json
[ { "label": "Powai", "place": "suburb", "city": "Mumbai", "near_city_km": 3.2, "lat": 19.1197, "lon": 72.9051, "known": true } ]
```

## `GET /api/surface?res=4` · `?res=8&city=mumbai`

Median ₹/sq ft per H3 cell, with listing count. A cell needs at least 3 listings at India scale and 2 at city scale.

```json
[ { "h": "8460145ffffffff", "ppsf": 18240, "n": 57, "city": "Mumbai" } ]
```

---

## Market reality on `POST /api/value`

`/api/value` accepts optional deal and legal facts and returns a `reality` block.

**Request fields**

| Field | Values |
|---|---|
| `legal_status` | `freehold` · `leasehold` · `society_share` · `lal_dora` · `gram_panchayat` · `power_of_attorney` · `unauthorised_colony` · `disputed` |
| `oc_status` (resale) | `oc` · `cc_only` · `none` |
| `rera_status` (new) | `registered` · `delayed` · `stalled` · `not_registered` |
| `builder` | `listed` · `regional` · `unknown` |
| `factors` | any of `railway_line`, `highway`, `high_tension_line`, `landfill`, `cremation_ground`, `slum_adjacent`, `nala`, `flood_prone`, `water_tanker`, `no_road_access`, `metro_walk`, `sea_or_lake_view`, `gated_township`, `school_zone`, `corner_unit` |
| `declared_value`, `valuer_value`, `prev_price` | ₹ |
| `prev_year` | Year of the previous sale |
| `related_party` | `true` · `false` |

**The `reality` block**

| Field | Contents |
|---|---|
| `state`, `state_rules` | The state, and its stamp duty, registration fee and typical circle-to-market ratio |
| `adjusted_value`, `steps[]` | Valuer adjustments, step by step |
| `two_prices` | Circle-rate value, likely deed value, market value, cash gap, stamp duty on each, duty leakage |
| `flags[]` | Each flag has `code`, `severity` (`high` · `medium` · `low`), `text` and `kind` (`fraud` · `legal` · `project` · `market`) |
| `integrity` | `score` (0–100) and `grade` (`clean` · `review` · `refer`) |
| `lending` | Lending basis (the lower of the adjusted 68% bound and the agreement value), LTV cap after title, max loan, eligibility |
| `route_override` | Replaces `decision` when a high-severity signal fires |

`GET /api/reality/catalogue` returns every factor, title, OC, RERA and state rule, for building forms.

## Portfolio

- `GET /api/portfolio` revalues the demo book (cached after the first call, about 1 s).
- `POST /api/portfolio/upload` takes `{ "csv": "<text>" }` and revalues your own book, up to 5,000 rows.
  - Required columns: `lat`, `lon`, `area_sqft`, `outstanding`, `orig_valuation`.
  - Optional columns: `loan_id`, `bhk`, `floor`, `total_floors`, `orig_year`, `sanctioned`, `valuer`, `legal_status`.

Both return:

| Field | Contents |
|---|---|
| `summary` | Loans, exposure, collateral, weighted LTV, breaches, double pledges, flagged valuers |
| `loans[]` | Current value and range, LTV at sanction and now, drift, origination bias against the model's back-cast, `alerts[]` |
| `valuers[]` | Median bias, share of files over +15%, flag |
| `cities[]` | Exposure and LTV per city |

## Monitoring

`GET /api/monitor` returns:
- the request count, requests per day and routing mix;
- p50 and p90 latency of live API calls;
- PSI per feature against a 3,000-listing training reference;
- the latest requests;
- the model card.

`POST /api/monitor/replay?n=200` sends realistic traffic from named places across India through the engine and logs it.

## Report narrative

`POST /api/report/narrative` takes `{ "valuation": <full valuation>, "llm": true }` and returns `{ "sections": [{ "h", "p" }], "source" }`.

`source` is `claude-opus-5-5` when Claude wrote the text and every number checked out, otherwise `template`.

## v1 for loan-origination systems

**`POST /api/v1/valuations`**
- Body: the `/api/value` body plus an optional `application_id`.
- Header: `X-API-Key` (enforced only if `NAKSHA_API_KEYS` is set).
- Returns `201` with a compact, stable document: `id`, `created_at`, `model_version`, `property`, `value`, `decision`, `lending`, `integrity`, `flags`, `two_prices`, `links`.

**`GET /api/v1/valuations/{id}`**
- Returns the stored document.
- `?full=true` returns the full evidence instead.
