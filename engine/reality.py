"""Market reality: the factors a valuation model does not see but a lender must.

Three layers sit on top of the model's market value:

1. Two prices of an Indian home: the government circle rate (ready reckoner / guidance value / jantri)
   that stamp duty is paid on, the price the deed records, and the market price. The gap between them
   is usually paid outside the deed. A lender should lend on the lower of deed value and valuation.
2. Valuer adjustments the model cannot learn from listings: legal title status, occupancy certificate,
   RERA status, local nuisances and amenities. Each carries a stated, editable adjustment.
3. Fraud and integrity signals: inflated agreement value, valuer variance, rapid flips, related-party
   sales, double financing of the same collateral.

All state rates and adjustment percentages here are indicative (public reporting and common lender
practice); they are configuration, shown in the interface, and meant to be replaced by state IGR
ready-reckoner tables and the lender's own credit policy.
"""
from __future__ import annotations

import numpy as np

# ------------------------------------------------------------------ states
# stamp: stamp duty incl. cess/surcharge for a male buyer (women often pay 1-2 pts less);
# reg: registration fee; circle: typical circle rate as a share of market price in urban areas.
STATES = {
    "Maharashtra": {"stamp": 0.06, "reg": 0.01, "circle": 0.78, "rr": "Ready reckoner (ASR), revised yearly"},
    "Karnataka": {"stamp": 0.056, "reg": 0.01, "circle": 0.55, "rr": "Guidance value, revised 2023"},
    "Delhi": {"stamp": 0.06, "reg": 0.01, "circle": 0.50, "rr": "Circle rates by colony category A-H, largely unrevised since 2014"},
    "Haryana": {"stamp": 0.07, "reg": 0.005, "circle": 0.55, "rr": "Collector rates"},
    "Uttar Pradesh": {"stamp": 0.07, "reg": 0.01, "circle": 0.62, "rr": "DM circle rates"},
    "Tamil Nadu": {"stamp": 0.07, "reg": 0.02, "circle": 0.60, "rr": "Guideline value"},
    "Telangana": {"stamp": 0.07, "reg": 0.005, "circle": 0.50, "rr": "Market value (SRO)"},
    "Andhra Pradesh": {"stamp": 0.07, "reg": 0.01, "circle": 0.55, "rr": "Market value (SRO)"},
    "West Bengal": {"stamp": 0.06, "reg": 0.01, "circle": 0.70, "rr": "Market value (e-Nathikaran)"},
    "Gujarat": {"stamp": 0.049, "reg": 0.01, "circle": 0.65, "rr": "Jantri, doubled in 2023"},
    "Rajasthan": {"stamp": 0.06, "reg": 0.01, "circle": 0.60, "rr": "DLC rates"},
    "Kerala": {"stamp": 0.08, "reg": 0.02, "circle": 0.50, "rr": "Fair value"},
    "Punjab": {"stamp": 0.07, "reg": 0.01, "circle": 0.55, "rr": "Collector rates"},
    "Chandigarh": {"stamp": 0.06, "reg": 0.01, "circle": 0.55, "rr": "Collector rates"},
    "Madhya Pradesh": {"stamp": 0.075, "reg": 0.03, "circle": 0.65, "rr": "Collector guideline"},
    "Bihar": {"stamp": 0.063, "reg": 0.02, "circle": 0.50, "rr": "MVR"},
    "Jharkhand": {"stamp": 0.04, "reg": 0.03, "circle": 0.55, "rr": "Circle rates"},
    "Odisha": {"stamp": 0.05, "reg": 0.02, "circle": 0.55, "rr": "Benchmark valuation"},
    "Assam": {"stamp": 0.06, "reg": 0.01, "circle": 0.55, "rr": "Zonal value"},
    "Goa": {"stamp": 0.05, "reg": 0.03, "circle": 0.60, "rr": "Minimum rates"},
    "Uttarakhand": {"stamp": 0.05, "reg": 0.02, "circle": 0.60, "rr": "Circle rates"},
    "Himachal Pradesh": {"stamp": 0.06, "reg": 0.02, "circle": 0.60, "rr": "Circle rates"},
    "Chhattisgarh": {"stamp": 0.05, "reg": 0.04, "circle": 0.60, "rr": "Guideline value"},
    "Puducherry": {"stamp": 0.07, "reg": 0.01, "circle": 0.60, "rr": "Guideline value"},
    "India (default)": {"stamp": 0.06, "reg": 0.01, "circle": 0.60, "rr": "State circle rate"},
}

CITY_STATE = {
    **dict.fromkeys(["mumbai", "thane", "navi mumbai", "pune", "nagpur", "nashik", "aurangabad", "palghar", "raigad", "bhiwandi",
                     "solapur", "kolhapur", "ratnagiri", "satara", "sindhudurg", "amravati", "ahmednagar", "karjat", "karad", "maharashtra"], "Maharashtra"),
    **dict.fromkeys(["bangalore", "mangalore", "mysore", "udupi", "belgaum", "hubli"], "Karnataka"),
    **dict.fromkeys(["delhi", "new delhi"], "Delhi"),
    **dict.fromkeys(["gurgaon", "faridabad", "sonipat", "panchkula", "bahadurgarh"], "Haryana"),
    **dict.fromkeys(["noida", "greater noida", "ghaziabad", "lucknow", "kanpur", "agra", "varanasi", "allahabad", "meerut", "aligarh",
                     "mathura", "vrindavan"], "Uttar Pradesh"),
    **dict.fromkeys(["chennai", "coimbatore", "madurai", "kanchipuram"], "Tamil Nadu"),
    "hyderabad": "Telangana",
    **dict.fromkeys(["visakhapatnam", "vijayawada", "guntur", "tirupati", "nellore", "rajahmundry", "vizianagaram", "kakinada"], "Andhra Pradesh"),
    **dict.fromkeys(["kolkata", "siliguri", "durgapur", "asansol"], "West Bengal"),
    **dict.fromkeys(["ahmedabad", "surat", "vadodara", "gandhinagar", "rajkot", "vapi", "jamnagar", "anand", "bharuch", "valsad",
                     "navsari", "bhavnagar", "junagadh"], "Gujarat"),
    **dict.fromkeys(["jaipur", "bhiwadi", "udaipur", "jodhpur", "kota", "ajmer"], "Rajasthan"),
    **dict.fromkeys(["kochi", "thrissur", "thiruvananthapuram", "palakkad", "kozhikode", "kottayam", "kannur"], "Kerala"),
    **dict.fromkeys(["mohali", "zirakpur", "ludhiana", "jalandhar"], "Punjab"),
    "chandigarh": "Chandigarh",
    **dict.fromkeys(["indore", "bhopal", "gwalior", "jabalpur"], "Madhya Pradesh"),
    "patna": "Bihar",
    **dict.fromkeys(["ranchi", "jamshedpur", "dhanbad"], "Jharkhand"),
    "bhubaneswar": "Odisha", "guwahati": "Assam",
    **dict.fromkeys(["goa", "panaji", "margao"], "Goa"),
    **dict.fromkeys(["dehradun", "haridwar"], "Uttarakhand"),
    **dict.fromkeys(["shimla", "solan"], "Himachal Pradesh"),
    **dict.fromkeys(["raipur", "bhilai", "bilaspur"], "Chhattisgarh"),
    "puducherry": "Puducherry",
}

# ------------------------------------------------------------------ factors
# (adjustment to market value, label, why) -- indicative, editable credit-policy configuration
FACTORS = {
    # negative externalities
    "railway_line": (-0.05, "Next to a railway line", "Noise and vibration; resale discount"),
    "highway": (-0.03, "On a highway or flyover", "Noise, dust, access"),
    "high_tension_line": (-0.08, "Under a high-tension line", "Health perception; many buyers refuse"),
    "landfill": (-0.12, "Near a landfill or dump", "Odour, groundwater, health"),
    "cremation_ground": (-0.06, "Near a cremation ground", "Cultural aversion in Indian markets"),
    "slum_adjacent": (-0.07, "Adjoining an informal settlement", "Buyer perception; encroachment risk"),
    "nala": (-0.05, "On an open drain (nala)", "Odour, mosquitoes, flooding"),
    "flood_prone": (-0.08, "Recorded waterlogging or flooding", "Damage, insurance, resale"),
    "water_tanker": (-0.06, "Tanker-dependent water", "Recurring cost; common in fast-growing suburbs"),
    "no_road_access": (-0.10, "No motorable road access", "Marketability and enforcement risk"),
    # positive
    "metro_walk": (0.06, "Metro within a 10-minute walk", "Commute premium"),
    "sea_or_lake_view": (0.08, "Sea, lake or golf view", "Scarcity premium"),
    "gated_township": (0.04, "Gated township", "Security and amenities"),
    "school_zone": (0.03, "Next to a reputed school", "Family-buyer demand"),
    "corner_unit": (0.02, "Corner unit, cross-ventilation", "Light and air"),
}

LEGAL = {
    # (value adjustment, LTV cap override or None, eligible, label, why)
    "freehold": (0.0, None, True, "Freehold title", "Clean, transferable title"),
    "leasehold": (-0.05, None, True, "Leasehold", "Transfer needs lessor consent; unearned increase charges"),
    "society_share": (0.0, None, True, "Co-operative society share", "Transfer via share certificate; society NOC needed"),
    "power_of_attorney": (-0.15, 0.0, False, "GPA / power-of-attorney sale", "Supreme Court (Suraj Lamp, 2011): GPA sales do not convey title"),
    "lal_dora": (-0.20, 0.60, True, "Lal Dora / abadi land", "No formal title records; most lenders cap LTV at 50-70%"),
    "gram_panchayat": (-0.15, 0.60, True, "Gram panchayat approval only", "Outside municipal sanction; marketability risk"),
    "unauthorised_colony": (-0.25, 0.0, False, "Unauthorised colony", "Not regularised; not acceptable security until regularised"),
    "disputed": (-0.35, 0.0, False, "Title under dispute or litigation", "Not acceptable security"),
}
OC = {"oc": (0.0, "Occupancy certificate in hand"), "cc_only": (-0.06, "Completion certificate, no OC"), "none": (-0.12, "No OC or CC")}
RERA = {"registered": (0.0, "RERA-registered, on schedule"), "delayed": (-0.08, "RERA-registered, delayed"),
        "stalled": (-0.30, "Project stalled"), "not_registered": (-0.10, "Not RERA-registered")}
BUILDER = {"listed": (0.03, "Listed or national developer"), "regional": (0.0, "Established regional developer"),
           "unknown": (-0.03, "Unknown developer")}

SEV = {"high": 25, "medium": 12, "low": 5}


def state_for(city: str, lat: float, lon: float, cities) -> str:
    c = (city or "").lower()
    if c in CITY_STATE:
        return CITY_STATE[c]
    # nearest mapped city within 150 km
    best, bd = None, 1e9
    for _, r in cities.iterrows():
        s = CITY_STATE.get(r.city)
        if not s:
            continue
        d = np.hypot((r.lat - lat) * 111, (r.lon - lon) * 111 * np.cos(np.radians(lat)))
        if d < bd:
            best, bd = s, d
    return best if best and bd < 150 else "India (default)"


def assess(q: dict, v: dict, loc_ix: float, state: str, dupes: list | None = None) -> dict:
    """q: request fields; v: the model valuation (value, range, ppsf, city, assumptions, ...)."""
    S = STATES[state]
    value = v["value"]
    lo68, hi68 = v["range"]["p68"]
    lo80, hi80 = v["range"]["p80"]
    lo90, hi90 = v["range"]["p90"]
    flags, steps = [], []

    def flag(code, sev, text, kind):
        flags.append({"code": code, "severity": sev, "text": text, "kind": kind})

    # ---- adjustments the model cannot see
    running = value
    for k in q.get("factors") or []:
        if k in FACTORS:
            pct, label, why = FACTORS[k]
            steps.append({"key": k, "label": label, "why": why, "pct": pct, "from": running, "to": running * (1 + pct), "group": "Location reality"})
            running *= 1 + pct
    legal_key = q.get("legal_status") or "freehold"
    lpct, lcap, eligible, llabel, lwhy = LEGAL.get(legal_key, LEGAL["freehold"])
    if lpct:
        steps.append({"key": legal_key, "label": llabel, "why": lwhy, "pct": lpct, "from": running, "to": running * (1 + lpct), "group": "Title"})
        running *= 1 + lpct
    if legal_key in ("power_of_attorney", "unauthorised_colony", "disputed"):
        flag("TITLE_NOT_ACCEPTABLE", "high", f"{llabel}: {lwhy}", "legal")
    elif legal_key in ("lal_dora", "gram_panchayat"):
        flag("TITLE_WEAK", "medium", f"{llabel}: {lwhy}", "legal")
    new = q.get("transaction") == "new"
    if not new:
        ok = q.get("oc_status") or "oc"
        p, lab = OC.get(ok, OC["oc"])
        if p:
            steps.append({"key": ok, "label": lab, "why": "Occupation without OC is unauthorised; lenders may refuse", "pct": p, "from": running, "to": running * (1 + p), "group": "Building approvals"})
            running *= 1 + p
            flag("NO_OC", "medium" if ok == "cc_only" else "high", f"{lab}: occupation may be unauthorised", "legal")
    else:
        rk = q.get("rera_status") or "registered"
        p, lab = RERA.get(rk, RERA["registered"])
        if p:
            steps.append({"key": rk, "label": lab, "why": "Delivery risk on under-construction collateral", "pct": p, "from": running, "to": running * (1 + p), "group": "Project"})
            running *= 1 + p
            flag("RERA_" + rk.upper(), "high" if rk in ("stalled", "not_registered") else "medium", lab, "project")
        bk = q.get("builder") or "regional"
        p, lab = BUILDER.get(bk, BUILDER["regional"])
        if p:
            steps.append({"key": bk, "label": lab, "why": "Developer track record", "pct": p, "from": running, "to": running * (1 + p), "group": "Project"})
            running *= 1 + p
    adjusted = running
    adj_factor = adjusted / value

    # ---- two prices: circle rate vs deed vs market
    circle_ratio = float(np.clip(S["circle"] * loc_ix ** -0.35, 0.3, 1.0))
    circle_value = value * circle_ratio
    declared = q.get("declared_value")
    deed_value = max(circle_value, declared) if declared else circle_value
    cash_gap = max(adjusted - deed_value, 0.0)
    stamp_on_market = adjusted * (S["stamp"] + S["reg"])
    stamp_on_deed = deed_value * (S["stamp"] + S["reg"])

    # ---- fraud and integrity signals
    if declared:
        if declared > hi90 * adj_factor:
            flag("OVER_DECLARED", "high", f"Agreement value is {declared / adjusted - 1:+.0%} above the adjusted value and outside the 90% range: possible inflated invoice to over-draw the loan", "fraud")
        elif declared < circle_value * 1.08 and adjusted > circle_value * 1.25:
            flag("CASH_COMPONENT", "medium", f"Agreement sits at about the circle rate; roughly ₹{cash_gap / 1e5:,.1f} lakh of the market price is likely paid outside the deed", "market")
    vv = q.get("valuer_value")
    if vv:
        if vv > hi80 * adj_factor:
            flag("VALUER_ABOVE_RANGE", "high", f"Valuer report is {vv / adjusted - 1:+.0%} above the model and outside the 80% range: check for valuer-builder collusion", "fraud")
        elif vv < lo80 * adj_factor:
            flag("VALUER_BELOW_RANGE", "low", f"Valuer report is {vv / adjusted - 1:+.0%} below the model", "fraud")
    pp, py = q.get("prev_price"), q.get("prev_year")
    if pp and py:
        yrs = max(0.25, 2026.9 - float(py))
        cagr = (adjusted / pp) ** (1 / yrs) - 1
        market = v["assumptions"]["annual_appreciation"]
        if yrs <= 3 and cagr > market + 0.15:
            flag("RAPID_FLIP", "high", f"Resold after {yrs:.1f} years at {cagr:.0%} a year against ~{market:.0%} market growth: possible round-tripping to inflate collateral", "fraud")
    if q.get("related_party"):
        flag("RELATED_PARTY", "medium", "Buyer and seller are related: price may not be arm's length", "fraud")
    for d in dupes or []:
        flag("DUPLICATE_COLLATERAL", "high", f"Same property already pledged on loan {d['loan_id']} ({d['km'] * 1000:.0f} m away, {d['area_sqft']} sq ft): possible double financing", "fraud")

    score = max(0, 100 - sum(SEV[f["severity"]] for f in flags))
    grade = "clean" if score >= 85 else "review" if score >= 60 else "refer"

    # ---- lending on reality
    lend_basis = min(lo68 * adj_factor, declared) if declared else lo68 * adj_factor
    cap = v["lending"]["ltv_cap"] if lcap is None else min(v["lending"]["ltv_cap"], lcap)
    if not eligible:
        cap = 0.0
    max_loan = lend_basis * cap
    route = None
    if not eligible or any(f["severity"] == "high" and f["kind"] == "fraud" for f in flags):
        route = {"band": "red", "action": "Refer to fraud control" if eligible else "Not acceptable security",
                 "detail": "High-severity integrity or title flag; do not sanction on this valuation."}
    elif any(f["severity"] == "high" for f in flags):
        route = {"band": "red", "action": "Physical valuation", "detail": "Legal or project risk needs a site visit and legal opinion."}

    return {
        "state": state, "state_rules": S,
        "adjusted_value": adjusted, "adjustment_pct": adj_factor - 1, "steps": steps,
        "two_prices": {"market": adjusted, "circle": circle_value, "deed": deed_value, "circle_ratio": circle_ratio,
                       "cash_gap": cash_gap, "stamp_on_market": stamp_on_market, "stamp_on_deed": stamp_on_deed,
                       "duty_leakage": max(stamp_on_market - stamp_on_deed, 0.0), "declared": declared},
        "flags": flags, "integrity": {"score": score, "grade": grade},
        "lending": {"basis": lend_basis, "basis_rule": "Lower of adjusted 68% bound and agreement value" if declared else "Adjusted 68% bound",
                    "ltv_cap": cap, "max_loan": max_loan, "eligible": eligible},
        "route_override": route,
    }


def catalogue():
    """Everything the interface needs to render the factor pickers and the market-truth page."""
    return {
        "factors": {k: {"pct": p, "label": l, "why": w} for k, (p, l, w) in FACTORS.items()},
        "legal": {k: {"pct": p, "ltv_cap": c, "eligible": e, "label": l, "why": w} for k, (p, c, e, l, w) in LEGAL.items()},
        "oc": {k: {"pct": p, "label": l} for k, (p, l) in OC.items()},
        "rera": {k: {"pct": p, "label": l} for k, (p, l) in RERA.items()},
        "builder": {k: {"pct": p, "label": l} for k, (p, l) in BUILDER.items()},
        "states": STATES,
    }
