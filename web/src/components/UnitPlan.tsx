import { useState } from "react";
import { motion } from "framer-motion";
import type { Valuation } from "../api";
import { areaStatement, facadeSun, clock, FACINGS, facingAz, facingShort, planFor, SUN_DATES, type Room } from "../arch";
import { inr, psf, signedPct } from "../format";
import { inputStyle } from "./ui";

const S = 46; // px per metre
const INK = "#e8f1fb", INK2 = "#b5cde6", INK3 = "#86a8cb", CYAN = "#7fb2e5", GROUND = "#0b2a4a", AMBER = "#f2b233";

/** The unit drawn as an architect's plan: walls, door swings, windows, dimension chains, north point. */
export function UnitPlan({ v }: { v: Valuation }) {
  const q = v.input;
  const P = planFor(v.area_carpet_sqft, q.bhk, q.bathrooms ?? q.bhk);
  const [hover, setHover] = useState<number | null>(null);
  const mL = 70, mT = 64, mR = 70, mB = 120;
  const Wp = P.W * S, Dp = P.D * S;
  const vbW = Wp + mL + mR, vbH = Dp + mT + mB;
  // drawing y: back of the flat at top, entrance/front at the bottom
  const X = (x: number) => mL + x * S;
  const Y = (y: number) => mT + (P.D - y) * S;
  const R = 180 - facingAz(q.facing);
  const backChain = P.rooms.filter((r) => /bed|toilet|bath/i.test(r.name));
  const ext = 0.23 * S, int = 0.115 * S;

  return (
    <div style={{ padding: "8px 12px 4px" }}>
      <svg viewBox={`0 0 ${vbW} ${vbH}`} width="100%" style={{ display: "block", maxHeight: 520 }} role="img"
        aria-label={`Indicative unit plan, ${q.bhk} BHK, ${Math.round(v.area_carpet_sqft)} sq ft carpet`}>
        <defs>
          <pattern id="tile" width="8" height="8" patternUnits="userSpaceOnUse">
            <path d="M8 0 L0 0 0 8" fill="none" stroke={CYAN} strokeOpacity="0.28" strokeWidth="0.6" />
          </pattern>
          <pattern id="poche" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke={INK2} strokeOpacity="0.5" strokeWidth="1" />
          </pattern>
        </defs>

        {/* balcony (outside the RERA carpet) */}
        <rect x={X(P.balcony.x)} y={Y(0)} width={P.balcony.w * S} height={P.balcony.d * S} fill="none" stroke={INK3} strokeDasharray="5 4" />
        <text x={X(P.balcony.x + P.balcony.w / 2)} y={Y(0) + P.balcony.d * S / 2 + 4} textAnchor="middle" fill={INK3} fontSize="11" className="label">Balcony · not carpet</text>

        {/* rooms */}
        {P.rooms.map((r, i) => (
          <g key={r.name + i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ cursor: "default" }}>
            <rect x={X(r.x)} y={Y(r.y + r.d)} width={r.w * S} height={r.d * S}
              fill={hover === i ? "rgba(127,178,229,0.16)" : r.wet ? "url(#tile)" : "transparent"} stroke={INK} strokeOpacity="0.9" strokeWidth={int} />
            <RoomLabel r={r} X={X} Y={Y} />
          </g>
        ))}

        {/* external wall as poché */}
        <path d={`M${X(0) - ext / 2},${Y(0) + ext / 2} H${X(P.W) + ext / 2} V${Y(P.D) - ext / 2} H${X(0) - ext / 2} Z
                  M${X(0) + ext / 2},${Y(0) - ext / 2} V${Y(P.D) + ext / 2} H${X(P.W) - ext / 2} V${Y(0) - ext / 2} Z`}
          fill="url(#poche)" fillRule="evenodd" stroke={INK} strokeWidth="1.2" />

        {/* doors and windows */}
        {P.rooms.map((r, i) => r.door && <Door key={`d${i}`} r={r} X={X} Y={Y} />)}
        <EntryDoor x={X(P.W * 0.5)} y={Y(0)} />
        {P.rooms.filter((r) => /bed/i.test(r.name)).map((r, i) => (
          <Window key={`w${i}`} x1={X(r.x + r.w * 0.25)} x2={X(r.x + r.w * 0.75)} y={Y(P.D)} t={ext} />
        ))}
        <Window x1={X(P.balcony.x + 0.4)} x2={X(P.balcony.x + P.balcony.w - 0.4)} y={Y(0)} t={ext} sliding />

        {/* dimension chains */}
        <DimH x1={X(0)} x2={X(P.W)} y={Y(P.D) - 40} text={`${P.W.toFixed(2)} m`} />
        {(() => {
          let acc = 0;
          return backChain.map((r) => { const a = acc; acc += r.w; return <DimH key={`c${r.name}${r.x}`} x1={X(r.x)} x2={X(r.x + r.w)} y={Y(P.D) - 18} text={r.w.toFixed(1)} small tickOnly={a > 0} />; });
        })()}
        <DimV y1={Y(0)} y2={Y(P.D)} x={X(P.W) + 40} text={`${P.D.toFixed(2)} m`} />

        {/* north point and entrance callout */}
        <g transform={`translate(${mL - 34}, ${mT + 4})`}>
          <circle r="17" fill="none" stroke={INK2} />
          <g transform={`rotate(${R})`}>
            <path d="M0,-24 L6,6 L0,1 L-6,6 Z" fill={INK} />
          </g>
          <text y="40" textAnchor="middle" fill={INK2} fontSize="11" className="label">N</text>
        </g>
        <g>
          <line x1={X(P.W * 0.5)} y1={Y(0) + 8} x2={X(P.W * 0.5)} y2={Y(0) + 56} stroke={AMBER} strokeWidth="1.2" />
          <path d={`M${X(P.W * 0.5)},${Y(0) + 8} l-5,10 h10 z`} fill={AMBER} />
          <text x={X(P.W * 0.5) + 8} y={Y(0) + 54} fill={AMBER} fontSize="12" className="label">Entrance faces {facingShort(q.facing)}</text>
        </g>

        {/* title strip */}
        <g transform={`translate(${mL}, ${vbH - 30})`}>
          <line x1="0" x2={Wp} y1="-10" y2="-10" stroke={INK3} strokeOpacity="0.6" />
          <text x="0" y="8" fill={INK2} fontSize="12" className="label">Unit plan · indicative layout · {q.bhk} BHK · carpet {Math.round(v.area_carpet_sqft).toLocaleString("en-IN")} sq ft</text>
          <text x={Wp} y="8" fill={INK3} fontSize="12" textAnchor="end" className="label">Scale bar</text>
          <g transform={`translate(${Wp - 2 * S - 70}, 3)`}>
            {[0, 1].map((k) => <rect key={k} x={k * S} y="0" width={S} height="5" fill={k ? "none" : INK2} stroke={INK2} />)}
            <text x="0" y="17" fill={INK3} fontSize="9.5">0</text><text x={2 * S} y="17" fill={INK3} fontSize="9.5" textAnchor="end">2 m</text>
          </g>
        </g>
      </svg>
      <p style={{ margin: "2px 4px 8px", fontSize: 11.5, color: "var(--ink-3)" }}>
        Generated from carpet area, BHK and bathrooms to check that the declared area can physically hold the declared rooms. It is not the sanctioned plan; the valuer matches it against the approved drawing.
      </p>
    </div>
  );
}

function RoomLabel({ r, X, Y }: { r: Room; X: (x: number) => number; Y: (y: number) => number }) {
  const cx = X(r.x + r.w / 2), cy = Y(r.y + r.d / 2);
  if (r.w * S < 50 || r.d * S < 34) return null;
  const sq = r.w * r.d * 10.764;
  return (
    <g pointerEvents="none">
      <text x={cx} y={cy - 3} textAnchor="middle" fill={INK} fontSize={r.w * S < 90 ? 10 : 12} className="label" style={{ letterSpacing: "0.1em" }}>{r.name}</text>
      {r.d * S > 50 && <text x={cx} y={cy + 12} textAnchor="middle" fill={INK3} fontSize="10.5" className="num">{r.w.toFixed(1)} × {r.d.toFixed(1)} · {Math.round(sq)} sf</text>}
    </g>
  );
}

function Door({ r, X, Y }: { r: Room; X: (x: number) => number; Y: (y: number) => number }) {
  const w = (r.wet ? 0.75 : 0.9) * S;
  // door on the room edge shared with the passage (n = front edge of back rooms in plan terms)
  let x0 = 0, y0 = 0, horiz = true, dir = 1;
  if (r.door === "n") { x0 = X(r.x + 0.25); y0 = Y(r.y); horiz = true; dir = -1; }
  else if (r.door === "s") { x0 = X(r.x + r.w - 0.3) - w; y0 = Y(r.y + r.d); horiz = true; dir = 1; }
  else if (r.door === "w") { x0 = X(r.x); y0 = Y(r.y + r.d - 0.3); horiz = false; dir = 1; }
  if (horiz) {
    return (
      <g>
        <line x1={x0} y1={y0} x2={x0 + w} y2={y0} stroke={GROUND} strokeWidth="5" />
        <line x1={x0} y1={y0} x2={x0} y2={y0 + dir * w} stroke={CYAN} strokeWidth="1.3" />
        <path d={`M${x0},${y0 + dir * w} A${w},${w} 0 0 ${dir > 0 ? 0 : 1} ${x0 + w},${y0}`} fill="none" stroke={CYAN} strokeWidth="0.8" strokeDasharray="3 2" />
      </g>
    );
  }
  return (
    <g>
      <line x1={x0} y1={y0} x2={x0} y2={y0 + w} stroke={GROUND} strokeWidth="5" />
      <line x1={x0} y1={y0} x2={x0 - w} y2={y0} stroke={CYAN} strokeWidth="1.3" />
      <path d={`M${x0 - w},${y0} A${w},${w} 0 0 0 ${x0},${y0 + w}`} fill="none" stroke={CYAN} strokeWidth="0.8" strokeDasharray="3 2" />
    </g>
  );
}

function EntryDoor({ x, y }: { x: number; y: number }) {
  const w = 1.0 * S;
  return (
    <g>
      <line x1={x} y1={y} x2={x + w} y2={y} stroke={GROUND} strokeWidth={0.23 * S + 2} />
      <line x1={x} y1={y} x2={x} y2={y - w} stroke={AMBER} strokeWidth="1.6" />
      <path d={`M${x},${y - w} A${w},${w} 0 0 1 ${x + w},${y}`} fill="none" stroke={AMBER} strokeWidth="0.9" strokeDasharray="3 2" />
    </g>
  );
}

function Window({ x1, x2, y, t, sliding }: { x1: number; x2: number; y: number; t: number; sliding?: boolean }) {
  return (
    <g>
      <rect x={x1} y={y - t / 2} width={x2 - x1} height={t} fill={GROUND} stroke={INK} strokeWidth="1" />
      <line x1={x1} x2={x2} y1={y} y2={y} stroke={CYAN} strokeWidth="1" />
      {sliding && <line x1={x1} x2={(x1 + x2) / 2} y1={y - t / 4} y2={y - t / 4} stroke={CYAN} strokeWidth="1" />}
    </g>
  );
}

function DimH({ x1, x2, y, text, small, tickOnly }: { x1: number; x2: number; y: number; text: string; small?: boolean; tickOnly?: boolean }) {
  return (
    <g stroke={CYAN} strokeWidth="0.9">
      <line x1={x1} x2={x2} y1={y} y2={y} />
      {[x1, x2].map((x, i) => (i === 0 && tickOnly ? null : <line key={i} x1={x - 4} y1={y + 4} x2={x + 4} y2={y - 4} strokeWidth="1.4" />))}
      <text x={(x1 + x2) / 2} y={y - 5} textAnchor="middle" fill={small ? INK3 : INK2} stroke="none" fontSize={small ? 10 : 12} className="num">{text}</text>
    </g>
  );
}
function DimV({ y1, y2, x, text }: { y1: number; y2: number; x: number; text: string }) {
  const m = (y1 + y2) / 2;
  return (
    <g stroke={CYAN} strokeWidth="0.9">
      <line x1={x} x2={x} y1={y1} y2={y2} />
      {[y1, y2].map((y, i) => <line key={i} x1={x - 4} y1={y + 4} x2={x + 4} y2={y - 4} strokeWidth="1.4" />)}
      <text x={x + 6} y={m} fill={INK2} stroke="none" fontSize="12" className="num" transform={`rotate(90 ${x + 6} ${m})`} textAnchor="middle">{text}</text>
    </g>
  );
}

/** RERA area statement: what the buyer pays for vs what they can use. */
export function AreaStatement({ v, superAgreed, setSuperAgreed }: { v: Valuation; superAgreed: number | null; setSuperAgreed: (n: number | null) => void }) {
  const q = v.input;
  const A = areaStatement(q.area_sqft, q.area_basis, q.bhk, superAgreed);
  const rows: [string, number, string, boolean?][] = [
    ["Carpet area · RERA s.2(k)", A.carpet, "Net usable floor inside the unit's walls", true],
    ["Internal walls", A.walls, "Included in built-up, not in carpet"],
    ["Balcony and utility", A.balcony, "Exclusive, but outside carpet"],
    ["Built-up area", A.builtup, "Carpet + walls + balcony", true],
    ["Common-area loading", A.super - A.carpet, `${(A.loading * 100).toFixed(0)}% on carpet · lobbies, lifts, staircases, clubhouse`],
    ["Super built-up area", A.super, A.agreed ? "As stated in the sale agreement" : "Market-standard loading assumed", true],
  ];
  const max = A.super;
  return (
    <div style={{ padding: "6px 16px 14px" }}>
      {rows.map(([k, val, sub, total]) => (
        <div key={k} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(50px, 1fr) 70px", gap: 12, alignItems: "center", padding: "7px 0", borderBottom: "1px solid var(--line)" }}>
          <div style={{ fontSize: 13, fontWeight: total ? 600 : 400 }}>{k}<div style={{ fontSize: 11, color: "var(--ink-3)", fontWeight: 400 }}>{sub}</div></div>
          <div style={{ height: 10, position: "relative" }}>
            <motion.div initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              style={{ position: "absolute", inset: 0, width: `${(val / max) * 100}%`, transformOrigin: "0 50%",
                background: total ? "rgba(232,241,251,0.75)" : "repeating-linear-gradient(135deg, rgba(127,178,229,0.6) 0 2px, transparent 2px 6px)" }} />
          </div>
          <div className="num" style={{ textAlign: "right", fontSize: 13 }}>{Math.round(val).toLocaleString("en-IN")} sf</div>
        </div>
      ))}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 12, alignItems: "end" }}>
        <label style={{ display: "grid", gap: 5 }}>
          <span className="label">Super area in the agreement</span>
          <input type="number" min={100} placeholder="enter to check loading" value={superAgreed ?? ""}
            onChange={(e) => setSuperAgreed(e.target.value === "" ? null : Number(e.target.value))} style={inputStyle} />
        </label>
        <div className="num" style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
          {psf(v.value / A.carpet)} on carpet<br />{psf(v.value / A.super)} on super built-up
        </div>
      </div>
      {A.loadingHigh && (
        <p role="alert" style={{ margin: "10px 0 0", fontSize: 12.5, color: "var(--red)" }}>
          Loading of {(A.loading * 100).toFixed(0)}% is above the usual 25–40%. Check that the agreement's super area isn't inflated; RERA requires sale by carpet area.
        </p>
      )}
    </div>
  );
}

/** Orientation rose: model value by facing (petal length) and direct sun on each facade for the chosen date. */
export function OrientationRose({ v, onFacing, busy }: { v: Valuation; onFacing: (k: string) => void; busy: boolean }) {
  const [date, setDate] = useState<(typeof SUN_DATES)[number]["k"]>("dec");
  const fx = v.facing_effects ?? [];
  const lim = Math.max(0.01, ...fx.map((f) => Math.abs(f.pct)));
  const doy = SUN_DATES.find((d) => d.k === date)!.doy;
  const sun = FACINGS.map((f) => facadeSun(v.input.lat, v.input.lon, doy, f.az));
  const cur = FACINGS.findIndex((f) => f.k === v.input.facing);
  const C = 130, r0 = 34, r1 = 104;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(200px, 260px) minmax(0, 1fr)", gap: 8, padding: "8px 14px 14px", alignItems: "center" }} className="rose-grid">
      <svg viewBox="0 0 260 260" width="100%" role="group" aria-label="Value and sunlight by facing">
        {[r0, (r0 + r1) / 2, r1].map((r) => <circle key={r} cx={C} cy={C} r={r} fill="none" stroke="rgba(214,233,252,0.16)" />)}
        {FACINGS.map((f, i) => {
          const e = fx.find((x) => x.facing === f.k);
          const len = r0 + ((r1 - r0) / 2) * (1 + (e ? e.pct / lim : 0));
          const a = (f.az - 90) * (Math.PI / 180);
          const half = 17 * (Math.PI / 180);
          const p = (r: number, da: number) => `${C + r * Math.cos(a + da)},${C + r * Math.sin(a + da)}`;
          const on = i === cur;
          return (
            <g key={f.k} role="button" tabIndex={0} aria-label={`Face ${f.k}${e ? `, ${signedPct(e.pct)}` : ""}`} aria-pressed={on}
              onClick={() => !busy && onFacing(f.k)} onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); if (!busy) onFacing(f.k); } }}
              style={{ cursor: busy ? "wait" : "pointer", outline: "none" }}>
              <path d={`M${p(r0, -half)} L${p(len, -half)} A${len},${len} 0 0 1 ${p(len, half)} L${p(r0, half)} A${r0},${r0} 0 0 0 ${p(r0, -half)} Z`}
                fill={on ? "rgba(242,178,51,0.35)" : `rgba(127,178,229,${0.1 + (sun[i].hours / 12) * 0.35})`} stroke={on ? AMBER : CYAN} strokeWidth={on ? 1.6 : 0.9} />
              <text x={C + (r1 + 14) * Math.cos(a)} y={C + (r1 + 14) * Math.sin(a) + 4} textAnchor="middle" fontSize="11"
                fill={on ? AMBER : INK2} className="label">{f.s}</text>
            </g>
          );
        })}
        <circle cx={C} cy={C} r={r0 - 6} fill="none" stroke="rgba(214,233,252,0.32)" />
        <text x={C} y={C - 2} textAnchor="middle" fill={INK3} fontSize="9" className="label">Value</text>
        <text x={C} y={C + 10} textAnchor="middle" fill={INK3} fontSize="9" className="label">by facing</text>
      </svg>
      <div>
        <div style={{ display: "flex", gap: 0, border: "1px solid var(--line-2)", width: "fit-content", marginBottom: 10 }} role="radiogroup" aria-label="Sun study date">
          {SUN_DATES.map((d, i) => (
            <button key={d.k} role="radio" aria-checked={date === d.k} onClick={() => setDate(d.k)} title={d.note}
              style={{ border: 0, borderLeft: i ? "1px solid var(--line-2)" : 0, padding: "5px 10px", cursor: "pointer", fontSize: 12, fontStretch: "80%", fontWeight: 600,
                background: date === d.k ? "var(--ink)" : "transparent", color: date === d.k ? "var(--ground)" : "var(--ink-2)" }}>{d.t}</button>
          ))}
        </div>
        <table className="num" style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead>
            <tr className="label" style={{ fontSize: 9.5, color: "var(--ink-3)", textAlign: "left" }}>
              <th style={{ padding: "4px 0", fontWeight: 600 }}>Entrance</th><th style={{ fontWeight: 600 }}>Model value</th><th style={{ fontWeight: 600, textAlign: "right" }}>Sun on front</th>
            </tr>
          </thead>
          <tbody>
            {FACINGS.map((f, i) => {
              const e = fx.find((x) => x.facing === f.k);
              const on = i === cur;
              return (
                <tr key={f.k} style={{ borderTop: "1px solid var(--line)", color: on ? "var(--amber)" : "var(--ink)" }}>
                  <td style={{ padding: "4px 0" }}>{f.s}</td>
                  <td>{e ? `${inr(e.value)} ${signedPct(e.pct)}` : "—"}</td>
                  <td style={{ textAlign: "right" }}>{sun[i].hours.toFixed(1)} h{sun[i].first != null ? ` · ${clock(sun[i].first)}–${clock(sun[i].last)}` : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p style={{ margin: "8px 0 0", fontSize: 11.5, color: "var(--ink-3)" }}>
          Petal length is the model's value for each entrance direction, against the average of all eight; tint is direct sun on that facade. Click a petal to re-value facing that way.
        </p>
      </div>
    </div>
  );
}
