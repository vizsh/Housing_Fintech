import type { StyleSpecification, LayerSpecification } from "maplibre-gl";

/**
 * OpenFreeMap (OSM vector tiles, no key) re-inked as a blueprint: water as deep ground,
 * roads as white technical line, buildings as faint outlines, labels in pale cyan.
 */
const SRC = "https://tiles.openfreemap.org/styles/positron";
let cached: Promise<StyleSpecification> | null = null;

const C = {
  ground: "#0b2a4a",
  water: "#061a30",
  park: "#0e3a52",
  road: "rgba(232,241,251,0.34)",
  roadMinor: "rgba(232,241,251,0.13)",
  building: "rgba(127,178,229,0.10)",
  buildingLine: "rgba(127,178,229,0.35)",
  label: "#b5cde6",
  halo: "#0b2a4a",
  boundary: "rgba(232,241,251,0.35)",
};

function reink(layer: LayerSpecification): LayerSpecification | null {
  const id = layer.id;
  const l = JSON.parse(JSON.stringify(layer)) as LayerSpecification & { paint?: Record<string, unknown>; layout?: Record<string, unknown> };
  const p = (l.paint = l.paint ?? {});
  if (l.type === "background") p["background-color"] = C.ground;
  else if (l.type === "fill") {
    if (/water/.test(id)) p["fill-color"] = C.water;
    else if (/park|wood|grass|landcover|landuse_park/.test(id)) { p["fill-color"] = C.park; p["fill-opacity"] = 0.5; }
    else if (/building/.test(id)) { p["fill-color"] = C.building; p["fill-outline-color"] = C.buildingLine; }
    else { p["fill-color"] = C.ground; p["fill-opacity"] = 0; }
    delete p["fill-pattern"];
  } else if (l.type === "line") {
    if (/water|river|waterway/.test(id)) p["line-color"] = "rgba(127,178,229,0.35)";
    else if (/boundary|admin/.test(id)) { p["line-color"] = C.boundary; p["line-dasharray"] = [3, 2]; }
    else if (/motorway|trunk|primary|major/.test(id)) p["line-color"] = C.road;
    else if (/rail/.test(id)) { p["line-color"] = "rgba(232,241,251,0.4)"; }
    else p["line-color"] = C.roadMinor;
    delete p["line-gradient"];
  } else if (l.type === "symbol") {
    if (l.layout && "icon-image" in l.layout) delete l.layout["icon-image"];
    if (l.layout && "text-field" in l.layout) l.layout["text-field"] = ["coalesce", ["get", "name:en"], ["get", "name_en"], ["get", "name:latin"], ["get", "name"]];
    p["text-color"] = C.label;
    p["text-halo-color"] = C.halo;
    p["text-halo-width"] = 1.4;
  } else if (l.type === "fill-extrusion") return null;
  return l;
}

export function blueprintStyle(): Promise<StyleSpecification> {
  if (!cached) {
    cached = fetch(SRC)
      .then((r) => r.json())
      .then((s: StyleSpecification) => ({
        ...s,
        layers: s.layers.map(reink).filter(Boolean) as LayerSpecification[],
      }))
      .catch(() => ({
        version: 8,
        sources: {},
        layers: [{ id: "bg", type: "background", paint: { "background-color": C.ground } }],
      }) as StyleSpecification);
  }
  return cached;
}
