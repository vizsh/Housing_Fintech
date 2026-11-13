/** Architecture-practice maths: orientation, solar geometry, unit layout, RERA areas, construction stages. */

export const FACINGS = [
  { k: "North", s: "N", az: 0 }, { k: "North - East", s: "NE", az: 45 }, { k: "East", s: "E", az: 90 },
  { k: "South - East", s: "SE", az: 135 }, { k: "South", s: "S", az: 180 }, { k: "South -West", s: "SW", az: 225 },
  { k: "West", s: "W", az: 270 }, { k: "North - West", s: "NW", az: 315 },
] as const;
export const facingAz = (k: string) => FACINGS.find((f) => f.k === k)?.az ?? 90;
export const facingShort = (k: string) => FACINGS.find((f) => f.k === k)?.s ?? "—";

// ---------------------------------------------------------------- sun
const rad = Math.PI / 180;
export const SUN_DATES = [
  { k: "jun", t: "21 Jun", doy: 172, note: "Summer solstice" },
  { k: "mar", t: "21 Mar", doy: 80, note: "Equinox" },
  { k: "dec", t: "21 Dec", doy: 355, note: "Winter solstice" },
] as const;

/** Sun altitude and azimuth (degrees, azimuth clockwise from north) at an IST clock time. */
export function sunPosition(lat: number, lon: number, doy: number, hourIST: number) {
  const B = (360 / 365) * (doy - 81) * rad;
  const decl = 23.44 * Math.sin(B) * rad;
  const eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B); // minutes
  const solar = hourIST + ((lon - 82.5) * 4 + eot) / 60;
  const H = (solar - 12) * 15 * rad;
  const phi = lat * rad;
  const alt = Math.asin(Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(H));
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(decl) * Math.cos(phi)) / rad + 180;
  return { alt: alt / rad, az: (az + 360) % 360 };
}

/** Hours of direct sun on a facade whose outward normal points to `normalAz`, plus sunrise/sunset. */
export function facadeSun(lat: number, lon: number, doy: number, normalAz: number) {
  let hours = 0, first: number | null = null, last: number | null = null, rise: number | null = null, set: number | null = null;
  for (let t = 4; t <= 20; t += 1 / 12) {
    const p = sunPosition(lat, lon, doy, t);
    if (p.alt > 0) {
      rise ??= t; set = t;
      if (Math.cos((p.az - normalAz) * rad) > 0.05) { hours += 1 / 12; first ??= t; last = t; }
    }
  }
  return { hours, first, last, rise, set };
}
export const clock = (h: number | null) => h == null ? "—" : `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.round((h % 1) * 60) % 60).padStart(2, "0")}`;

// ---------------------------------------------------------------- RERA areas
export const BASIS = { carpet: 1.0, builtup: 0.88, super: 0.78 } as const;
/** RERA s.2(k) carpet; built-up adds walls (~12%) and balcony; super adds the common-area loading. */
export function areaStatement(area: number, basis: keyof typeof BASIS, bhk: number, superAgreed?: number | null) {
  const carpet = area * BASIS[basis];
  const walls = carpet * 0.12;
  const balcony = Math.round(Math.min(160, 30 + bhk * 25));
  const builtup = carpet + walls + balcony;
  const superStd = carpet / BASIS.super;
  const sup = superAgreed && superAgreed > 0 ? superAgreed : superStd;
  const loading = sup / carpet - 1;
  return { carpet, walls, balcony, builtup, super: sup, loading, agreed: !!(superAgreed && superAgreed > 0), loadingHigh: loading > 0.4 };
}

// ---------------------------------------------------------------- unit plan
export type Room = { name: string; x: number; y: number; w: number; d: number; wet?: boolean; door?: "n" | "s" | "e" | "w" };
/** Lays out a flat inside a W×D plate (metres, y grows away from the entrance/front). */
export function planFor(carpetSqft: number, bhk: number, baths: number) {
  const m2 = carpetSqft * 0.0929;
  const n = Math.max(1, Math.min(5, Math.round(bhk)));
  const nb = Math.max(1, Math.min(n + 1, Math.round(baths || n)));
  const W = Math.sqrt(m2 * 1.55);
  const D = m2 / W;
  const front = D * 0.44, pass = Math.min(1.2, D * 0.1), back = D - front - pass;
  const rooms: Room[] = [];
  const kw = Math.max(2.2, W * 0.3);
  rooms.push({ name: "Living · dining", x: 0, y: 0, w: W - kw, d: front, door: "s" });
  rooms.push({ name: "Kitchen", x: W - kw, y: 0, w: kw, d: front * 0.72, wet: true, door: "w" });
  rooms.push({ name: "Utility", x: W - kw, y: front * 0.72, w: kw, d: front * 0.28, wet: true });
  rooms.push({ name: "Passage", x: 0, y: front, w: W, d: pass });
  const bw = Math.min(1.7, W * 0.16);
  const wetCols = Math.min(nb, n);
  const bedW = (W - wetCols * bw) / n;
  let x = 0;
  for (let i = 0; i < n; i++) {
    rooms.push({ name: i === 0 ? "Master bed" : `Bed ${i + 1}`, x, y: front + pass, w: bedW, d: back, door: "n" });
    x += bedW;
    if (i < wetCols) {
      rooms.push({ name: i === 0 ? "Toilet" : "Bath", x, y: front + pass, w: bw, d: back * 0.62, wet: true, door: "n" });
      rooms.push({ name: "Wardrobe", x, y: front + pass + back * 0.62, w: bw, d: back * 0.38 });
      x += bw;
    }
  }
  return { W, D, rooms, balcony: { x: 0, y: -1.4, w: (W - kw) * 0.7, d: 1.4 } };
}

// ---------------------------------------------------------------- construction-linked plan
export type Stage = { k: string; t: string; cum: number; slabs: number };
/** Typical construction-linked payment plan; RERA s.13 caps collection at 10% before the sale agreement. */
export function clpStages(totalFloors: number): Stage[] {
  const n = Math.max(1, Math.round(totalFloors));
  const s: Stage[] = [
    { k: "book", t: "Booking", cum: 0.10, slabs: 0 },
    { k: "agree", t: "Agreement for sale", cum: 0.20, slabs: 0 },
    { k: "plinth", t: "Plinth", cum: 0.30, slabs: 0 },
  ];
  const groups = Math.min(n, 6);
  for (let g = 1; g <= groups; g++) {
    const slabs = Math.round((g / groups) * n);
    s.push({ k: `slab${g}`, t: slabs === n ? `Roof slab (${n})` : `Slab ${slabs}`, cum: 0.30 + 0.30 * (g / groups), slabs });
  }
  s.push({ k: "brick", t: "Brickwork, internal plaster", cum: 0.70, slabs: n });
  s.push({ k: "finish", t: "Flooring, plumbing, electrical", cum: 0.80, slabs: n });
  s.push({ k: "lift", t: "Lifts, external finish", cum: 0.90, slabs: n });
  s.push({ k: "oc", t: "Possession with OC", cum: 1.0, slabs: n });
  return s;
}
