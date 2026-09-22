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
 * Faint reference grid across the plot area. The first vertical line is
 * skipped: it would sit exactly under the y axis and only blend with it. The
 * last one is not — nothing else marks the right edge of the plot.
 */
export function drawGrid(plot: Plot, columns = 4, rows = 4): void {
  const { ctx } = plot;
  ctx.strokeStyle = CHART.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i <= columns; i++) {
    const x = plot.left + (plot.plotWidth * i) / columns;
    ctx.moveTo(x, plot.top);
    ctx.lineTo(x, plot.bottom);
  }
  for (let i = 0; i <= rows; i++) {
    const y = plot.top + (plot.plotHeight * i) / rows;
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
