import { q } from "../../dom";
import type { FuzzySystem, FuzzyVariable } from "../../fuzzy/types";
import { CHART } from "../../styles/chart";
import { drawAxes, drawGrid, preparePlot } from "../chart/plot";
import { formatTick, formatValue } from "../../utils/format";
import { liveRender } from "../chart/live";
import type { AppShellCtx, Unmount } from "../context";

// Roughly two samples per drawn pixel: past that the extra inferences only
// cost time. Unlike the surfaces these are recomputed on every input change.
const SWEEP_STEPS = 120;

const PAD = { left: 40, right: 16, top: 20, bottom: 32 } as const;

/**
 * Transfer curve: one input swept across its whole domain while the others
 * hold their current values. Every surface that plots this input draws the
 * same cut as one of its crosshair lines. It shows what a single point of the
 * inference cannot: where the controller is sensitive, where it saturates on
 * a plateau, and where the rule base leaves a gap.
 */
export function mountTransferPanel(
  container: HTMLElement,
  ctx: AppShellCtx,
  system: FuzzySystem,
  sweptId: string,
): Unmount {
  const swept = varOf(system, sweptId);
  const held = system.inputs.filter((v) => v.id !== sweptId);

  container.innerHTML = `
    <p class="text-[11px] font-semibold text-graphite-600 leading-4 h-8 overflow-hidden" data-i18n="${swept.nameKey}"></p>
    <p class="text-[10px] text-graphite-400 h-4">
      <span data-i18n="response.fixedAt"></span>
      <span class="font-mono tabular-nums" data-fixed></span>
    </p>
    <canvas class="w-full h-[210px] mt-0.5 rounded-md bg-white"></canvas>
  `;

  const canvas = q<HTMLCanvasElement>(container, "canvas");
  const fixedEl = q(container, "[data-fixed]");


  function render(): void {
    const { inputs, evaluation } = ctx.store.getState();
    const engine = ctx.getEngine(system.id);

    fixedEl.textContent = held
      .map((v) => `${v.id} = ${formatValue(inputs[v.id] ?? v.defaultValue, v.range)}`)
      .join(", ");

    const samples: (number | null)[] = [];
    for (let i = 0; i <= SWEEP_STEPS; i++) {
      const x = swept.range[0] + ((swept.range[1] - swept.range[0]) * i) / SWEEP_STEPS;
      samples.push(engine.outputOnly({ ...inputs, [swept.id]: x }));
    }

    draw(canvas, system, swept, samples, {
      x: inputs[swept.id] ?? swept.defaultValue,
      y: evaluation?.fired ? evaluation.output : null,
    });
  }

  return liveRender({
    store: ctx.store,
    observe: canvas,
    render,
  });
}

function varOf(system: FuzzySystem, id: string): FuzzyVariable {
  const found = system.inputs.find((v) => v.id === id);
  if (!found) throw new Error(`Unknown input: ${id}`);
  return found;
}

interface CurrentPoint {
  x: number;
  y: number | null;
}

function draw(
  canvas: HTMLCanvasElement,
  system: FuzzySystem,
  swept: FuzzyVariable,
  samples: readonly (number | null)[],
  current: CurrentPoint,
): void {
  const [xMin, xMax] = swept.range;
  const [yMin, yMax] = system.output.range;
  const plot = preparePlot(canvas, PAD, swept.range, system.output.range,
                           { width: 400, height: 230 });
  if (!plot) return;
  const { ctx: ctx2d } = plot;
  const toX = plot.x;
  const toY = plot.y;

  drawGrid(plot);

  // Stretches where no rule fires: the curve has nothing to say there, and a
  // line drawn straight across the gap would claim otherwise.
  ctx2d.fillStyle = CHART.grid;
  for (let i = 0; i < samples.length; i++) {
    if (samples[i] !== null) continue;
    let end = i;
    while (end + 1 < samples.length && samples[end + 1] === null) end++;
    const x0 = toX(xMin + ((xMax - xMin) * i) / (samples.length - 1));
    const x1 = toX(xMin + ((xMax - xMin) * end) / (samples.length - 1));
    ctx2d.fillRect(x0, plot.top, Math.max(1, x1 - x0), plot.plotHeight);
    i = end;
  }

  drawAxes(plot);

  ctx2d.strokeStyle = CHART.result;
  ctx2d.lineWidth = 2.5;
  ctx2d.lineCap = "round";
  ctx2d.lineJoin = "round";
  ctx2d.beginPath();
  let pen = false;
  samples.forEach((value, i) => {
    if (value === null) {
      pen = false;
      return;
    }
    const px = toX(xMin + ((xMax - xMin) * i) / (samples.length - 1));
    const py = toY(value);
    if (pen) ctx2d.lineTo(px, py);
    else ctx2d.moveTo(px, py);
    pen = true;
  });
  ctx2d.stroke();

  const cx = toX(current.x);
  ctx2d.save();
  ctx2d.strokeStyle = CHART.marker;
  ctx2d.lineWidth = 1.5;
  ctx2d.setLineDash([4, 4]);
  ctx2d.beginPath();
  ctx2d.moveTo(cx, plot.top);
  ctx2d.lineTo(cx, plot.bottom);
  if (current.y !== null) {
    ctx2d.moveTo(plot.left, toY(current.y));
    ctx2d.lineTo(cx, toY(current.y));
  }
  ctx2d.stroke();
  ctx2d.restore();

  if (current.y !== null) {
    ctx2d.fillStyle = CHART.marker;
    ctx2d.beginPath();
    ctx2d.arc(cx, toY(current.y), 4.5, 0, Math.PI * 2);
    ctx2d.fill();
  }

  ctx2d.fillStyle = CHART.tick;
  ctx2d.font = "9px ui-monospace, monospace";
  ctx2d.textAlign = "right";
  ctx2d.textBaseline = "middle";
  for (let i = 0; i <= 2; i++) {
    const value = yMin + ((yMax - yMin) * i) / 2;
    ctx2d.fillText(formatTick(value), plot.left - 5, toY(value));
  }
  ctx2d.textBaseline = "alphabetic";
  ctx2d.textAlign = "center";
  for (const v of [xMin, xMax]) {
    ctx2d.fillText(formatTick(v), toX(v), plot.bottom + 12);
  }

  ctx2d.fillStyle = CHART.label;
  ctx2d.font = "600 9px ui-monospace, monospace";
  ctx2d.textAlign = "left";
  ctx2d.fillText(system.output.id, plot.left, plot.top - 7);
  ctx2d.textAlign = "right";
  ctx2d.fillText(swept.id, plot.right, plot.bottom + 25);
}
