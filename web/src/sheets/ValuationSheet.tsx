import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Printer } from "lucide-react";
import { valueProperty, type Valuation, type ValueInput } from "../api";
import TitleBlock, { PRESETS } from "../components/TitleBlock";
import ValueDimension from "../components/ValueDimension";
import Decision from "../components/Decision";
import { AccessList, CompsTable, Flags, LandStructure, Waterfall, Witnesses } from "../components/Evidence";
import { Panel } from "../components/ui";
import SitePlan from "../components/SitePlan";
import { AreaStatement, OrientationRose, UnitPlan } from "../components/UnitPlan";
import Construction from "../components/Construction";
import { clock, clpStages, SUN_DATES } from "../arch";
import { inr, pct } from "../format";

const Elevation = lazy(() => import("../components/Elevation"));

const DEFAULT: ValueInput = {
  lat: PRESETS[0].lat, lon: PRESETS[0].lon, area_sqft: 850, area_basis: "carpet", bhk: 2, ptype: "flat", floor: 9,
  total_floors: 22, transaction: window.location.hash === "#construction" ? "new" : "resale", furnishing: "Semi-Furnished", bathrooms: 2, parking: 1, covered_parking: 1,
  amenities: ["liftavailable", "secsecurity", "gymnasium"], age_years: null, loan_amount: null, label: PRESETS[0].t, facing: "East",
};

export default function ValuationSheet() {
  const [form, setForm] = useState<ValueInput>(DEFAULT);
  const [place, setPlace] = useState(PRESETS[0].t);
  const [v, setV] = useState<Valuation | null>(null);
  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drawKey, setDrawKey] = useState(1);
  const first = useRef(true);
  const [sunDoy, setSunDoy] = useState<number>(SUN_DATES[2].doy);
  const [sunHour, setSunHour] = useState(10);
  const [superAgreed, setSuperAgreed] = useState<number | null>(null);
  const [stageIdx, setStageIdx] = useState(5);

  const run = useCallback(async (f: ValueInput) => {
    setBusy(true); setError(null); setSlow(false);
    const t = setTimeout(() => setSlow(true), 2500);
    try {
      const r = await valueProperty(f);
      setV(r); setDrawKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof Error ? `${e.message}. Check that the engine is running on port 8000.` : "Valuation failed.");
    } finally { clearTimeout(t); setBusy(false); setSlow(false); }
  }, []);

  useEffect(() => { if (first.current) { first.current = false; run(DEFAULT); } }, [run]);
  // deep link to a section once the first valuation has landed
  const jumped = useRef(false);
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!v || jumped.current || !["drawings", "construction"].includes(id)) return;
    jumped.current = true;
    setTimeout(() => document.getElementById(id)?.scrollIntoView(), 400);
  }, [v]);

  const pick = (lat: number, lon: number) => {
    const f = { ...form, lat, lon, label: null };
    setForm(f); setPlace(`Dropped pin ${lat.toFixed(4)}, ${lon.toFixed(4)}`); run(f);
  };
  const house = /house|villa/.test(form.ptype);
  const stages = clpStages(house ? form.total_floors ?? 2 : form.total_floors ?? 10);
  const sIdx = Math.min(stageIdx, stages.length - 1);
  const building = form.transaction === "new";

  return (
    <div>
      {/* first viewport: the drawing sheet */}
      <div className="sheet-main" style={{ display: "grid", gridTemplateColumns: "minmax(300px, 25%) minmax(0, 1fr) minmax(360px, 30%)", height: "calc(100vh - 57px)", minHeight: 680 }}>
        <aside style={{ borderRight: "1px solid var(--line-2)", minHeight: 0, background: "rgba(7,31,56,0.55)" }} className="no-print">
          <TitleBlock form={form} setForm={setForm} place={place} setPlace={setPlace} onValue={() => run(form)} busy={busy} error={error} />
        </aside>

        <div className="sheet-centre" style={{ display: "grid", gridTemplateRows: "56% 44%", minHeight: 0 }}>
          <Panel title="Elevation · subject in amber" meta={v ? `${v.city}${v.city_km > 25 ? ` + ${Math.round(v.city_km)} km` : ""}` : ""} style={{ borderBottom: "1px solid var(--line-2)" }}>
            <Suspense fallback={null}>
              <Elevation floors={house ? form.total_floors ?? 2 : form.total_floors ?? 10} subjectFloor={house ? 0 : form.floor ?? 0}
                ptype={form.ptype} areaSqft={form.area_sqft} drawKey={drawKey}
                lat={form.lat} lon={form.lon} facing={form.facing} sunDoy={sunDoy} sunHour={sunHour}
                built={building ? stages[sIdx].slabs : null} />
            </Suspense>
            <SunBar doy={sunDoy} setDoy={setSunDoy} hour={sunHour} setHour={setSunHour} />
          </Panel>
          <Panel title="Site plan · comparables extruded by ₹/sq ft" meta="Click to move the pin">
            <SitePlan lat={form.lat} lon={form.lon} comps={v?.comparables ?? []} access={v?.access ?? []} subjectPpsf={v?.ppsf} onPick={pick} />
          </Panel>
        </div>

        <aside style={{ borderLeft: "1px solid var(--line-2)", display: "flex", flexDirection: "column", minHeight: 0, overflowY: "auto", background: "rgba(7,31,56,0.35)" }}>
          {v ? (
            <div style={{ opacity: busy ? 0.45 : 1, transition: "opacity .3s" }}>
              <ValueDimension v={v} />
              <Decision v={v} />
            </div>
          ) : (
            <EmptyValue busy={busy} />
          )}
          {busy && (
            <div className="label" style={{ padding: "10px 20px", color: "var(--amber)" }} role="status">
              {slow ? "Fetching satellite tile for a new area · first time only" : "Measuring"}
            </div>
          )}
        </aside>
      </div>

      {/* drawing set */}
      {v && (
        <div id="drawings" style={{ borderTop: "1px solid var(--line-3)" }}>
          <div style={{ padding: "18px 24px", borderBottom: "1px solid var(--line-2)" }}>
            <h2 style={{ margin: 0, fontStretch: "75%", fontWeight: 700, fontSize: 26 }}>Drawing set</h2>
            <p style={{ margin: "4px 0 0", color: "var(--ink-2)", fontSize: 13 }}>
              What the valuer checks on site: does the declared area hold the declared rooms, what is the buyer paying for,
              which way does it face{v.input.transaction === "new" ? ", and how much can be lent at this stage of construction" : ""}.
            </p>
          </div>
          <div className="sheet-2col" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr)" }}>
            <Panel title="Unit plan" meta={`Entrance ${v.input.facing === "Unknown" ? "unknown" : v.input.facing}`} style={{ borderRight: "1px solid var(--line-2)", borderBottom: "1px solid var(--line-2)" }}>
              <UnitPlan v={v} />
            </Panel>
            <div style={{ borderBottom: "1px solid var(--line-2)" }}>
              <Panel title="Area statement · RERA"><AreaStatement v={v} superAgreed={superAgreed} setSuperAgreed={setSuperAgreed} /></Panel>
              <Panel title="Orientation study" meta="Model value and sunlight by facing" style={{ borderTop: "1px solid var(--line-2)" }}>
                <OrientationRose v={v} busy={busy} onFacing={(fc) => { const f = { ...form, facing: fc }; setForm(f); run(f); }} />
              </Panel>
            </div>
          </div>
          {v.input.transaction === "new" && (
            <div id="construction">
              <Panel title="Construction-linked disbursement" meta={`${stages[sIdx].t} · the elevation above shows this stage`} style={{ borderBottom: "1px solid var(--line-2)" }}>
                <Construction v={v} idx={sIdx} setIdx={setStageIdx} />
              </Panel>
            </div>
          )}
        </div>
      )}

      {/* evidence sheet */}
      {v && (
        <div style={{ borderTop: "1px solid var(--line-3)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 24px", borderBottom: "1px solid var(--line-2)" }}>
            <div>
              <h2 style={{ margin: 0, fontStretch: "75%", fontWeight: 700, fontSize: 26, letterSpacing: "0.01em" }}>Why {inr(v.value)}</h2>
              <p style={{ margin: "4px 0 0", color: "var(--ink-2)", fontSize: 13 }}>
                {v.comps_signal.n_within_3km} comparable listings within 3 km · satellite context {v.satellite.available ? "available" : "unavailable"} ·
                valued in {v.latency_ms} ms · confidence {pct(v.confidence, 0)}
              </p>
            </div>
            <button onClick={() => window.print()} className="no-print"
              style={{ display: "flex", gap: 8, alignItems: "center", border: "1px solid var(--line-3)", background: "transparent", padding: "9px 14px", cursor: "pointer", fontStretch: "80%", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", fontSize: 12 }}>
              <Printer size={15} aria-hidden /> Print valuation report
            </button>
          </div>
          <div className="sheet-2col" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.35fr) minmax(0, 1fr)" }}>
            <Panel title="Factor attribution" style={{ borderRight: "1px solid var(--line-2)", borderBottom: "1px solid var(--line-2)" }}><Waterfall v={v} /></Panel>
            <div style={{ borderBottom: "1px solid var(--line-2)" }}>
              <Panel title="Source reconciliation"><Witnesses v={v} /></Panel>
              <Panel title="Land and structure" style={{ borderTop: "1px solid var(--line-2)" }}><LandStructure v={v} /></Panel>
            </div>
            <Panel title="Comparable evidence" meta={`${v.comparables.length} closest`} style={{ borderRight: "1px solid var(--line-2)" }}><CompsTable v={v} /></Panel>
            <div>
              <Panel title="Risk flags"><Flags v={v} /></Panel>
              <Panel title="Access" style={{ borderTop: "1px solid var(--line-2)" }}><AccessList v={v} /></Panel>
              <Panel title="Stated assumptions" style={{ borderTop: "1px solid var(--line-2)" }}>
                <ul style={{ margin: 0, padding: "10px 16px 14px 32px", fontSize: 12, color: "var(--ink-2)", display: "grid", gap: 4 }}>
                  <li>Listings rolled forward at {pct(Number(v.assumptions.annual_appreciation), 0)} a year to {String(v.assumptions.valuation_date)}.</li>
                  <li>Asking price converted to transaction price at −{pct(Number(v.assumptions.ask_to_txn_discount), 0)}.</li>
                  <li>Distress value applies a {pct(Number(v.assumptions.distress_haircut), 0)} forced-sale haircut.</li>
                  <li>No registry, circle-rate or lender data in this prototype; those plug in as additional sources.</li>
                </ul>
              </Panel>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyValue({ busy }: { busy: boolean }) {
  return (
    <div style={{ padding: 20 }}>
      <div className="label">Fair market value</div>
      <div style={{ height: 76, marginTop: 10, borderBottom: "1px dashed var(--line-2)", display: "flex", alignItems: "flex-end", paddingBottom: 6, color: "var(--ink-3)" }}>
        {busy ? "Measuring the property…" : "Pick a location, describe the property, and value it."}
      </div>
    </div>
  );
}

/** Sun study controls laid over the elevation: date and clock time drive the sun path and cast shadow. */
function SunBar({ doy, setDoy, hour, setHour }: { doy: number; setDoy: (d: number) => void; hour: number; setHour: (h: number) => void }) {
  return (
    <div className="no-print" style={{
      position: "absolute", left: 12, bottom: 12, display: "flex", alignItems: "center", gap: 12, padding: "7px 10px",
      background: "rgba(7,31,56,0.86)", border: "1px solid var(--line-2)", zIndex: 2, maxWidth: "calc(100% - 24px)", flexWrap: "wrap",
    }}>
      <span className="label" style={{ fontSize: 9.5 }}>Sun study</span>
      <div role="radiogroup" aria-label="Date" style={{ display: "flex", border: "1px solid var(--line-2)" }}>
        {SUN_DATES.map((d, i) => (
          <button key={d.k} role="radio" aria-checked={doy === d.doy} onClick={() => setDoy(d.doy)} title={d.note}
            style={{ border: 0, borderLeft: i ? "1px solid var(--line-2)" : 0, padding: "3px 8px", fontSize: 11.5, cursor: "pointer", fontStretch: "80%", fontWeight: 600,
              background: doy === d.doy ? "var(--ink)" : "transparent", color: doy === d.doy ? "var(--ground)" : "var(--ink-2)" }}>{d.t}</button>
        ))}
      </div>
      <input type="range" min={6} max={18.5} step={0.25} value={hour} onChange={(e) => setHour(Number(e.target.value))}
        aria-label="Time of day" className="stage-range" style={{ width: 130 }} />
      <span className="num" style={{ fontSize: 13, minWidth: 40 }}>{clock(hour)}</span>
    </div>
  );
}
