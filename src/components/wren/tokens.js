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

// Resistance band options for assisted pull-ups (heaviest → lightest = weakest → strongest)
export const BANDS = [
  { value: "heavy", label: "Heavy band", color: "#7040A0" },
  { value: "medium", label: "Medium band", color: "#C97AAE" },
  { value: "light", label: "Light band", color: "#F4B8D4" },
  { value: "none", label: "No band", color: "#4a8a5a" },
];
