import { useState } from "react";
import { Link } from "react-router-dom";
import { Copy, Loader2, Send } from "lucide-react";
import { API, v1Create } from "../api";

const SAMPLE = {
  application_id: "HHF-APP-240117",
  lat: 19.1176, lon: 72.906, area_sqft: 850, area_basis: "carpet", bhk: 2, ptype: "flat",
  floor: 9, total_floors: 22, transaction: "resale", facing: "East",
  legal_status: "freehold", factors: ["metro_walk"], declared_value: 31000000, loan_amount: 22000000,
};

const ENDPOINTS = [
  ["POST", "/api/v1/valuations", "Create a valuation for a loan application. Returns value, range, decision, lending terms, integrity score and flags, with an id."],
  ["GET", "/api/v1/valuations/{id}", "Fetch a stored valuation; ?full=true returns the full evidence (waterfall, comparables, reality check)."],
  ["POST", "/api/value", "Full valuation for the console: everything above plus 3D, drawing-set and evidence payloads."],
  ["POST", "/api/income", "Commercial income approach: direct capitalisation, ten-year DCF, sensitivity and LRD sizing."],
  ["GET", "/api/portfolio", "Revalue the demo loan book. POST /api/portfolio/upload with {csv} revalues your own."],
  ["POST", "/api/report/narrative", "Narrative sections for a valuation report; numbers locked to the valuation."],
  ["GET", "/api/monitor", "Drift (PSI), routing mix, latency and the model card for model-risk governance."],
  ["GET", "/api/search?q=", "Place search over 304k OSM names; no external geocoder."],
];

export default function Developers() {
  const [body, setBody] = useState(JSON.stringify(SAMPLE, null, 2));
  const [key, setKey] = useState("");
  const [out, setOut] = useState<string>("");
  const [id, setId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ms, setMs] = useState<number | null>(null);
  const send = async () => {
    setBusy(true); setOut(""); setId(null);
    const t = performance.now();
    try {
      const r = await v1Create(JSON.parse(body), key || undefined);
      setMs(Math.round(performance.now() - t));
      setOut(JSON.stringify(r, null, 2)); setId(String(r.id));
    } catch (e) { setOut(e instanceof Error ? `Error: ${e.message}` : "Request failed"); } finally { setBusy(false); }
  };
  const curl = `curl -X POST ${API}/api/v1/valuations \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: $NAKSHA_KEY" \\
  -d '${JSON.stringify({ application_id: "HHF-APP-240117", lat: 19.1176, lon: 72.906, area_sqft: 850, bhk: 2 })}'`;
  const py = `import requests

r = requests.post("${API}/api/v1/valuations",
                  headers={"X-API-Key": NAKSHA_KEY},
                  json={"application_id": app.id, "lat": app.lat, "lon": app.lon,
                        "area_sqft": app.carpet_sqft, "bhk": app.bhk,
                        "declared_value": app.agreement_value})
v = r.json()
if v["decision"]["band"] == "green":
    los.waive_site_visit(app.id, valuation_id=v["id"])`;
  return (
    <div>
      <section className="sec" style={{ borderBottom: "1px solid var(--line-2)" }}>
        <div className="sec-head" style={{ paddingTop: 44 }}>
          <div className="label">Developers</div>
          <h1 className="h1">One call from the loan-origination system</h1>
          <p className="lede">The LOS posts the address and attributes when an application lands; Naksha returns a value, a calibrated range, the routing decision, lendable terms and integrity flags in under a second, and keeps the record for audit. Set <code>NAKSHA_API_KEYS</code> on the engine to require keys.</p>
        </div>
      </section>
      <section className="split" style={{ borderBottom: "1px solid var(--line-2)" }}>
        <div style={{ padding: "22px 28px" }}>
          <div className="label">Request · POST /api/v1/valuations</div>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} spellCheck={false} aria-label="Request body"
            style={{ width: "100%", height: 330, marginTop: 10, background: "var(--ground-0)", color: "var(--ink)", border: "1px solid var(--line-2)", padding: 12, fontFamily: "ui-monospace, Consolas, monospace", fontSize: 12.5, resize: "vertical" }} />
          <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
            <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="X-API-Key (optional in the demo)" aria-label="API key"
              style={{ flex: 1, minWidth: 200, background: "transparent", border: "1px solid var(--line-2)", color: "var(--ink)", padding: "9px 10px" }} />
            <button className="btn-primary" onClick={send} disabled={busy}>{busy ? <Loader2 size={15} className="spin" aria-hidden /> : <Send size={15} aria-hidden />} Send request</button>
          </div>
        </div>
        <div style={{ padding: "22px 28px", borderLeft: "1px solid var(--line-2)" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span className="label">Response {ms != null && <span style={{ color: "var(--green)" }}>· 201 · {ms} ms</span>}</span>
            {id && <Link to={`/report?id=${id}`} style={{ color: "var(--cyan)", fontSize: 13 }}>Open the report for {id} →</Link>}
          </div>
          <pre style={{ height: 380, overflow: "auto", marginTop: 10, background: "var(--ground-0)", border: "1px solid var(--line-2)", padding: 12, fontSize: 12, color: "var(--ink-2)" }}>
            {out || "Send the request to see the response."}
          </pre>
        </div>
      </section>
      <section className="sec" style={{ borderBottom: "1px solid var(--line-2)" }}>
        <div className="sec-head"><h2 className="h2">Endpoints</h2></div>
        <div style={{ padding: "0 40px 30px" }}>
          {ENDPOINTS.map(([m, p, d]) => (
            <div key={p} className="ep" style={{ display: "grid", gridTemplateColumns: "60px 300px 1fr", gap: 14, padding: "10px 0", borderBottom: "1px solid var(--line)", alignItems: "baseline" }}>
              <span className="label" style={{ color: m === "GET" ? "var(--green)" : "var(--amber)" }}>{m}</span>
              <code style={{ fontSize: 13 }}>{p}</code>
              <span style={{ fontSize: 13.5, color: "var(--ink-2)" }}>{d}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="split">
        {[["curl", curl], ["Python, inside the LOS", py]].map(([t, c], i) => (
          <div key={t} style={{ padding: "22px 28px 30px", borderLeft: i ? "1px solid var(--line-2)" : 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span className="label">{t}</span>
              <button onClick={() => navigator.clipboard.writeText(c)} style={{ background: "transparent", border: 0, color: "var(--ink-3)", cursor: "pointer" }} aria-label={`Copy ${t} sample`}><Copy size={14} aria-hidden /></button>
            </div>
            <pre style={{ marginTop: 10, background: "var(--ground-0)", border: "1px solid var(--line-2)", padding: 14, fontSize: 12.5, overflowX: "auto", color: "var(--ink-2)" }}>{c}</pre>
          </div>
        ))}
      </section>
    </div>
  );
}
