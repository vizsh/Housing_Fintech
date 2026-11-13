import { CornerDownLeft, Loader2 } from "lucide-react";
import type { ValueInput } from "../api";
import LocationSearch, { type Preset } from "./LocationSearch";
import { Field, inputStyle, Seg } from "./ui";
import { FACINGS } from "../arch";

export const PRESETS: Preset[] = [
  { t: "Powai, Mumbai", lat: 19.1176, lon: 72.906, note: "Dense metro" },
  { t: "Whitefield, Bengaluru", lat: 12.9698, lon: 77.75, note: "IT corridor" },
  { t: "Sector 50, Gurgaon", lat: 28.4227, lon: 77.0587, note: "NCR" },
  { t: "Gomti Nagar, Lucknow", lat: 26.8505, lon: 81.0088, note: "Held-out city" },
  { t: "Salt Lake, Kolkata", lat: 22.5867, lon: 88.4171, note: "East" },
  { t: "Nashik outskirts", lat: 20.0059, lon: 73.7897, note: "Thin data" },
];

const AMENITIES = [
  { k: "liftavailable", t: "Lift" }, { k: "secsecurity", t: "24×7 security" }, { k: "gymnasium", t: "Gym" },
  { k: "swimmingpool", t: "Pool" }, { k: "clubhouse", t: "Clubhouse" }, { k: "overlook_park", t: "Park facing" },
];

type Props = {
  form: ValueInput; setForm: (f: ValueInput) => void; place: string; setPlace: (s: string) => void;
  onValue: () => void; busy: boolean; error: string | null;
};

export default function TitleBlock({ form, setForm, place, setPlace, onValue, busy, error }: Props) {
  const set = <K extends keyof ValueInput>(k: K, v: ValueInput[K]) => setForm({ ...form, [k]: v });

  const house = /house|villa/.test(form.ptype);
  const drawingNo = `NK-${Math.abs(Math.round(form.lat * 100))}-${Math.abs(Math.round(form.lon * 100))}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <LocationSearch lat={form.lat} lon={form.lon} place={place} presets={PRESETS}
        onPlace={(lat, lon, label) => { setForm({ ...form, lat, lon, label }); setPlace(label); }} />

      <div style={{ padding: "14px 18px", display: "grid", gap: 14, overflowY: "auto", flex: 1 }}>
        <Field label="Property type">
          <Seg label="Property type" value={form.ptype as "flat"} onChange={(v) => setForm({ ...form, ptype: v, total_floors: /house|villa/.test(v) ? 2 : Math.max(form.total_floors ?? 12, 4), floor: /house|villa/.test(v) ? 0 : form.floor })}
            options={[{ v: "flat", t: "Apartment" }, { v: "independent house", t: "House" }, { v: "villa", t: "Villa" }]} />
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Field label="Area, sq ft">
            <input type="number" min={150} max={15000} value={form.area_sqft} onChange={(e) => set("area_sqft", Number(e.target.value))} style={inputStyle} />
          </Field>
          <Field label="Area basis">
            <select value={form.area_basis} onChange={(e) => set("area_basis", e.target.value as ValueInput["area_basis"])} style={{ ...inputStyle, appearance: "none", background: "transparent" }}>
              <option value="carpet">Carpet</option><option value="builtup">Built-up</option><option value="super">Super built-up</option>
            </select>
          </Field>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
          <Field label="BHK">
            <input type="number" min={1} max={8} value={form.bhk} onChange={(e) => set("bhk", Number(e.target.value))} style={inputStyle} />
          </Field>
          <Field label={house ? "Storeys" : "Floor"}>
            <input type="number" min={0} max={80} value={house ? form.total_floors ?? 2 : form.floor ?? 0}
              onChange={(e) => house ? set("total_floors", Number(e.target.value)) : set("floor", Number(e.target.value))} style={inputStyle} />
          </Field>
          <Field label={house ? "Baths" : "Of floors"}>
            <input type="number" min={1} max={80} value={house ? form.bathrooms ?? 2 : form.total_floors ?? 1}
              onChange={(e) => house ? set("bathrooms", Number(e.target.value)) : set("total_floors", Number(e.target.value))} style={inputStyle} />
          </Field>
        </div>
        <Field label="Transaction">
          <Seg label="Transaction" value={form.transaction} onChange={(v) => set("transaction", v)} options={[{ v: "resale", t: "Resale" }, { v: "new", t: "Under construction" }]} />
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 14, alignItems: "center" }}>
          <Compass value={form.facing} onChange={(f) => set("facing", f)} />
          <div>
            <div className="label">Entrance facing</div>
            <div style={{ fontSize: 15, fontWeight: 500, marginTop: 4 }}>{form.facing === "Unknown" ? "Not known" : form.facing.replace(" -", "-").replace("- ", "-")}</div>
            <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>Feeds the model and orients the plan, north point and sun study</div>
          </div>
        </div>
        <Field label="Furnishing">
          <Seg label="Furnishing" value={form.furnishing as "Unfurnished"} onChange={(v) => set("furnishing", v)}
            options={[{ v: "Unfurnished", t: "Bare" }, { v: "Semi-Furnished", t: "Semi" }, { v: "Furnished", t: "Full" }]} />
        </Field>
        <Field label="Project amenities">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {AMENITIES.map((a) => {
              const on = form.amenities.includes(a.k);
              return (
                <button key={a.k} aria-pressed={on}
                  onClick={() => set("amenities", on ? form.amenities.filter((x) => x !== a.k) : [...form.amenities, a.k])}
                  style={{ border: "1px solid", borderColor: on ? "var(--ink)" : "var(--line-2)", background: on ? "var(--ink)" : "transparent",
                    color: on ? "var(--ground)" : "var(--ink-2)", padding: "4px 9px", fontSize: 12, cursor: "pointer", fontStretch: "85%" }}>
                  {a.t}
                </button>
              );
            })}
          </div>
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Field label="Age, years">
            <input type="number" min={0} max={80} placeholder={form.transaction === "new" ? "0" : "10"} value={form.age_years ?? ""}
              onChange={(e) => set("age_years", e.target.value === "" ? null : Number(e.target.value))} style={inputStyle} />
          </Field>
          <Field label="Loan asked, ₹ lakh">
            <input type="number" min={1} placeholder="auto" value={form.loan_amount ? form.loan_amount / 1e5 : ""}
              onChange={(e) => set("loan_amount", e.target.value === "" ? null : Number(e.target.value) * 1e5)} style={inputStyle} />
          </Field>
        </div>
      </div>

      <div style={{ borderTop: "1px solid var(--line-2)" }}>
        {error && <p role="alert" style={{ margin: 0, padding: "10px 18px", color: "var(--red)", fontSize: 12.5 }}>{error}</p>}
        <button onClick={onValue} disabled={busy}
          style={{
            width: "100%", padding: "16px 18px", border: 0, background: busy ? "var(--ground-3)" : "var(--ink)", color: "var(--ground)",
            fontStretch: "72%", fontWeight: 800, fontSize: 17, letterSpacing: "0.14em", textTransform: "uppercase", cursor: busy ? "wait" : "pointer",
            display: "flex", justifyContent: "space-between", alignItems: "center", transition: "background .2s",
          }}>
          <span style={{ color: busy ? "var(--ink)" : "var(--ground)" }}>{busy ? "Measuring…" : "Value property"}</span>
          {busy ? <Loader2 size={18} className="spin" color="var(--ink)" /> : <CornerDownLeft size={17} strokeWidth={2} aria-hidden />}
        </button>
        <dl style={{ display: "grid", gridTemplateColumns: "1fr 1fr", margin: 0, borderTop: "1px solid var(--line)" }}>
          {[["Drawing no.", drawingNo], ["Scale", "1 : market"]].map(([k, val], i) => (
            <div key={k} style={{ padding: "7px 18px", borderLeft: i ? "1px solid var(--line)" : 0 }}>
              <dt className="label" style={{ fontSize: 9 }}>{k}</dt>
              <dd className="num" style={{ margin: 0, fontSize: 12, color: "var(--ink-2)" }}>{val}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

/** Eight-point compass: click the direction the main door faces. */
function Compass({ value, onChange }: { value: string; onChange: (f: string) => void }) {
  const C = 38;
  return (
    <svg width="76" height="76" viewBox="0 0 76 76" role="radiogroup" aria-label="Entrance facing">
      <circle cx={C} cy={C} r="30" fill="none" stroke="rgba(214,233,252,0.32)" />
      <circle cx={C} cy={C} r="3" fill="#e8f1fb" />
      {FACINGS.map((f) => {
        const a = (f.az - 90) * (Math.PI / 180);
        const on = f.k === value;
        const tip = [C + 29 * Math.cos(a), C + 29 * Math.sin(a)];
        const l = [C + 9 * Math.cos(a - 0.5), C + 9 * Math.sin(a - 0.5)];
        const r = [C + 9 * Math.cos(a + 0.5), C + 9 * Math.sin(a + 0.5)];
        return (
          <g key={f.k} role="radio" aria-checked={on} aria-label={f.k} tabIndex={0} style={{ cursor: "pointer", outline: "none" }}
            onClick={() => onChange(f.k)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onChange(f.k); } }}>
            <path d={`M${C},${C} L${l[0]},${l[1]} L${tip[0]},${tip[1]} L${r[0]},${r[1]} Z`}
              fill={on ? "#f2b233" : f.s.length === 1 ? "rgba(232,241,251,0.22)" : "rgba(127,178,229,0.12)"}
              stroke={on ? "#f2b233" : "rgba(214,233,252,0.45)"} strokeWidth="0.8" />
          </g>
        );
      })}
      <text x={C} y="7" textAnchor="middle" fontSize="8" fill="#b5cde6" className="label">N</text>
    </svg>
  );
}
