import { motion } from "framer-motion";
import type { Valuation } from "../api";
import { inr, inrParts, pct, psf } from "../format";
import { RollingNumber } from "./ui";

/**
 * The value drawn as a measurement: a dimension line spanning the P10–P90 tolerance,
 * with nested 80% and 68% bands and the point estimate as the datum tick.
 */
export default function ValueDimension({ v }: { v: Valuation }) {
  const { num, unit } = inrParts(v.value);
  const [a, b] = v.range.p90;
  const span = b - a || 1;
  const x = (p: number) => `${((p - a) / span) * 100}%`;
  const w = (r: [number, number]) => `${((r[1] - r[0]) / span) * 100}%`;
  return (
    <div style={{ padding: "18px 20px 6px" }}>
      <div className="label">Fair market value · transaction basis</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 10 }}>
        <span style={{ fontSize: 34, color: "var(--amber)", fontWeight: 500, fontStretch: "80%" }}>₹</span>
        <RollingNumber text={num} size={76} color="var(--amber)" />
        <span style={{ fontSize: 22, color: "var(--amber-2)", fontStretch: "75%", fontWeight: 600, letterSpacing: "0.04em" }}>{unit}</span>
      </div>
      <div style={{ color: "var(--ink-2)", marginTop: 6 }} className="num">
        {psf(v.ppsf)} on {Math.round(v.area_carpet_sqft).toLocaleString("en-IN")} sq ft carpet
      </div>

      {/* tolerance dimension */}
      <div style={{ position: "relative", height: 92, marginTop: 22 }} aria-label={`90% range ${inr(a)} to ${inr(b)}`}>
        {/* extension lines */}
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 26, borderLeft: "1px solid var(--line-3)" }} />
        <div style={{ position: "absolute", right: 0, top: 0, bottom: 26, borderLeft: "1px solid var(--line-3)" }} />
        {/* dimension line with arrowheads */}
        <svg width="100%" height="12" style={{ position: "absolute", top: 8, left: 0 }} preserveAspectRatio="none">
          <line x1="0" y1="6" x2="100%" y2="6" stroke="var(--line-3)" strokeWidth="1" />
        </svg>
        <svg width="9" height="10" style={{ position: "absolute", top: 9, left: 0 }} aria-hidden><path d="M0,5 L9,0 L9,10 z" fill="var(--ink-2)" /></svg>
        <svg width="9" height="10" style={{ position: "absolute", top: 9, right: 0 }} aria-hidden><path d="M9,5 L0,0 L0,10 z" fill="var(--ink-2)" /></svg>
        {/* bands */}
        <motion.div initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          style={{ position: "absolute", top: 30, height: 18, left: 0, right: 0, background: "rgba(127,178,229,0.12)", border: "1px solid var(--line-2)", transformOrigin: "50% 50%" }} />
        <motion.div initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.9, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          style={{ position: "absolute", top: 30, height: 18, left: x(v.range.p80[0]), width: w(v.range.p80), background: "rgba(127,178,229,0.22)" }} />
        <motion.div initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.9, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          style={{ position: "absolute", top: 30, height: 18, left: x(v.range.p68[0]), width: w(v.range.p68), background: "rgba(242,178,51,0.32)", borderLeft: "1px solid var(--amber)", borderRight: "1px solid var(--amber)" }} />
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
          style={{ position: "absolute", top: 22, height: 34, left: x(v.value), borderLeft: "2px solid var(--amber)" }} />
        <div className="num" style={{ position: "absolute", top: 58, left: 0, fontSize: 12, color: "var(--ink-2)" }}>{inr(a)}</div>
        <div className="num" style={{ position: "absolute", top: 58, right: 0, fontSize: 12, color: "var(--ink-2)" }}>{inr(b)}</div>
        <div className="label" style={{ position: "absolute", top: 76, left: 0, right: 0, textAlign: "center", fontSize: 9.5 }}>
          Calibrated range · 90% outer · 80% · 68% amber
        </div>
      </div>

      <dl style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", margin: "6px 0 0", borderTop: "1px solid var(--line)" }}>
        {[
          ["Confidence", pct(v.confidence, 0)],
          ["Forecast std. dev.", pct(v.fsd, 1)],
          ["Comps ≤ 1 km", String(v.comps_signal.n_within_1km)],
        ].map(([k, val], i) => (
          <div key={k} style={{ padding: "10px 0 10px", paddingLeft: i ? 12 : 0, borderLeft: i ? "1px solid var(--line)" : 0 }}>
            <dt className="label" style={{ fontSize: 9.5 }}>{k}</dt>
            <dd className="num" style={{ margin: "3px 0 0", fontSize: 20, fontWeight: 600, fontStretch: "85%" }}>{val}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
