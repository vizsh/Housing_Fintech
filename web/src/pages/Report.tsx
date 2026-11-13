import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Loader2, Printer, Sparkles } from "lucide-react";
import { getNarrative, v1Get, type Narrative, type Valuation } from "../api";
import { inr, pct, psf, SOURCE_NAMES, signedPct } from "../format";
import { Mark } from "../App";

export default function Report() {
  const [qs] = useSearchParams();
  const id = qs.get("id");
  const [v, setV] = useState<Valuation | null>(null);
  const [n, setN] = useState<Narrative | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      try {
        let val: Valuation | null = null;
        if (id) val = await v1Get(id);
        else {
          const s = sessionStorage.getItem("naksha:last");
          val = s ? (JSON.parse(s) as Valuation) : null;
        }
        if (!val) { setErr("No valuation yet. Value a property first, then open its report."); return; }
        setV(val);
        setN(await getNarrative(val, true));
      } catch (e) { setErr(e instanceof Error ? e.message : "Could not load the report"); }
    })();
  }, [id]);

  if (err) return <div style={{ padding: 48 }}><p style={{ color: "var(--ink-2)" }}>{err}</p><Link to="/value" className="btn-primary">Go to valuation</Link></div>;
  if (!v) return <div className="label" style={{ padding: 48 }}><Loader2 size={16} className="spin" aria-hidden /> Preparing the report…</div>;
  const r = v.reality;
  const no = id ?? `NK-${Math.abs(Math.round(v.input.lat * 100))}-${Math.abs(Math.round(v.input.lon * 100))}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
  const band = v.decision.band === "green" ? "var(--green)" : v.decision.band === "amber" ? "var(--amber)" : "var(--red)";
  return (
    <div style={{ padding: "28px 16px 60px" }}>
      <div className="no-print" style={{ maxWidth: 940, margin: "0 auto 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Link to="/value" style={{ color: "var(--cyan)" }}>← Back to the valuation</Link>
        <button className="btn-primary" onClick={() => window.print()}><Printer size={15} aria-hidden /> Print or save as PDF</button>
      </div>
      <article className="report" style={{ maxWidth: 940, margin: "0 auto", border: "1px solid var(--line-3)", background: "var(--ground)", position: "relative" }}>
        <header style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", borderBottom: "1px solid var(--line-3)" }}>
          <div style={{ padding: "18px 20px", borderRight: "1px solid var(--line-2)", display: "flex", alignItems: "center", gap: 12 }}>
            <Mark size={36} />
            <div><div style={{ fontStretch: "68%", fontWeight: 800, fontSize: 24, letterSpacing: "0.16em" }}>NAKSHA</div><div className="label" style={{ fontSize: 9 }}>Automated valuation report</div></div>
          </div>
          <div style={{ padding: "16px 20px" }}>
            <div className="label">Property</div>
            <div style={{ fontSize: 17, fontWeight: 600 }}>{v.input.label ?? `${v.input.lat.toFixed(4)}, ${v.input.lon.toFixed(4)}`}</div>
            <div style={{ fontSize: 13, color: "var(--ink-2)" }}>{v.input.bhk} BHK {v.input.ptype} · {Math.round(v.area_carpet_sqft)} sq ft carpet · floor {v.input.floor} of {v.input.total_floors} · {v.city}{r ? `, ${r.state}` : ""}</div>
          </div>
          <dl style={{ margin: 0, borderLeft: "1px solid var(--line-2)", display: "grid", gridTemplateRows: "1fr 1fr 1fr" }}>
            {[["Report no.", no], ["Date", new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })], ["Model", v.model_version ?? "naksha"]].map(([k, val], i) => (
              <div key={k} style={{ padding: "6px 16px", borderTop: i ? "1px solid var(--line)" : 0 }}><dt className="label" style={{ fontSize: 8.5 }}>{k}</dt><dd className="num" style={{ margin: 0, fontSize: 11.5 }}>{val}</dd></div>
            ))}
          </dl>
        </header>
        <section style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", borderBottom: "1px solid var(--line-2)" }} className="rep-top">
          <div style={{ padding: "20px 22px", borderRight: "1px solid var(--line-2)" }}>
            <div className="label">Fair market value · transaction basis</div>
            <div className="num" style={{ fontStretch: "78%", fontWeight: 800, fontSize: 58, color: "var(--amber)", lineHeight: 1.05 }}>{inr(v.value)}</div>
            <div style={{ color: "var(--ink-2)", fontSize: 13 }}>{psf(v.ppsf)} · confidence {pct(v.confidence, 0)} · FSD {pct(v.fsd, 1)}</div>
            <RangeBar v={v} />
            {r && Math.abs(r.adjustment_pct) > 0.001 && <div style={{ fontSize: 13, marginTop: 10 }}>Adjusted for facts the model cannot see: <b className="num">{inr(r.adjusted_value)}</b> ({signedPct(r.adjustment_pct, 0)})</div>}
          </div>
          <div>
            <div style={{ background: band, color: "#071f38", padding: "16px 20px" }}>
              <div style={{ fontStretch: "68%", fontWeight: 800, fontSize: 28, textTransform: "uppercase", lineHeight: 1 }}>{v.decision.action}</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>{v.decision.detail}</div>
            </div>
            <dl style={{ display: "grid", gridTemplateColumns: "1fr 1fr", margin: 0 }}>
              {[["Lendable value", inr(r?.lending.basis ?? v.lending.lendable_value)], ["Max loan", r && !r.lending.eligible ? "Not eligible" : inr(r?.lending.max_loan ?? v.lending.max_loan)],
                ["LTV cap", pct(r?.lending.ltv_cap ?? v.lending.ltv_cap, 0)], ["Integrity", r ? `${r.integrity.score}/100 · ${r.integrity.grade}` : "—"]].map(([k, val], i) => (
                <div key={k} style={{ padding: "10px 18px", borderTop: "1px solid var(--line)", borderLeft: i % 2 ? "1px solid var(--line)" : 0 }}>
                  <dt className="label" style={{ fontSize: 9 }}>{k}</dt><dd className="num" style={{ margin: "2px 0 0", fontSize: 17, fontWeight: 600 }}>{val}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
        <section style={{ padding: "18px 22px", borderBottom: "1px solid var(--line-2)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div className="label">Valuer's narrative</div>
            {n && <span className="label" style={{ fontSize: 9, color: n.source === "template" ? "var(--ink-3)" : "var(--cyan)", display: "flex", gap: 5, alignItems: "center" }}>
              {n.source !== "template" && <Sparkles size={12} aria-hidden />}{n.source === "template" ? "Deterministic narrative" : `Written by ${n.source} · every number checked against the valuation`}</span>}
          </div>
          {!n && <p className="label" style={{ marginTop: 10 }}><Loader2 size={14} className="spin" aria-hidden /> Writing…</p>}
          {n?.sections.map((s) => (
            <div key={s.h} style={{ display: "grid", gridTemplateColumns: "170px 1fr", gap: 16, padding: "9px 0", borderTop: "1px solid var(--line)", marginTop: 6 }} className="rep-row">
              <div style={{ fontStretch: "80%", fontWeight: 700, fontSize: 14 }}>{s.h}</div>
              <p style={{ margin: 0, fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.55 }}>{s.p}</p>
            </div>
          ))}
        </section>
        <section style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", borderBottom: "1px solid var(--line-2)" }} className="rep-top">
          <div style={{ padding: "16px 22px", borderRight: "1px solid var(--line-2)" }}>
            <div className="label">Comparable evidence</div>
            <table className="num" style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginTop: 8 }}>
              <thead><tr className="label" style={{ fontSize: 8.5, textAlign: "left" }}><th>Comparable</th><th>km</th><th>Size</th><th>Source</th><th style={{ textAlign: "right" }}>₹/sq ft today</th></tr></thead>
              <tbody>
                {v.comparables.slice(0, 7).map((c, i) => (
                  <tr key={i} style={{ borderTop: "1px solid var(--line)" }}>
                    <td style={{ padding: "5px 0", fontFamily: "inherit" }}>{(c.society || c.locality || "Listing").slice(0, 26)}</td><td>{c.km}</td><td>{c.bhk} BHK · {c.area_sqft}</td>
                    <td style={{ color: "var(--ink-3)" }}>{(SOURCE_NAMES[c.source] ?? c.source).replace(" listings", "")}</td><td style={{ textAlign: "right" }}>{Math.round(c.ppsf_today).toLocaleString("en-IN")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: "16px 22px" }}>
            <div className="label">Flags and adjustments</div>
            {[...v.flags.map((f) => ({ code: f.code, text: f.text })), ...(r?.flags ?? []).map((f) => ({ code: f.code, text: f.text }))].map((f, i) => (
              <div key={i} style={{ fontSize: 12.5, padding: "6px 0", borderTop: "1px solid var(--line)" }}><b className="label" style={{ fontSize: 8.5, color: "var(--red)" }}>{f.code.replace(/_/g, " ")}</b> {f.text}</div>
            ))}
            {r?.steps.map((s) => <div key={s.key} style={{ fontSize: 12.5, padding: "6px 0", borderTop: "1px solid var(--line)" }}>{s.label} <span className="num" style={{ color: s.pct < 0 ? "var(--red)" : "var(--green)" }}>{signedPct(s.pct, 0)}</span></div>)}
            {!v.flags.length && !(r?.flags.length) && !(r?.steps.length) && <p style={{ fontSize: 13, color: "var(--green)" }}>No flags or adjustments.</p>}
          </div>
        </section>
        <footer style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr" }} className="rep-top">
          <p style={{ margin: 0, padding: "14px 22px", fontSize: 11, color: "var(--ink-3)", borderRight: "1px solid var(--line-2)" }}>
            Automated valuation from public listings (time-aligned, ask-to-transaction −{pct(Number(v.assumptions.ask_to_txn_discount), 0)}), OpenStreetMap and AlphaEarth satellite context,
            with split-conformal ranges. To be read with the lender's credit policy; for loans of ₹50 lakh and above it serves as one of the two valuations.
          </p>
          {["Credit officer", "Registered valuer"].map((k, i) => (
            <div key={k} style={{ padding: "14px 22px", borderRight: i === 0 ? "1px solid var(--line-2)" : 0 }}>
              <div style={{ height: 34, borderBottom: "1px solid var(--line-3)" }} />
              <div className="label" style={{ fontSize: 9, marginTop: 6 }}>{k} · signature and date</div>
            </div>
          ))}
        </footer>
      </article>
    </div>
  );
}

function RangeBar({ v }: { v: Valuation }) {
  const [a, b] = v.range.p90;
  const x = (p: number) => `${((p - a) / (b - a)) * 100}%`;
  return (
    <div style={{ position: "relative", height: 46, marginTop: 14 }}>
      <div style={{ position: "absolute", top: 8, left: 0, right: 0, height: 14, background: "rgba(127,178,229,0.14)", border: "1px solid var(--line-2)" }} />
      <div style={{ position: "absolute", top: 8, height: 14, left: x(v.range.p68[0]), width: `calc(${x(v.range.p68[1])} - ${x(v.range.p68[0])})`, background: "rgba(242,178,51,0.4)" }} />
      <div style={{ position: "absolute", top: 3, height: 24, left: x(v.value), borderLeft: "2px solid var(--amber)" }} />
      <div className="num" style={{ position: "absolute", top: 28, left: 0, fontSize: 11, color: "var(--ink-2)" }}>{inr(a)}</div>
      <div className="num" style={{ position: "absolute", top: 28, right: 0, fontSize: 11, color: "var(--ink-2)" }}>{inr(b)}</div>
      <div className="label" style={{ position: "absolute", top: 30, left: 0, right: 0, textAlign: "center", fontSize: 8.5 }}>90% range · 68% amber</div>
    </div>
  );
}
