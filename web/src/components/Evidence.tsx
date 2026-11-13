import { motion } from "framer-motion";
import { AlertTriangle, Bus, GraduationCap, Hospital, ShoppingBag, Trees, Plane, TrainFront } from "lucide-react";
import type { Valuation } from "../api";
import { featureName, inr, pct, psf, signedPct, SOURCE_NAMES, title } from "../format";

const ease = [0.16, 1, 0.3, 1] as const;

/** Factor waterfall: from the model's average property to this one, drawn as leader-annotated steps. */
export function Waterfall({ v }: { v: Valuation }) {
  const steps = v.waterfall.steps.filter((s) => Math.abs(s.log_effect) > 0.004);
  const vals = [v.waterfall.base, ...steps.map((s) => s.to)];
  const lo = Math.min(...vals) * 0.92;
  const hi = Math.max(...vals) * 1.04;
  const X = (p: number) => ((p - lo) / (hi - lo)) * 100;
  const row = 40;
  return (
    <div style={{ padding: "12px 16px 16px" }}>
      <p style={{ margin: "0 0 12px", color: "var(--ink-2)", fontSize: 12.5, maxWidth: "62ch" }}>
        Starting from the model's average listing ({inr(v.waterfall.base)} for this size), each group of evidence moves the value.
        Effects are exact LightGBM attributions.
      </p>
      <div style={{ position: "relative" }}>
        {[{ group: "Average property", from: v.waterfall.base, to: v.waterfall.base, pct: 0, drivers: [] as [string, number][] }, ...steps].map((s, i) => {
          const up = s.to >= s.from;
          const left = X(Math.min(s.from, s.to));
          const width = Math.max(0.6, Math.abs(X(s.to) - X(s.from)));
          return (
            <div key={s.group} style={{ display: "grid", gridTemplateColumns: "190px 1fr 74px", alignItems: "center", height: row, borderTop: i ? "1px dashed var(--line)" : 0 }}>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 600, fontStretch: "88%" }}>{s.group}</div>
                {s.drivers[0] && <div style={{ fontSize: 10.5, color: "var(--ink-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{featureName(s.drivers[0][0])}</div>}
              </div>
              <div style={{ position: "relative", height: "100%" }}>
                {i === 0 ? (
                  <div style={{ position: "absolute", left: `${X(s.to)}%`, top: 8, bottom: 8, borderLeft: "1.5px solid var(--ink-2)" }} />
                ) : (
                  <motion.div
                    initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.6, delay: 0.25 + i * 0.08, ease }}
                    style={{
                      position: "absolute", left: `${left}%`, width: `${width}%`, top: 11, bottom: 11,
                      transformOrigin: up ? "left" : "right",
                      background: up ? "rgba(127,178,229,0.35)" : "transparent",
                      border: `1px solid ${up ? "var(--cyan)" : "var(--ink-3)"}`,
                      backgroundImage: up ? undefined : "repeating-linear-gradient(135deg, rgba(181,205,230,0.35) 0 1px, transparent 1px 5px)",
                    }}
                  />
                )}
                {i > 0 && <div style={{ position: "absolute", left: `${X(s.from)}%`, top: -row / 2 + 11, height: row / 2, borderLeft: "1px dotted var(--line-3)" }} />}
              </div>
              <div className="num" style={{ textAlign: "right", fontSize: 12.5, color: i === 0 ? "var(--ink-2)" : up ? "var(--ink)" : "var(--ink-2)" }}>
                {i === 0 ? inr(s.to) : signedPct(s.pct)}
              </div>
            </div>
          );
        })}
        <div style={{ display: "grid", gridTemplateColumns: "190px 1fr 74px", alignItems: "center", height: row, borderTop: "1px solid var(--line-3)" }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--amber)" }}>This property</div>
          <div style={{ position: "relative", height: "100%" }}>
            <div style={{ position: "absolute", left: `${X(vals[vals.length - 1])}%`, top: 6, bottom: 6, borderLeft: "2px solid var(--amber)" }} />
          </div>
          <div className="num" style={{ textAlign: "right", fontWeight: 700, color: "var(--amber)" }}>{inr(vals[vals.length - 1])}</div>
        </div>
      </div>
      <p style={{ margin: "8px 0 0", fontSize: 11, color: "var(--ink-3)" }}>
        Waterfall is on the asking basis before the {pct(Number(v.assumptions.ask_to_txn_discount), 0)} ask-to-transaction adjustment.
      </p>
    </div>
  );
}

/** Each data source is a biased witness; the engine reconciles them. */
export function Witnesses({ v }: { v: Valuation }) {
  const all = [...v.witnesses.map((w) => w.value), v.value];
  const lo = Math.min(...all) * 0.9;
  const hi = Math.max(...all) * 1.05;
  const X = (p: number) => `${((p - lo) / (hi - lo)) * 100}%`;
  return (
    <div style={{ padding: "12px 16px 14px" }}>
      <p style={{ margin: "0 0 10px", color: "var(--ink-2)", fontSize: 12.5, maxWidth: "62ch" }}>
        The same property as each source would price it. Sources differ by year, platform and area basis; the engine learns each
        source's bias and reports the reconciled value.
      </p>
      {v.witnesses.map((w, i) => (
        <div key={w.source} style={{ display: "grid", gridTemplateColumns: "170px 1fr 70px", alignItems: "center", height: 30 }}>
          <span style={{ fontSize: 12, color: "var(--ink-2)" }}>{SOURCE_NAMES[w.source] ?? w.source}</span>
          <div style={{ position: "relative", height: "100%" }}>
            <div style={{ position: "absolute", left: 0, right: 0, top: "50%", borderTop: "1px dotted var(--line)" }} />
            <motion.div initial={{ left: X(v.value), opacity: 0 }} animate={{ left: X(w.value), opacity: 1 }} transition={{ duration: 0.8, delay: 0.1 * i, ease }}
              style={{ position: "absolute", top: "50%", width: 9, height: 9, marginLeft: -4.5, marginTop: -4.5, border: "1.5px solid var(--cyan)", background: "var(--ground)", transform: "rotate(45deg)" }} />
          </div>
          <span className="num" style={{ textAlign: "right", fontSize: 12 }}>{inr(w.value)}</span>
        </div>
      ))}
      <div style={{ display: "grid", gridTemplateColumns: "170px 1fr 70px", alignItems: "center", height: 32, borderTop: "1px solid var(--line-2)", marginTop: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--amber)" }}>Reconciled, transaction basis</span>
        <div style={{ position: "relative", height: "100%" }}>
          <div style={{ position: "absolute", left: X(v.value), top: 6, bottom: 6, borderLeft: "2px solid var(--amber)" }} />
        </div>
        <span className="num" style={{ textAlign: "right", fontSize: 12, fontWeight: 700, color: "var(--amber)" }}>{inr(v.value)}</span>
      </div>
    </div>
  );
}

export function CompsTable({ v }: { v: Valuation }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
        <thead>
          <tr>
            {["Comparable", "Config", "Carpet", "Distance", "Rate today", "Indicates"].map((h, i) => (
              <th key={h} className="label" style={{ textAlign: i > 1 ? "right" : "left", padding: "9px 12px", borderBottom: "1px solid var(--line-2)", fontSize: 9.5, fontWeight: 600 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {v.comparables.map((c, i) => (
            <motion.tr key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.04 * i }}>
              <td style={{ padding: "8px 12px", borderBottom: "1px solid var(--line)", maxWidth: 220 }}>
                <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontWeight: 500 }}>{c.society || title(c.locality ?? "Listing")}</div>
                <div style={{ fontSize: 10.5, color: "var(--ink-3)" }}>{SOURCE_NAMES[c.source]}{c.geocode === "locality" ? " · locality-level location" : ""}</div>
              </td>
              <td style={{ padding: "8px 12px", borderBottom: "1px solid var(--line)" }}>{c.bhk ? `${c.bhk} BHK` : "—"}</td>
              <td className="num" style={{ padding: "8px 12px", borderBottom: "1px solid var(--line)", textAlign: "right" }}>{c.area_sqft.toLocaleString("en-IN")}</td>
              <td className="num" style={{ padding: "8px 12px", borderBottom: "1px solid var(--line)", textAlign: "right" }}>{c.km.toFixed(2)} km</td>
              <td className="num" style={{ padding: "8px 12px", borderBottom: "1px solid var(--line)", textAlign: "right" }}>{psf(c.ppsf_today)}</td>
              <td className="num" style={{ padding: "8px 12px", borderBottom: "1px solid var(--line)", textAlign: "right", fontWeight: 600 }}>{inr(c.indicated_value)}</td>
            </motion.tr>
          ))}
        </tbody>
      </table>
      <p style={{ margin: 0, padding: "8px 12px", fontSize: 11, color: "var(--ink-3)" }}>
        Listing rates are rolled to the valuation date and moved to transaction basis. Ranked by distance, size and configuration similarity.
      </p>
    </div>
  );
}

export function LandStructure({ v }: { v: Valuation }) {
  const c = v.cost_approach;
  const tot = c.land + c.structure || 1;
  return (
    <div style={{ padding: "12px 16px 14px" }}>
      <div style={{ display: "flex", height: 34, border: "1px solid var(--line-2)" }}>
        <motion.div initial={{ flexGrow: 0 }} animate={{ flexGrow: c.land / tot }} transition={{ duration: 0.8, ease }}
          style={{ flexBasis: 0, background: "rgba(127,178,229,0.28)", display: "flex", alignItems: "center", paddingLeft: 8, overflow: "hidden" }}>
          <span className="label" style={{ color: "var(--ink)", whiteSpace: "nowrap" }}>Land & location {pct(c.land / tot, 0)}</span>
        </motion.div>
        <motion.div initial={{ flexGrow: 1 }} animate={{ flexGrow: c.structure / tot }} transition={{ duration: 0.8, ease }}
          style={{ flexBasis: 0, borderLeft: "1px solid var(--line-3)", backgroundImage: "repeating-linear-gradient(135deg, rgba(181,205,230,0.3) 0 1px, transparent 1px 6px)", display: "flex", alignItems: "center", paddingLeft: 8, overflow: "hidden" }}>
          <span className="label" style={{ color: "var(--ink)", whiteSpace: "nowrap" }}>Structure {pct(c.structure / tot, 0)}</span>
        </motion.div>
      </div>
      <p style={{ margin: "10px 0 0", fontSize: 12, color: "var(--ink-2)", maxWidth: "64ch" }}>
        Cost-approach cross-check: {Math.round(c.builtup_sqft).toLocaleString("en-IN")} sq ft built-up at ₹{c.spec_rate.toLocaleString("en-IN")}/sq ft,
        depreciated for {c.age_years} years, gives a structure value of {inr(c.structure)}; the remaining {inr(c.land)} is the value of the land share and location.
      </p>
    </div>
  );
}

const ACCESS_ICON: Record<string, typeof Bus> = {
  metro: TrainFront, rail: TrainFront, school: GraduationCap, hospital: Hospital, mall: ShoppingBag, park: Trees, airport: Plane,
};

export function AccessList({ v }: { v: Valuation }) {
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: "6px 0" }}>
      {v.access.map((a) => {
        const Icon = ACCESS_ICON[a.cat] ?? Bus;
        return (
          <li key={a.cat} style={{ display: "grid", gridTemplateColumns: "22px 1fr auto", gap: 10, alignItems: "center", padding: "7px 16px" }}>
            <Icon size={15} strokeWidth={1.5} color="var(--cyan)" aria-hidden />
            <span style={{ fontSize: 12.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              <span className="label" style={{ marginRight: 8 }}>{a.cat}</span>{a.name}
            </span>
            <span className="num" style={{ fontSize: 12.5, color: "var(--ink-2)" }}>{a.km.toFixed(1)} km</span>
          </li>
        );
      })}
    </ul>
  );
}

export function Flags({ v }: { v: Valuation }) {
  if (!v.flags.length)
    return <p style={{ margin: 0, padding: "12px 16px", color: "var(--green)", fontSize: 12.5 }}>No risk flags. Inputs and evidence are consistent.</p>;
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: "6px 0" }}>
      {v.flags.map((f) => (
        <li key={f.code} style={{ display: "grid", gridTemplateColumns: "20px 1fr", gap: 8, padding: "7px 16px", fontSize: 12.5 }}>
          <AlertTriangle size={14} color="var(--amber)" strokeWidth={1.8} style={{ marginTop: 2 }} aria-hidden />
          <span>{f.text}</span>
        </li>
      ))}
    </ul>
  );
}
