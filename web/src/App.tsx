import { useEffect, useState } from "react";
import { getMeta, type Meta } from "./api";
import ValuationSheet from "./sheets/ValuationSheet";
import MarketSheet from "./sheets/MarketSheet";
import EvidenceSheet from "./sheets/EvidenceSheet";
import IncomeSheet from "./sheets/IncomeSheet";

type Sheet = "value" | "income" | "market" | "evidence";
const SHEETS: { k: Sheet; t: string; code: string }[] = [
  { k: "value", t: "Valuation", code: "VAL" },
  { k: "income", t: "Commercial income", code: "CRE" },
  { k: "market", t: "Market surface", code: "MKT" },
  { k: "evidence", t: "Model evidence", code: "EVD" },
];

export default function App() {
  // deep links: #income, #market, #evidence; #drawings and #construction open the valuation sheet at that section
  const fromHash = (): Sheet => {
    const h = window.location.hash.slice(1);
    return (["income", "market", "evidence"].includes(h) ? h : "value") as Sheet;
  };
  const [sheet, setSheet] = useState<Sheet>(fromHash);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [seen, setSeen] = useState<Set<Sheet>>(new Set(["value", fromHash()]));
  useEffect(() => {
    const on = () => setSheet(fromHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  useEffect(() => { setSeen((s) => (s.has(sheet) ? s : new Set([...s, sheet]))); }, [sheet]);
  useEffect(() => { getMeta().then(setMeta).catch(() => setMeta(null)); }, []);
  const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

  return (
    <div style={{ minHeight: "100%" }}>
      <header className="no-print app-header" style={{
        position: "sticky", top: 0, zIndex: 50, height: 57, display: "grid", gridTemplateColumns: "auto 1fr auto",
        alignItems: "stretch", borderBottom: "1px solid var(--line-3)", background: "var(--ground-0)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 20px", borderRight: "1px solid var(--line-2)" }}>
          <Mark />
          <div>
            <div style={{ fontStretch: "68%", fontWeight: 800, fontSize: 21, letterSpacing: "0.16em", lineHeight: 1 }}>NAKSHA</div>
            <div className="label" style={{ fontSize: 9, marginTop: 3 }}>Collateral valuation engine · India</div>
          </div>
        </div>
        <nav aria-label="Sheets" style={{ display: "flex", overflowX: "auto" }}>
          {SHEETS.map((s) => {
            const on = s.k === sheet;
            return (
              <button key={s.k} onClick={() => { setSheet(s.k); history.replaceState(null, "", s.k === "value" ? " " : `#${s.k}`); window.scrollTo({ top: 0 }); }} aria-current={on ? "page" : undefined}
                style={{
                  border: 0, borderRight: "1px solid var(--line-2)", padding: "0 22px", cursor: "pointer",
                  background: on ? "var(--ground)" : "transparent", color: on ? "var(--ink)" : "var(--ink-3)",
                  boxShadow: on ? "inset 0 -2px 0 var(--ink)" : "none", display: "flex", alignItems: "center", gap: 10,
                }}>
                <span className="label" style={{ fontSize: 9.5, color: on ? "var(--cyan)" : "var(--ink-3)" }}>{s.code}</span>
                <span style={{ fontStretch: "80%", fontWeight: 600, fontSize: 14, letterSpacing: "0.03em" }}>{s.t}</span>
              </button>
            );
          })}
        </nav>
        <dl className="hdr-meta" style={{ display: "flex", margin: 0 }}>
          {[["Valuation date", today], ["Model", meta ? `${meta.report.data.cities} cities` : "offline"]].map(([k, v]) => (
            <div key={k} style={{ padding: "10px 18px", borderLeft: "1px solid var(--line-2)" }}>
              <dt className="label" style={{ fontSize: 9 }}>{k}</dt>
              <dd className="num" style={{ margin: "2px 0 0", fontSize: 13, color: meta || k !== "Model" ? "var(--ink)" : "var(--red)" }}>{v}</dd>
            </div>
          ))}
        </dl>
      </header>
      <main>
        {/* sheets stay mounted once opened, so a valuation survives a trip to the map */}
        <div hidden={sheet !== "value"}><ValuationSheet /></div>
        {seen.has("income") && <div hidden={sheet !== "income"}><IncomeSheet /></div>}
        {seen.has("market") && <div hidden={sheet !== "market"}><MarketSheet meta={meta} active={sheet === "market"} /></div>}
        {seen.has("evidence") && <div hidden={sheet !== "evidence"}><EvidenceSheet meta={meta} /></div>}
      </main>
    </div>
  );
}

/** Mark: a plot outline with a dimensioned datum, drawn in two strokes. */
function Mark() {
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden>
      <rect x="4.5" y="8.5" width="21" height="17" fill="none" stroke="#e8f1fb" strokeWidth="1.5" />
      <path d="M4.5 8.5 L15 2.5 L25.5 8.5" fill="none" stroke="#e8f1fb" strokeWidth="1.5" />
      <rect x="11.5" y="15.5" width="7" height="10" fill="#f2b233" />
    </svg>
  );
}
