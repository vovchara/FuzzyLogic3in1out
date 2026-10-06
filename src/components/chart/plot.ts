import { CHART } from "../../styles/chart";

export interface Padding {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

/**
 * A canvas prepared for drawing, plus the mapping from data to pixels. Three
 * charts in this app paint on canvas; before this existed each carried its own
 * copy of the device-pixel-ratio dance and its own padding constants, which
 * meant three coordinate conventions to keep in step by hand.
 */
export interface Plot {
  readonly ctx: CanvasRenderingContext2D;
  /** Canvas size in CSS pixels. */
  readonly width: number;
  readonly height: number;
  /** Edges of the drawing area, inside the padding. */
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly plotWidth: number;
  readonly plotHeight: number;
  /** Domain value to pixel, per axis. */
  x(value: number): number;
  y(value: number): number;
}

/**
 * Sizes the canvas for the current device pixel ratio, clears it and returns
 * the plot geometry. Null when the 2D context is unavailable, which callers
 * treat as "nothing to draw".
 */
export function preparePlot(
  canvas: HTMLCanvasElement,
  pad: Padding,
  xDomain: readonly [number, number],
  yDomain: readonly [number, number],
  fallback: { width: number; height: number },
): Plot | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const rect = canvas.getBoundingClientRect();
  const width = rect.width || fallback.width;
  const height = rect.height || fallback.height;

  const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
    canvas.width = width * dpr;
    canvas.height = height * dpr;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const [xMin, xMax] = xDomain;
  const [yMin, yMax] = yDomain;
  const xSpan = xMax - xMin || 1;
  const ySpan = yMax - yMin || 1;

  return {
    ctx,
    width,
    height,
    left: pad.left,
    top: pad.top,
    right: pad.left + plotWidth,
    bottom: pad.top + plotHeight,
    plotWidth,
    plotHeight,
    x: (value) => pad.left + ((value - xMin) / xSpan) * plotWidth,
    y: (value) => pad.top + plotHeight - ((value - yMin) / ySpan) * plotHeight,
  };
}

/**
 * Evenly spaced axis ticks on a round step (1, 2, 2.5 or 5 × 10ⁿ), about
 * `target` intervals across the domain — what MATLAB's axes do. The domain
 * ends are not added: a domain like [0, 45] ends between two ticks.
 */
export function niceTicks(range: readonly [number, number], target = 5): number[] {
  const [min, max] = range;
  const raw = (max - min) / target;
  if (!(raw > 0)) return [min];
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((x) => x >= raw - 1e-12) ?? 10 * mag;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step - 1e-9) * step; v <= max + 1e-9; v += step) {
    ticks.push(Number(v.toFixed(10)));
  }
  return ticks;
}

/**
 * Faint reference grid across the plot area. Lines go at `xTicks` / `yTicks`
 * when given (domain values), so they meet the axis labels; otherwise the
 * plot is split into `columns` and `rows`. A line on the y axis is skipped:
 * it would only blend with it. The right edge keeps one — nothing else
 * marks it.
 */
export function drawGrid(
  plot: Plot,
  columns = 4,
  rows = 4,
  xTicks?: readonly number[],
  yTicks?: readonly number[],
): void {
  const { ctx } = plot;
  ctx.strokeStyle = CHART.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  const xs = xTicks
    ? [...xTicks.map((v) => plot.x(v)), plot.right]
    : Array.from({ length: columns }, (_, i) => plot.left + (plot.plotWidth * (i + 1)) / columns);
  for (const x of xs) {
    if (x <= plot.left + 0.5) continue;
    ctx.moveTo(x, plot.top);
    ctx.lineTo(x, plot.bottom);
  }
  const ys = yTicks
    ? yTicks.map((v) => plot.y(v))
    : Array.from({ length: rows + 1 }, (_, i) => plot.top + (plot.plotHeight * i) / rows);
  for (const y of ys) {
    ctx.moveTo(plot.left, y);
    ctx.lineTo(plot.right, y);
  }
  ctx.stroke();
}

/**
 * The two axes, drawn over the grid as separate strokes rather than one
 * polyline: a shared path would add a miter join at the corner and thicken it.
 */
export function drawAxes(plot: Plot): void {
  const { ctx } = plot;
  ctx.strokeStyle = CHART.axis;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(plot.left, plot.bottom);
  ctx.lineTo(plot.right, plot.bottom);
  ctx.moveTo(plot.left, plot.top);
  ctx.lineTo(plot.left, plot.bottom);
  ctx.stroke();
}
