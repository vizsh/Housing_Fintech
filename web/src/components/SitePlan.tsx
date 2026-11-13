import { useEffect, useMemo, useState } from "react";
import DeckGL from "@deck.gl/react";
import { FlyToInterpolator, type MapViewState } from "@deck.gl/core";
import { ColumnLayer, LineLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import Map from "react-map-gl/maplibre";
import type { StyleSpecification } from "maplibre-gl";
import { blueprintStyle } from "../mapStyle";
import type { Access, Comp } from "../api";
import { inr, psf } from "../format";

type Props = {
  lat: number; lon: number; comps: Comp[]; access: Access[];
  subjectPpsf?: number; onPick: (lat: number, lon: number) => void;
};

const ACCESS_LABEL: Record<string, string> = {
  metro: "Metro", rail: "Rail", school: "School", hospital: "Hospital", mall: "Mall", park: "Park", airport: "Airport",
};

export default function SitePlan({ lat, lon, comps, access, subjectPpsf, onPick }: Props) {
  const [style, setStyle] = useState<StyleSpecification | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number; c: Comp } | null>(null);
  const [view, setView] = useState<MapViewState>({ longitude: lon, latitude: lat, zoom: 12.5, pitch: 52, bearing: -18 });
  useEffect(() => { blueprintStyle().then(setStyle); }, []);
  useEffect(() => {
    setView((v) => ({ ...v, longitude: lon, latitude: lat, zoom: 13.8, pitch: 54, bearing: -18,
      transitionDuration: 1600, transitionInterpolator: new FlyToInterpolator() }));
  }, [lat, lon]);

  const maxP = Math.max(subjectPpsf ?? 1, ...comps.map((c) => c.ppsf_today));
  const scale = 420 / maxP;
  const near = access.filter((a) => a.km < 4 && a.cat !== "airport");

  const layers = useMemo(() => [
    new LineLayer<Comp>({
      id: "tie", data: comps, getSourcePosition: () => [lon, lat], getTargetPosition: (c) => [c.lon, c.lat],
      getColor: [127, 178, 229, 110], getWidth: 1,
    }),
    new ColumnLayer<Comp>({
      id: "comps", data: comps, diskResolution: 4, radius: 30, extruded: true, angle: 45,
      getPosition: (c) => [c.lon, c.lat], getElevation: (c) => c.ppsf_today * scale,
      getFillColor: [127, 178, 229, 80], getLineColor: [232, 241, 251, 230], wireframe: true, filled: true,
      pickable: true, onHover: (i) => setHover(i.object ? { x: i.x, y: i.y, c: i.object } : null),
      transitions: { getElevation: 900 },
    }),
    new ScatterplotLayer<Access>({
      id: "access", data: near, getPosition: (a) => [a.lon, a.lat], getRadius: 6, radiusUnits: "pixels",
      stroked: true, filled: true, getFillColor: [11, 42, 74, 255], getLineColor: [181, 205, 230, 255], lineWidthMinPixels: 1.5,
    }),
    new TextLayer<Access>({
      id: "access-t", data: near, getPosition: (a) => [a.lon, a.lat],
      getText: (a) => `${(ACCESS_LABEL[a.cat] ?? a.cat).toUpperCase()} ${a.km.toFixed(1)} KM`,
      getSize: 10.5, getColor: [181, 205, 230, 255], getPixelOffset: [10, 0], getTextAnchor: "start",
      fontFamily: "Archivo Variable, Archivo, sans-serif", fontWeight: 600, background: true,
      getBackgroundColor: [7, 31, 56, 235], backgroundPadding: [4, 2],
    }),
    new ScatterplotLayer({
      id: "subject-ring", data: [0], getPosition: () => [lon, lat], getRadius: 1000, radiusUnits: "meters",
      stroked: true, filled: false, getLineColor: [242, 178, 51, 160], lineWidthMinPixels: 1,
    }),
    new ColumnLayer({
      id: "subject", data: [0], diskResolution: 4, radius: 44, extruded: true, angle: 45,
      getPosition: () => [lon, lat], getElevation: () => (subjectPpsf ?? maxP * 0.5) * scale,
      getFillColor: [242, 178, 51, 170], getLineColor: [255, 210, 122, 255], wireframe: true,
      transitions: { getElevation: 900 }, updateTriggers: { getElevation: [subjectPpsf, scale] },
    }),
  ], [comps, near, lat, lon, subjectPpsf, scale, maxP]);

  return (
    <div style={{ position: "absolute", inset: 0, cursor: "crosshair" }}>
      <DeckGL
        viewState={view} onViewStateChange={({ viewState }) => setView(viewState as MapViewState)} controller={{ dragRotate: true }}
        layers={layers} getCursor={() => "crosshair"}
        onClick={(info) => { if (!info.object && info.coordinate) onPick(info.coordinate[1], info.coordinate[0]); }}
      >
        {style && <Map mapStyle={style} attributionControl={{ compact: true }} />}
      </DeckGL>
      {hover && (
        <div style={{
          position: "absolute", left: hover.x + 14, top: hover.y - 10, pointerEvents: "none", background: "var(--ground-0)",
          border: "1px solid var(--line-3)", padding: "8px 10px", fontSize: 12, minWidth: 190, zIndex: 3,
        }}>
          <div className="label" style={{ color: "var(--ink-2)" }}>{hover.c.society || hover.c.locality || "Listing"}</div>
          <div className="num" style={{ fontSize: 16, fontWeight: 600, marginTop: 2 }}>{psf(hover.c.ppsf_today)}</div>
          <div style={{ color: "var(--ink-3)" }}>{hover.c.bhk} BHK · {hover.c.area_sqft} sq ft · {hover.c.km} km</div>
          <div style={{ color: "var(--ink-3)" }}>Indicates {inr(hover.c.indicated_value)} for the subject</div>
        </div>
      )}
    </div>
  );
}
