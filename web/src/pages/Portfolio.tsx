import { useEffect, useMemo, useRef, useState } from "react";
import DeckGL from "@deck.gl/react";
import { ColumnLayer, ScatterplotLayer } from "@deck.gl/layers";
import type { MapViewState } from "@deck.gl/core";
import Map from "react-map-gl/maplibre";
import type { StyleSpecification } from "maplibre-gl";
import { motion } from "framer-motion";
import { Download, Loader2, Upload } from "lucide-react";
import { blueprintStyle } from "../mapStyle";
import { getBook, uploadBook, type Book, type Loan } from "../api";
import { inr, pct, signedPct } from "../format";
import { Panel } from "../components/ui";

const EASE = [0.16, 1, 0.3, 1] as const;
type Filter = "all" | "high" | "medium";

function colorFor(l: Loan, ltv: number): [number, number, number, number] {
  if (l.duplicate_of) return [255, 90, 70, 255];
  if (ltv > l.cap) return [255, 138, 115, 235];
  if (ltv > l.cap - 0.1) return [242, 178, 51, 225];
  return [127, 178, 229, 190];
}

export default function Portfolio() {
  const [book, setBook] = useState<Book | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shock, setShock] = useState(0);
  const [filter, setFilter] = useState<Filter>("high");
  const [focus, setFocus] = useState<Loan | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number; l: Loan } | null>(null);
  const [style, setStyle] = useState<StyleSpecification | null>(null);
  const [view, setView] = useState<MapViewState>({ longitude: 78.6, latitude: 21.2, zoom: 4.3, pitch: 52, bearing: -8 });
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { blueprintStyle().then(setStyle); }, []);
  useEffect(() => { setBusy(true); getBook().then(setBook).catch((e) => setErr(String(e.message ?? e))).finally(() => setBusy(false)); }, []);

  const stressed = useMemo(() => {
    if (!book) return null;
    const ltv = book.loans.map((l) => l.outstanding / (l.value * (1 - shock)));
    const breaches = book.loans.filter((l, i) => ltv[i] > l.cap).length;
    const exposureAtRisk = book.loans.reduce((s, l, i) => s + (ltv[i] > l.cap ? l.outstanding - l.value * (1 - shock) * l.cap : 0), 0);
    const coll = book.summary.collateral * (1 - shock);
    return { ltv, breaches, exposureAtRisk, wtd: book.summary.exposure / coll };
  }, [book, shock]);

  const loans = book?.loans ?? [];
  const layers = useMemo(() => !book || !stressed ? [] : [
    new ColumnLayer<Loan>({
      id: "loans", data: loans, diskResolution: 6, radius: 7500, extruded: true, pickable: true,
      getPosition: (l) => [l.lon, l.lat], getElevation: (l) => Math.sqrt(l.outstanding) * 70,
      getFillColor: (l) => colorFor(l, stressed.ltv[loans.indexOf(l)]),
      updateTriggers: { getFillColor: [shock] }, transitions: { getFillColor: 600, getElevation: 900 },
      onHover: (i) => setHover(i.object ? { x: i.x, y: i.y, l: i.object } : null), onClick: (i) => i.object && setFocus(i.object),
    }),
    new ScatterplotLayer<Loan>({
      id: "alarm", data: loans.filter((l) => l.duplicate_of || stressed.ltv[loans.indexOf(l)] > l.cap), getPosition: (l) => [l.lon, l.lat],
      getRadius: 16000, radiusUnits: "meters", stroked: true, filled: false, getLineColor: [255, 138, 115, 200], lineWidthMinPixels: 1.2,
      updateTriggers: { data: [shock] },
    }),
  ], [book, stressed, loans, shock]);

  const alerts = useMemo(() => {
    if (!book || !stressed) return [];
    const out: { l: Loan; code: string; sev: string; text: string }[] = [];
    book.loans.forEach((l, i) => {
      l.alerts.filter((a) => a.code !== "LTV_BREACH" && a.code !== "LTV_DRIFT").forEach((a) => out.push({ l, code: a.code, sev: a.severity, text: a.text }));
      if (stressed.ltv[i] > l.cap) out.push({ l, code: "LTV_BREACH", sev: "high", text: `LTV ${pct(stressed.ltv[i], 0)} above the ${pct(l.cap, 0)} cap${shock ? ` at −${pct(shock, 0)}` : ""}` });
    });
    const rank = { high: 0, medium: 1, low: 2 } as Record<string, number>;
    return out.filter((a) => filter === "all" || a.sev === filter).sort((a, b) => rank[a.sev] - rank[b.sev] || b.l.outstanding - a.l.outstanding);
  }, [book, stressed, filter, shock]);

  const onFile = async (f: File) => {
    setBusy(true); setErr(null);
    try { setBook(await uploadBook(await f.text())); setShock(0); } catch (e) { setErr(e instanceof Error ? e.message : "Upload failed"); } finally { setBusy(false); }
  };
  const template = () => {
    const rows = ["loan_id,lat,lon,area_sqft,bhk,orig_year,orig_valuation,sanctioned,outstanding,valuer,legal_status",
      ...loans.slice(0, 25).map((l) => [l.loan_id, l.lat.toFixed(5), l.lon.toFixed(5), l.area_sqft, l.bhk, l.orig_year.toFixed(1), Math.round(l.orig_valuation), Math.round(l.sanctioned), Math.round(l.outstanding), l.valuer, l.legal_status].join(","))];
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([rows.join("\n")], { type: "text/csv" }));
    a.download = "naksha_loan_book_template.csv"; a.click();
  };

  const S = book?.summary;
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 16, padding: "22px 28px 16px", borderBottom: "1px solid var(--line-2)" }}>
        <div>
          <h1 className="h1" style={{ fontSize: 38 }}>Portfolio revaluation</h1>
          <p style={{ margin: "6px 0 0", color: "var(--ink-2)", maxWidth: 760, fontSize: 14 }}>
            Every loan's collateral revalued by the engine, LTV drift since sanction, a price-shock stress test, valuers scored against the model, and the same property pledged twice.
            {S?.synthetic ? ` Demo book: ${S.loans} synthetic loans placed on real locations, with two biased valuers and five double pledges planted.` : " Your uploaded book."}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn-ghost" onClick={template} disabled={!book}><Download size={15} aria-hidden /> CSV template</button>
          <button className="btn-primary" onClick={() => fileRef.current?.click()}><Upload size={15} aria-hidden /> Upload a loan book</button>
          <input ref={fileRef} type="file" accept=".csv" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        </div>
      </div>
      {err && <p role="alert" style={{ color: "var(--red)", padding: "10px 28px", margin: 0 }}>{err}</p>}
      {S && stressed && (
        <div className="kpis" style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", borderBottom: "1px solid var(--line-2)" }}>
          {[["Loans", S.loans.toLocaleString("en-IN"), `${inr(S.exposure)} outstanding`, "var(--ink)"],
            ["Collateral now", inr(S.collateral * (1 - shock)), shock ? `after a −${pct(shock, 0)} shock` : "model value today", "var(--ink)"],
            ["Weighted LTV", pct(stressed.wtd, 1), "outstanding ÷ collateral", stressed.wtd > 0.7 ? "var(--red)" : "var(--ink)"],
            ["LTV breaches", String(stressed.breaches), `${inr(stressed.exposureAtRisk)} above cap`, stressed.breaches ? "var(--red)" : "var(--green)"],
            ["Double pledges", String(S.double_pledges), "same collateral, two loans", S.double_pledges ? "var(--red)" : "var(--green)"],
            ["Valuers flagged", String(S.flagged_valuers), "median bias > +8%", S.flagged_valuers ? "var(--amber)" : "var(--green)"]].map(([k, v, s, c], i) => (
            <div key={k} style={{ padding: "14px 20px", borderLeft: i ? "1px solid var(--line-2)" : 0 }}>
              <div className="label" style={{ fontSize: 9.5 }}>{k}</div>
              <motion.div key={v} initial={{ opacity: 0.4 }} animate={{ opacity: 1 }} className="num" style={{ fontSize: 28, fontWeight: 700, fontStretch: "78%", color: c }}>{v}</motion.div>
              <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{s}</div>
            </div>
          ))}
        </div>
      )}
      <div className="port-main" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.65fr) minmax(340px, 1fr)", height: 600, borderBottom: "1px solid var(--line-2)" }}>
        <div style={{ position: "relative", borderRight: "1px solid var(--line-2)" }}>
          {busy && !book && <div className="label" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", zIndex: 3 }}><span><Loader2 size={16} className="spin" aria-hidden /> Revaluing the book…</span></div>}
          <DeckGL viewState={view} onViewStateChange={({ viewState }) => setView(viewState as MapViewState)} controller layers={layers}>
            {style && <Map mapStyle={style} attributionControl={{ compact: true }} />}
          </DeckGL>
          <div style={{ position: "absolute", left: 14, top: 14, right: 14, display: "flex", flexWrap: "wrap", gap: 18, alignItems: "center", padding: "10px 14px", background: "rgba(7,31,56,0.88)", border: "1px solid var(--line-2)", maxWidth: 560 }}>
            <label style={{ flex: 1, minWidth: 220 }}>
              <span className="label">Price shock · {shock ? `−${pct(shock, 0)}` : "none"}</span>
              <input type="range" min={0} max={0.4} step={0.01} value={shock} onChange={(e) => setShock(Number(e.target.value))} className="stage-range" style={{ width: "100%" }} />
            </label>
            <div style={{ display: "flex", gap: 12, fontSize: 11.5, color: "var(--ink-2)" }}>
              {[["#7fb2e5", "Within cap"], ["#f2b233", "Near cap"], ["#ff8a73", "Breach"], ["#ff5a46", "Double pledge"]].map(([c, t]) => (
                <span key={t} style={{ display: "flex", alignItems: "center", gap: 5 }}><i style={{ width: 9, height: 9, background: c, display: "inline-block" }} />{t}</span>
              ))}
            </div>
          </div>
          {hover && (
            <div style={{ position: "absolute", left: hover.x + 14, top: hover.y - 10, pointerEvents: "none", background: "var(--ground-0)", border: "1px solid var(--line-3)", padding: "8px 10px", fontSize: 12, zIndex: 4, minWidth: 210 }}>
              <div className="label">{hover.l.loan_id} · {hover.l.city}</div>
              <div className="num" style={{ fontSize: 15, fontWeight: 600 }}>{inr(hover.l.outstanding)} on {inr(hover.l.value)}</div>
              <div style={{ color: "var(--ink-3)" }}>LTV {pct(hover.l.ltv_orig, 0)} at sanction → {pct(hover.l.ltv_now, 0)} today · valuer {hover.l.valuer}</div>
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: "1px solid var(--line)" }}>
            <span className="label">Early warnings · {alerts.length}</span>
            <div style={{ display: "flex", border: "1px solid var(--line-2)" }}>
              {(["high", "medium", "all"] as Filter[]).map((f, i) => (
                <button key={f} onClick={() => setFilter(f)} style={{ border: 0, borderLeft: i ? "1px solid var(--line-2)" : 0, padding: "4px 10px", fontSize: 11.5, cursor: "pointer", background: filter === f ? "var(--ink)" : "transparent", color: filter === f ? "var(--ground)" : "var(--ink-2)", textTransform: "capitalize" }}>{f}</button>
              ))}
            </div>
          </div>
          <div style={{ overflowY: "auto", flex: 1 }}>
            {alerts.slice(0, 120).map((a, i) => (
              <button key={a.l.loan_id + a.code + i} onClick={() => { setFocus(a.l); setView((v) => ({ ...v, longitude: a.l.lon, latitude: a.l.lat, zoom: 11, transitionDuration: 1200 })); }}
                style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 10, width: "100%", textAlign: "left", padding: "9px 16px", border: 0, borderBottom: "1px solid var(--line)", background: focus?.loan_id === a.l.loan_id ? "var(--ground-2)" : "transparent", color: "var(--ink)", cursor: "pointer" }}>
                <span className="label" style={{ fontSize: 8.5, color: a.sev === "high" ? "var(--red)" : "var(--amber)", border: `1px solid ${a.sev === "high" ? "var(--red)" : "var(--amber)"}`, padding: "1px 4px", alignSelf: "start" }}>{a.code.replace(/_/g, " ")}</span>
                <span style={{ fontSize: 12.5 }}>{a.text}<div style={{ fontSize: 11, color: "var(--ink-3)" }}>{a.l.loan_id} · {a.l.city} · valuer {a.l.valuer}</div></span>
                <span className="num" style={{ fontSize: 12 }}>{inr(a.l.outstanding)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
      {book && (
        <div className="sheet-2col" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr)" }}>
          <Panel title="Valuer scorecard · origination value against the model's back-cast" style={{ borderRight: "1px solid var(--line-2)" }}>
            <div style={{ padding: "10px 16px 16px" }}>
              {book.valuers.map((v, i) => (
                <div key={v.valuer} style={{ display: "grid", gridTemplateColumns: "48px 1fr 64px 120px", gap: 12, alignItems: "center", padding: "5px 0", borderBottom: "1px solid var(--line)" }}>
                  <span className="num" style={{ fontWeight: 700, color: v.flag ? "var(--red)" : "var(--ink)" }}>{v.valuer}</span>
                  <span style={{ position: "relative", height: 12 }}>
                    <span style={{ position: "absolute", left: "30%", top: -3, bottom: -3, borderLeft: "1px solid var(--line-3)" }} />
                    <motion.span initial={{ width: 0 }} whileInView={{ width: `${Math.min(Math.abs(v.median_bias) / 0.3, 1) * (v.median_bias < 0 ? 30 : 70)}%` }} viewport={{ once: true }} transition={{ delay: i * 0.04, duration: 0.8, ease: EASE }}
                      style={{ position: "absolute", top: 0, bottom: 0, [v.median_bias < 0 ? "right" : "left"]: v.median_bias < 0 ? "70%" : "30%", background: v.flag ? "var(--red)" : "#5c8fc4" } as React.CSSProperties} />
                  </span>
                  <span className="num" style={{ textAlign: "right", color: v.flag ? "var(--red)" : "var(--ink)" }}>{signedPct(v.median_bias, 1)}</span>
                  <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{v.n} loans · {pct(v.share_high, 0)} over +15%</span>
                </div>
              ))}
              <p style={{ fontSize: 12, color: "var(--ink-3)", margin: "10px 0 0" }}>A valuer whose reports sit systematically above what the model says the property was worth at the time is the classic signature of valuer-builder collusion. Flagged: median bias above +8% across ten or more files.</p>
            </div>
          </Panel>
          <Panel title="Exposure by city">
            <div style={{ padding: "6px 16px 16px", maxHeight: 520, overflowY: "auto" }}>
              {book.cities.sort((a, b) => b.exposure - a.exposure).map((c) => (
                <div key={c.city} style={{ display: "grid", gridTemplateColumns: "120px 1fr 70px 56px", gap: 10, alignItems: "center", padding: "5px 0", borderBottom: "1px solid var(--line)", fontSize: 13 }}>
                  <span>{c.city}</span>
                  <span style={{ height: 8, background: "rgba(127,178,229,0.12)" }}><span style={{ display: "block", height: 8, width: `${(c.exposure / book.cities[0].exposure) * 100}%`, background: "#7fb2e5" }} /></span>
                  <span className="num" style={{ textAlign: "right" }}>{inr(c.exposure)}</span>
                  <span className="num" style={{ textAlign: "right", color: c.ltv > 0.7 ? "var(--red)" : "var(--ink-2)" }}>{pct(c.ltv, 0)}</span>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}
