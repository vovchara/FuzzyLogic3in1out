/**
 * Colours the canvas charts draw with. Kept next to the Tailwind theme rather
 * than inside a component: three panels paint on canvas, where no class can
 * reach, and they must agree on what "grid", "marker" or "axis" looks like.
 */
export const CHART = {
  grid: "#eceef0",
  gridStrong: "#d8dce0",
  axis: "#8b959f",
  tick: "#6b757f",
  label: "#434a52",
  /** Current value of a variable: the one thing the eye must find first. */
  marker: "#0f6a61",
  markerSoft: "rgba(15, 106, 97, 0.12)",
  /** Accumulated set / defuzzified result: the outcome, not an input. */
  result: "#1b1f24",
  muted: "#b6bdc4",
} as const;

