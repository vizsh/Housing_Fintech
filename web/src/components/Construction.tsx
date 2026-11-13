import { motion } from "framer-motion";
import type { Valuation } from "../api";
import { clpStages } from "../arch";
import { inr, pct } from "../format";

/** Physical completion of the structure at each payment stage (for collateral-in-place). */
function builtShare(k: string, slabs: number, n: number) {
  if (k === "book" || k === "agree") return 0;
  if (k === "plinth") return 0.1;
  if (k.startsWith("slab")) return 0.1 + 0.5 * (slabs / n);
  return { brick: 0.75, finish: 0.88, lift: 0.95, oc: 1 }[k] ?? 1;
}

const STALL = 0.35;

export function stageSlabs(v: Valuation, idx: number) {
  const n = Math.max(1, Math.round(v.input.total_floors ?? 1));
  return clpStages(n)[Math.min(idx, clpStages(n).length - 1)].slabs;
}

/**
 * Construction-linked disbursement: the builder's demand at each stage, the borrower's own contribution
 * paid first, the lender's tranche, and whether the collateral built so far still covers what has been lent.
 */
export default function Construction({ v, idx, setIdx }: { v: Valuation; idx: number; setIdx: (i: number) => void }) {
  const n = Math.max(1, Math.round(v.input.total_floors ?? 1));
  const st = clpStages(n);
  const cost = v.value;
  const loan = Math.min(v.lending.loan_amount, v.lending.max_loan);
  const margin = cost - loan;
  const rows = st.map((s) => {
    const demand = cost * s.cum;
    const lender = Math.max(0, demand - margin);
    // an unfinished project sells at a discount if the developer stalls; full value only with the OC
    const inPlace = (v.cost_approach.land + v.cost_approach.structure * builtShare(s.k, s.slabs, n)) * (s.k === "oc" ? 1 : 1 - STALL);
    return { ...s, demand, own: Math.min(demand, margin), lender, inPlace, cover: lender > 0 ? inPlace / lender : Infinity };
  });
  const cur = rows[idx];
  const prev = idx > 0 ? rows[idx - 1] : null;
  const tranche = cur.lender - (prev?.lender ?? 0);
  const weak = cur.cover < 1.1;
  return (
    <div>
      <div style={{ padding: "14px 20px 6px" }}>
        <label className="label" htmlFor="stage">Construction stage reached · drag to inspect</label>
        <input id="stage" type="range" min={0} max={st.length - 1} step={1} value={idx} onChange={(e) => setIdx(Number(e.target.value))}
          className="stage-range" style={{ width: "100%", marginTop: 10 }} aria-valuetext={cur.t} />
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${st.length}, 1fr)`, marginTop: 4 }} aria-hidden>
          {st.map((s, i) => (
            <button key={s.k} onClick={() => setIdx(i)} tabIndex={-1} title={s.t}
              style={{ border: 0, background: "transparent", padding: "4px 0 0", cursor: "pointer", textAlign: "center",
                color: i === idx ? "var(--amber)" : i < idx ? "var(--ink-2)" : "var(--ink-3)" }}>
              <div style={{ height: 8, borderLeft: `1px solid ${i <= idx ? "var(--ink-2)" : "var(--line-2)"}`, width: 0, margin: "0 auto" }} />
              <div className="label stage-tick" style={{ fontSize: 8.5, color: "inherit", letterSpacing: "0.06em", lineHeight: 1.2, marginTop: 2 }}>{s.t.split(",")[0].replace("Agreement for sale", "Agreement").replace("Possession with OC", "OC")}</div>
            </button>
          ))}
        </div>
      </div>

      <dl className="clp-stats" style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", margin: 0, borderTop: "1px solid var(--line)" }}>
        {[
          ["Builder demand to date", inr(cur.demand), `${pct(cur.cum, 0)} of ${inr(cost)}`],
          ["Borrower's own share paid", inr(cur.own), `Margin ${inr(margin)} goes first`],
          ["Lender disbursed to date", inr(cur.lender), `of sanctioned ${inr(loan)}`],
          ["This stage's tranche", inr(tranche), tranche > 0 ? "Release on architect's certificate" : "Nothing due from the lender"],
          ["Realisable if it stalls", inr(cur.inPlace), cur.lender > 0 ? `Cover ${cur.cover.toFixed(2)}× of disbursed` : `${pct(STALL, 0)} stalled-project haircut`],
        ].map(([k, val, sub], i) => (
          <div key={k} style={{ padding: "11px 16px", borderLeft: i ? "1px solid var(--line)" : 0 }}>
            <dt className="label" style={{ fontSize: 9.5 }}>{k}</dt>
            <dd className="num" style={{ margin: "2px 0 0", fontSize: 19, fontWeight: 600, fontStretch: "85%", color: i === 4 && weak ? "var(--red)" : "var(--ink)" }}>{val}</dd>
            <div style={{ fontSize: 11, color: i === 4 && weak ? "var(--red)" : "var(--ink-3)" }}>{sub}</div>
          </div>
        ))}
      </dl>

      {/* exposure chart: lender disbursed vs collateral in place, by stage */}
      <div style={{ padding: "8px 20px 4px", borderTop: "1px solid var(--line)" }}>
        <ExposureChart rows={rows} idx={idx} loan={loan} />
        <div className="label" style={{ fontSize: 9.5, display: "flex", gap: 18, flexWrap: "wrap", padding: "2px 0 6px" }}>
          <span><span style={{ display: "inline-block", width: 16, borderTop: "1.5px solid var(--cyan)", verticalAlign: "middle", marginRight: 6 }} />Realisable if stalled</span>
          <span><span style={{ display: "inline-block", width: 16, borderTop: "2px solid var(--ink)", verticalAlign: "middle", marginRight: 6 }} />Lender disbursed</span>
          <span><span style={{ display: "inline-block", width: 16, borderTop: "1px dashed var(--ink-2)", verticalAlign: "middle", marginRight: 6 }} />Sanctioned loan</span>
          <span><span style={{ display: "inline-block", height: 10, borderLeft: "1.5px solid var(--amber)", verticalAlign: "middle", marginRight: 6 }} />Stage reached</span>
        </div>
      </div>

      <p style={{ margin: 0, padding: "10px 20px 14px", fontSize: 12, color: "var(--ink-2)", borderTop: "1px solid var(--line)" }}>
        Typical construction-linked plan: RERA s.13 caps collection at 10% before the agreement for sale, and the promoter must hold 70% of
        collections in the project's RERA account. Tranches go to that account against an architect's stage certificate and a site check. Until the occupancy certificate, the collateral is valued as land share plus structure built, less a 35% stalled-project haircut (our assumption).
        {weak && cur.lender > 0 && " At this stage the stalled-project value barely covers what has been lent; hold the tranche until the next slab is certified."}
      </p>
    </div>
  );
}

function ExposureChart({ rows, idx, loan }: { rows: { t: string; lender: number; inPlace: number }[]; idx: number; loan: number }) {
  const W = 1000, H = 150, pl = 8, pr = 8, pt = 14, pb = 18;
  const max = Math.max(loan, ...rows.map((r) => r.inPlace)) * 1.05;
  const x = (i: number) => pl + (i / (rows.length - 1)) * (W - pl - pr);
  const y = (val: number) => pt + (1 - val / max) * (H - pt - pb);
  const line = (k: "lender" | "inPlace") => rows.map((r, i) => `${i ? "L" : "M"}${x(i)},${y(r[k])}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" role="img"
      aria-label="Lender exposure against collateral in place, by construction stage">
      {[0.25, 0.5, 0.75, 1].map((f) => <line key={f} x1={pl} x2={W - pr} y1={y(max * f / 1.05)} y2={y(max * f / 1.05)} stroke="rgba(214,233,252,0.1)" />)}
      <line x1={pl} x2={W - pr} y1={y(loan)} y2={y(loan)} stroke="rgba(214,233,252,0.32)" strokeDasharray="6 5" vectorEffect="non-scaling-stroke" />
      <path d={`${line("inPlace")} L${x(rows.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill="rgba(127,178,229,0.14)" />
      <motion.path d={line("inPlace")} fill="none" stroke="#7fb2e5" strokeWidth="1.5" vectorEffect="non-scaling-stroke"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }} />
      <motion.path d={line("lender")} fill="none" stroke="#e8f1fb" strokeWidth="2" vectorEffect="non-scaling-stroke"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 0.15, ease: [0.16, 1, 0.3, 1] }} />
      <line x1={x(idx)} x2={x(idx)} y1={pt - 6} y2={H - pb} stroke="#f2b233" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
