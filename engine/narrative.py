"""Valuation report narrative.

The engine always writes a deterministic narrative from the valuation. If Claude credentials are
available (ANTHROPIC_API_KEY, or an `ant auth login` profile) and NAKSHA_LLM is not "off", Claude
rewrites that narrative into a valuer's prose. The numbers are locked: every figure in Claude's text
must appear in the facts it was given, otherwise the deterministic text is used.
"""
from __future__ import annotations

import json
import os
import re


def inr(v: float) -> str:
    if v is None:
        return "-"
    a = abs(v)
    if a >= 1e7:
        return f"₹{v / 1e7:.2f} Cr"
    if a >= 1e5:
        return f"₹{v / 1e5:.1f} lakh"
    return f"₹{v:,.0f}"


def pct(v: float, d=0) -> str:
    return f"{v * 100:.{d}f}%"


def cnt(n) -> str:
    return f"{n}+" if n >= 40 else str(n)  # the neighbour search looks at the 40 nearest listings


def facts(v: dict) -> dict:
    q = v["input"]
    r = v.get("reality") or {}
    top = sorted(v["waterfall"]["steps"], key=lambda s: -abs(s["log_effect"]))[:3]
    return {
        "property": f"{q.get('bhk')} BHK {q.get('ptype')}, {round(v['area_carpet_sqft'])} sq ft carpet, floor {q.get('floor')} of {q.get('total_floors')}",
        "location": q.get("label") or f"{q['lat']:.4f}, {q['lon']:.4f}", "city": v["city"],
        "value": inr(v["value"]), "ppsf": f"₹{v['ppsf']:,.0f}/sq ft",
        "range68": f"{inr(v['range']['p68'][0])} to {inr(v['range']['p68'][1])}",
        "range90": f"{inr(v['range']['p90'][0])} to {inr(v['range']['p90'][1])}",
        "confidence": pct(v["confidence"]), "fsd": pct(v["fsd"], 1),
        "comps_1km": cnt(v["comps_signal"]["n_within_1km"]), "comps_3km": cnt(v["comps_signal"]["n_within_3km"]),
        "drivers": [f"{s['group']} ({s['pct'] * 100:+.0f}%)" for s in top],
        "decision": v["decision"]["action"], "decision_detail": v["decision"]["detail"],
        "lendable": inr(r["lending"]["basis"] if r else v["lending"]["lendable_value"]),
        "lendable_rule": r["lending"]["basis_rule"] if r else "Lower bound of the 68% range",
        "max_loan": (inr(r["lending"]["max_loan"]) if r["lending"]["eligible"] else "nil (not acceptable security)") if r else inr(v["lending"]["max_loan"]),
        "ltv_cap": pct(r["lending"]["ltv_cap"] if r else v["lending"]["ltv_cap"]), "distress": inr(v["lending"]["distress_value"]),
        "flags": [f["text"] for f in v["flags"]] + [f["text"] for f in r.get("flags", [])],
        "adjusted_value": inr(r["adjusted_value"]) if r else None,
        "adjustments": [f"{s['label']} ({s['pct'] * 100:+.0f}%)" for s in r.get("steps", [])],
        "circle_value": inr(r["two_prices"]["circle"]) if r else None,
        "cash_gap": inr(r["two_prices"]["cash_gap"]) if r else None,
        "integrity": f"{r['integrity']['score']}/100" if r else None,
        "state": r.get("state"),
    }


def template(f: dict) -> list[dict]:
    s = [
        {"h": "Subject property", "p": f"A {f['property']} at {f['location']} ({f['city']})."},
        {"h": "Opinion of value", "p": f"Fair market value on a transaction basis is {f['value']} ({f['ppsf']}). The calibrated 68% range is {f['range68']} and the 90% range {f['range90']}; confidence {f['confidence']}, forecast standard deviation {f['fsd']}."},
        {"h": "Basis", "p": f"The value rests on {f['comps_1km']} comparable listings within 1 km and {f['comps_3km']} within 3 km, satellite and map context. The largest drivers were {', '.join(f['drivers'])}."},
    ]
    if f["adjustments"]:
        s.append({"h": "Valuer adjustments", "p": f"Factors the model cannot observe were applied: {', '.join(f['adjustments'])}, giving an adjusted value of {f['adjusted_value']}."})
    if f["circle_value"]:
        s.append({"h": "Market reality", "p": f"The {f['state']} circle-rate value is about {f['circle_value']}; around {f['cash_gap']} of the market price is typically paid outside the deed in such markets. Integrity score {f['integrity']}."})
    s.append({"h": "Lending recommendation", "p": f"{f['decision']}: {f['decision_detail']} Lendable value {f['lendable']} ({f['lendable_rule'].lower()}); maximum loan {f['max_loan']} at an LTV cap of {f['ltv_cap']}; distress value {f['distress']}."})
    s.append({"h": "Flags", "p": "; ".join(f["flags"]) + "." if f["flags"] else "No risk flags raised."})
    return s


NUM = re.compile(r"\d[\d,]*\.?\d*")


def _numbers(text: str) -> set[str]:
    return {n.replace(",", "").rstrip(".") for n in NUM.findall(text)}


def llm(f: dict, fallback: list[dict]) -> tuple[list[dict], str]:
    if os.environ.get("NAKSHA_LLM", "on").lower() == "off":
        return fallback, "template"
    from pathlib import Path
    has_creds = any(os.environ.get(k) for k in ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_PROFILE"))         or (Path.home() / ".config" / "anthropic").exists()
    if not has_creds:
        return fallback, "template"
    try:
        import anthropic
    except ImportError:
        return fallback, "template"
    try:
        client = anthropic.Anthropic(timeout=60.0, max_retries=1)
        facts_json = json.dumps(f, ensure_ascii=False, indent=1)
        response = client.beta.messages.create(
            model="claude-opus-5-5",
            max_tokens=4000,
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            output_config={"effort": "low"},
            system=(
                "You write the narrative sections of an Indian bank collateral valuation report, in the plain, precise "
                "voice of a senior registered valuer. Use only the facts given. Every number you write must appear "
                "exactly as given in the facts; never compute, round or invent figures. Return JSON only: a list of "
                'objects {"h": heading, "p": paragraph} with the headings: Subject property, Opinion of value, Basis, '
                "Valuer adjustments (only if adjustments exist), Market reality (only if circle_value exists), "
                "Lending recommendation, Flags."
            ),
            messages=[{"role": "user", "content": f"Facts:\n{facts_json}"}],
        )
        if response.stop_reason == "refusal":
            return fallback, "template"
        text = next((b.text for b in response.content if b.type == "text"), "")
        text = text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        sections = json.loads(text)
        allowed = _numbers(facts_json)
        written = set().union(*(_numbers(s["h"] + " " + s["p"]) for s in sections))
        if not written <= allowed | {"68", "90", "1", "3"}:
            return fallback, "template"
        return sections, "claude-opus-5-5"
    except Exception:  # no credentials, network, malformed output: the deterministic report stands
        return fallback, "template"


def report(v: dict, use_llm: bool = True) -> dict:
    f = facts(v)
    base = template(f)
    sections, source = llm(f, base) if use_llm else (base, "template")
    return {"sections": sections, "source": source, "facts": f}
