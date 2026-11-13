import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { CornerDownLeft, Loader2, MapPinned, Printer, ScanSearch } from "lucide-react";
import { valueIncome, type Asset, type IncomeInput, type IncomeValuation } from "../api";
import LocationSearch, { type Preset } from "../components/LocationSearch";
import { Field, inputStyle, Panel, RollingNumber, Seg } from "../components/ui";
import { inr, inrParts, pct, psf, signedPct } from "../format";

const CashflowSkyline = lazy(() => import("../components/CashflowSkyline"));

const PRESETS: (Preset & { asset: Asset; area: number })[] = [
  { t: "BKC, Mumbai", lat: 19.0662, lon: 72.8679, note: "Prime office", asset: "office", area: 25000 },
  { t: "Cyber City, Gurgaon", lat: 28.4949, lon: 77.0887, note: "NCR office", asset: "office", area: 40000 },
  { t: "HITEC City, Hyderabad", lat: 17.4474, lon: 78.3762, note: "IT office", asset: "office", area: 30000 },
  { t: "Koramangala, Bengaluru", lat: 12.9352, lon: 77.6245, note: "High-street retail", asset: "retail", area: 4000 },
  { t: "Bhiwandi, Thane", lat: 19.2813, lon: 73.0483, note: "Logistics", asset: "warehouse", area: 150000 },
  { t: "Hazratganj, Lucknow", lat: 26.8467, lon: 80.9462, note: "Tier-2, no benchmark", asset: "retail", area: 3000 },
];

const DEFAULT: IncomeInput = {
  lat: PRESETS[0].lat, lon: PRESETS[0].lon, asset: "office", area_sqft: 25000, rent: 165, occupancy: null, escalation: null,
  wale: 6, tenant: "A", cap_rate: null, loan_amount: null, label: PRESETS[0].t,
};

const ASSET_NAME: Record<Asset, string> = { office: "Office", retail: "Retail", warehouse: "Warehouse" };

export default function IncomeSheet() {
  const [form, setForm] = useState<IncomeInput>(DEFAULT);
  const [place, setPlace] = useState(PRESETS[0].t);
  const [v, setV] = useState<IncomeValuation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drawKey, setDrawKey] = useState(1);
  const first = useRef(true);

  const run = useCallback(async (f: IncomeInput) => {
    setBusy(true); setError(null);
    try { setV(await valueIncome(f)); setDrawKey((k) => k + 1); }
    catch (e) { setError(e instanceof Error ? `${e.message}. Check that the engine is running on port 8000.` : "Valuation failed."); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { if (first.current) { first.current = false; run(DEFAULT); } }, [run]);

  return (
    <div>
      <div className="sheet-main" style={{ display: "grid", gridTemplateColumns: "minmax(300px, 25%) minmax(0, 1fr) minmax(360px, 30%)", height: "calc(100vh - 57px)", minHeight: 680 }}>
        <aside className="no-print" style={{ borderRight: "1px solid var(--line-2)", minHeight: 0, background: "rgba(7,31,56,0.55)" }}>
          <IncomeBlock form={form} setForm={setForm} place={place} setPlace={setPlace} onValue={() => run(form)} busy={busy} error={error} />
        </aside>

        <div className="sheet-centre" style={{ display: "grid", gridTemplateRows: "58% 42%", minHeight: 0 }}>
          <Panel title="Ten-year income · net operating income by year" meta={v ? `${ASSET_NAME[v.asset]} · ${v.city}` : ""} style={{ borderBottom: "1px solid var(--line-2)" }}>
            {v && (
              <Suspense fallback={null}>
                <CashflowSkyline flows={v.flows} wale={v.input.wale} exitValue={v.dcf_parts.exit_value} exitCap={v.rates.exit_cap} drawKey={drawKey} />
              </Suspense>
            )}
          </Panel>
          <Panel title="Sensitivity · value by cap rate and rent" meta="Amber cell is the estimate">
            {v && <Sensitivity v={v} />}
          </Panel>
        </div>

        <aside style={{ borderLeft: "1px solid var(--line-2)", display: "flex", flexDirection: "column", minHeight: 0, overflowY: "auto", background: "rgba(7,31,56,0.35)" }}>
          {v ? (
            <div style={{ opacity: busy ? 0.45 : 1, transition: "opacity .3s" }}>
              <IncomeValue v={v} />
              <LrdDecision v={v} />
            </div>
          ) : (
            <div style={{ padding: 20, color: "var(--ink-3)" }}>{busy ? "Capitalising the income…" : "Describe the lease and value it."}</div>
          )}
          {busy && <div className="label" role="status" style={{ padding: "10px 20px", color: "var(--amber)" }}>Measuring</div>}
        </aside>
      </div>

      {v && (
        <div style={{ borderTop: "1px solid var(--line-3)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 24px", borderBottom: "1px solid var(--line-2)" }}>
            <div>
              <h2 style={{ margin: 0, fontStretch: "75%", fontWeight: 700, fontSize: 26 }}>Why {inr(v.value)}</h2>
              <p style={{ margin: "4px 0 0", color: "var(--ink-2)", fontSize: 13 }}>
                NOI {inr(v.income.noi)} a year capitalised at {pct(v.rates.cap, 2)}, reconciled 50 : 50 with a ten-year cash flow ·
                {" "}{v.tenant} tenant · valued in {v.latency_ms} ms
              </p>
            </div>
            <button onClick={() => window.print()} className="no-print"
              style={{ display: "flex", gap: 8, alignItems: "center", border: "1px solid var(--line-3)", background: "transparent", padding: "9px 14px", cursor: "pointer", fontStretch: "80%", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", fontSize: 12 }}>
              <Printer size={15} aria-hidden /> Print valuation report
            </button>
          </div>
          <div className="sheet-2col" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.35fr) minmax(0, 1fr)" }}>
            <Panel title="Income build-up · year 1" style={{ borderRight: "1px solid var(--line-2)", borderBottom: "1px solid var(--line-2)" }}><BuildUp v={v} /></Panel>
            <div style={{ borderBottom: "1px solid var(--line-2)" }}>
              <Panel title="Method reconciliation"><Reconcile v={v} /></Panel>
              <Panel title="Cap rate build-up" style={{ borderTop: "1px solid var(--line-2)" }}><Rates v={v} /></Panel>
            </div>
            <Panel title="Market rent evidence" style={{ borderRight: "1px solid var(--line-2)" }}><MarketRent v={v} /></Panel>
            <div>
              <Panel title="Risk flags"><IncomeFlags v={v} /></Panel>
              <Panel title="Stated assumptions and sources" style={{ borderTop: "1px solid var(--line-2)" }}>
                <ul style={{ margin: 0, padding: "10px 16px 14px 32px", fontSize: 12, color: "var(--ink-2)", display: "grid", gap: 4 }}>
                  <li>Office rents: Anarock Annual Office Update 2025 (MMR); Business Standard, May 2025 (NCR, Bengaluru, Pune, Hyderabad, Chennai). Kolkata, Ahmedabad, retail premium and warehouse rent are our assumptions.</li>
                  <li>Office cap rates: Brookfield India REIT valuation summary, FY26 (7.75–8.0%). Retail and warehouse cap rates are our assumptions.</li>
                  <li>Leases step up {pct(v.income.escalation, 0)} every 3 years; after expiry the space re-lets at market rent growing {pct(0.04, 0)} a year, with a 6-month void. Exit at cap + 25 bp; discount rate cap + 350 bp.</li>
                  <li>LRD: {pct(v.lending.rate, 2)} interest, tenor capped by the lease (3–12 years), loan the lower of DSCR cover and {pct(v.lending.ltv_cap, 0)} of the lower value bound. These are lender-policy placeholders, not RBI ceilings.</li>
                  <li>The range is a sensitivity band (cap ±25 bp, rent ±5%), not a calibrated interval: no public Indian commercial transaction data exists to calibrate against.</li>
                </ul>
              </Panel>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function num(v: string) { return v === "" ? null : Number(v); }

function IncomeBlock({ form, setForm, place, setPlace, onValue, busy, error }: {
  form: IncomeInput; setForm: (f: IncomeInput) => void; place: string; setPlace: (s: string) => void;
  onValue: () => void; busy: boolean; error: string | null;
}) {
  const set = <K extends keyof IncomeInput>(k: K, val: IncomeInput[K]) => setForm({ ...form, [k]: val });
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <LocationSearch lat={form.lat} lon={form.lon} place={place} presets={PRESETS} hint=""
        onPlace={(lat, lon, label) => {
          const p = PRESETS.find((x) => x.t === label);
          setForm({ ...form, lat, lon, label, ...(p ? { asset: p.asset, area_sqft: p.area, rent: null } : {}) });
          setPlace(label);
        }} />
      <div style={{ padding: "14px 18px", display: "grid", gap: 14, overflowY: "auto", flex: 1 }}>
        <Field label="Asset class">
          <Seg label="Asset class" value={form.asset} onChange={(a) => set("asset", a)}
            options={[{ v: "office", t: "Office" }, { v: "retail", t: "Retail" }, { v: "warehouse", t: "Warehouse" }]} />
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Field label="Leasable area, sq ft">
            <input type="number" min={500} value={form.area_sqft} onChange={(e) => set("area_sqft", Number(e.target.value))} style={inputStyle} />
          </Field>
          <Field label="Lease rent, ₹/sq ft/mo">
            <input type="number" min={1} placeholder="market" value={form.rent ?? ""} onChange={(e) => set("rent", num(e.target.value))} style={inputStyle} />
          </Field>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
          <Field label="Occupancy %">
            <input type="number" min={30} max={100} placeholder="auto" value={form.occupancy != null ? Math.round(form.occupancy * 100) : ""}
              onChange={(e) => set("occupancy", e.target.value === "" ? null : Number(e.target.value) / 100)} style={inputStyle} />
          </Field>
          <Field label="Step-up %/3y">
            <input type="number" min={0} max={40} placeholder="15" value={form.escalation != null ? Math.round(form.escalation * 100) : ""}
              onChange={(e) => set("escalation", e.target.value === "" ? null : Number(e.target.value) / 100)} style={inputStyle} />
          </Field>
          <Field label="Lease left, yrs">
            <input type="number" min={0.5} max={30} step={0.5} value={form.wale} onChange={(e) => set("wale", Number(e.target.value))} style={inputStyle} />
          </Field>
        </div>
        <Field label="Tenant covenant">
          <Seg label="Tenant covenant" value={form.tenant} onChange={(t) => set("tenant", t)}
            options={[{ v: "A", t: "Listed / MNC" }, { v: "B", t: "Private" }, { v: "C", t: "Unrated" }]} />
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Field label="Cap rate override %">
            <input type="number" min={4} max={16} step={0.25} placeholder="auto" value={form.cap_rate != null ? +(form.cap_rate * 100).toFixed(2) : ""}
              onChange={(e) => set("cap_rate", e.target.value === "" ? null : Number(e.target.value) / 100)} style={inputStyle} />
          </Field>
          <Field label="Loan asked, ₹ Cr">
            <input type="number" min={0.1} step={0.1} placeholder="auto" value={form.loan_amount ? +(form.loan_amount / 1e7).toFixed(2) : ""}
              onChange={(e) => set("loan_amount", e.target.value === "" ? null : Number(e.target.value) * 1e7)} style={inputStyle} />
          </Field>
        </div>
        <p style={{ margin: 0, fontSize: 11.5, color: "var(--ink-3)" }}>
          Leave rent blank to value on estimated market rent. Lease rental discounting (LRD) loans are sized on the rent, so the lease deed decides the loan.
        </p>
      </div>
      <div style={{ borderTop: "1px solid var(--line-2)" }}>
        {error && <p role="alert" style={{ margin: 0, padding: "10px 18px", color: "var(--red)", fontSize: 12.5 }}>{error}</p>}
        <button onClick={onValue} disabled={busy}
          style={{
            width: "100%", padding: "16px 18px", border: 0, background: busy ? "var(--ground-3)" : "var(--ink)", color: "var(--ground)",
            fontStretch: "72%", fontWeight: 800, fontSize: 17, letterSpacing: "0.14em", textTransform: "uppercase", cursor: busy ? "wait" : "pointer",
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
          <span style={{ color: busy ? "var(--ink)" : "var(--ground)" }}>{busy ? "Measuring…" : "Value on income"}</span>
          {busy ? <Loader2 size={18} className="spin" color="var(--ink)" /> : <CornerDownLeft size={17} strokeWidth={2} aria-hidden />}
        </button>
      </div>
    </div>
  );
}

function IncomeValue({ v }: { v: IncomeValuation }) {
  const { num: n, unit } = inrParts(v.value);
  const [a, b] = v.range.outer;
  const span = b - a || 1;
  const x = (p: number) => `${((p - a) / span) * 100}%`;
  return (
    <div style={{ padding: "18px 20px 6px" }}>
      <div className="label">Market value · income approach</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 10 }}>
        <span style={{ fontSize: 34, color: "var(--amber)", fontWeight: 500, fontStretch: "80%" }}>₹</span>
        <RollingNumber text={n} size={76} color="var(--amber)" />
        <span style={{ fontSize: 22, color: "var(--amber-2)", fontStretch: "75%", fontWeight: 600 }}>{unit}</span>
      </div>
      <div className="num" style={{ color: "var(--ink-2)", marginTop: 6 }}>
        {psf(v.ppsf)} on {Math.round(v.input.area_sqft).toLocaleString("en-IN")} sq ft leasable
      </div>
      <div style={{ position: "relative", height: 84, marginTop: 20 }} aria-label={`Sensitivity range ${inr(a)} to ${inr(b)}`}>
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 26, borderLeft: "1px solid var(--line-3)" }} />
        <div style={{ position: "absolute", right: 0, top: 0, bottom: 26, borderLeft: "1px solid var(--line-3)" }} />
        <div style={{ position: "absolute", top: 14, left: 0, right: 0, borderTop: "1px solid var(--line-3)" }} />
        <svg width="9" height="10" style={{ position: "absolute", top: 9, left: 0 }} aria-hidden><path d="M0,5 L9,0 L9,10 z" fill="var(--ink-2)" /></svg>
        <svg width="9" height="10" style={{ position: "absolute", top: 9, right: 0 }} aria-hidden><path d="M9,5 L0,0 L0,10 z" fill="var(--ink-2)" /></svg>
        <motion.div key={`o${v.value}`} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          style={{ position: "absolute", top: 26, height: 16, left: 0, right: 0, background: "rgba(127,178,229,0.14)", border: "1px solid var(--line-2)" }} />
        <motion.div key={`i${v.value}`} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.9, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          style={{ position: "absolute", top: 26, height: 16, left: x(v.range.inner[0]), width: `${((v.range.inner[1] - v.range.inner[0]) / span) * 100}%`,
            background: "rgba(242,178,51,0.32)", borderLeft: "1px solid var(--amber)", borderRight: "1px solid var(--amber)" }} />
        <div style={{ position: "absolute", top: 20, height: 28, left: x(v.value), borderLeft: "2px solid var(--amber)" }} />
        <div className="num" style={{ position: "absolute", top: 50, left: 0, fontSize: 12, color: "var(--ink-2)" }}>{inr(a)}</div>
        <div className="num" style={{ position: "absolute", top: 50, right: 0, fontSize: 12, color: "var(--ink-2)" }}>{inr(b)}</div>
        <div className="label" style={{ position: "absolute", top: 68, left: 0, right: 0, textAlign: "center", fontSize: 9.5 }}>
          Sensitivity · cap ±50 bp, rent ±10% outer · ±25 bp, ±5% amber
        </div>
      </div>
      <dl style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", margin: "6px 0 0", borderTop: "1px solid var(--line)" }}>
        {[["Direct capitalisation", inr(v.direct)], ["Ten-year DCF", inr(v.dcf)], ["Cap rate", pct(v.rates.cap, 2)]].map(([k, val], i) => (
          <div key={k} style={{ padding: "10px 0", paddingLeft: i ? 12 : 0, borderLeft: i ? "1px solid var(--line)" : 0 }}>
            <dt className="label" style={{ fontSize: 9.5 }}>{k}</dt>
            <dd className="num" style={{ margin: "3px 0 0", fontSize: 20, fontWeight: 600, fontStretch: "85%" }}>{val}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function LrdDecision({ v }: { v: IncomeValuation }) {
  const L = v.lending;
  const amber = v.decision.band === "amber";
  const Icon = amber ? ScanSearch : MapPinned;
  const binding = L.loan_by_dscr <= L.loan_by_ltv ? "Rent cover (DSCR) binds" : `LTV ${pct(L.ltv_cap, 0)} binds`;
  const short = L.dscr < L.dscr_min;
  return (
    <div>
      <motion.div key={v.decision.band + v.value}
        initial={{ clipPath: "inset(0 100% 0 0)" }} animate={{ clipPath: "inset(0 0% 0 0)" }}
        transition={{ duration: 0.7, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
        style={{ background: amber ? "var(--amber)" : "var(--red)", color: "#071f38", padding: "14px 20px 16px", display: "flex", gap: 14, alignItems: "center" }}>
        <Icon size={34} strokeWidth={1.6} aria-hidden />
        <div>
          <div style={{ fontStretch: "68%", fontWeight: 800, fontSize: 30, lineHeight: 1, textTransform: "uppercase" }}>{v.decision.action}</div>
          <div style={{ fontSize: 13, marginTop: 4, fontWeight: 500 }}>{v.decision.detail}</div>
        </div>
      </motion.div>
      <dl style={{ display: "grid", gridTemplateColumns: "1fr 1fr", margin: 0 }}>
        {[
          ["Max LRD loan", inr(L.max_loan), binding, false],
          ["EMI at asked loan", inr(L.emi), `${inr(L.loan_amount)} over ${L.tenor_years} yrs at ${pct(L.rate, 2)}`, false],
          ["DSCR", `${L.dscr.toFixed(2)}×`, `Minimum ${L.dscr_min.toFixed(2)}× for this tenant`, short],
          ["LTV", pct(L.ltv, 0), `Policy cap ${pct(L.ltv_cap, 0)}`, L.ltv > L.ltv_cap],
        ].map(([k, val, sub, bad], i) => (
          <div key={String(k)} style={{ padding: "11px 20px", borderTop: "1px solid var(--line)", borderLeft: i % 2 ? "1px solid var(--line)" : 0 }}>
            <dt className="label" style={{ fontSize: 9.5 }}>{k}</dt>
            <dd className="num" style={{ margin: "2px 0 0", fontSize: 19, fontWeight: 600, fontStretch: "85%", color: bad ? "var(--red)" : "var(--ink)" }}>{val}</dd>
            <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{sub}</div>
          </div>
        ))}
      </dl>
      <p style={{ margin: 0, padding: "10px 20px", borderTop: "1px solid var(--line)", fontSize: 12, color: "var(--ink-2)" }}>
        Routing rule: commercial collateral is never waived. Desk review needs an entered lease rent within 25% of market,
        a Listed/MNC or private tenant, 3+ years left on the lease, DSCR cover and LTV within policy; anything else gets a site visit.
        {L.two_valuations_required && " Loans of ₹50 lakh and above also need two valuation reports; the engine can be one."}
      </p>
    </div>
  );
}

function Sensitivity({ v }: { v: IncomeValuation }) {
  const S = v.sensitivity;
  const all = S.grid.flat();
  const lo = Math.min(...all), hi = Math.max(...all);
  return (
    <div style={{ position: "absolute", inset: 0, padding: "12px 16px 14px", display: "grid", gridTemplateColumns: "minmax(56px, 88px) repeat(5, minmax(0, 1fr))", gridTemplateRows: "22px repeat(5, 1fr)", gap: 0 }}>
      <div className="label" style={{ fontSize: 9, alignSelf: "end", paddingBottom: 4 }}>Rent ↓ · Cap →</div>
      {S.caps.map((c) => <div key={c} className="label num" style={{ fontSize: 10, textAlign: "center", alignSelf: "end", paddingBottom: 4 }}>{pct(c, 2)}</div>)}
      {S.grid.map((row, i) => [
        <div key={`r${i}`} className="label num" style={{ fontSize: 10, display: "flex", alignItems: "center" }}>
          {i === 2 ? `${Math.round(v.income.rent)} ₹/sf` : signedPct(S.rent_mult[i] - 1, 0)}
        </div>,
        ...row.map((val, j) => {
          const centre = i === 2 && j === 2;
          const t = (val - lo) / (hi - lo || 1);
          return (
            <div key={`${i}-${j}`} className="num"
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: "clamp(10px, 0.95vw, 13px)", whiteSpace: "nowrap", fontWeight: centre ? 700 : 500,
                borderLeft: "1px solid var(--line)", borderTop: "1px solid var(--line)",
                background: centre ? "rgba(242,178,51,0.22)" : `rgba(127,178,229,${0.04 + t * 0.3})`,
                outline: centre ? "1.5px solid var(--amber)" : "none", outlineOffset: -1.5,
                color: centre ? "var(--amber-2)" : "var(--ink)",
              }}>
              {inr(val)}
            </div>
          );
        }),
      ])}
    </div>
  );
}

function Bar({ label, value, max, kind, note }: { label: string; value: number; max: number; kind: "pos" | "neg" | "total"; note?: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.3fr) minmax(60px, 1fr) auto", alignItems: "center", gap: 12, padding: "7px 0", borderBottom: "1px solid var(--line)" }}>
      <div style={{ fontSize: 13 }}>{label}{note && <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{note}</div>}</div>
      <div style={{ height: 14, position: "relative" }}>
        <motion.div initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          style={{
            position: "absolute", left: 0, top: 0, bottom: 0, width: `${(Math.abs(value) / max) * 100}%`, transformOrigin: "0 50%",
            background: kind === "neg" ? "repeating-linear-gradient(135deg, rgba(255,138,115,0.55) 0 2px, transparent 2px 6px)"
              : kind === "total" ? "var(--ink)" : "rgba(127,178,229,0.45)",
            border: kind === "neg" ? "1px solid rgba(255,138,115,0.6)" : 0,
          }} />
      </div>
      <div className="num" style={{ textAlign: "right", fontSize: 13, color: kind === "neg" ? "var(--red)" : "var(--ink)" }}>
        {kind === "neg" ? "−" : ""}{inr(Math.abs(value))}
      </div>
    </div>
  );
}

function BuildUp({ v }: { v: IncomeValuation }) {
  const I = v.income;
  return (
    <div style={{ padding: "8px 16px 14px" }}>
      <Bar label="Gross rent" value={I.gri} max={I.gri} kind="pos" note={`${Math.round(I.rent)} ₹/sq ft/mo × ${Math.round(v.input.area_sqft).toLocaleString("en-IN")} sq ft × 12`} />
      <Bar label="Vacancy and collection" value={I.vacancy} max={I.gri} kind="neg" note={`${pct(1 - I.occupancy, 0)} of gross`} />
      <Bar label="Non-recoverable costs" value={I.opex} max={I.gri} kind="neg" note={`${pct(I.opex_ratio, 0)}: property tax, insurance, reserve`} />
      <Bar label="Net operating income" value={I.noi} max={I.gri} kind="total" />
      <p style={{ margin: "12px 0 0", fontSize: 13, color: "var(--ink-2)" }}>
        <span className="num">{inr(I.noi)}</span> ÷ <span className="num">{pct(v.rates.cap, 2)}</span> = <span className="num" style={{ color: "var(--ink)" }}>{inr(v.direct)}</span> by direct capitalisation.
        The DCF gives <span className="num" style={{ color: "var(--ink)" }}>{inr(v.dcf)}</span>: {inr(v.dcf_parts.pv_flows)} of discounted income plus {inr(v.dcf_parts.pv_exit)} of discounted exit value.
      </p>
    </div>
  );
}

function Reconcile({ v }: { v: IncomeValuation }) {
  const rc = v.residential_check;
  const rows: [string, string, string][] = [
    ["Direct capitalisation", inr(v.direct), "Weight 50%"],
    ["Ten-year DCF", inr(v.dcf), "Weight 50%"],
    ["Reconciled market value", inr(v.value), ""],
    ["Same area at residential prices", inr(rc.value), rc.ratio ? `Commercial is ${rc.ratio.toFixed(2)}× residential` : ""],
  ];
  return (
    <div style={{ padding: "4px 16px 12px" }}>
      {rows.map(([k, val, sub], i) => (
        <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderBottom: i < rows.length - 1 ? "1px solid var(--line)" : 0 }}>
          <div style={{ fontSize: 13, fontWeight: i === 2 ? 600 : 400 }}>{k}<div style={{ fontSize: 11, color: "var(--ink-3)" }}>{sub}</div></div>
          <div className="num" style={{ fontSize: 14, color: i === 2 ? "var(--amber)" : "var(--ink)", fontWeight: i === 2 ? 600 : 400 }}>{val}</div>
        </div>
      ))}
      <p style={{ margin: "6px 0 0", fontSize: 11.5, color: "var(--ink-3)" }}>
        The residential line comes from the Naksha engine at this point ({psf(rc.ppsf)}). It is a sense check on location, not a valuation of the commercial use.
      </p>
    </div>
  );
}

function Rates({ v }: { v: IncomeValuation }) {
  const R = v.rates;
  const short = v.input.cap_rate == null ? R.cap - R.base_cap - R.tenant_spread - R.tier2_spread : 0;
  const rows: [string, number][] = v.input.cap_rate != null ? [["Entered cap rate", R.cap]] : [
    [`${ASSET_NAME[v.asset]} base rate`, R.base_cap], ["Tenant covenant spread", R.tenant_spread],
    ["Outside benchmarked metros", R.tier2_spread], ["Short lease (< 3 yrs)", short],
  ];
  return (
    <div style={{ padding: "4px 16px 12px" }}>
      {rows.map(([k, r]) => (
        <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--line)", fontSize: 13 }}>
          <span style={{ color: r ? "var(--ink)" : "var(--ink-3)" }}>{k}</span>
          <span className="num">{rows.length > 1 && k !== rows[0][0] ? `+${(r * 1e4).toFixed(0)} bp` : pct(r, 2)}</span>
        </div>
      ))}
      <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0 0", fontSize: 13, fontWeight: 600 }}>
        <span>Cap rate · discount · exit</span>
        <span className="num">{pct(R.cap, 2)} · {pct(R.discount, 2)} · {pct(R.exit_cap, 2)}</span>
      </div>
    </div>
  );
}

function MarketRent({ v }: { v: IncomeValuation }) {
  const M = v.market_rent;
  const rows: [string, string, string][] = [
    ["City benchmark", `${M.benchmark.toFixed(0)} ₹/sq ft/mo`, M.source],
    ["Location index", `${M.location_index.toFixed(2)}×`, "This point's residential price against the city median, from the Naksha engine"],
    ["Estimated market rent", `${M.value.toFixed(0)} ₹/sq ft/mo`, `Benchmark scaled by the location index, damped for ${v.asset}`],
    ["Lease rent", `${v.income.rent.toFixed(0)} ₹/sq ft/mo`, M.gap == null ? "Not entered: valued at market" : `${signedPct(M.gap, 0)} against market`],
  ];
  return (
    <div style={{ padding: "4px 16px 14px" }}>
      {rows.map(([k, val, sub]) => (
        <div key={k} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
          <div style={{ fontSize: 13 }}>{k}<div style={{ fontSize: 11, color: "var(--ink-3)" }}>{sub}</div></div>
          <div className="num" style={{ fontSize: 14, alignSelf: "center" }}>{val}</div>
        </div>
      ))}
    </div>
  );
}

function IncomeFlags({ v }: { v: IncomeValuation }) {
  if (!v.flags.length) return <p style={{ margin: 0, padding: "12px 16px", fontSize: 13, color: "var(--green)" }}>No flags raised.</p>;
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: "6px 16px 12px" }}>
      {v.flags.map((f) => (
        <li key={f.code} style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 10, padding: "7px 0", borderBottom: "1px solid var(--line)", fontSize: 13 }}>
          <span className="label" style={{ color: "var(--red)", fontSize: 9.5, border: "1px solid var(--red)", padding: "1px 5px", alignSelf: "start" }}>{f.code.replace(/_/g, " ")}</span>
          <span>{f.text}</span>
        </li>
      ))}
    </ul>
  );
}
