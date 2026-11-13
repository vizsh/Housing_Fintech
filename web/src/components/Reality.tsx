import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ChevronDown, ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import { getCatalogue, type Catalogue, type Reality, type ValueInput } from "../api";
import { inr, pct, signedPct } from "../format";
import { inputStyle } from "./ui";

const EASE = [0.16, 1, 0.3, 1] as const;
const SEV_C: Record<string, string> = { high: "var(--red)", medium: "var(--amber)", low: "var(--cyan)" };

let _cat: Promise<Catalogue> | null = null;
export const catalogue = () => (_cat ??= getCatalogue());

/** Integrity dial: 0-100, needle sweeps in; colour bands match the routing. */
export function IntegrityDial({ score, grade, size = 220 }: { score: number; grade: string; size?: number }) {
  const R = 90, cx = 110, cy = 110;
  const arc = (a0: number, a1: number) => {
    const p = (a: number) => [cx + R * Math.cos(Math.PI * (1 - a)), cy - R * Math.sin(Math.PI * (1 - a))];
    const [x0, y0] = p(a0), [x1, y1] = p(a1);
    return `M${x0},${y0} A${R},${R} 0 0 1 ${x1},${y1}`;
  };
  const c = grade === "clean" ? "var(--green)" : grade === "review" ? "var(--amber)" : "var(--red)";
  const Icon = grade === "clean" ? ShieldCheck : grade === "review" ? ShieldQuestion : ShieldAlert;
  return (
    <div style={{ width: size, position: "relative" }}>
      <svg viewBox="0 0 220 130" width={size} role="img" aria-label={`Integrity score ${score} of 100, ${grade}`}>
        <path d={arc(0, 0.6)} stroke="rgba(255,138,115,0.35)" strokeWidth="14" fill="none" />
        <path d={arc(0.6, 0.85)} stroke="rgba(242,178,51,0.35)" strokeWidth="14" fill="none" />
        <path d={arc(0.85, 1)} stroke="rgba(127,214,168,0.35)" strokeWidth="14" fill="none" />
        {Array.from({ length: 11 }, (_, i) => {
          const a = Math.PI * (1 - i / 10);
          return <line key={i} x1={cx + 70 * Math.cos(a)} y1={cy - 70 * Math.sin(a)} x2={cx + 77 * Math.cos(a)} y2={cy - 77 * Math.sin(a)} stroke="#86a8cb" strokeWidth="1" />;
        })}
        <motion.g initial={{ rotate: -90 }} animate={{ rotate: -90 + (score / 100) * 180 }} transition={{ duration: 1.4, ease: EASE }}
          style={{ originX: "110px", originY: "110px" }}>
          <line x1={cx} y1={cy} x2={cx} y2={cy - 82} stroke="#e8f1fb" strokeWidth="2" />
        </motion.g>
        <circle cx={cx} cy={cy} r="6" fill="#e8f1fb" />
      </svg>
      <div style={{ position: "absolute", left: 0, right: 0, top: size * 0.33, textAlign: "center" }}>
        <div className="num" style={{ fontStretch: "75%", fontWeight: 800, fontSize: size * 0.17, color: c, lineHeight: 1 }}>{score}</div>
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 6, alignItems: "center", marginTop: -4 }}>
        <Icon size={16} color={c} aria-hidden />
        <span className="label" style={{ color: c, fontSize: 11 }}>{grade === "clean" ? "Clean file" : grade === "review" ? "Review" : "Refer"}</span>
      </div>
    </div>
  );
}

/** The two prices of an Indian home: circle-rate value, deed value, market value. */
export function TwoPrices({ r, height = 190 }: { r: Reality; height?: number }) {
  const T = r.two_prices;
  const max = Math.max(T.market, T.deed, T.circle) * 1.08;
  const cols = [
    { k: "Circle rate", v: T.circle, c: "#3d6e9f", sub: `${pct(T.circle_ratio, 0)} of market` },
    { k: "Deed (registered)", v: T.deed, c: "#7fb2e5", sub: T.declared ? "From the agreement" : "Likely at circle rate" },
    { k: "Market (adjusted)", v: T.market, c: "#f2b233", sub: "What it really trades at" },
  ];
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, alignItems: "end", height, position: "relative" }}>
        {cols.map((c, i) => (
          <div key={c.k} style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%" }}>
            <div className="num" style={{ fontSize: 15, fontWeight: 600, marginBottom: 4, color: i === 2 ? "var(--amber)" : "var(--ink)" }}>{inr(c.v)}</div>
            <motion.div initial={{ height: 0 }} animate={{ height: `${(c.v / max) * 100 * 0.78}%` }} transition={{ duration: 1, delay: i * 0.12, ease: EASE }}
              style={{ background: i === 2 ? c.c : `repeating-linear-gradient(135deg, ${c.c} 0 3px, rgba(0,0,0,0) 3px 7px)`, border: `1px solid ${c.c}` }} />
          </div>
        ))}
        {T.cash_gap > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 }}
            style={{ position: "absolute", right: "35%", top: `${(1 - T.market / max * 0.78) * 100 - 6}%`, width: "28%", borderTop: "1px dashed var(--red)", textAlign: "center" }}>
            <span className="label" style={{ fontSize: 9.5, color: "var(--red)", background: "var(--ground-0)", padding: "0 4px", position: "relative", top: -9 }}>
              Outside the deed ≈ {inr(T.cash_gap)}
            </span>
          </motion.div>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginTop: 6 }}>
        {cols.map((c) => <div key={c.k}><div className="label" style={{ fontSize: 9.5 }}>{c.k}</div><div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{c.sub}</div></div>)}
      </div>
    </div>
  );
}

export function RealityPanel({ r }: { r: Reality }) {
  const S = r.state_rules;
  return (
    <div className="reality-grid" style={{ display: "grid", gridTemplateColumns: "250px minmax(0, 1.15fr) minmax(0, 1fr)" }}>
      <div style={{ padding: "20px 18px", borderRight: "1px solid var(--line-2)", display: "grid", justifyItems: "center", alignContent: "start", gap: 14 }}>
        <IntegrityDial score={r.integrity.score} grade={r.integrity.grade} />
        <dl style={{ margin: 0, width: "100%", display: "grid", gap: 8 }}>
          {[["Adjusted value", inr(r.adjusted_value), signedPct(r.adjustment_pct, 0) + " for facts the model can't see"],
            ["Lend on", inr(r.lending.basis), r.lending.basis_rule],
            ["Max loan", r.lending.eligible ? inr(r.lending.max_loan) : "Not eligible", `LTV cap ${pct(r.lending.ltv_cap, 0)}`]].map(([k, v, s]) => (
            <div key={k} style={{ borderTop: "1px solid var(--line)", paddingTop: 7 }}>
              <dt className="label" style={{ fontSize: 9.5 }}>{k}</dt>
              <dd className="num" style={{ margin: "2px 0 0", fontSize: 18, fontWeight: 600 }}>{v}</dd>
              <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{s}</div>
            </div>
          ))}
        </dl>
      </div>
      <div style={{ padding: "20px 22px", borderRight: "1px solid var(--line-2)" }}>
        <div className="label" style={{ marginBottom: 12 }}>Two prices · {r.state}</div>
        <TwoPrices r={r} />
        <p style={{ fontSize: 12, color: "var(--ink-2)", margin: "14px 0 0" }}>
          {S.rr}. Stamp duty {pct(S.stamp, 1)} + registration {pct(S.reg, 1)}: {inr(r.two_prices.stamp_on_deed)} on the deed against {inr(r.two_prices.stamp_on_market)} on the market price
          {r.two_prices.duty_leakage > 0 ? `, a ${inr(r.two_prices.duty_leakage)} duty gap` : ""}. Lenders lend on the lower of deed value and valuation, so the cash part is the borrower's margin.
        </p>
        {r.steps.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div className="label" style={{ marginBottom: 6 }}>Adjustments the model cannot see</div>
            {r.steps.map((s, i) => (
              <motion.div key={s.key} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 + i * 0.08 }}
                style={{ display: "grid", gridTemplateColumns: "1fr 70px", gap: 10, padding: "6px 0", borderTop: "1px solid var(--line)", fontSize: 13 }}>
                <div>{s.label}<div style={{ fontSize: 11, color: "var(--ink-3)" }}>{s.group} · {s.why}</div></div>
                <div className="num" style={{ textAlign: "right", color: s.pct < 0 ? "var(--red)" : "var(--green)" }}>{signedPct(s.pct, 0)}</div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
      <div style={{ padding: "20px 22px" }}>
        <div className="label" style={{ marginBottom: 10 }}>Integrity and title signals</div>
        {r.flags.length === 0 && <p style={{ margin: 0, color: "var(--green)", fontSize: 14 }}>No integrity or title flags. Add the agreement value, the valuer's figure or the previous sale to test the deal.</p>}
        {r.flags.map((f, i) => (
          <motion.div key={f.code + i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + i * 0.12 }}
            style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 10, padding: "9px 0", borderTop: "1px solid var(--line)" }}>
            <span className="label" style={{ fontSize: 9, color: SEV_C[f.severity], border: `1px solid ${SEV_C[f.severity]}`, padding: "2px 5px", alignSelf: "start", whiteSpace: "nowrap" }}>{f.code.replace(/_/g, " ")}</span>
            <span style={{ fontSize: 13 }}>{f.text}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/** Title-block section: the deal and legal facts a valuer collects. */
export function DealFacts({ form, setForm }: { form: ValueInput; setForm: (f: ValueInput) => void }) {
  const [open, setOpen] = useState(false);
  const [cat, setCat] = useState<Catalogue | null>(null);
  useEffect(() => { catalogue().then(setCat).catch(() => {}); }, []);
  const set = <K extends keyof ValueInput>(k: K, v: ValueInput[K]) => setForm({ ...form, [k]: v });
  const n = (s: string) => (s === "" ? null : Number(s));
  const active = (form.factors?.length ?? 0) + (form.declared_value ? 1 : 0) + (form.valuer_value ? 1 : 0) + (form.prev_price ? 1 : 0)
    + (form.legal_status && form.legal_status !== "freehold" ? 1 : 0) + (form.related_party ? 1 : 0);
  const sel: React.CSSProperties = { ...inputStyle, appearance: "none", background: "transparent", fontSize: 14 };
  return (
    <div style={{ border: "1px solid var(--line-2)" }}>
      <button onClick={() => setOpen(!open)} aria-expanded={open}
        style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 10px", background: open ? "var(--ground-2)" : "transparent", border: 0, color: "var(--ink)", cursor: "pointer" }}>
        <span className="label" style={{ color: "var(--ink)" }}>Deal and legal facts {active ? `· ${active} set` : ""}</span>
        <ChevronDown size={15} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }} aria-hidden />
      </button>
      {open && cat && (
        <div style={{ padding: "10px 10px 12px", display: "grid", gap: 12 }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span className="label">Title</span>
            <select value={form.legal_status ?? "freehold"} onChange={(e) => set("legal_status", e.target.value)} style={sel}>
              {Object.entries(cat.legal).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {form.transaction === "new" ? (
              <>
                <label style={{ display: "grid", gap: 4 }}><span className="label">RERA status</span>
                  <select value={form.rera_status ?? "registered"} onChange={(e) => set("rera_status", e.target.value)} style={sel}>
                    {Object.entries(cat.rera).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select></label>
                <label style={{ display: "grid", gap: 4 }}><span className="label">Developer</span>
                  <select value={form.builder ?? "regional"} onChange={(e) => set("builder", e.target.value)} style={sel}>
                    {Object.entries(cat.builder).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select></label>
              </>
            ) : (
              <label style={{ display: "grid", gap: 4, gridColumn: "span 2" }}><span className="label">Occupancy certificate</span>
                <select value={form.oc_status ?? "oc"} onChange={(e) => set("oc_status", e.target.value)} style={sel}>
                  {Object.entries(cat.oc).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select></label>
            )}
          </div>
          <div>
            <span className="label">Around the property</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 6 }}>
              {Object.entries(cat.factors).map(([k, v]) => {
                const on = form.factors?.includes(k);
                return (
                  <button key={k} aria-pressed={on} title={`${v.why} (${signedPct(v.pct, 0)})`}
                    onClick={() => set("factors", on ? form.factors!.filter((x) => x !== k) : [...(form.factors ?? []), k])}
                    style={{ border: "1px solid", borderColor: on ? (v.pct < 0 ? "var(--red)" : "var(--green)") : "var(--line-2)",
                      background: on ? (v.pct < 0 ? "rgba(255,138,115,0.15)" : "rgba(127,214,168,0.15)") : "transparent",
                      color: on ? "var(--ink)" : "var(--ink-2)", padding: "3px 7px", fontSize: 11.5, cursor: "pointer", fontStretch: "85%" }}>
                    {v.label} <span className="num" style={{ color: v.pct < 0 ? "var(--red)" : "var(--green)" }}>{signedPct(v.pct, 0)}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {([["declared_value", "Agreement value, ₹ L"], ["valuer_value", "Valuer's figure, ₹ L"], ["prev_price", "Last sale, ₹ L"]] as const).map(([k, t]) => (
              <label key={k} style={{ display: "grid", gap: 4 }}><span className="label">{t}</span>
                <input type="number" min={1} placeholder="optional" value={form[k] ? (form[k] as number) / 1e5 : ""}
                  onChange={(e) => set(k, n(e.target.value) ? Number(e.target.value) * 1e5 : null)} style={inputStyle} /></label>
            ))}
            <label style={{ display: "grid", gap: 4 }}><span className="label">Last sale year</span>
              <input type="number" min={1990} max={2026} placeholder="e.g. 2025" value={form.prev_year ?? ""} onChange={(e) => set("prev_year", n(e.target.value))} style={inputStyle} /></label>
          </div>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
            <input type="checkbox" checked={!!form.related_party} onChange={(e) => set("related_party", e.target.checked)} />
            Buyer and seller are related
          </label>
        </div>
      )}
    </div>
  );
}
