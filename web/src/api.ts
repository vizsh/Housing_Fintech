export const API = (import.meta.env.VITE_API as string) || "http://127.0.0.1:8000";

export type Place = { label: string; place: string; city: string; near_city_km: number; lat: number; lon: number; known: boolean };

export type ValueInput = {
  lat: number; lon: number; area_sqft: number; area_basis: "carpet" | "builtup" | "super"; bhk: number;
  ptype: string; floor: number | null; total_floors: number | null; transaction: "resale" | "new";
  furnishing: string; bathrooms: number | null; parking: number | null; covered_parking: number | null;
  amenities: string[]; age_years: number | null; loan_amount: number | null; label?: string | null;
  facing: string; super_area?: number | null;
};

export type Step = { group: string; log_effect: number; pct: number; drivers: [string, number][]; from: number; to: number };
export type Comp = { lat: number; lon: number; km: number; geocode?: string; locality: string | null; society: string | null; bhk: number;
  area_sqft: number; source: string; listed_price: number; ppsf_today: number; indicated_value: number };
export type Access = { cat: string; km: number; name: string; lat: number; lon: number };
export type Flag = { code: string; text: string };

export type Valuation = {
  input: ValueInput; city: string; city_km: number; value: number; ppsf: number; area_carpet_sqft: number;
  range: { p68: [number, number]; p80: [number, number]; p90: [number, number] };
  fsd: number; confidence: number; density_bin: number;
  comps_signal: { knn_value: number; n_within_1km: number; n_within_3km: number; d10_km: number };
  waterfall: { base: number; steps: Step[] };
  witnesses: { source: string; value: number }[];
  facing_effects?: { facing: string; value: number; pct: number }[];
  comparables: Comp[]; access: Access[];
  cost_approach: { structure: number; land: number; spec_rate: number; age_years: number; builtup_sqft: number };
  satellite: { available: boolean; vector: number[] | null };
  flags: Flag[];
  decision: { band: "green" | "amber" | "red"; action: string; detail: string };
  lending: { lendable_value: number; distress_value: number; ltv_cap: number; max_loan: number; loan_amount: number;
    ltv: number; two_valuations_required: boolean; note: string };
  assumptions: Record<string, number | string>;
  thresholds?: { waive_fsd: number; desk_fsd: number };
  latency_ms: number;
};

export type Metrics = { n: number; MdAPE: number; MAPE: number; PPE10: number; PPE20: number; [k: string]: number };
export type Meta = {
  assumptions: Record<string, number | string>;
  report: {
    random: Record<string, Metrics>; unseen_locality: Record<string, Metrics>; unseen_city: Record<string, Metrics>;
    holdout_cities: string[]; data: { rows: number; cities: number; localities: number; by_source: Record<string, number> };
  };
  importance: Record<string, number>;
  cities: { city: string; lat: number; lon: number; n: number }[];
};
export type Hex = { h: string; ppsf: number; n: number; city: string };

async function j<T>(r: Response): Promise<T> {
  if (!r.ok) {
    let msg = `Request failed (${r.status})`;
    try { msg = (await r.json()).detail ?? msg; } catch { /* keep default */ }
    throw new Error(msg);
  }
  return r.json() as Promise<T>;
}

export const getMeta = () => fetch(`${API}/api/meta`).then(j<Meta>);
export const search = (q: string, signal?: AbortSignal) =>
  fetch(`${API}/api/search?q=${encodeURIComponent(q)}`, { signal }).then(j<Place[]>);
export const valueProperty = (body: ValueInput) =>
  fetch(`${API}/api/value`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(j<Valuation>);
export type Asset = "office" | "retail" | "warehouse";
export type IncomeInput = {
  lat: number; lon: number; asset: Asset; area_sqft: number; rent: number | null; occupancy: number | null;
  escalation: number | null; wale: number; tenant: "A" | "B" | "C"; cap_rate: number | null; loan_amount: number | null; label?: string | null;
};
export type Flow = { year: number; noi: number; rent: number; pv: number; void: boolean; leased: boolean };
export type IncomeValuation = {
  input: IncomeInput; city: string; city_km: number; asset: Asset; value: number; ppsf: number;
  range: { inner: [number, number]; outer: [number, number] }; fsd: number; direct: number; dcf: number;
  dcf_parts: { pv_flows: number; pv_exit: number; exit_value: number };
  income: { gri: number; vacancy: number; egi: number; opex: number; noi: number; rent: number; occupancy: number; opex_ratio: number; escalation: number };
  market_rent: { value: number; benchmark: number; source: string; location_index: number; gap: number | null };
  rates: { cap: number; discount: number; exit_cap: number; base_cap: number; tenant_spread: number; tier2_spread: number };
  flows: Flow[]; sensitivity: { caps: number[]; rent_mult: number[]; grid: number[][] };
  residential_check: { value: number; ppsf: number; ratio: number | null };
  lending: { tenor_years: number; rate: number; dscr_min: number; ltv_cap: number; loan_by_dscr: number; loan_by_ltv: number;
    max_loan: number; loan_amount: number; emi: number; dscr: number; ltv: number; two_valuations_required: boolean };
  tenant: string; flags: Flag[]; decision: { band: "green" | "amber" | "red"; action: string; detail: string }; latency_ms: number;
};
export const valueIncome = (body: IncomeInput) =>
  fetch(`${API}/api/income`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(j<IncomeValuation>);

export const getSurface =(res: number, city?: string) =>
  fetch(`${API}/api/surface?res=${res}${city ? `&city=${encodeURIComponent(city)}` : ""}`).then(j<Hex[]>);
