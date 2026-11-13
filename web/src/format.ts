/** Indian currency formatting: lakh / crore. */
export function inr(v: number, digits = 2): string {
  if (!isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1e7) return `₹${(v / 1e7).toFixed(digits)} Cr`;
  if (a >= 1e5) return `₹${(v / 1e5).toFixed(digits >= 2 ? 1 : digits)} L`;
  return `₹${Math.round(v).toLocaleString("en-IN")}`;
}

export function inrParts(v: number): { num: string; unit: string } {
  if (v >= 1e7) return { num: (v / 1e7).toFixed(2), unit: "Cr" };
  return { num: (v / 1e5).toFixed(1), unit: "Lakh" };
}

export const pct = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`;
export const signedPct = (v: number, d = 1) => `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toFixed(d)}%`;
export const psf = (v: number) => `₹${Math.round(v).toLocaleString("en-IN")}/sq ft`;
export const title = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

export const SOURCE_NAMES: Record<string, string> = {
  mb2023: "Magicbricks listings 2023",
  metro: "Six-metro listings 2020",
  hppc: "Listing challenge 2020",
  blr: "Bengaluru listings 2017",
};

export const FEATURE_NAMES: Record<string, string> = {
  knn_wmean: "Local price level (distance-weighted comps)", knn_med10: "Median of 10 nearest comps",
  knn_std: "Dispersion of nearby prices", knn_d1: "Distance to nearest comp", knn_d10: "Distance to 10th comp",
  knn_n1km: "Comps within 1 km", knn_n3km: "Comps within 3 km", d_centre: "Distance to city centre",
  log_area: "Carpet area", area_sqft: "Carpet area", area_per_bhk: "Area per bedroom", bhk: "Bedrooms",
  floor: "Floor", total_floors: "Building height", floor_ratio: "Relative floor", source: "Listing source",
  transaction: "New vs resale", ptype: "Property type", bathrooms: "Bathrooms", furnishing: "Furnishing",
  d_metro: "Distance to metro", d_rail: "Distance to rail station", d_airport: "Distance to airport",
  d_school: "Distance to school", d_hospital: "Distance to hospital", d_mall: "Distance to mall",
  d_park: "Distance to park", d_commercial: "Distance to commercial land", d_industrial: "Distance to industrial land",
  d_college: "Distance to college", lat: "Latitude", lon: "Longitude", geo: "Geocode precision",
  amenity_score: "Project amenities", posted_by: "Posted by", ownership: "Ownership", parking: "Parking",
};
export function featureName(k: string): string {
  if (FEATURE_NAMES[k]) return FEATURE_NAMES[k];
  if (k.startsWith("sat")) return `Satellite embedding ${Number(k.slice(3)) + 1}`;
  const m = k.match(/^n(1|3)_(.+)$/);
  if (m) return `${title(m[2])}s within ${m[1]} km`;
  return title(k.replace(/_/g, " "));
}
