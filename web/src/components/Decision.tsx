import { motion } from "framer-motion";
import { ShieldCheck, ScanSearch, MapPinned } from "lucide-react";
import type { Valuation } from "../api";
import { inr, pct } from "../format";

const BAND = {
  green: { c: "var(--green)", icon: ShieldCheck },
  amber: { c: "var(--amber)", icon: ScanSearch },
  red: { c: "var(--red)", icon: MapPinned },
};

/** The lending decision set at sign scale: one message, then the numbers that support it. */
export default function Decision({ v }: { v: Valuation }) {
  const b = BAND[v.decision.band];
  const Icon = b.icon;
  const L = v.lending;
  return (
    <div>
      <motion.div
        key={v.decision.band + v.value}
        initial={{ clipPath: "inset(0 100% 0 0)" }} animate={{ clipPath: "inset(0 0% 0 0)" }}
        transition={{ duration: 0.7, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
        style={{ background: b.c, color: "#071f38", padding: "14px 20px 16px", display: "flex", gap: 14, alignItems: "center" }}
      >
        <Icon size={34} strokeWidth={1.6} aria-hidden />
        <div>
          <div style={{ fontStretch: "68%", fontWeight: 800, fontSize: 30, lineHeight: 1, letterSpacing: "0.01em", textTransform: "uppercase" }}>
            {v.decision.action}
          </div>
          <div style={{ fontSize: 13, marginTop: 4, fontWeight: 500 }}>{v.decision.detail}</div>
        </div>
      </motion.div>
      <dl style={{ display: "grid", gridTemplateColumns: "1fr 1fr", margin: 0 }}>
        {[
          ["Lendable value", inr(L.lendable_value), "Lower 68% bound"],
          ["Max loan at RBI LTV", inr(L.max_loan), `LTV cap ${pct(L.ltv_cap, 0)}`],
          ["Distress value", inr(L.distress_value), "Forced-sale haircut"],
          ["Requested loan LTV", pct(L.ltv, 0), L.ltv > L.ltv_cap ? "Above cap" : "Within cap"],
        ].map(([k, val, sub], i) => (
          <div key={k} style={{ padding: "11px 20px", borderTop: "1px solid var(--line)", borderLeft: i % 2 ? "1px solid var(--line)" : 0 }}>
            <dt className="label" style={{ fontSize: 9.5 }}>{k}</dt>
            <dd className="num" style={{ margin: "2px 0 0", fontSize: 19, fontWeight: 600, fontStretch: "85%",
              color: k === "Requested loan LTV" && L.ltv > L.ltv_cap ? "var(--red)" : "var(--ink)" }}>{val}</dd>
            <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{sub}</div>
          </div>
        ))}
      </dl>
      {v.thresholds && (
        <p style={{ margin: 0, padding: "10px 20px", borderTop: "1px solid var(--line)", fontSize: 12, color: "var(--ink-2)" }}>
          Routing rule: waive when FSD ≤ {pct(v.thresholds.waive_fsd, 0)} with 8+ comparables within 1 km and no flags;
          desk review up to {pct(v.thresholds.desk_fsd, 0)}; otherwise a site visit. This property: FSD {pct(v.fsd, 1)}.
        </p>
      )}
      {L.two_valuations_required && (
        <p style={{ margin: 0, padding: "10px 20px", borderTop: "1px solid var(--line)", fontSize: 12, color: "var(--ink-2)" }}>
          {L.note}
        </p>
      )}
    </div>
  );
}
