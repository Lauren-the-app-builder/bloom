// Bloom design tokens — duplicated from BloomApp.jsx so Wren components
// don't need to import from the monolith.
export const c = {
  blush: "#F4B8D4",
  blushLight: "#FBEFEC",
  cream: "#FFFFFF",
  bg: "#FFFFFF",
  paper: "#FDF9F9",
  rose: "#C8B4E8",
  rosedeep: "#C97AAE",
  charcoal: "#5A5266",
  muted: "#9A92A6",
  faint: "#C4B8CE",
  line: "#F0E8EE",
  white: "#FFFFFF",
};

// Wren-specific accents (from brief)
export const wren = {
  nudgeBg: "#fff5f7",
  nudgeBorder: "#f4c0d1",
  nudgeHeader: "#fbeaf0",
  punishBg: "#faeeda",
  punishText: "#ba7517",
};

// Legacy single-band options — kept so older logged sets render with their
// original labels. New sets use BAND_COLORS below.
export const BANDS = [
  { value: "heavy", label: "Heavy band", color: "#7040A0" },
  { value: "medium", label: "Medium band", color: "#C97AAE" },
  { value: "light", label: "Light band", color: "#F4B8D4" },
  { value: "none", label: "No band", color: "#4a8a5a" },
];

// Band-color palette for bands-loaded exercises (e.g. Assisted Pull-Ups).
// Bands stack — a set logs a combo as an array of these names, in any order
// and with repeats allowed. The colors carry no implicit ranking (heavy vs
// light); only rep counts at a given combo signal progression.
export const BAND_COLORS = [
  { name: "green",  hex: "#6FAE7A" },
  { name: "blue",   hex: "#6F94C8" },
  { name: "yellow", hex: "#D4B96A" },
  { name: "red",    hex: "#D08585" },
  { name: "purple", hex: "#A07AC8" },
];

// Lookup hex by name (case-insensitive). Falls back to charcoal if unknown.
export function bandHex(name) {
  const found = BAND_COLORS.find(b => b.name === String(name).toLowerCase());
  return found ? found.hex : "#5A5266";
}

// Canonical key for a combo (sorted, joined). Lets us aggregate "best reps
// at this combo" across order variants (['green','blue'] === ['blue','green']).
export function comboKey(bands) {
  if (!Array.isArray(bands) || bands.length === 0) return "no-band";
  return [...bands].map(b => String(b).toLowerCase()).sort().join("+");
}

// Human label for a combo: "Green ×2 + Blue" style.
export function comboLabel(bands) {
  if (!Array.isArray(bands) || bands.length === 0) return "No band";
  const counts = {};
  for (const b of bands) {
    const k = String(b).toLowerCase();
    counts[k] = (counts[k] || 0) + 1;
  }
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  // Preserve BAND_COLORS order so labels are stable.
  return BAND_COLORS
    .filter(c => counts[c.name])
    .map(c => counts[c.name] > 1 ? `${cap(c.name)} ×${counts[c.name]}` : cap(c.name))
    .join(" + ");
}
