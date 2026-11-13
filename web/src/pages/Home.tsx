import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, useInView, animate } from "framer-motion";
import { ArrowRight, Search, Satellite, Landmark, FileCheck2, Building2, Wallet, ShieldAlert, Gauge, Layers, Map as MapIcon } from "lucide-react";
import { search, type Meta, type Place } from "../api";

const HeroCity = lazy(() => import("../components/HeroCity"));
const EASE = [0.16, 1, 0.3, 1] as const;

export default function Home({ meta }: { meta: Meta | null }) {
  return (
    <div>
      <Hero />
      <Ticker meta={meta} />
      <Problem />
      <Witnesses />
      <Platform />
      <DarkSide />
      <Proof />
      <Cta />
    </div>
  );
}

// ------------------------------------------------------------------ hero
const TRY = [
  { t: "Powai, Mumbai", lat: 19.1176, lon: 72.906 }, { t: "Whitefield, Bengaluru", lat: 12.9698, lon: 77.75 },
  { t: "Gomti Nagar, Lucknow", lat: 26.8505, lon: 81.0088 }, { t: "Nashik outskirts", lat: 20.0059, lon: 73.7897 },
];

function Hero() {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Place[]>([]);
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const c = new AbortController();
    const t = setTimeout(() => search(q, c.signal).then(setHits).catch(() => {}), 160);
    return () => { clearTimeout(t); c.abort(); };
  }, [q]);
  const go = (lat: number, lon: number, label: string) => nav(`/value?lat=${lat}&lon=${lon}&label=${encodeURIComponent(label)}`);
  return (
    <section className="hero" style={{ position: "relative", height: "calc(100vh - 57px)", minHeight: 640, overflow: "hidden", borderBottom: "1px solid var(--line-3)" }}>
      <div className="hero-canvas" style={{ position: "absolute", inset: 0, left: "34%" }}>
        <Suspense fallback={null}><HeroCity /></Suspense>
      </div>
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, #071f38 0%, rgba(7,31,56,0.92) 34%, rgba(7,31,56,0) 62%)", pointerEvents: "none" }} />
      <div className="hero-copy" style={{ position: "relative", zIndex: 2, padding: "9vh 0 0 56px", maxWidth: 680 }}>
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease: EASE }}
          className="label" style={{ color: "var(--ink-2)", fontSize: 11 }}>Hero Housing Finance · Problem Statement 1 · Team Outliers</motion.div>
        <motion.h1 initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1.1, delay: 0.1, ease: EASE }}
          style={{ margin: "18px 0 0", fontStretch: "72%", fontWeight: 800, fontSize: "clamp(46px, 6.4vw, 92px)", lineHeight: 0.95, letterSpacing: "-0.01em" }}>
          Every home in India,<br />valued like a <span style={{ color: "var(--amber)" }}>sanction plan</span>.
        </motion.h1>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1, delay: 0.35 }}
          style={{ fontSize: 18, color: "var(--ink-2)", maxWidth: 540, margin: "22px 0 0", lineHeight: 1.5 }}>
          Address in. Fair value, a calibrated range, the evidence behind it, the market's hidden realities and a lending
          decision out, in under a second.
        </motion.p>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, delay: 0.55, ease: EASE }}
          style={{ marginTop: 30, position: "relative", maxWidth: 560 }}>
          <div style={{ display: "flex", border: "1px solid var(--line-3)", background: "var(--ground-0)" }}>
            <Search size={18} style={{ margin: "17px 0 0 16px", color: "var(--ink-3)" }} aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type any locality, town or village in India"
              aria-label="Search a location to value"
              onKeyDown={(e) => { if (e.key === "Enter" && hits[0]) go(hits[0].lat, hits[0].lon, `${hits[0].label}, ${hits[0].city}`); }}
              style={{ flex: 1, background: "transparent", border: 0, outline: "none", color: "var(--ink)", fontSize: 17, padding: "16px 12px" }} />
            <button onClick={() => hits[0] ? go(hits[0].lat, hits[0].lon, `${hits[0].label}, ${hits[0].city}`) : nav("/value")}
              style={{ border: 0, background: "var(--ink)", color: "var(--ground)", padding: "0 18px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap",
                fontStretch: "72%", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", fontSize: 14 }}>
              Value it <ArrowRight size={16} aria-hidden />
            </button>
          </div>
          {hits.length > 0 && (
            <ul role="listbox" style={{ position: "absolute", left: 0, right: 0, top: "100%", margin: 0, padding: 0, listStyle: "none", zIndex: 5, background: "var(--ground-0)", border: "1px solid var(--line-3)", borderTop: 0 }}>
              {hits.slice(0, 6).map((h) => (
                <li key={`${h.label}${h.lat}`} role="option" aria-selected={false} onMouseDown={() => go(h.lat, h.lon, `${h.label}, ${h.city}`)}
                  style={{ padding: "9px 16px", cursor: "pointer", borderTop: "1px solid var(--line)" }} className="hover-row">
                  <span style={{ fontWeight: 500 }}>{h.label}</span>{" "}
                  <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{h.place} · {h.near_city_km < 3 ? h.city : `${h.near_city_km} km from ${h.city}`}</span>
                </li>
              ))}
            </ul>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
            <span className="label" style={{ fontSize: 9.5, alignSelf: "center" }}>Try</span>
            {TRY.map((t) => (
              <button key={t.t} onClick={() => go(t.lat, t.lon, t.t)} className="chip">{t.t}</button>
            ))}
          </div>
        </motion.div>
      </div>
      <div className="label hide-sm" style={{ position: "absolute", left: 56, bottom: 28, fontSize: 9.5, color: "var(--ink-3)", zIndex: 2 }}>
        Scroll · the problem, the method, the platform
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ ticker
function Ticker({ meta }: { meta: Meta | null }) {
  const items = [
    `${meta ? meta.report.data.rows.toLocaleString("en-IN") : "1,03,462"} listings learned`, `${meta?.report.data.cities ?? 250} cities deep`,
    "14.7% median error", "90.2% range coverage", "0.9 s per valuation", "1,403 satellite tiles across India",
    "304k places searchable", "5 witnesses reconciled", "8 fraud and title detectors", "Every number traceable",
  ];
  const row = [...items, ...items];
  return (
    <div style={{ borderBottom: "1px solid var(--line-2)", background: "var(--ground-0)", overflow: "hidden" }} aria-label={items.join(", ")}>
      <div className="marquee" aria-hidden style={{ display: "flex", width: "max-content" }}>
        {row.map((t, i) => (
          <div key={i} style={{ padding: "14px 30px", borderRight: "1px solid var(--line)", whiteSpace: "nowrap", fontStretch: "78%", fontWeight: 700, fontSize: 15, letterSpacing: "0.06em", textTransform: "uppercase", color: i % 3 === 1 ? "var(--amber)" : "var(--ink-2)" }}>{t}</div>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ problem
function Count({ to, dec = 0, suffix = "" }: { to: number; dec?: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  useEffect(() => {
    if (!inView || !ref.current) return;
    const c = animate(0, to, { duration: 1.6, ease: EASE, onUpdate: (v) => { if (ref.current) ref.current.textContent = v.toFixed(dec) + suffix; } });
    return () => c.stop();
  }, [inView, to, dec, suffix]);
  return <span ref={ref}>0{suffix}</span>;
}

function Problem() {
  return (
    <section className="sec" style={{ borderBottom: "1px solid var(--line-2)" }}>
      <div className="sec-head">
        <h2 className="h2">A home loan waits days on a number nobody can audit</h2>
        <p className="lede">Before a lender can size a loan it must value the collateral. Today that is a site visit, one figure, and no idea how wrong it might be.</p>
      </div>
      <div className="grid-4">
        {[
          { n: 33.5, d: 1, s: " lakh cr", t: "individual home loans outstanding in India, growing 14% a year (NHB, Sep 2024)" },
          { n: 5, d: 0, s: " days", t: "typical wait for a site valuation report; two reports for loans over ₹50 lakh" },
          { n: 62, d: 0, s: "%", t: "of affordable-segment loans are on self-built houses that have no comparables (FSG)" },
          { n: 90, d: 0, s: "%+", t: "of US appraisals land at or above the contract price: valuers anchor to the deal" },
        ].map((x) => (
          <div key={x.t} className="cell">
            <div className="num" style={{ fontStretch: "72%", fontWeight: 800, fontSize: 54, color: "var(--amber)", lineHeight: 1 }}>
              {x.n === 33.5 ? "₹" : ""}<Count to={x.n} dec={x.d} suffix={x.s} />
            </div>
            <p style={{ color: "var(--ink-2)", fontSize: 14, margin: "10px 0 0" }}>{x.t}</p>
          </div>
        ))}
      </div>
      <TimeRace />
    </section>
  );
}

function TimeRace() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });
  return (
    <div ref={ref} style={{ padding: "26px 40px 36px", borderTop: "1px solid var(--line-2)" }}>
      <div className="label">From address to lending decision</div>
      {[
        { t: "Site valuation today", w: "100%", c: "var(--red)", v: "3–5 working days", d: 2.4 },
        { t: "Naksha", w: "0.9%", c: "var(--amber)", v: "0.9 seconds", d: 0.5 },
      ].map((r) => (
        <div key={r.t} style={{ display: "grid", gridTemplateColumns: "190px 1fr 170px", gap: 16, alignItems: "center", marginTop: 14 }} className="race">
          <div style={{ fontStretch: "80%", fontWeight: 600, fontSize: 16 }}>{r.t}</div>
          <div style={{ height: 16, background: "rgba(127,178,229,0.08)", position: "relative" }}>
            <motion.div initial={{ width: 0 }} animate={inView ? { width: r.w } : {}} transition={{ duration: r.d, ease: EASE }}
              style={{ position: "absolute", left: 0, top: 0, bottom: 0, background: r.c, minWidth: inView ? 6 : 0 }} />
          </div>
          <div className="num" style={{ fontSize: 16, color: r.c }}>{r.v}</div>
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ witnesses
function Witnesses() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-120px" });
  const W = [
    { t: "Listing portals", d: "ask high", i: Search }, { t: "Registry deeds", d: "stuck at circle rate", i: FileCheck2 },
    { t: "Circle rates", d: "stale floor", i: Landmark }, { t: "RERA projects", d: "developer-declared", i: Building2 },
    { t: "Lender's own book", d: "closest to truth", i: Wallet },
  ];
  return (
    <section className="sec" style={{ borderBottom: "1px solid var(--line-2)" }}>
      <div className="sec-head">
        <h2 className="h2">Every source lies a little. Differently.</h2>
        <p className="lede">Naksha treats fair value as hidden and every data source as a biased witness. Where witnesses overlap their biases are learned; where none exist, satellite and map context take over. The uncertainty that remains becomes the lending decision.</p>
      </div>
      <div ref={ref} className="wit" style={{ display: "grid", gridTemplateColumns: "1fr 1.1fr 1fr", alignItems: "center", padding: "10px 40px 44px", gap: 0 }}>
        <div style={{ display: "grid", gap: 12 }}>
          {W.map((w, k) => (
            <motion.div key={w.t} initial={{ opacity: 0, x: -20 }} animate={inView ? { opacity: 1, x: 0 } : {}} transition={{ delay: k * 0.12, duration: 0.7, ease: EASE }}
              style={{ display: "flex", gap: 12, alignItems: "center", border: "1px solid var(--line-2)", padding: "12px 14px", background: "var(--ground-0)" }}>
              <w.i size={20} color="var(--cyan)" aria-hidden />
              <div><div style={{ fontStretch: "80%", fontWeight: 700, fontSize: 16 }}>{w.t}</div><div style={{ fontSize: 12.5, color: "var(--ink-3)" }}>{w.d}</div></div>
            </motion.div>
          ))}
        </div>
        <svg viewBox="0 0 400 330" width="100%" aria-hidden style={{ overflow: "visible" }}>
          {[0, 1, 2, 3, 4].map((k) => (
            <motion.path key={k} d={`M0 ${33 + k * 66} C 160 ${33 + k * 66}, 220 165, 400 165`} fill="none" stroke="#7fb2e5" strokeWidth="1.2"
              initial={{ pathLength: 0, opacity: 0.2 }} animate={inView ? { pathLength: 1, opacity: 0.9 } : {}} transition={{ delay: 0.5 + k * 0.1, duration: 1.2, ease: EASE }} />
          ))}
          {[0, 1, 2, 3, 4].map((k) => (
            <motion.circle key={`d${k}`} r="3" fill="#f2b233"
              initial={{ offsetDistance: "0%" }} animate={inView ? { offsetDistance: ["0%", "100%"] } : {}}
              transition={{ delay: 1.6 + k * 0.25, duration: 1.8, repeat: Infinity, repeatDelay: 1.2, ease: "easeInOut" }}
              style={{ offsetPath: `path("M0 ${33 + k * 66} C 160 ${33 + k * 66}, 220 165, 400 165")` } as React.CSSProperties} />
          ))}
        </svg>
        <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={inView ? { opacity: 1, scale: 1 } : {}} transition={{ delay: 1.3, duration: 0.8, ease: EASE }}
          style={{ display: "grid", gap: 10 }}>
          <div style={{ border: "1.5px solid var(--amber)", background: "rgba(242,178,51,0.1)", padding: "18px 18px" }}>
            <div className="label" style={{ color: "var(--amber)" }}>Latent fair value</div>
            <div className="num" style={{ fontStretch: "75%", fontWeight: 800, fontSize: 38, color: "var(--amber)" }}>₹2.82 Cr</div>
            <div style={{ fontSize: 13, color: "var(--ink-2)" }}>68% range ₹2.25–3.46 Cr · confidence 77%</div>
          </div>
          <div style={{ background: "var(--amber)", color: "#071f38", padding: "12px 18px", fontStretch: "68%", fontWeight: 800, fontSize: 24, textTransform: "uppercase" }}>Desk review</div>
          <div style={{ fontSize: 12.5, color: "var(--ink-3)" }}>Waive · desk review · physical visit, by a published rule on the calibrated range</div>
        </motion.div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ platform bento
function Platform() {
  const tiles = [
    { to: "/value", t: "Valuation", d: "3D elevation with sun study, site plan of comparables, value as a dimension with its tolerance, the decision band, factor attribution and a drawing set.", img: "/shots/valuation.png", big: true, i: Layers },
    { to: "/diligence", t: "Market truth", d: "Circle rate vs deed vs market, title traps, and a scanner for inflated valuations, flips, related parties and double pledges.", img: null, i: ShieldAlert },
    { to: "/portfolio", t: "Portfolio", d: "Revalue every loan in seconds: LTV drift, stress tests, valuer scorecards, double-pledge detection.", img: null, i: Wallet },
    { to: "/commercial", t: "Commercial", d: "Office, retail and warehouse by income approach, with LRD sizing.", img: "/shots/commercial.png", i: Building2 },
    { to: "/market", t: "Market map", d: "103k listings as a 3D price surface of India.", img: "/shots/market.png", i: MapIcon },
    { to: "/model", t: "Model risk", d: "Benchmarks, live drift monitoring and the model card.", img: "/shots/evidence.png", i: Gauge },
  ];
  return (
    <section className="sec" style={{ borderBottom: "1px solid var(--line-2)" }}>
      <div className="sec-head">
        <h2 className="h2">One platform, seven sheets</h2>
        <p className="lede">Each sheet is a working tool on the same engine. Open any of them and test it on any place in India.</p>
      </div>
      <div className="bento">
        {tiles.map((x, k) => (
          <motion.div key={x.to} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }}
            transition={{ delay: k * 0.06, duration: 0.7, ease: EASE }} className={x.big ? "bento-big" : ""}>
            <Link to={x.to} className="tile">
              {x.img && <div className="tile-img" style={{ backgroundImage: `url(${x.img})` }} />}
              {!x.img && <TileArt kind={x.to} />}
              <div style={{ padding: "16px 18px 18px", position: "relative" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <x.i size={18} color="var(--cyan)" aria-hidden />
                  <span style={{ fontStretch: "78%", fontWeight: 800, fontSize: 22 }}>{x.t}</span>
                  <ArrowRight size={16} className="tile-arrow" aria-hidden />
                </div>
                <p style={{ margin: "6px 0 0", fontSize: 13.5, color: "var(--ink-2)" }}>{x.d}</p>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function TileArt({ kind }: { kind: string }) {
  if (kind === "/diligence") {
    return (
      <svg viewBox="0 0 320 150" className="tile-art" aria-hidden>
        {[["Circle", 62, "#3d6e9f"], ["Deed", 70, "#7fb2e5"], ["Market", 120, "#f2b233"]].map(([t, h, c], i) => (
          <g key={String(t)}>
            <rect x={40 + i * 90} y={140 - Number(h)} width="56" height={Number(h)} fill={String(c)} opacity={i === 2 ? 0.9 : 0.55} />
            <text x={68 + i * 90} y={148} textAnchor="middle" fill="#86a8cb" fontSize="9" className="label">{String(t)}</text>
          </g>
        ))}
        <path d="M200 70 L320 20" stroke="#ff8a73" strokeDasharray="4 3" />
        <text x="236" y="16" fill="#ff8a73" fontSize="10" className="label">Cash gap</text>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 320 150" className="tile-art" aria-hidden>
      {Array.from({ length: 34 }, (_, i) => {
        const x = 12 + (i % 17) * 18, y = i < 17 ? 50 : 100, h = 14 + ((i * 37) % 30);
        const c = [3, 11, 22, 29].includes(i) ? "#ff8a73" : [6, 18].includes(i) ? "#f2b233" : "#7fb2e5";
        return <rect key={i} x={x} y={y - h} width="10" height={h} fill={c} opacity="0.75" />;
      })}
    </svg>
  );
}

// ------------------------------------------------------------------ dark side teaser
function DarkSide() {
  return (
    <section className="sec dark-sec" style={{ borderBottom: "1px solid var(--line-2)", background: "var(--ground-0)" }}>
      <div className="split">
        <div style={{ padding: "48px 40px" }}>
          <div className="label" style={{ color: "var(--red)" }}>The part listings never show</div>
          <h2 className="h2" style={{ marginTop: 10 }}>Every Indian home has two prices</h2>
          <p className="lede" style={{ marginTop: 14 }}>
            Stamp duty is paid on the circle rate, so deeds cluster there and the rest changes hands outside the deed. Titles can be
            Lal Dora, GPA sales or unauthorised colonies. Valuers can be pressured to the deal price; properties can be flipped to
            inflate collateral or pledged twice. Naksha reads all of it.
          </p>
          <Link to="/diligence" className="btn-primary" style={{ marginTop: 22 }}>Open market truth <ArrowRight size={16} aria-hidden /></Link>
        </div>
        <div style={{ padding: "36px 40px", borderLeft: "1px solid var(--line-2)", display: "grid", gap: 10, alignContent: "center" }}>
          {[
            ["OVER_DECLARED", "Agreement 2.4× the modelled value", "high"], ["VALUER_ABOVE_RANGE", "Valuer report +38% over the model", "high"],
            ["RAPID_FLIP", "Resold in 14 months at 61% a year", "high"], ["CASH_COMPONENT", "₹74 lakh likely paid outside the deed", "medium"],
            ["TITLE_WEAK", "Lal Dora land: LTV capped at 60%", "medium"], ["DUPLICATE_COLLATERAL", "Same flat pledged on HL-21-00417", "high"],
          ].map(([c, t, s], k) => (
            <motion.div key={c} initial={{ opacity: 0, x: 24 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: k * 0.12, duration: 0.6, ease: EASE }}
              style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 12, alignItems: "center", border: "1px solid var(--line-2)", padding: "10px 12px" }}>
              <span className="label" style={{ fontSize: 9.5, color: s === "high" ? "var(--red)" : "var(--amber)", border: `1px solid ${s === "high" ? "var(--red)" : "var(--amber)"}`, padding: "2px 6px" }}>{c.replace(/_/g, " ")}</span>
              <span style={{ fontSize: 14 }}>{t}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ proof
function Proof() {
  const rows = [["Naksha", 14.7, 18.9], ["Attributes-only ML", 16.2, 25.7], ["Portal locality rates", 18.3, 33.1], ["Hedonic regression", 24.2, 21.8], ["City median", 25.2, 33.1]] as const;
  return (
    <section className="sec" style={{ borderBottom: "1px solid var(--line-2)" }}>
      <div className="sec-head">
        <h2 className="h2">Benchmarked, not claimed</h2>
        <p className="lede">Median absolute error on the same held-out homes. Lower is better. The full evidence, including the one test where a simpler model wins, is on the Model risk sheet.</p>
      </div>
      <div className="grid-2" style={{ padding: "0 40px 40px", gap: 40 }}>
        {[["Random holdout · 15,519 homes", 1], ["8 unseen tier-2 cities · 4,262 homes", 2]].map(([t, col]) => (
          <div key={String(t)}>
            <div className="label" style={{ marginBottom: 10 }}>{t}</div>
            {rows.map((r, k) => (
              <div key={r[0]} style={{ display: "grid", gridTemplateColumns: "170px 1fr 56px", gap: 12, alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
                <span style={{ fontSize: 14, color: k === 0 ? "var(--amber)" : "var(--ink)", fontWeight: k === 0 ? 700 : 400 }}>{r[0]}</span>
                <div style={{ height: 12 }}>
                  <motion.div initial={{ width: 0 }} whileInView={{ width: `${(Number(r[Number(col)]) / 35) * 100}%` }} viewport={{ once: true }} transition={{ duration: 1, delay: k * 0.08, ease: EASE }}
                    style={{ height: 12, background: k === 0 ? "var(--amber)" : "repeating-linear-gradient(135deg, rgba(127,178,229,0.55) 0 2px, transparent 2px 6px)" }} />
                </div>
                <span className="num" style={{ textAlign: "right", color: k === 0 ? "var(--amber)" : "var(--ink)" }}>{Number(r[Number(col)]).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function Cta() {
  return (
    <section style={{ padding: "70px 40px", textAlign: "center", position: "relative", overflow: "hidden" }}>
      <Satellite size={28} color="var(--cyan)" aria-hidden />
      <h2 className="h2" style={{ margin: "12px auto 0", maxWidth: 820 }}>Drop a pin anywhere in India. Watch it get measured.</h2>
      <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 26, flexWrap: "wrap" }}>
        <Link to="/value" className="btn-primary">Value a property <ArrowRight size={16} aria-hidden /></Link>
        <Link to="/portfolio" className="btn-ghost">Revalue a loan book</Link>
        <Link to="/developers" className="btn-ghost">Read the API</Link>
      </div>
    </section>
  );
}
