import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight, Loader2, Play } from "lucide-react";
import { getBook, valueProperty, type Catalogue, type Valuation, type ValueInput } from "../api";
import { catalogue, IntegrityDial, RealityPanel } from "../components/Reality";
import { inr, pct, signedPct } from "../format";

const EASE = [0.16, 1, 0.3, 1] as const;
const BASE: ValueInput = {
  lat: 19.1176, lon: 72.906, area_sqft: 850, area_basis: "carpet", bhk: 2, ptype: "flat", floor: 9, total_floors: 22, transaction: "resale",
  furnishing: "Semi-Furnished", bathrooms: 2, parking: 1, covered_parking: 1, amenities: ["liftavailable", "secsecurity"], age_years: null,
  loan_amount: null, facing: "East",
};

type Case = { k: string; t: string; who: string; how: string; detect: string; input: () => Promise<ValueInput> };
const CASES: Case[] = [
  { k: "inflate", t: "Inflated agreement", who: "Borrower + builder", how: "Agreement value is pumped up so an 80% loan covers the whole real price, or more.",
    detect: "Agreement above the calibrated 90% range", input: async () => ({ ...BASE, label: "Powai, Mumbai", declared_value: 6.2e7 }) },
  { k: "collude", t: "Valuer collusion", who: "Valuer + borrower", how: "An empanelled valuer reports what the deal needs, not what the flat is worth.",
    detect: "Valuer figure outside the 80% range; valuer scorecard on the book", input: async () => ({ ...BASE, label: "Powai, Mumbai", valuer_value: 4.1e7 }) },
  { k: "flip", t: "Flip and round-trip", who: "Related buyers", how: "The flat is sold back and forth between friends at rising prices to manufacture a high value.",
    detect: "Resale growth far above the local market; related-party sale", input: async () => ({ ...BASE, label: "Powai, Mumbai", prev_price: 1.55e7, prev_year: 2025.6, related_party: true }) },
  { k: "cash", t: "Cash component", who: "Buyer + seller", how: "The deed records the circle-rate price; the rest is paid in cash to save stamp duty.",
    detect: "Agreement at the circle rate while the market sits far above it",
    input: async () => ({ ...BASE, lat: 28.4227, lon: 77.0587, label: "Sector 50, Gurgaon", area_sqft: 1400, bhk: 3, declared_value: 9.5e6 }) },
  { k: "gpa", t: "GPA sale", who: "Seller", how: "Property 'sold' by general power of attorney: the Supreme Court held in 2011 that this conveys no title.",
    detect: "Title type not acceptable as security", input: async () => ({ ...BASE, lat: 28.6692, lon: 77.4538, label: "Ghaziabad", legal_status: "power_of_attorney" }) },
  { k: "laldora", t: "Lal Dora house", who: "Owner", how: "Urban-village abadi land with no formal title record; sold on possession and local papers.",
    detect: "Weak title: value discount and LTV capped at 60%",
    input: async () => ({ ...BASE, lat: 28.5466, lon: 77.2196, label: "Shahpur Jat, Delhi", ptype: "independent house", total_floors: 3, floor: 0, area_sqft: 1100, bhk: 3, legal_status: "lal_dora" }) },
  { k: "stalled", t: "Stalled project", who: "Developer", how: "Construction-linked money is drawn while the project stops; the flat may never be delivered.",
    detect: "RERA status, developer track record, stalled-project haircut",
    input: async () => ({ ...BASE, lat: 28.5917, lon: 77.4366, label: "Greater Noida West", transaction: "new", rera_status: "stalled", builder: "unknown" }) },
  { k: "double", t: "Double pledge", who: "Borrower", how: "The same flat is mortgaged to two lenders, or twice in one book, with copied documents.",
    detect: "Collateral matched against every pledged property in the book",
    input: async () => {
      const b = await getBook();
      const l = b.loans.find((x) => !x.duplicate_of) ?? b.loans[0];
      return { ...BASE, lat: l.lat, lon: l.lon, area_sqft: l.area_sqft, bhk: l.bhk, label: `${l.locality || l.city} (already pledged)`, declared_value: l.value * 1.05 };
    } },
];

export default function Diligence() {
  const [cat, setCat] = useState<Catalogue | null>(null);
  useEffect(() => { catalogue().then(setCat).catch(() => {}); }, []);
  return (
    <div>
      <section className="sec" style={{ borderBottom: "1px solid var(--line-2)" }}>
        <div className="sec-head" style={{ paddingTop: 44 }}>
          <div className="label" style={{ color: "var(--red)" }}>Market truth</div>
          <h1 className="h1">Every Indian home has two prices</h1>
          <p className="lede">Stamp duty is paid on the government circle rate, so deeds cluster near it and the rest of the price often moves in cash. A lender that values the market price but lends against a circle-rate deed, a weak title or a staged deal is lending against fiction.</p>
        </div>
        {cat && <TwoPriceLab cat={cat} />}
      </section>
      <Scanner />
      {cat && <Factors cat={cat} />}
      {cat && <TitleLadder cat={cat} />}
      <section className="sec" style={{ padding: "26px 40px 34px" }}>
        <p style={{ fontSize: 12.5, color: "var(--ink-3)", maxWidth: 900, margin: 0 }}>
          State duty rates, circle-to-market ratios and adjustment percentages are indicative, drawn from public reporting and common lender practice. They are configuration, shown wherever they are used, and are meant to be replaced by state IGR ready-reckoner tables and the lender's own credit policy. The engine flags; a credit officer decides.
        </p>
      </section>
    </div>
  );
}

// ------------------------------------------------------------------ two price lab
function TwoPriceLab({ cat }: { cat: Catalogue }) {
  const states = Object.entries(cat.states).filter(([k]) => k !== "India (default)");
  const [st, setSt] = useState("Delhi");
  const [mv, setMv] = useState(150); // lakh
  const [prem, setPrem] = useState(1.3);
  const S = cat.states[st];
  const ratio = Math.min(1, Math.max(0.3, S.circle * Math.pow(prem, -0.35)));
  const market = mv * 1e5, circle = market * ratio, gap = market - circle;
  const duty = (S.stamp + S.reg);
  const sorted = useMemo(() => [...states].sort((a, b) => a[1].circle - b[1].circle), [states]);
  const max = market * 1.05;
  return (
    <div className="split" style={{ borderTop: "1px solid var(--line-2)" }}>
      <div style={{ padding: "28px 40px 34px" }}>
        <div className="label">State</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {states.map(([k]) => (
            <button key={k} onClick={() => setSt(k)} className="chip" aria-pressed={st === k}
              style={st === k ? { background: "var(--ink)", color: "var(--ground)", borderColor: "var(--ink)" } : undefined}>{k}</button>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginTop: 22 }}>
          <label><span className="label">Market price · {inr(market)}</span>
            <input type="range" min={20} max={600} step={5} value={mv} onChange={(e) => setMv(Number(e.target.value))} className="stage-range" style={{ width: "100%" }} /></label>
          <label><span className="label">Locality premium · {prem.toFixed(1)}× city</span>
            <input type="range" min={0.6} max={2.4} step={0.1} value={prem} onChange={(e) => setPrem(Number(e.target.value))} className="stage-range" style={{ width: "100%" }} /></label>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 18, alignItems: "end", height: 230, marginTop: 26 }}>
          {[["Circle rate value", circle, "#3d6e9f"], ["Deed (as registered)", circle, "#7fb2e5"], ["Market price", market, "#f2b233"]].map(([t, v, c], i) => (
            <div key={String(t)} style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%" }}>
              <div className="num" style={{ fontWeight: 600, fontSize: 18, color: i === 2 ? "var(--amber)" : "var(--ink)" }}>{inr(Number(v))}</div>
              <motion.div animate={{ height: `${(Number(v) / max) * 82}%` }} transition={{ duration: 0.6, ease: EASE }}
                style={{ marginTop: 4, background: i === 2 ? String(c) : `repeating-linear-gradient(135deg, ${c} 0 3px, transparent 3px 7px)`, border: `1px solid ${c}` }} />
              <div className="label" style={{ fontSize: 9.5, marginTop: 6 }}>{String(t)}</div>
            </div>
          ))}
        </div>
        <div className="grid-3" style={{ marginTop: 22, borderTop: "1px solid var(--line-2)" }}>
          {[["Paid outside the deed", inr(gap), "var(--red)"], ["Duty on the deed", inr(circle * duty), "var(--ink)"], ["Duty the state loses", inr(gap * duty), "var(--red)"]].map(([k, v, c]) => (
            <div key={k} style={{ padding: "12px 0" }}><div className="label" style={{ fontSize: 9.5 }}>{k}</div><div className="num" style={{ fontSize: 24, fontWeight: 700, fontStretch: "80%", color: c }}>{v}</div></div>
          ))}
        </div>
        <p style={{ fontSize: 12.5, color: "var(--ink-2)", margin: "8px 0 0" }}>{S.rr}. Stamp duty {pct(S.stamp, 1)} + registration {pct(S.reg, 1)}. Premium localities show the widest gaps, because circle rates are set per zone and lag the market most where prices rise fastest.</p>
      </div>
      <div style={{ padding: "28px 40px 34px", borderLeft: "1px solid var(--line-2)" }}>
        <div className="label">Where the gap is widest · circle rate as a share of market (indicative)</div>
        <div style={{ marginTop: 14, display: "grid", gap: 4 }}>
          {sorted.map(([k, v], i) => (
            <button key={k} onClick={() => setSt(k)} style={{ display: "grid", gridTemplateColumns: "130px 1fr 44px", gap: 10, alignItems: "center", background: "transparent", border: 0, padding: "3px 0", cursor: "pointer", color: "var(--ink)", textAlign: "left" }}>
              <span style={{ fontSize: 12.5, color: k === st ? "var(--amber)" : "var(--ink-2)", fontWeight: k === st ? 700 : 400 }}>{k}</span>
              <span style={{ height: 10, background: "rgba(255,138,115,0.18)", position: "relative" }}>
                <motion.span initial={{ width: 0 }} whileInView={{ width: `${v.circle * 100}%` }} viewport={{ once: true }} transition={{ delay: i * 0.03, duration: 0.8, ease: EASE }}
                  style={{ position: "absolute", left: 0, top: 0, bottom: 0, background: k === st ? "var(--amber)" : "#5c8fc4" }} />
              </span>
              <span className="num" style={{ fontSize: 12, textAlign: "right" }}>{pct(v.circle, 0)}</span>
            </button>
          ))}
        </div>
        <p style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 10 }}>Red is the share of the market price above the circle rate. Delhi's circle rates were largely unrevised from 2014; Gujarat doubled its jantri in 2023 and Karnataka revised guidance values in 2023.</p>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ fraud scanner
function Scanner() {
  const [sel, setSel] = useState<string | null>(null);
  const [v, setV] = useState<Valuation | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async (c: Case) => {
    setSel(c.k); setBusy(true); setErr(null);
    try { setV(await valueProperty(await c.input())); } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); } finally { setBusy(false); }
  };
  const c = CASES.find((x) => x.k === sel);
  return (
    <section className="sec" style={{ borderBottom: "1px solid var(--line-2)" }}>
      <div className="sec-head">
        <h2 className="h2">Anatomy of collateral fraud</h2>
        <p className="lede">Eight ways collateral is misrepresented in Indian home lending, each staged as a real file and run live through the engine. Pick one and watch what the detectors catch.</p>
      </div>
      <div className="scan-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", borderTop: "1px solid var(--line-2)" }}>
        {CASES.map((x, i) => (
          <button key={x.k} onClick={() => run(x)} className="case"
            style={{ textAlign: "left", padding: "18px 18px 16px", background: sel === x.k ? "rgba(242,178,51,0.08)" : "transparent", color: "var(--ink)", cursor: "pointer",
              border: 0, borderRight: (i % 4) < 3 ? "1px solid var(--line-2)" : 0, borderBottom: "1px solid var(--line-2)", boxShadow: sel === x.k ? "inset 0 -2px 0 var(--amber)" : "none" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontStretch: "78%", fontWeight: 800, fontSize: 19 }}>{x.t}</span>
              {busy && sel === x.k ? <Loader2 size={16} className="spin" aria-hidden /> : <Play size={14} color="var(--cyan)" aria-hidden />}
            </div>
            <div className="label" style={{ fontSize: 9, marginTop: 4, color: "var(--red)" }}>{x.who}</div>
            <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "var(--ink-2)" }}>{x.how}</p>
          </button>
        ))}
      </div>
      <AnimatePresence mode="wait">
        {v && c && !busy && (
          <motion.div key={sel} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.5, ease: EASE }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 24, padding: "18px 40px", borderBottom: "1px solid var(--line-2)", background: "var(--ground-0)" }}>
              <div><div className="label">Case</div><div style={{ fontStretch: "78%", fontWeight: 800, fontSize: 22 }}>{c.t} · {v.input.label}</div></div>
              <div><div className="label">Model value</div><div className="num" style={{ fontSize: 22, fontWeight: 700, color: "var(--amber)" }}>{inr(v.value)}</div></div>
              <div><div className="label">Detected by</div><div style={{ fontSize: 13.5, color: "var(--ink-2)", maxWidth: 360 }}>{c.detect}</div></div>
              <div style={{ marginLeft: "auto", background: v.decision.band === "red" ? "var(--red)" : v.decision.band === "amber" ? "var(--amber)" : "var(--green)", color: "#071f38", padding: "10px 16px", fontStretch: "68%", fontWeight: 800, fontSize: 22, textTransform: "uppercase" }}>{v.decision.action}</div>
            </div>
            {v.reality && <RealityPanel r={v.reality} />}
            <div style={{ padding: "12px 40px 18px", borderTop: "1px solid var(--line-2)" }}>
              <Link to={`/value?lat=${v.input.lat}&lon=${v.input.lon}&label=${encodeURIComponent(v.input.label ?? "")}`} className="btn-ghost">Open this location on the valuation sheet <ArrowRight size={15} aria-hidden /></Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {!v && !busy && (
        <div style={{ display: "flex", alignItems: "center", gap: 30, padding: "26px 40px" }}>
          <IntegrityDial score={100} grade="clean" size={170} />
          <p style={{ color: "var(--ink-3)", fontSize: 14, maxWidth: 480 }}>Every file starts at 100. Each integrity, title or project signal takes points off; high-severity fraud signals route the file to fraud control regardless of how good the valuation looks.</p>
        </div>
      )}
      {err && <p role="alert" style={{ color: "var(--red)", padding: "0 40px 20px" }}>{err}. Is the engine running on port 8000?</p>}
    </section>
  );
}

// ------------------------------------------------------------------ factors tornado
function Factors({ cat }: { cat: Catalogue }) {
  const rows = [
    ...Object.values(cat.factors).map((f) => ({ ...f, g: "Neighbourhood" })),
    ...Object.entries(cat.legal).filter(([k]) => k !== "freehold" && k !== "society_share").map(([, f]) => ({ pct: f.pct, label: f.label, why: f.why, g: "Title" })),
    ...Object.values(cat.oc).filter((f) => f.pct).map((f) => ({ ...f, why: "Occupation without OC may be unauthorised", g: "Approvals" })),
    ...Object.values(cat.rera).filter((f) => f.pct).map((f) => ({ ...f, why: "Delivery risk on under-construction collateral", g: "Project" })),
  ].sort((a, b) => a.pct - b.pct);
  const lim = 0.36;
  return (
    <section className="sec" style={{ borderBottom: "1px solid var(--line-2)" }}>
      <div className="sec-head">
        <h2 className="h2">What moves a price that listings never record</h2>
        <p className="lede">A model trained on listings sees area, floor and location. It does not see the high-tension line overhead, the nala outside, a GPA title or a stalled tower. These are the valuer's adjustments, applied on top of the model and shown line by line.</p>
      </div>
      <div style={{ padding: "6px 40px 34px" }}>
        {rows.map((r, i) => (
          <motion.div key={r.label} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: i * 0.02 }}
            className="tornado" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 360px 54px minmax(0, 1.1fr)", gap: 14, alignItems: "center", padding: "5px 0", borderBottom: "1px solid var(--line)" }}>
            <span style={{ fontSize: 13.5 }}>{r.label} <span className="label" style={{ fontSize: 8.5, color: "var(--ink-3)" }}>{r.g}</span></span>
            <span style={{ position: "relative", height: 12 }}>
              <span style={{ position: "absolute", left: "50%", top: -3, bottom: -3, borderLeft: "1px solid var(--line-3)" }} />
              <motion.span initial={{ width: 0 }} whileInView={{ width: `${(Math.abs(r.pct) / lim) * 50}%` }} viewport={{ once: true }} transition={{ duration: 0.8, ease: EASE }}
                style={{ position: "absolute", top: 0, bottom: 0, [r.pct < 0 ? "right" : "left"]: "50%", background: r.pct < 0 ? "var(--red)" : "var(--green)", opacity: 0.85 } as React.CSSProperties} />
            </span>
            <span className="num" style={{ textAlign: "right", color: r.pct < 0 ? "var(--red)" : "var(--green)" }}>{signedPct(r.pct, 0)}</span>
            <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{r.why}</span>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function TitleLadder({ cat }: { cat: Catalogue }) {
  const order = ["freehold", "society_share", "leasehold", "gram_panchayat", "lal_dora", "power_of_attorney", "unauthorised_colony", "disputed"];
  return (
    <section className="sec" style={{ borderBottom: "1px solid var(--line-2)" }}>
      <div className="sec-head">
        <h2 className="h2">The title ladder</h2>
        <p className="lede">How much a lender can advance depends first on what the borrower actually owns. Naksha applies the title's value discount and its LTV ceiling before any loan is sized.</p>
      </div>
      <div className="ladder" style={{ display: "grid", gridTemplateColumns: `repeat(${order.length}, 1fr)`, borderTop: "1px solid var(--line-2)" }}>
        {order.map((k, i) => {
          const L = cat.legal[k];
          const cap = L.eligible ? (L.ltv_cap ?? 0.8) : 0;
          return (
            <motion.div key={k} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.07, duration: 0.6, ease: EASE }}
              style={{ padding: "16px 14px 18px", borderRight: i < order.length - 1 ? "1px solid var(--line-2)" : 0, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ height: 120, display: "flex", alignItems: "flex-end" }}>
                <motion.div initial={{ height: 0 }} whileInView={{ height: `${cap * 100}%` }} viewport={{ once: true }} transition={{ delay: 0.3 + i * 0.07, duration: 0.8, ease: EASE }}
                  style={{ width: "100%", background: L.eligible ? (cap >= 0.75 ? "var(--green)" : "var(--amber)") : "transparent", border: L.eligible ? 0 : "1px dashed var(--red)", minHeight: 2, opacity: 0.85 }} />
              </div>
              <div className="num" style={{ fontSize: 20, fontWeight: 700, fontStretch: "80%", color: L.eligible ? "var(--ink)" : "var(--red)" }}>{L.eligible ? `≤ ${pct(cap, 0)}` : "No loan"}</div>
              <div style={{ fontStretch: "80%", fontWeight: 700, fontSize: 14 }}>{L.label}</div>
              <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{L.why}</div>
            </motion.div>
          );
        })}
      </div>
      <p style={{ fontSize: 11.5, color: "var(--ink-3)", padding: "8px 40px 20px", margin: 0 }}>Bars show the maximum LTV; clean titles take the RBI cap for the loan size (shown here at 80%).</p>
    </section>
  );
}
