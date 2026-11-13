import { lazy, Suspense, useEffect, useState } from "react";
import { BrowserRouter, NavLink, Route, Routes, useLocation, Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { getMeta, type Meta } from "./api";

const Home = lazy(() => import("./pages/Home"));
const ValuationSheet = lazy(() => import("./sheets/ValuationSheet"));
const Diligence = lazy(() => import("./pages/Diligence"));
const Portfolio = lazy(() => import("./pages/Portfolio"));
const IncomeSheet = lazy(() => import("./sheets/IncomeSheet"));
const MarketSheet = lazy(() => import("./sheets/MarketSheet"));
const ModelPage = lazy(() => import("./pages/ModelPage"));
const Developers = lazy(() => import("./pages/Developers"));
const Report = lazy(() => import("./pages/Report"));

export const NAV: { to: string; t: string; code: string; blurb: string }[] = [
  { to: "/value", t: "Valuation", code: "VAL", blurb: "Value any home in India, explained and routed" },
  { to: "/diligence", t: "Market truth", code: "DUE", blurb: "Two prices, title traps and fraud signals" },
  { to: "/portfolio", t: "Portfolio", code: "PRT", blurb: "Revalue the whole loan book overnight" },
  { to: "/commercial", t: "Commercial", code: "CRE", blurb: "Income approach and LRD sizing" },
  { to: "/market", t: "Market map", code: "MKT", blurb: "3D price surface of India" },
  { to: "/model", t: "Model risk", code: "EVD", blurb: "Benchmarks, drift and the model card" },
  { to: "/developers", t: "API", code: "API", blurb: "Plug into the loan-origination system" },
];

export default function App() {
  return (
    <BrowserRouter>
      <Site />
    </BrowserRouter>
  );
}

function Site() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const loc = useLocation();
  useEffect(() => { getMeta().then(setMeta).catch(() => setMeta(null)); }, []);
  useEffect(() => { if (!loc.hash) window.scrollTo({ top: 0 }); }, [loc.pathname, loc.hash]);
  const workspace = ["/value", "/commercial", "/market", "/portfolio"].includes(loc.pathname);
  return (
    <div style={{ minHeight: "100%" }}>
      <SiteNav meta={meta} />
      <main>
        <Suspense fallback={<div className="label" style={{ padding: 40, color: "var(--ink-3)" }}>Drawing the sheet…</div>}>
          <Routes>
            <Route path="/" element={<Home meta={meta} />} />
            <Route path="/value" element={<ValuationSheet />} />
            <Route path="/diligence" element={<Diligence />} />
            <Route path="/portfolio" element={<Portfolio />} />
            <Route path="/commercial" element={<IncomeSheet />} />
            <Route path="/market" element={<MarketSheet meta={meta} active />} />
            <Route path="/model" element={<ModelPage meta={meta} />} />
            <Route path="/developers" element={<Developers />} />
            <Route path="/report" element={<Report />} />
            <Route path="*" element={<Home meta={meta} />} />
          </Routes>
        </Suspense>
      </main>
      {!workspace && loc.pathname !== "/report" && <Footer />}
    </div>
  );
}

function SiteNav({ meta }: { meta: Meta | null }) {
  const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  return (
    <header className="no-print app-header" style={{
      position: "sticky", top: 0, zIndex: 50, height: 57, display: "grid", gridTemplateColumns: "auto 1fr auto",
      alignItems: "stretch", borderBottom: "1px solid var(--line-3)", background: "rgba(7,31,56,0.94)", backdropFilter: "blur(6px)",
    }}>
      <Link to="/" style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 20px", borderRight: "1px solid var(--line-2)", color: "inherit", textDecoration: "none" }}>
        <Mark />
        <div>
          <div style={{ fontStretch: "68%", fontWeight: 800, fontSize: 21, letterSpacing: "0.16em", lineHeight: 1 }}>NAKSHA</div>
          <div className="label hide-sm" style={{ fontSize: 9, marginTop: 3 }}>Collateral valuation engine · India</div>
        </div>
      </Link>
      <nav aria-label="Site" className="site-nav" style={{ display: "flex", overflowX: "auto" }}>
        {NAV.map((s) => (
          <NavLink key={s.to} to={s.to}
            style={({ isActive }) => ({
              borderRight: "1px solid var(--line-2)", padding: "0 16px", display: "flex", alignItems: "center", gap: 9, whiteSpace: "nowrap",
              background: isActive ? "var(--ground)" : "transparent", color: isActive ? "var(--ink)" : "var(--ink-3)", textDecoration: "none",
              boxShadow: isActive ? "inset 0 -2px 0 var(--ink)" : "none",
            })}>
            {({ isActive }) => (
              <>
                <span className="label" style={{ fontSize: 9, color: isActive ? "var(--cyan)" : "var(--ink-3)" }}>{s.code}</span>
                <span style={{ fontStretch: "80%", fontWeight: 600, fontSize: 14, letterSpacing: "0.03em" }}>{s.t}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="hdr-meta" style={{ display: "flex", alignItems: "stretch" }}>
        {[["Valuation date", today], ["Model", meta ? `${meta.report.data.cities} cities` : "offline"]].map(([k, v]) => (
          <div key={k} style={{ padding: "10px 16px", borderLeft: "1px solid var(--line-2)" }}>
            <div className="label" style={{ fontSize: 9 }}>{k}</div>
            <div className="num" style={{ marginTop: 2, fontSize: 13, color: meta || k !== "Model" ? "var(--ink)" : "var(--red)" }}>{v}</div>
          </div>
        ))}
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="no-print" style={{ borderTop: "1px solid var(--line-3)", background: "var(--ground-0)" }}>
      <div className="foot-grid" style={{ display: "grid", gridTemplateColumns: "1.3fr repeat(3, 1fr)" }}>
        <div style={{ padding: "28px", borderRight: "1px solid var(--line-2)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}><Mark /><span style={{ fontStretch: "68%", fontWeight: 800, fontSize: 22, letterSpacing: "0.16em" }}>NAKSHA</span></div>
          <p style={{ color: "var(--ink-2)", fontSize: 13, maxWidth: 360, marginTop: 12 }}>
            AI collateral valuation for Indian housing finance. Built by Team Outliers for Hero Housing Finance Problem Statement 1, IIT Bombay E-Cell.
          </p>
          <p className="label" style={{ fontSize: 9.5, marginTop: 14, color: "var(--ink-3)" }}>Jeevesh Bodhani · Rishit Lahoti · Shreyas Kale · Swayam Panchal</p>
        </div>
        {[NAV.slice(0, 3), NAV.slice(3, 6), NAV.slice(6)].map((col, i) => (
          <div key={i} style={{ padding: "28px 24px", borderRight: i < 2 ? "1px solid var(--line-2)" : 0 }}>
            {col.map((s) => (
              <Link key={s.to} to={s.to} style={{ display: "block", color: "var(--ink)", textDecoration: "none", marginBottom: 14 }}>
                <span style={{ fontStretch: "80%", fontWeight: 600, fontSize: 15 }}>{s.t}</span> <ArrowUpRight size={13} color="var(--cyan)" aria-hidden />
                <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{s.blurb}</div>
              </Link>
            ))}
            {i === 2 && (
              <a href="https://github.com/vizsh/Housing_Fintech" style={{ display: "block", color: "var(--ink)", textDecoration: "none" }}>
                <span style={{ fontStretch: "80%", fontWeight: 600, fontSize: 15 }}>Source code</span> <ArrowUpRight size={13} color="var(--cyan)" aria-hidden />
                <div style={{ fontSize: 12, color: "var(--ink-3)" }}>Engine, console, benchmark and docs</div>
              </a>
            )}
          </div>
        ))}
      </div>
    </footer>
  );
}

/** Mark: a plot outline with a dimensioned datum, drawn in two strokes. */
export function Mark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 30 30" aria-hidden>
      <rect x="4.5" y="8.5" width="21" height="17" fill="none" stroke="#e8f1fb" strokeWidth="1.5" />
      <path d="M4.5 8.5 L15 2.5 L25.5 8.5" fill="none" stroke="#e8f1fb" strokeWidth="1.5" />
      <rect x="11.5" y="15.5" width="7" height="10" fill="#f2b233" />
    </svg>
  );
}
