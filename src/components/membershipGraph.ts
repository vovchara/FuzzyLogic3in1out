import { evaluateShape } from "../fuzzy/engine";
import type { FuzzyTerm, FuzzyVariable } from "../fuzzy/types";
import { t } from "../i18n";

interface GraphParams {
  variable: FuzzyVariable;
  canvas: HTMLCanvasElement;
  currentValue: number | null;
  highlightTermId: string | null;
}

export function drawMembershipGraph({
  variable,
  canvas,
  currentValue,
  highlightTermId,
}: GraphParams): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const cssWidth = rect.width || canvas.width || 400;
  const cssHeight = rect.height || canvas.height || 220;
  if (canvas.width !== cssWidth * dpr || canvas.height !== cssHeight * dpr) {
    canvas.width = cssWidth * dpr;
    canvas.height = cssHeight * dpr;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const width = cssWidth;
  const height = cssHeight;
  const paddingLeft = 32;
  const paddingRight = 16;
  const paddingTop = 28;
  const paddingBottom = 36;
  const graphWidth = width - paddingLeft - paddingRight;
  const graphHeight = height - paddingTop - paddingBottom;
  const [xMin, xMax] = variable.range;
  const xRange = xMax - xMin;

  ctx.clearRect(0, 0, width, height);

  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i <= 4; i++) {
    const x = paddingLeft + (graphWidth * i) / 4;
    ctx.moveTo(x, paddingTop);
    ctx.lineTo(x, paddingTop + graphHeight);
  }
  for (let i = 0; i <= 4; i++) {
    const y = paddingTop + (graphHeight * i) / 4;
    ctx.moveTo(paddingLeft, y);
    ctx.lineTo(paddingLeft + graphWidth, y);
  }
  ctx.stroke();

  ctx.strokeStyle = "#94a3b8";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(paddingLeft, paddingTop + graphHeight);
  ctx.lineTo(paddingLeft + graphWidth, paddingTop + graphHeight);
  ctx.moveTo(paddingLeft, paddingTop);
  ctx.lineTo(paddingLeft, paddingTop + graphHeight);
  ctx.stroke();

  const toX = (value: number): number => paddingLeft + ((value - xMin) / xRange) * graphWidth;
  const toY = (m: number): number => paddingTop + graphHeight - m * graphHeight;

  for (const term of variable.terms) {
    const highlighted = term.id === highlightTermId;
    drawTermCurve(ctx, term, toX, toY, xMin, xMax, highlighted);
  }

  if (currentValue !== null && !Number.isNaN(currentValue)) {
    const x = toX(currentValue);
    ctx.save();
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x, paddingTop);
    ctx.lineTo(x, paddingTop + graphHeight);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = "#0f172a";
    ctx.font = "600 12px ui-sans-serif, system-ui";
    ctx.textAlign = "center";
    ctx.fillText(currentValue.toFixed(1), x, paddingTop + graphHeight + 22);
  }

  ctx.fillStyle = "#64748b";
  ctx.font = "10px ui-sans-serif, system-ui";
  ctx.textAlign = "center";
  const xTicks = [xMin, ...(variable.keyPoints ?? []), xMax];
  const drawn = new Set<number>();
  for (const v of xTicks) {
    if (drawn.has(v)) continue;
    drawn.add(v);
    ctx.fillText(String(v), toX(v), paddingTop + graphHeight + 14);
  }

  ctx.textAlign = "right";
  ctx.fillText("1.0", paddingLeft - 6, paddingTop + 4);
  ctx.fillText("0.0", paddingLeft - 6, paddingTop + graphHeight + 4);

  ctx.fillStyle = "#334155";
  ctx.font = "600 11px ui-sans-serif, system-ui";
  ctx.textAlign = "left";
  ctx.fillText(t(variable.nameKey), paddingLeft, paddingTop - 10);
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
  const steps = 100;
  const samples: { x: number; y: number; m: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const v = xMin + ((xMax - xMin) * i) / steps;
    const m = evaluateShape(term.shape, v);
    samples.push({ x: toX(v), y: toY(m), m });
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
  samples.forEach((s, i) => {
    if (i === 0) ctx.moveTo(s.x, s.y);
    else ctx.lineTo(s.x, s.y);
  });
  ctx.stroke();
}

function hexWithAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return hex.length === 7 ? `${hex}${a}` : hex;
}
