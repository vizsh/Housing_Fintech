# From value to lending decision

A valuation is only useful to a credit officer if it says what to do next. This document covers every rule the engine applies after the model has produced a value and a range.

**Contents:** [Residential routing](#residential-routing) · [Risk flags](#risk-flags) · [Lendable value and LTV](#lendable-value-and-ltv) · [Construction-linked disbursement](#construction-linked-disbursement) · [Commercial: lease rental discounting](#commercial-lease-rental-discounting) · [Drawing-set checks](#drawing-set-checks)

---

## Residential routing

```mermaid
flowchart TD
    V[Value + 68% range] --> F{FSD ≤ 16%<br/>and ≥ 8 comparables within 1 km<br/>and no flags?}
    F -- yes --> G[WAIVE physical valuation]
    F -- no --> D{FSD ≤ 26%<br/>and no hard flag?}
    D -- yes --> A[DESK REVIEW<br/>valuer checks photos and documents]
    D -- no --> R[PHYSICAL VALUATION<br/>site visit]
```

**FSD** (forecast standard deviation) is half the calibrated 68% range divided by the value. The interface prints the rule and this property's FSD under every decision, so the routing is auditable.

**Why 16% and 26%.** With listing prices as ground truth, irreducible listing noise widens every range. These cut-offs route roughly the densest, most consistent micro-markets to a waive. With registry or lender data as ground truth, typical industry bands of 10% and 20% apply.

## Risk flags

| Flag | Trigger | Hard flag (forces a visit)? |
|---|---|:---:|
| `THIN_DATA` | Comparable-density bin 3: nearest comparables far away | ✔ |
| `OUTSIDE_COVERAGE` | More than 40 km from the nearest covered city | ✔ |
| `ATTRIBUTE_CHECK` | Area per bedroom below 180 or above 1,600 sq ft | ✔ |
| `NO_SATELLITE` | No satellite embedding for the point | |
| `INDUSTRIAL_ADJ` | Industrial land within 250 m | |
| `MODEL_VS_COMPS` | Model value differs from the local comparable level by more than 35% | |

Any flag blocks a waive. A hard flag also blocks desk review.

## Lendable value and LTV

| Quantity | Definition |
|---|---|
| **Lendable value** | Lower bound of the 68% range. The lender advances against a value it is about 84% sure the property is worth at least. |
| **Max loan** | Lendable value × RBI LTV cap for the loan size |
| **Distress value** | Lendable value × (1 − 22%). SARFAESI auctions in India commonly clear 15–30% below market. |
| **Requested LTV** | Loan asked ÷ lendable value, flagged in red above the cap |

**RBI LTV ceilings for individual housing loans:**

| Loan size | LTV cap |
|---|---:|
| Up to ₹30 lakh | 90% |
| ₹30–75 lakh | 80% |
| Above ₹75 lakh | 75% |

RBI directions require **two independent valuation reports for loans of ₹50 lakh and above**. The interface says so and positions the engine as one of the two.

## Construction-linked disbursement

Under-construction homes are lent against in tranches. The *Drawing set* models this with a stage slider, and the 3D elevation draws the building only up to the slab reached.

**Typical construction-linked payment plan** (cumulative % of the agreement value demanded by the builder):

| Stage | Booking | Agreement | Plinth | Slabs (grouped, up to roof) | Brickwork | Flooring and services | Lifts and finish | Possession with OC |
|---|---|---|---|---|---|---|---|---|
| Cumulative | 10% | 20% | 30% | 30 → 60% | 70% | 80% | 90% | 100% |

RERA s.13 caps what a promoter can collect before the agreement for sale at 10%.

**Rules applied:**
1. **Borrower's margin first.** The borrower funds (value − sanctioned loan) before the lender disburses anything.
2. **Lender tranche** = builder demand to date − margin, released against an architect's stage certificate into the project's RERA account. The promoter must keep 70% of collections there.
3. **Exposure check:** compare what has been disbursed with what the collateral would fetch if the project stalled.
   - Before the OC, that is land share plus structure built, less a **35% stalled-project haircut** (our assumption).
   - When cover falls below 1.1×, the panel recommends holding the tranche until the next slab is certified.

## Commercial: lease rental discounting

The *Commercial income* sheet values office, retail and warehouse assets by the income approach and sizes the loan as a lease rental discounting (LRD) loan.

| Step | Rule |
|---|---|
| **Market rent** | City benchmark × (location index)^k. The location index is this point's residential ₹/sq ft against the city median, from the residential engine. k is 0.6 for office, 0.8 for retail and 0.2 for warehouse. |
| **NOI** (net operating income) | Rent × area × 12 × occupancy × (1 − non-recoverable cost ratio) |
| **Direct capitalisation** | NOI ÷ cap rate |
| **Cap rate** | Base cap rate (8.0% office, 8.5% retail, 8.0% warehouse), plus 50 bp for a private tenant or 100 bp for an unrated one, plus 50 bp outside benchmarked metros, plus 25 bp if the lease has under 3 years left |
| **DCF** | 10 years. The lease steps up 15% every 3 years until expiry, then re-lets at market rent (growing 4% a year) after a 6-month void. Exit at cap + 25 bp, discounted at cap + 350 bp. |
| **Market value** | 50 : 50 reconciliation of direct capitalisation and DCF |
| **Max LRD loan** | min(loan serviceable at DSCR, 65% × lower sensitivity bound). Interest 9.25%, tenor capped by the lease (3–12 years). Minimum DSCR 1.25× for a listed or MNC tenant, 1.40× private, 1.60× unrated. |

**Routing.** Commercial collateral is **never waived**. Desk review requires all of:
- an entered lease rent within 25% of market;
- a listed, MNC or established private tenant;
- 3 or more years left on the lease;
- DSCR and LTV within policy.

Everything else goes to a physical valuation.

**Sources.**
- Office rents: Anarock Annual Office Update 2025 (MMR ₹148/sq ft/month) and Business Standard, May 2025 (NCR ₹110, Bengaluru ₹95, Pune ₹80, Hyderabad ₹72, Chennai ₹72).
- Office cap rates: Brookfield India REIT valuation summary, FY26 (7.75–8.0%).
- Our assumptions, labelled in the UI: Kolkata and Ahmedabad rents, retail and warehouse rents and cap rates, and LRD terms.

## Drawing-set checks

| Check | What it catches |
|---|---|
| **Unit plan** | Whether the declared carpet area can hold the declared BHK and bathrooms at livable room sizes |
| **RERA area statement** | Carpet (s.2(k)) → walls → balcony → built-up → loading → super built-up. Entering the agreement's super area computes the real loading; **above 40% is flagged** as a possibly inflated super area. |
| **Orientation study** | Model value for each of the eight facings, plus hours of direct sun on each facade at the solstices and the equinox, computed for the property's latitude and longitude |
