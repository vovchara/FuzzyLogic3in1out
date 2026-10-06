import { CHART } from "../../styles/chart";
import { formatTick } from "../../utils/format";
import { drawAxes, drawGrid, niceTicks, preparePlot } from "./plot";

const PAD = { left: 36, right: 8, top: 16, bottom: 20 } as const;

export interface ConvergencePoint {
  readonly generation: number;
  readonly best: number;
  readonly mean: number;
}

/**
 * Best and population-mean error per generation — the app's version of
 * MATLAB's convergence plot (Рис. 4.11). `totalGenerations` fixes the x axis
 * while a run is still filling it in; the axis titles come in translated.
 */
export function drawConvergence(
  canvas: HTMLCanvasElement,
  points: readonly ConvergencePoint[],
  totalGenerations: number,
  titles: { readonly y: string; readonly x: string },
): void {
  const finite = points.flatMap((g) => [g.best, g.mean]).filter(Number.isFinite);
  const peak = finite.length > 0 ? Math.max(...finite) : 1;
  // The top of the axis is the first round tick at or above the curve, so the
  // highest label sits at the top edge rather than somewhere below the peak.
  const base = niceTicks([0, peak], 4);
  const step = base.length > 1 ? base[1] - base[0] : peak;
  const yMax = Math.ceil(peak / step - 1e-9) * step;
  const yTicks = Array.from({ length: Math.round(yMax / step) + 1 }, (_, i) => Number((i * step).toFixed(10)));
  const xMax = Math.max(1, totalGenerations, points.length - 1);
  const plot = preparePlot(canvas, PAD, [0, xMax], [0, yMax || 1], { width: 280, height: 140 });
  if (!plot) return;
  const { ctx } = plot;

  drawGrid(plot, 4, 4, niceTicks([0, xMax], 4), yTicks);
  drawAxes(plot);

  ctx.fillStyle = CHART.tick;
  ctx.font = "10px ui-monospace, monospace";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (const v of yTicks) ctx.fillText(formatTick(v), plot.left - 4, plot.y(v));
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (const v of niceTicks([0, xMax], 4)) ctx.fillText(String(v), plot.x(v), plot.bottom + 4);

  ctx.fillStyle = CHART.label;
  ctx.font = "600 10px ui-sans-serif, system-ui";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(titles.y, 2, 0);
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  ctx.fillText(titles.x, plot.right, plot.bottom - 2);

  const line = (pick: (g: ConvergencePoint) => number, color: string, width: number) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    let started = false;
    for (const g of points) {
      const y = pick(g);
      if (!Number.isFinite(y)) continue;
      if (started) ctx.lineTo(plot.x(g.generation), plot.y(y));
      else ctx.moveTo(plot.x(g.generation), plot.y(y));
      started = true;
    }
    ctx.stroke();
  };
  line((g) => g.mean, CHART.muted, 1.5);
  line((g) => g.best, CHART.marker, 2);
}
