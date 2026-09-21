import { evaluateShape } from "../../fuzzy/engine";
import type { AggregatedSet, FuzzyCurve, FuzzyTerm, FuzzyVariable } from "../../fuzzy/types";
import { t } from "../../i18n";
import { CHART } from "../../styles/chart";
import { formatDegree, formatTick, formatValue } from "../../utils/format";
import { drawAxes, drawGrid, preparePlot, type Plot } from "./plot";

const CURVE_STEPS = 100;
const ENVELOPE_STEPS = 400;

// Left fits the μ letter plus a three-decimal readout without the two
// touching; bottom leaves room for the x ticks and, below them, the value pill.
const PAD = { left: 56, right: 16, top: 28, bottom: 48 } as const;

/** Membership below this is treated as "this term is not involved". */
const READOUT_EPS = 0.005;
/** Minimum vertical gap between two readout labels in the left gutter. */
const READOUT_SPACING = 12;

interface GraphParams {
  variable: FuzzyVariable;
  canvas: HTMLCanvasElement;
  currentValue: number | null;
  highlightTermId: string | null;
  /**
   * When given, the resulting fuzzy set is drawn instead of the plain term
   * curves: clipped terms filled, accumulated envelope on top.
   */
  aggregated?: AggregatedSet | null;
  /**
   * Project each term's membership at the current value onto the μ axis:
   * a dot on the curve, a guide across to the axis and the number in the
   * gutter. Reading a degree off the shape by eye is what this replaces.
   */
  readout?: boolean;
  /**
   * How to write the marker's value. Defaults to the variable's own domain
   * precision; the panels that mark the defuzzified result pass formatOutput,
   * so the pill agrees with the figure printed beside the chart.
   */
  formatMarker?: (value: number) => string;
  titleKey?: string;
}

export function drawMembershipGraph({
  variable,
  canvas,
  currentValue,
  highlightTermId,
  aggregated = null,
  readout = false,
  formatMarker,
  titleKey,
}: GraphParams): void {
  const [xMin, xMax] = variable.range;

  // μ always spans [0, 1]; only the value axis follows the variable.
  const plot = preparePlot(canvas, PAD, variable.range, [0, 1], { width: 400, height: 220 });
  if (!plot) return;
  const { ctx } = plot;
  const toX = plot.x;
  const toY = plot.y;

  drawGrid(plot);
  drawAxes(plot);

  if (aggregated) {
    drawAggregatedCurves(ctx, variable, aggregated, toX, toY, xMin, xMax);
  } else {
    for (const term of variable.terms) {
      drawTermCurve(ctx, term, toX, toY, xMin, xMax, term.id === highlightTermId);
    }
  }

  const hasValue = currentValue !== null && !Number.isNaN(currentValue);
  const readoutYs =
    hasValue && readout ? drawReadout(plot, variable, currentValue) : [];
  if (hasValue) {
    drawValueMarker(plot, currentValue, formatMarker ?? ((v) => formatValue(v, variable.range)));
  }

  drawAxisLabels(plot, variable, readoutYs);

  ctx.fillStyle = CHART.label;
  ctx.font = "600 11px ui-sans-serif, system-ui";
  ctx.textAlign = "left";
  ctx.fillText(t(titleKey ?? variable.nameKey), plot.left, plot.top - 12);
}


/**
 * Every term's degree at the current value, read straight off the μ axis.
 * Labels that would land on top of each other are pushed apart, so the numbers
 * stay legible even where two terms cross at nearly the same height. Returns
 * where the labels ended up, so the axis scale can step out of their way.
 */
function drawReadout(plot: Plot, variable: FuzzyVariable, value: number): number[] {
  const { ctx } = plot;
  const toX = plot.x;
  const toY = plot.y;
  const hits = variable.terms
    .map((term) => ({ term, m: evaluateShape(term.shape, value) }))
    .filter((h) => h.m > READOUT_EPS)
    .sort((a, b) => b.m - a.m);
  if (hits.length === 0) return [];

  const x = toX(value);
  const labelYs = spreadLabels(hits.map((h) => toY(h.m)), plot.top, plot.bottom);

  hits.forEach((hit, i) => {
    const y = toY(hit.m);

    ctx.save();
    ctx.strokeStyle = hit.term.color;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(plot.left, y);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.restore();

    ctx.beginPath();
    ctx.fillStyle = hit.term.color;
    ctx.arc(x, y, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // A tick on the axis marks the true height; the label may have been
    // nudged away from it to avoid its neighbour.
    ctx.strokeStyle = hit.term.color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(plot.left - 4, y);
    ctx.lineTo(plot.left, y);
    ctx.stroke();

    ctx.fillStyle = hit.term.color;
    ctx.font = "600 10px ui-monospace, monospace";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(formatDegree(hit.m), plot.left - 7, labelYs[i]);
    ctx.textBaseline = "alphabetic";
  });

  return labelYs;
}

/**
 * Keeps label positions at least READOUT_SPACING apart while staying as close
 * as possible to where they belong. Inputs are ordered by importance, so the
 * first one holds its place and later ones give way.
 */
function spreadLabels(ys: readonly number[], min: number, max: number): number[] {
  const out = [...ys];
  for (let i = 1; i < out.length; i++) {
    for (let j = 0; j < i; j++) {
      if (Math.abs(out[i] - out[j]) >= READOUT_SPACING) continue;
      out[i] = out[i] >= out[j] ? out[j] + READOUT_SPACING : out[j] - READOUT_SPACING;
    }
    out[i] = Math.max(min, Math.min(max, out[i]));
  }
  return out;
}

function drawValueMarker(plot: Plot, value: number, format: (v: number) => string): void {
  const { ctx } = plot;
  const x = plot.x(value);
  const baseY = plot.bottom;

  ctx.save();
  ctx.strokeStyle = CHART.marker;
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(x, plot.top);
  ctx.lineTo(x, baseY);
  ctx.stroke();
  ctx.restore();

  const label = format(value);
  ctx.font = "600 11px ui-monospace, monospace";
  const pillW = ctx.measureText(label).width + 12;
  const pillH = 16;
  const pillX = Math.max(plot.left, Math.min(x - pillW / 2, plot.right - pillW));

  const pillY = baseY + 19;
  ctx.fillStyle = CHART.marker;
  roundRect(ctx, pillX, pillY, pillW, pillH, 4);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, pillX + pillW / 2, pillY + pillH / 2 + 0.5);
  ctx.textBaseline = "alphabetic";

}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawAxisLabels(plot: Plot, variable: FuzzyVariable, readoutYs: readonly number[]): void {
  const { ctx } = plot;
  ctx.fillStyle = CHART.tick;
  ctx.font = "10px ui-sans-serif, system-ui";
  ctx.textAlign = "center";
  const drawn = new Set<number>();
  for (const v of [variable.range[0], ...(variable.keyPoints ?? []), variable.range[1]]) {
    if (drawn.has(v)) continue;
    drawn.add(v);
    ctx.fillText(formatTick(v), plot.x(v), plot.bottom + 13);
  }

  // The μ scale is only there to orient the reader; an actual readout at the
  // same height says more, so the scale yields rather than overprint it.
  ctx.fillStyle = CHART.muted;
  ctx.textAlign = "right";
  const free = (y: number): boolean =>
    readoutYs.every((ry) => Math.abs(ry - y) >= READOUT_SPACING);
  if (free(plot.top)) ctx.fillText(formatTick(1), plot.left - 7, plot.top + 4);
  if (free(plot.bottom)) ctx.fillText(formatTick(0), plot.left - 7, plot.bottom + 4);

  ctx.save();
  ctx.translate(9, plot.top + plot.plotHeight / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "center";
  ctx.fillStyle = CHART.tick;
  ctx.font = "600 10px ui-monospace, monospace";
  ctx.fillText("μ", 0, 0);
  ctx.restore();
}

function drawAggregatedCurves(
  ctx: CanvasRenderingContext2D,
  variable: FuzzyVariable,
  aggregated: AggregatedSet,
  toX: (v: number) => number,
  toY: (m: number) => number,
  xMin: number,
  xMax: number,
): void {
  const sample = (fn: FuzzyCurve, steps: number): { x: number; y: number }[] => {
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i <= steps; i++) {
      const v = xMin + ((xMax - xMin) * i) / steps;
      out.push({ x: toX(v), y: toY(fn(v)) });
    }
    return out;
  };

  // Base term outlines, faint: they show how far each term was cut down.
  for (const term of variable.terms) {
    if (term.shape.kind === "singleton") continue;
    const samples = sample((v) => evaluateShape(term.shape, v), CURVE_STEPS);
    ctx.beginPath();
    ctx.strokeStyle = hexWithAlpha(term.color, 0.35);
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    samples.forEach((s, i) => (i === 0 ? ctx.moveTo(s.x, s.y) : ctx.lineTo(s.x, s.y)));
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Clipped terms, filled in their own colour.
  for (const term of variable.terms) {
    const curve = aggregated.clipped[term.id];
    if (!curve) continue;
    const samples = sample(curve, ENVELOPE_STEPS);
    ctx.beginPath();
    ctx.fillStyle = hexWithAlpha(term.color, 0.3);
    ctx.moveTo(samples[0].x, toY(0));
    for (const s of samples) ctx.lineTo(s.x, s.y);
    ctx.lineTo(samples[samples.length - 1].x, toY(0));
    ctx.closePath();
    ctx.fill();
  }

  // Accumulated envelope: the curve the defuzzification strategy integrates.
  const envelope = sample(aggregated.envelope, ENVELOPE_STEPS);
  ctx.beginPath();
  ctx.strokeStyle = CHART.result;
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  envelope.forEach((s, i) => (i === 0 ? ctx.moveTo(s.x, s.y) : ctx.lineTo(s.x, s.y)));
  ctx.stroke();
}

function drawTermCurve(
  ctx: CanvasRenderingContext2D,
  term: FuzzyTerm,
  toX: (v: number) => number,
  toY: (m: number) => number,
  xMin: number,
  xMax: number,
  highlighted: boolean,
): void {
  if (term.shape.kind === "singleton") {
    const at = term.shape.at;
    if (at < xMin || at > xMax) return;
    const x = toX(at);
    const y0 = toY(0);
    const y1 = toY(1);

    ctx.beginPath();
    ctx.strokeStyle = term.color;
    ctx.lineWidth = highlighted ? 3 : 2;
    ctx.setLineDash(highlighted ? [] : [2, 3]);
    ctx.moveTo(x, y0);
    ctx.lineTo(x, y1);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    ctx.fillStyle = term.color;
    ctx.arc(x, y1, highlighted ? 5 : 3.5, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  const steps = CURVE_STEPS;
  const samples: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const v = xMin + ((xMax - xMin) * i) / steps;
    samples.push({ x: toX(v), y: toY(evaluateShape(term.shape, v)) });
  }

  if (highlighted) {
    ctx.beginPath();
    ctx.fillStyle = hexWithAlpha(term.color, 0.2);
    ctx.moveTo(samples[0].x, toY(0));
    for (const s of samples) ctx.lineTo(s.x, s.y);
    ctx.lineTo(samples[samples.length - 1].x, toY(0));
    ctx.closePath();
    ctx.fill();
  }

  ctx.beginPath();
  ctx.strokeStyle = term.color;
  ctx.lineWidth = highlighted ? 3 : 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  samples.forEach((s, i) => (i === 0 ? ctx.moveTo(s.x, s.y) : ctx.lineTo(s.x, s.y)));
  ctx.stroke();
}

function hexWithAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return hex.length === 7 ? `${hex}${a}` : hex;
}
