import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Activity, Loader2, RefreshCw } from "lucide-react";
import EvidenceSheet from "../sheets/EvidenceSheet";
import { getMonitor, replay, type Meta, type Monitor } from "../api";
import { Panel } from "../components/ui";
import { pct } from "../format";

const EASE = [0.16, 1, 0.3, 1] as const;
const ST: Record<string, string> = { stable: "var(--green)", watch: "var(--amber)", drift: "var(--red)" };

export default function ModelPage({ meta }: { meta: Meta | null }) {
  return (
    <div>
      <MonitorPanel />
      <div style={{ borderTop: "1px solid var(--line-3)" }}>
        <EvidenceSheet meta={meta} />
      </div>
    </div>
  );
}

function MonitorPanel() {
  const [m, setM] = useState<Monitor | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => getMonitor().then(setM).catch(() => setM(null));
  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, []);
  const doReplay = async () => { setBusy(true); try { await replay(200); await load(); } finally { setBusy(false); } };
  return (
    <section>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-end", gap: 16, padding: "24px 28px 16px", borderBottom: "1px solid var(--line-2)" }}>
        <div>
          <h1 className="h1" style={{ fontSize: 38, display: "flex", alignItems: "center", gap: 12 }}><Activity size={30} color="var(--cyan)" aria-hidden /> Model risk monitor</h1>
          <p style={{ margin: "6px 0 0", color: "var(--ink-2)", maxWidth: 820, fontSize: 14 }}>
            Every valuation the engine serves is logged. The monitor compares live traffic with the data the model was trained on (population stability index),
            tracks the routing mix and latency, and keeps the model card that model-risk governance asks for. It refreshes every 8 seconds.
          </p>
        </div>
        <button className="btn-primary" onClick={doReplay} disabled={busy}>
          {busy ? <Loader2 size={15} className="spin" aria-hidden /> : <RefreshCw size={15} aria-hidden />} Replay 200 requests from across India
        </button>
      </div>
      {!m && <p className="label" style={{ padding: 28 }}>Connecting to the engine…</p>}
      {m && (
        <>
          <div className="kpis" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", borderBottom: "1px solid var(--line-2)" }}>
            {[["Valuations logged", m.n.toLocaleString("en-IN")], ["Median FSD", m.fsd_median != null ? pct(m.fsd_median, 1) : "—"],
              ["Latency p50 · p90", m.latency.p50 != null ? `${Math.round(m.latency.p50)} · ${Math.round(m.latency.p90 ?? 0)} ms` : "—"],
              ["Satellite coverage", m.sat_share != null ? pct(m.sat_share, 0) : "—"],
              ["Drifting features", `${m.features.filter((f) => f.status === "drift").length} of ${m.features.length}`]].map(([k, v], i) => (
              <div key={k} style={{ padding: "14px 20px", borderLeft: i ? "1px solid var(--line-2)" : 0 }}>
                <div className="label" style={{ fontSize: 9.5 }}>{k}</div>
                <div className="num" style={{ fontSize: 26, fontWeight: 700, fontStretch: "78%" }}>{v}</div>
              </div>
            ))}
          </div>
          <div className="sheet-2col" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.5fr) minmax(0, 1fr)" }}>
            <Panel title="Feature drift · training (outline) vs live traffic (fill)" style={{ borderRight: "1px solid var(--line-2)", borderBottom: "1px solid var(--line-2)" }}>
              <div className="psi-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 0 }}>
                {m.features.map((f) => (
                  <div key={f.key} style={{ padding: "14px 16px", borderRight: "1px solid var(--line)", borderBottom: "1px solid var(--line)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <span style={{ fontSize: 13 }}>{f.name}</span>
                      <span className="label" style={{ fontSize: 9, color: ST[f.status] }}>{f.status}</span>
                    </div>
                    <Hist ref_={f.ref} cur={f.cur} color={ST[f.status]} />
                    <div className="num" style={{ fontSize: 12, color: "var(--ink-3)" }}>PSI {f.psi.toFixed(3)}</div>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 12, color: "var(--ink-3)", margin: 0, padding: "10px 16px 14px" }}>
                PSI below 0.1 is stable, 0.1–0.25 worth watching, above 0.25 a shift. Traffic from places far from listings drifts by design;
                drift there is the cue to widen ranges, route to site visits and collect new ground truth for those areas.
              </p>
            </Panel>
            <div style={{ borderBottom: "1px solid var(--line-2)" }}>
              <Panel title="Routing mix">
                <div style={{ padding: "14px 16px" }}>
                  <div style={{ display: "flex", height: 26 }}>
                    {(["green", "amber", "red"] as const).map((b) => (
                      <motion.div key={b} initial={{ width: 0 }} animate={{ width: `${(m.bands[b] ?? 0) * 100}%` }} transition={{ duration: 0.9, ease: EASE }}
                        style={{ background: b === "green" ? "var(--green)" : b === "amber" ? "var(--amber)" : "var(--red)" }} />
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 12.5 }}>
                    {[["green", "Waive"], ["amber", "Desk review"], ["red", "Site visit"]].map(([b, t]) => <span key={b}>{t} <b className="num">{pct(m.bands[b] ?? 0, 0)}</b></span>)}
                  </div>
                </div>
              </Panel>
              <Panel title="Requests per day" style={{ borderTop: "1px solid var(--line-2)" }}>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 90, padding: "12px 16px" }}>
                  {m.by_day.slice(-30).map((d) => {
                    const mx = Math.max(...m.by_day.map((x) => x.n));
                    return <div key={d.day} title={`${d.day}: ${d.n}`} style={{ flex: 1, background: "#7fb2e5", height: `${(d.n / mx) * 100}%`, minHeight: 2 }} />;
                  })}
                  {!m.by_day.length && <span style={{ color: "var(--ink-3)", fontSize: 13 }}>No traffic yet. Value a property or replay requests.</span>}
                </div>
              </Panel>
              <Panel title="Model card" style={{ borderTop: "1px solid var(--line-2)" }}>
                <dl style={{ margin: 0, padding: "8px 16px 14px", display: "grid", gap: 6, fontSize: 12.5 }}>
                  {[["Version", m.model_card.version], ["Trained on", `${m.model_card.trained_rows.toLocaleString("en-IN")} listings · ${m.model_card.cities} cities`],
                    ["Method", m.model_card.objective],
                    ["Validated", Object.entries(m.model_card.validation).map(([k, v]) => `${k.replace("_", " ")} ${pct(v.MdAPE, 1)} (90% cover ${pct(v.cover_p90, 0)})`).join(" · ")],
                    ["Routing", `waive ≤ ${pct(m.model_card.thresholds.waive_fsd, 0)} FSD · desk ≤ ${pct(m.model_card.thresholds.desk_fsd, 0)}`]].map(([k, v]) => (
                    <div key={k} style={{ display: "grid", gridTemplateColumns: "90px 1fr", gap: 10 }}><dt className="label" style={{ fontSize: 9.5 }}>{k}</dt><dd style={{ margin: 0, color: "var(--ink-2)" }}>{v}</dd></div>
                  ))}
                </dl>
              </Panel>
            </div>
          </div>
          {m.recent.length > 0 && (
            <Panel title="Latest requests" style={{ borderBottom: "1px solid var(--line-2)" }}>
              <div style={{ overflowX: "auto" }}>
                <table className="num" style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                  <tbody>
                    {[...m.recent].reverse().map((r, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid var(--line)" }}>
                        <td style={{ padding: "6px 16px", color: "var(--ink-3)" }}>{new Date(r.t * 1000).toLocaleString("en-IN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })}</td>
                        <td>{r.city}</td><td>{r.src}</td><td>FSD {pct(r.fsd, 1)}</td><td>{Math.round(r.latency_ms)} ms</td>
                        <td style={{ color: r.band === "green" ? "var(--green)" : r.band === "amber" ? "var(--amber)" : "var(--red)" }}>{r.band === "green" ? "Waive" : r.band === "amber" ? "Desk review" : "Site visit"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}
        </>
      )}
    </section>
  );
}

function Hist({ ref_, cur, color }: { ref_: number[]; cur: number[]; color: string }) {
  const mx = Math.max(...ref_, ...cur, 0.01);
  return (
    <svg viewBox={`0 0 ${ref_.length * 10} 50`} width="100%" height="56" preserveAspectRatio="none" style={{ margin: "8px 0 4px" }} aria-hidden>
      {cur.map((v, i) => <rect key={`c${i}`} x={i * 10 + 1} y={50 - (v / mx) * 48} width="8" height={(v / mx) * 48} fill={color} opacity="0.55" />)}
      {ref_.map((v, i) => <rect key={`r${i}`} x={i * 10 + 1} y={50 - (v / mx) * 48} width="8" height={(v / mx) * 48} fill="none" stroke="#e8f1fb" strokeWidth="0.6" vectorEffect="non-scaling-stroke" />)}
    </svg>
  );
}
