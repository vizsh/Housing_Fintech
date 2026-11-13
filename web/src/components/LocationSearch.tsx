import { useEffect, useRef, useState } from "react";
import { MapPin, Search } from "lucide-react";
import { search, type Place } from "../api";
import { inputStyle } from "./ui";

export type Preset = { t: string; lat: number; lon: number; note: string };
type Props = {
  lat: number; lon: number; place: string; presets: Preset[]; hint?: string;
  onPlace: (lat: number, lon: number, label: string) => void;
};

/** Local place search (engine gazetteer, no external geocoder) with preset chips. */
export default function LocationSearch({ lat, lon, place, presets, hint = "or click the site plan", onPlace }: Props) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const t = setTimeout(() => {
      ctrl.current?.abort();
      ctrl.current = new AbortController();
      search(q, ctrl.current.signal).then((h) => { setHits(h); setActive(0); setOpen(true); }).catch(() => {});
    }, 160);
    return () => clearTimeout(t);
  }, [q]);

  const choose = (p: Place) => { onPlace(p.lat, p.lon, `${p.label}, ${p.city}`); setQ(""); setOpen(false); };

  return (
    <div style={{ padding: "16px 18px 14px", borderBottom: "1px solid var(--line)" }}>
      <div className="label">Property location</div>
      <div style={{ position: "relative", marginTop: 8 }}>
        <Search size={15} style={{ position: "absolute", left: 0, top: 9, color: "var(--ink-3)" }} aria-hidden />
        <input
          value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => hits.length && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { setActive((a) => Math.min(a + 1, hits.length - 1)); e.preventDefault(); }
            if (e.key === "ArrowUp") { setActive((a) => Math.max(a - 1, 0)); e.preventDefault(); }
            if (e.key === "Enter" && hits[active]) choose(hits[active]);
          }}
          placeholder="Search a locality, town or village"
          aria-label="Search location" role="combobox" aria-expanded={open} aria-controls="place-list"
          style={{ ...inputStyle, paddingLeft: 24, fontSize: 15 }}
        />
        {open && hits.length > 0 && (
          <ul id="place-list" role="listbox" style={{
            position: "absolute", zIndex: 20, left: 0, right: 0, top: "100%", margin: 0, padding: 0, listStyle: "none",
            background: "var(--ground-0)", border: "1px solid var(--line-3)", maxHeight: 300, overflowY: "auto",
          }}>
            {hits.map((h, i) => (
              <li key={`${h.label}-${h.lat}`} role="option" aria-selected={i === active}
                onMouseDown={() => choose(h)} onMouseEnter={() => setActive(i)}
                style={{ padding: "8px 10px", cursor: "pointer", background: i === active ? "var(--ground-3)" : "transparent", borderBottom: "1px solid var(--line)" }}>
                <div style={{ fontWeight: 500 }}>{h.label}</div>
                <div style={{ fontSize: 11, color: "var(--ink-3)" }}>
                  {h.place} · {h.near_city_km < 3 ? h.city : `${h.near_city_km} km from ${h.city}`}{h.known ? " · listing data" : ""}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, fontSize: 12.5, color: "var(--ink-2)" }}>
        <MapPin size={14} color="var(--amber)" aria-hidden />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{place}</span>
      </div>
      <div className="num" style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>
        {lat.toFixed(5)}°N {lon.toFixed(5)}°E{hint ? ` · ${hint}` : ""}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
        {presets.map((p) => (
          <button key={p.t} onClick={() => onPlace(p.lat, p.lon, p.t)} title={p.note}
            style={{ border: "1px solid var(--line-2)", background: "transparent", padding: "4px 8px", fontSize: 11.5, cursor: "pointer", color: "var(--ink-2)", fontStretch: "85%" }}>
            {p.t}
          </button>
        ))}
      </div>
    </div>
  );
}
