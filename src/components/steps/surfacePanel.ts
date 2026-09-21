import { q } from "../../dom";
import type { FuzzySystem, FuzzyVariable } from "../../fuzzy/types";
import { CHART, surfaceCss } from "../../styles/chart";
import { preparePlot } from "../chart/plot";
import { formatTick, formatValue } from "../../utils/format";
import { liveRender } from "../chart/live";
import type { AppShellCtx, Unmount } from "../context";

/**
 * Samples per axis. Squared and times the number of pairs, this is how many
 * inferences a full redraw of the step costs, and the routing controller needs
 * ~73 µs for each of them. These surfaces are piecewise-smooth plateaus, so a
 * finer grid buys no visible detail at the size the maps are drawn — 56 and 32
 * are indistinguishable on screen and 32 is four times cheaper.
 */
const GRID = 32;
/** Grid rows computed per animation frame, so a redraw never blocks input. */
const ROWS_PER_FRAME = 4;

const PAD = { left: 40, right: 16, top: 20, bottom: 32 } as const;

type Matrix = (number | null)[][];

/**
 * Response surface over one pair of inputs, with the rest held at their
 * current values. A single inference answers "what does the controller say
 * here"; this answers "how does it behave", which is the question a rule base
 * is actually judged on. Both crosshair lines are cuts drawn by the transfer
 * curves above: the horizontal one is the x-input's curve, the vertical one
 * the y-input's. The map only displays — a click on it would move two inputs
 * at once, which is not what pointing at a region should do.
 *
 * Colour is keyed to the output variable's declared range, never to what this
 * particular slice happens to span. A scale that moved with the inputs would
 * make the same shade mean a different number from one moment to the next,
 * and it would hide the very thing worth seeing: how much of its available
 * range the controller actually uses.
 */
export function mountSurfacePanel(
  container: HTMLElement,
  ctx: AppShellCtx,
  system: FuzzySystem,
  xId: string,
  yId: string,
): Unmount {
  const xVar = varOf(system, xId);
  const yVar = varOf(system, yId);

  container.innerHTML = `
    <p class="text-[11px] font-semibold text-graphite-600 leading-4 h-8 overflow-hidden flex items-center gap-1 flex-wrap">
      <span data-i18n="${xVar.nameKey}"></span>
      <span class="text-graphite-300">×</span>
      <span data-i18n="${yVar.nameKey}"></span>
    </p>
    <p class="text-[10px] text-graphite-400 h-4">
      <span data-i18n="response.fixedAt"></span>
      <span class="font-mono tabular-nums" data-fixed></span>
    </p>
    <canvas class="w-full h-[210px] mt-0.5 rounded-md bg-white"></canvas>
  `;

  const canvas = q<HTMLCanvasElement>(container, "canvas");
  const fixedEl = q(container, "[data-fixed]");
  const held = system.inputs.filter((v) => v.id !== xId && v.id !== yId);


  // The surface only depends on the held inputs: moving the two plotted ones
  // just moves the crosshair. Caching on that signature means a drag on this
  // map's own axes is a repaint, and only the maps that hold the moved input
  // fixed pay for a recompute.
  let cache: { key: string; matrix: Matrix } | null = null;
  let frameId: number | null = null;
  let generation = 0;

  function signature(): string {
    const { inputs } = ctx.store.getState();
    return held.map((v) => `${v.id}=${inputs[v.id] ?? v.defaultValue}`).join("|");
  }

  function update(): void {
    const { inputs } = ctx.store.getState();
    fixedEl.textContent = held
      .map((v) => `${v.id} = ${formatValue(inputs[v.id] ?? v.defaultValue, v.range)}`)
      .join(", ");

    const key = signature();
    if (cache?.key === key) {
      paint(cache.matrix);
      return;
    }
    compute(key);
  }

  function compute(key: string): void {
    if (frameId !== null) cancelAnimationFrame(frameId);
    const run = ++generation;
    const engine = ctx.getEngine(system.id);
    const base = { ...ctx.store.getState().inputs };
    const matrix: Matrix = [];

    const step = (): void => {
      if (run !== generation) return;
      for (let n = 0; n < ROWS_PER_FRAME && matrix.length < GRID; n++) {
        const row: (number | null)[] = [];
        const yValue = yVar.range[0] + (span(yVar) * matrix.length) / (GRID - 1);
        for (let i = 0; i < GRID; i++) {
          const xValue = xVar.range[0] + (span(xVar) * i) / (GRID - 1);
          row.push(engine.outputOnly({ ...base, [xId]: xValue, [yId]: yValue }));
        }
        matrix.push(row);
      }
      paint(matrix);
      if (matrix.length < GRID) {
        frameId = requestAnimationFrame(step);
        return;
      }
      frameId = null;
      cache = { key, matrix };
    };
    step();
  }

  function paint(matrix: Matrix): void {
    drawSurface(canvas, xVar, yVar, matrix, ctx.store.getState().inputs, system.output.range);
  }

  // liveRender coalesces the redraw requests; the row-by-row compute below
  // keeps its own frame chain, which `generation` cancels when inputs move on.
  const stopLive = liveRender({ store: ctx.store, observe: canvas, render: update });

  return () => {
    generation++;
    if (frameId !== null) cancelAnimationFrame(frameId);
    stopLive();
  };
}

function drawSurface(
  canvas: HTMLCanvasElement,
  xVar: FuzzyVariable,
  yVar: FuzzyVariable,
  matrix: Matrix,
  inputs: Readonly<Record<string, number>>,
  scale: readonly [number, number],
): void {
  const plot = preparePlot(canvas, PAD, xVar.range, yVar.range, { width: 300, height: 210 });
  if (!plot) return;
  const { ctx: ctx2d, plotWidth: plotW, plotHeight: plotH } = plot;
  const [oMin, oMax] = scale;
  const oSpan = oMax - oMin;
  const cellW = plotW / GRID;
  const cellH = plotH / GRID;

  for (let row = 0; row < matrix.length; row++) {
    const y = plot.bottom - (row + 1) * cellH;
    for (let col = 0; col < GRID; col++) {
      const value = matrix[row][col];
      // A cell no rule covers is left blank rather than coloured: the surface
      // must not imply an answer the inference never produced.
      ctx2d.fillStyle =
        value === null ? CHART.grid : surfaceCss((value - oMin) / oSpan);
      ctx2d.fillRect(plot.left + col * cellW, y, cellW + 0.5, cellH + 0.5);
    }
  }

  ctx2d.strokeStyle = CHART.axis;
  ctx2d.lineWidth = 1.5;
  ctx2d.strokeRect(plot.left, plot.top, plotW, plotH);

  const cx = plot.x(inputs[xVar.id] ?? xVar.defaultValue);
  const cy = plot.y(inputs[yVar.id] ?? yVar.defaultValue);

  // Both lines are cuts a transfer curve plots, so both are drawn solid. The
  // white halo keeps them legible over the dark end of the ramp.
  drawHaloLine(ctx2d, plot.left, cy, plot.right, cy);
  drawHaloLine(ctx2d, cx, plot.top, cx, plot.bottom);

  ctx2d.beginPath();
  ctx2d.fillStyle = "#ffffff";
  ctx2d.arc(cx, cy, 4, 0, Math.PI * 2);
  ctx2d.fill();
  ctx2d.beginPath();
  ctx2d.fillStyle = CHART.marker;
  ctx2d.arc(cx, cy, 2.5, 0, Math.PI * 2);
  ctx2d.fill();

  ctx2d.fillStyle = CHART.tick;
  ctx2d.font = "9px ui-monospace, monospace";
  ctx2d.textAlign = "center";
  for (const v of [xVar.range[0], xVar.range[1]]) {
    ctx2d.fillText(formatTick(v), plot.x(v), plot.bottom + 12);
  }
  ctx2d.textAlign = "right";
  ctx2d.textBaseline = "middle";
  for (const v of [yVar.range[0], yVar.range[1]]) {
    ctx2d.fillText(formatTick(v), plot.left - 5, plot.y(v));
  }
  ctx2d.textBaseline = "alphabetic";

  ctx2d.fillStyle = CHART.label;
  ctx2d.font = "600 9px ui-monospace, monospace";
  ctx2d.textAlign = "left";
  ctx2d.fillText(yVar.id, plot.left, plot.top - 7);
  ctx2d.textAlign = "right";
  ctx2d.fillText(xVar.id, plot.right, plot.bottom + 25);
}

function drawHaloLine(
  ctx2d: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): void {
  ctx2d.save();
  ctx2d.strokeStyle = "rgba(255,255,255,0.85)";
  ctx2d.lineWidth = 3.5;
  ctx2d.beginPath();
  ctx2d.moveTo(x0, y0);
  ctx2d.lineTo(x1, y1);
  ctx2d.stroke();

  ctx2d.strokeStyle = CHART.marker;
  ctx2d.lineWidth = 1.5;
  ctx2d.beginPath();
  ctx2d.moveTo(x0, y0);
  ctx2d.lineTo(x1, y1);
  ctx2d.stroke();
  ctx2d.restore();
}

function varOf(system: FuzzySystem, id: string): FuzzyVariable {
  const found = system.inputs.find((v) => v.id === id);
  if (!found) throw new Error(`Unknown input: ${id}`);
  return found;
}

function span(v: FuzzyVariable): number {
  return v.range[1] - v.range[0];
}

