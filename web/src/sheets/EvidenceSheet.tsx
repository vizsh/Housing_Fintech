import { motion } from "framer-motion";
import type { Meta, Metrics } from "../api";
import { Panel } from "../components/ui";
import { featureName, pct, SOURCE_NAMES, title } from "../format";

const METHODS: { k: string; t: string }[] = [
  { k: "engine", t: "Naksha engine" },
  { k: "attributes_gbm", t: "Attributes-only ML" },
  { k: "locality_median", t: "Locality median (portal style)" },
  { k: "hedonic_ridge", t: "Hedonic regression" },
  { k: "city_median", t: "City median rate" },
];
const SPLITS: { k: "random" | "unseen_locality" | "unseen_city"; t: string; sub: string }[] = [
  { k: "random", t: "Random holdout", sub: "15% of listings never seen in training" },
  { k: "unseen_locality", t: "Unseen localities", sub: "Whole localities held out" },
  { k: "unseen_city", t: "Unseen cities", sub: "Eight tier-2 cities held out entirely" },
];
const ease = [0.16, 1, 0.3, 1] as const;

function Bars({ data, metric, max, fmt }: { data: Record<string, Metrics>; metric: string; max: number; fmt: (v: number) => string }) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      {METHODS.filter((m) => data[m.k]).map((m, i) => {
        const val = data[m.k][metric];
        const ours = m.k === "engine";
        return (
          <div key={m.k} style={{ display: "grid", gridTemplateColumns: "190px 1fr 58px", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 12.5, color: ours ? "var(--amber)" : "var(--ink-2)", fontWeight: ours ? 700 : 500 }}>{m.t}</span>
            <div style={{ position: "relative", height: 16, borderLeft: "1px solid var(--line-3)" }}>
              <motion.div initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true }} transition={{ duration: 0.8, delay: i * 0.07, ease }}
                style={{ position: "absolute", left: 0, top: 2, bottom: 2, width: `${(val / max) * 100}%`, transformOrigin: "left",
                  background: ours ? "rgba(242,178,51,0.45)" : "transparent", border: `1px solid ${ours ? "var(--amber)" : "var(--ink-3)"}`,
                  backgroundImage: ours ? undefined : "repeating-linear-gradient(135deg, rgba(181,205,230,0.28) 0 1px, transparent 1px 5px)" }} />
            </div>
            <span className="num" style={{ fontSize: 13, textAlign: "right", fontWeight: ours ? 700 : 500, color: ours ? "var(--amber)" : "var(--ink)" }}>{fmt(val)}</span>
          </div>
        );
      })}
    </div>
  );
}

function Coverage({ r }: { r: Meta["report"] }) {
  const W = 300, H = 220, P = 34;
  const X = (v: number) => P + ((v - 0.5) / 0.5) * (W - P - 10);
  const Y = (v: number) => H - P - ((v - 0.5) / 0.5) * (H - P - 10);
  const pts = SPLITS.flatMap((s, si) => (["p68", "p80", "p90"] as const).map((k) => ({
    s: si, nom: Number(k.slice(1)) / 100, obs: r[s.k].engine[`cover_${k}`],
  })));
  const marks = ["circle", "square", "diamond"];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: 420 }} role="img" aria-label="Nominal versus observed interval coverage">
      {[0.5, 0.6, 0.7, 0.8, 0.9, 1].map((t) => (
        <g key={t}>
          <line x1={X(t)} x2={X(t)} y1={Y(0.5)} y2={Y(1)} stroke="rgba(214,233,252,0.1)" />
          <line x1={X(0.5)} x2={X(1)} y1={Y(t)} y2={Y(t)} stroke="rgba(214,233,252,0.1)" />
          <text x={X(t)} y={H - P + 14} fill="#86a8cb" fontSize="9" textAnchor="middle">{Math.round(t * 100)}</text>
          <text x={P - 6} y={Y(t) + 3} fill="#86a8cb" fontSize="9" textAnchor="end">{Math.round(t * 100)}</text>
        </g>
      ))}
      <line x1={X(0.5)} y1={Y(0.5)} x2={X(1)} y2={Y(1)} stroke="#b5cde6" strokeDasharray="4 3" />
      <text x={X(0.98)} y={Y(0.99) - 4} fill="#b5cde6" fontSize="9" textAnchor="end">perfect calibration</text>
      {pts.map((p, i) => {
        const cx = X(p.nom), cy = Y(p.obs);
        const c = p.s === 0 ? "#f2b233" : p.s === 1 ? "#e8f1fb" : "#7fb2e5";
        return marks[p.s] === "circle" ? <circle key={i} cx={cx} cy={cy} r={4.5} fill="none" stroke={c} strokeWidth={1.6} />
          : marks[p.s] === "square" ? <rect key={i} x={cx - 4} y={cy - 4} width={8} height={8} fill="none" stroke={c} strokeWidth={1.6} />
          : <rect key={i} x={cx - 4} y={cy - 4} width={8} height={8} fill="none" stroke={c} strokeWidth={1.6} transform={`rotate(45 ${cx} ${cy})`} />;
      })}
      <text x={(W + P) / 2} y={H - 4} fill="#86a8cb" fontSize="9.5" textAnchor="middle" letterSpacing="1">PROMISED COVERAGE %</text>
      <text x={10} y={H / 2} fill="#86a8cb" fontSize="9.5" textAnchor="middle" letterSpacing="1" transform={`rotate(-90 10 ${H / 2})`}>OBSERVED %</text>
    </svg>
  );
}

function Pipeline() {
  const boxes = [
    { x: 10, y: 20, w: 150, t: "4 listing sources", s: "biased witnesses" },
    { x: 10, y: 80, w: 150, t: "OpenStreetMap", s: "390k places · 188k POIs" },
    { x: 10, y: 140, w: 150, t: "AlphaEarth satellite", s: "64-d embeddings, 2024" },
    { x: 210, y: 50, w: 150, t: "Geocode + time-align", s: "gazetteer, roll-forward" },
    { x: 210, y: 120, w: 150, t: "Feature blocks", s: "comps · access · sat · unit" },
    { x: 410, y: 50, w: 150, t: "LightGBM value", s: "monotone in local level" },
    { x: 410, y: 120, w: 150, t: "LightGBM scale", s: "per-property spread" },
    { x: 610, y: 85, w: 150, t: "Conformal calibration", s: "Mondrian by data density" },
    { x: 810, y: 85, w: 150, t: "Lend decision", s: "waive · desk · visit", amber: true },
  ];
  const lines = [[0, 3], [1, 4], [2, 4], [3, 4], [4, 5], [4, 6], [5, 7], [6, 7], [7, 8]];
  const cx = (b: typeof boxes[0]) => [b.x + b.w, b.y + 22];
  const cxIn = (b: typeof boxes[0]) => [b.x, b.y + 22];
  return (
    <svg viewBox="0 0 970 200" width="100%" role="img" aria-label="Engine pipeline">
      {lines.map(([a, b], i) => {
        const [x1, y1] = cx(boxes[a]); const [x2, y2] = cxIn(boxes[b]);
        const mx = (x1 + x2) / 2;
        return (
          <motion.path key={i} d={`M${x1},${y1} H${mx} V${y2} H${x2 - 6}`} fill="none" stroke="#7fb2e5" strokeWidth="1"
            initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 0.9, delay: 0.2 + i * 0.08 }}
            markerEnd="url(#arr)" />
        );
      })}
      <defs><marker id="arr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#b5cde6" /></marker></defs>
      {boxes.map((b, i) => (
        <g key={i}>
          <rect x={b.x} y={b.y} width={b.w} height={44} fill={b.amber ? "#f2b233" : "#0b2a4a"} stroke={b.amber ? "#f2b233" : "#b5cde6"} strokeWidth="1" />
          <text x={b.x + 10} y={b.y + 19} fill={b.amber ? "#071f38" : "#e8f1fb"} fontSize="12.5" fontWeight="600">{b.t}</text>
          <text x={b.x + 10} y={b.y + 34} fill={b.amber ? "#071f38" : "#86a8cb"} fontSize="10.5">{b.s}</text>
        </g>
      ))}
    </svg>
  );
}

export default function EvidenceSheet({ meta }: { meta: Meta | null }) {
  if (!meta) return <p style={{ padding: 24, color: "var(--ink-2)" }}>Loading benchmark…</p>;
  const r = meta.report;
  const e = r.random.engine, b = r.random.locality_median;
  const maxMd = Math.max(...SPLITS.flatMap((s) => METHODS.map((m) => r[s.k][m.k]?.MdAPE ?? 0)));
  const abl = Object.entries(r.random).filter(([k]) => k.startsWith("ablation_"));
  const imp = Object.entries(meta.importance).slice(0, 14);
  const impMax = imp[0]?.[1] ?? 1;
  return (
    <div>
      <div className="sheet-2col" style={{ padding: "28px 28px 22px", borderBottom: "1px solid var(--line-2)", display: "grid", gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 1fr)", gap: 40, alignItems: "end" }}>
        <div>
          <h1 style={{ margin: 0, fontStretch: "70%", fontWeight: 700, fontSize: 52, lineHeight: 1, letterSpacing: "-0.01em" }}>
            Median error {pct(e.MdAPE, 1)}<br /><span style={{ color: "var(--ink-3)" }}>against {pct(b.MdAPE, 1)} for portal-style locality rates</span>
          </h1>
        </div>
        <p style={{ margin: 0, color: "var(--ink-2)", fontSize: 14, maxWidth: "62ch" }}>
          Every method is scored on the same held-out listings, priced on the same time-aligned basis. {pct(e.PPE10, 0)} of engine
          valuations land within 10% of the listed price, against {pct(b.PPE10, 0)} for the locality-median method. Ground truth is
          listing prices, not registered transactions; registry and lender data would replace it in production.
        </p>
      </div>

      <div className="sheet-2col" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", borderBottom: "1px solid var(--line-2)" }}>
        {SPLITS.map((s, i) => (
          <Panel key={s.k} title={s.t} meta={`n = ${r[s.k].engine.n.toLocaleString("en-IN")}`} style={{ borderLeft: i ? "1px solid var(--line-2)" : 0 }}>
            <div style={{ padding: "14px 16px 18px" }}>
              <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--ink-3)" }}>{s.sub}{s.k === "unseen_city" ? `: ${r.holdout_cities.map(title).join(", ")}` : ""}</p>
              <div className="label" style={{ marginBottom: 8 }}>Median absolute % error · lower is better</div>
              <Bars data={r[s.k]} metric="MdAPE" max={maxMd} fmt={(v) => pct(v, 1)} />
              <div className="label" style={{ margin: "16px 0 8px" }}>Within 10% of price · higher is better</div>
              <Bars data={r[s.k]} metric="PPE10" max={1} fmt={(v) => pct(v, 0)} />
            </div>
          </Panel>
        ))}
      </div>

      <div className="sheet-2col" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)", borderBottom: "1px solid var(--line-2)" }}>
        <Panel title="Ranges keep their promise">
          <div style={{ padding: "14px 16px" }}>
            <Coverage r={r} />
            <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--ink-2)", maxWidth: "52ch" }}>
              Conformal calibration: a 90% range should contain the true price 90% of the time.
              Amber circles random holdout, white squares unseen localities, cyan diamonds unseen cities.
            </p>
          </div>
        </Panel>
        <Panel title="What each evidence block adds" style={{ borderLeft: "1px solid var(--line-2)" }}>
          <div style={{ padding: "14px 16px", display: "grid", gap: 10 }}>
            {abl.map(([k, m]) => {
              const d = m.MdAPE - e.MdAPE;
              return (
                <div key={k} style={{ display: "grid", gridTemplateColumns: "1fr auto", borderBottom: "1px solid var(--line)", paddingBottom: 8 }}>
                  <span style={{ fontSize: 13 }}>Without {k.replace("ablation_no_", "").replace("osm", "OpenStreetMap access").replace("comps", "comparables")}</span>
                  <span className="num" style={{ fontSize: 13, color: d > 0 ? "var(--amber)" : "var(--ink-2)" }}>
                    {pct(m.MdAPE, 1)} <span style={{ color: "var(--ink-3)" }}>({d >= 0 ? "+" : "−"}{(Math.abs(d) * 100).toFixed(1)} pts)</span>
                  </span>
                </div>
              );
            })}
            <p style={{ margin: 0, fontSize: 12, color: "var(--ink-3)" }}>Median error on the random holdout when a block is removed and the model retrained.</p>
          </div>
        </Panel>
        <Panel title="Training data" style={{ borderLeft: "1px solid var(--line-2)" }}>
          <div style={{ padding: "14px 16px" }}>
            <div className="num" style={{ fontSize: 40, fontWeight: 700, fontStretch: "75%" }}>{r.data.rows.toLocaleString("en-IN")}</div>
            <div style={{ color: "var(--ink-2)", fontSize: 12.5 }}>geocoded listings · {r.data.cities} cities · {r.data.localities.toLocaleString("en-IN")} localities</div>
            <div style={{ display: "grid", gap: 6, marginTop: 14 }}>
              {Object.entries(r.data.by_source).map(([k, n]) => (
                <div key={k} style={{ display: "grid", gridTemplateColumns: "1fr auto", fontSize: 12.5, borderBottom: "1px solid var(--line)", paddingBottom: 5 }}>
                  <span style={{ color: "var(--ink-2)" }}>{SOURCE_NAMES[k] ?? k}</span><span className="num">{n.toLocaleString("en-IN")}</span>
                </div>
              ))}
            </div>
          </div>
        </Panel>
      </div>

      <div className="sheet-2col" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.6fr)", borderBottom: "1px solid var(--line-2)" }}>
        <Panel title="Strongest signals">
          <div style={{ padding: "12px 16px", display: "grid", gap: 5 }}>
            {imp.map(([k, v], i) => (
              <div key={k} style={{ display: "grid", gridTemplateColumns: "200px 1fr", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 12, color: "var(--ink-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{featureName(k)}</span>
                <motion.div initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true }} transition={{ duration: 0.7, delay: i * 0.04, ease }}
                  style={{ height: 8, width: `${(v / impMax) * 100}%`, transformOrigin: "left", background: k.startsWith("sat") ? "var(--cyan)" : "var(--ink-2)" }} />
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="How a valuation is produced" style={{ borderLeft: "1px solid var(--line-2)" }}>
          <div style={{ padding: "18px 16px" }}><Pipeline /></div>
        </Panel>
      </div>
      <p style={{ margin: 0, padding: "16px 28px 28px", fontSize: 12, color: "var(--ink-3)", maxWidth: "110ch" }}>
        Data: Kaggle public listing datasets (Magicbricks 2023, House Price Prediction Challenge, Housing Prices in Metropolitan Areas of India,
        Bengaluru House Data); © OpenStreetMap contributors; AlphaEarth Foundations Satellite Embedding dataset by Google and Google DeepMind (CC-BY 4.0).
        Basemap © OpenFreeMap / OpenMapTiles. Demonstration prototype; not a regulated valuation.
      </p>
    </div>
  );
}
