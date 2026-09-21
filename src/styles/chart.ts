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

/**
 * Sequential ramp for the response surface, light to dark in the brand hue.
 * Lightness decreases monotonically so the map still reads when printed in
 * greyscale, which a dissertation eventually will be.
 */
const SURFACE_STOPS: readonly (readonly [number, number, number])[] = [
  [239, 252, 249],
  [168, 236, 223],
  [53, 194, 174],
  [13, 133, 120],
  [18, 63, 59],
];

/** Maps a normalised value in [0, 1] onto the surface ramp. */
export function surfaceColor(tNorm: number): [number, number, number] {
  const clamped = Math.max(0, Math.min(1, tNorm));
  const scaled = clamped * (SURFACE_STOPS.length - 1);
  const i = Math.min(SURFACE_STOPS.length - 2, Math.floor(scaled));
  const f = scaled - i;
  const a = SURFACE_STOPS[i];
  const b = SURFACE_STOPS[i + 1];
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ];
}

export function surfaceCss(tNorm: number): string {
  const [r, g, b] = surfaceColor(tNorm);
  return `rgb(${r}, ${g}, ${b})`;
}
