import type { GenerationStat } from "../../training/genetic";
import { CHART } from "../../styles/chart";
import { formatTick } from "../../utils/format";
import { drawAxes, drawGrid, preparePlot } from "./plot";

const PAD = { left: 40, right: 8, top: 8, bottom: 20 } as const;

/**
 * Objective of the best chromosome and the population mean per generation —
 * the app's version of MATLAB's "Best f(x) / Mean f(x)" plot (Рис. 4.11).
 * `totalGenerations` fixes the x axis while a run is still filling it in.
 */
export function drawConvergence(
  canvas: HTMLCanvasElement,
  history: readonly GenerationStat[],
  totalGenerations: number,
): void {
  const finite = history.flatMap((g) => [g.best, g.mean]).filter(Number.isFinite);
  const yMax = finite.length > 0 ? Math.max(...finite) * 1.05 : 1;
  const xMax = Math.max(1, totalGenerations, history.length - 1);
  const plot = preparePlot(canvas, PAD, [0, xMax], [0, yMax], { width: 280, height: 140 });
  if (!plot) return;
  const { ctx } = plot;

  drawGrid(plot, 4, 3);
  drawAxes(plot);

  ctx.fillStyle = CHART.tick;
  ctx.font = "10px ui-monospace, monospace";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (const v of [0, yMax / 2, yMax]) ctx.fillText(formatTick(Number(v.toFixed(3))), plot.left - 4, plot.y(v));
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (const v of [0, Math.round(xMax / 2), xMax]) ctx.fillText(String(v), plot.x(v), plot.bottom + 4);

  const line = (pick: (g: GenerationStat) => number, color: string, width: number) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    let started = false;
    for (const g of history) {
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
