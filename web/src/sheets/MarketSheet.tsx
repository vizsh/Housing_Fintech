import { useEffect, useMemo, useState } from "react";
import Map from "react-map-gl/maplibre";
import type { StyleSpecification } from "maplibre-gl";
import DeckGL from "@deck.gl/react";
import { FlyToInterpolator, type MapViewState } from "@deck.gl/core";
import { H3HexagonLayer } from "@deck.gl/geo-layers";
import { blueprintStyle } from "../mapStyle";
import { getSurface, type Hex, type Meta } from "../api";
import { psf, title } from "../format";

// blueprint ramp: deep cyan -> pale ink -> amber at the top of the market
const RAMP: [number, number, number][] = [[31, 84, 140], [62, 128, 190], [127, 178, 229], [200, 225, 248], [242, 178, 51]];
function color(t: number): [number, number, number, number] {
  const x = Math.max(0, Math.min(0.9999, t)) * (RAMP.length - 1);
  const i = Math.floor(x), f = x - i;
  const a = RAMP[i], b = RAMP[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, 215];
}

export default function MarketSheet({ meta, active }: { meta: Meta | null; active: boolean }) {
  const [style, setStyle] = useState<StyleSpecification | null>(null);
  const [city, setCity] = useState<string | null>(null);
  const [hex, setHex] = useState<Hex[]>([]);
  const [hover, setHover] = useState<{ x: number; y: number; h: Hex } | null>(null);
  const INDIA: MapViewState = { longitude: 80.5, latitude: 21.5, zoom: 4.65, pitch: 55, bearing: 0 };
  const [view, setView] = useState<MapViewState>(INDIA);
  useEffect(() => { blueprintStyle().then(setStyle); }, []);
  useEffect(() => { getSurface(city ? 8 : 4, city ?? undefined).then(setHex).catch(() => setHex([])); }, [city]);

  // slow orbit until the user takes over
  const [spin, setSpin] = useState(true);
  useEffect(() => {
    if (!spin || !active) return;
    let raf = 0;
    const tick = () => { setView((v) => (v.transitionDuration ? v : { ...v, bearing: ((v.bearing ?? 0) + 0.04) % 360 })); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [spin, active]);

  const sorted = useMemo(() => hex.map((h) => h.ppsf).sort((a, b) => a - b), [hex]);
  const q = (p: number) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 1;
  const lo = q(0.03), hi = q(0.97);
  const layer = useMemo(() => new H3HexagonLayer<Hex>({
    id: "surface", data: hex, getHexagon: (d) => d.h, extruded: true, coverage: 0.88,
    elevationScale: city ? 0.15 : 9, getElevation: (d) => Math.min(d.ppsf, hi * 1.3),
    getFillColor: (d) => color((Math.log(d.ppsf) - Math.log(lo)) / (Math.log(hi) - Math.log(lo))),
    getLineColor: [232, 241, 251, 120], wireframe: true, lineWidthMinPixels: 0.5, pickable: true,
    onHover: (i) => setHover(i.object ? { x: i.x, y: i.y, h: i.object } : null),
    transitions: { getElevation: { duration: 1200 } },
    updateTriggers: { getFillColor: [lo, hi], getElevation: [hi] },
  }), [hex, lo, hi, city]);

  const fly = (c: { city: string; lat: number; lon: number } | null) => {
    setCity(c?.city ?? null);
    const target = c ? { longitude: c.lon, latitude: c.lat, zoom: 10.4, pitch: 58, bearing: view.bearing ?? 0 } : { ...INDIA, bearing: view.bearing ?? 0 };
    setView({ ...target, transitionDuration: 2200, transitionInterpolator: new FlyToInterpolator(),
      onTransitionEnd: () => setView((v) => ({ ...v, transitionDuration: 0 })) } as MapViewState);
  };
  const cities = (meta?.cities ?? []).filter((c) => c.n >= 600).slice(0, 18);

  return (
    <div style={{ position: "relative", height: "calc(100vh - 57px)" }} onPointerDown={() => setSpin(false)}>
      <DeckGL viewState={view} onViewStateChange={({ viewState }) => setView(viewState as MapViewState)} controller layers={[layer]}>
        {style && <Map mapStyle={style} attributionControl={{ compact: true }} />}
      </DeckGL>

      <div style={{ position: "absolute", left: 24, top: 24, width: 330, background: "rgba(7,31,56,0.9)", border: "1px solid var(--line-2)" }}>
        <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--line)" }}>
          <h1 style={{ margin: 0, fontStretch: "72%", fontWeight: 700, fontSize: 30, lineHeight: 1.05 }}>
            {city ? `${title(city)} price surface` : "India price surface"}
          </h1>
          <p style={{ margin: "6px 0 0", color: "var(--ink-2)", fontSize: 12.5 }}>
            Median listing rate per hexagon, {city ? "~0.7 km²" : "~1,800 km²"} cells. Height and colour both encode ₹/sq ft.
            {meta && ` ${meta.report.data.rows.toLocaleString("en-IN")} geocoded listings, ${meta.report.data.cities} cities.`}
          </p>
        </div>
        <div style={{ padding: "12px 18px 14px" }}>
          <div className="label" style={{ marginBottom: 8 }}>Scale</div>
          <div style={{ height: 10, background: `linear-gradient(90deg, ${RAMP.map((c) => `rgb(${c.join(",")})`).join(",")})` }} />
          <div className="num" style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: "var(--ink-2)", marginTop: 4 }}>
            <span>{psf(lo)}</span><span>{psf(hi)}</span>
          </div>
        </div>
        <div style={{ padding: "4px 18px 16px", display: "flex", flexWrap: "wrap", gap: 6 }}>
          <button onClick={() => fly(null)} style={chip(!city)}>All India</button>
          {cities.map((c) => <button key={c.city} onClick={() => fly(c)} style={chip(city === c.city)}>{title(c.city)}</button>)}
        </div>
      </div>

      {hover && (
        <div style={{ position: "absolute", left: hover.x + 14, top: hover.y - 10, pointerEvents: "none", background: "var(--ground-0)", border: "1px solid var(--line-3)", padding: "8px 10px" }}>
          <div className="label" style={{ color: "var(--ink-2)" }}>{hover.h.city}</div>
          <div className="num" style={{ fontSize: 17, fontWeight: 600 }}>{psf(hover.h.ppsf)}</div>
          <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{hover.h.n} listings in cell</div>
        </div>
      )}
    </div>
  );
}

const chip = (on: boolean) => ({
  border: "1px solid", borderColor: on ? "var(--ink)" : "var(--line-2)", background: on ? "var(--ink)" : "transparent",
  color: on ? "var(--ground)" : "var(--ink-2)", padding: "4px 9px", fontSize: 12, cursor: "pointer", fontStretch: "85%",
} as const);
