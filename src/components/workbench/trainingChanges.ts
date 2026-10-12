import { evaluateShape } from "../../fuzzy/engine";
import type { FuzzySystem, FuzzyVariable, MembershipShape } from "../../fuzzy/types";
import { t } from "../../i18n";
import { diffSystems, shapeParams, type TrainingRecord } from "../../training/record";
import { formatValue } from "../../utils/format";

const W = 200;
const H = 48;
const SAMPLES = 80;

/**
 * What training moved, one card per variable — its terms before and after as
 * a table and as overlaid curves — then the rules whose conclusion changed.
 * The curves carry the point: a list of numbers says a centre moved from 40
 * to 45, the picture shows which neighbour the term now overlaps.
 */
export function changesHtml(expert: FuzzySystem, record: TrainingRecord): string {
  const diff = diffSystems(expert, record.system);
  const trained = [...record.system.inputs, record.system.output];

  const cards = [...expert.inputs, expert.output].map((v) => {
    const after = trained.find((x) => x.id === v.id)!;
    return variableCard(v, after);
  });

  // The count follows what the cards show: a change below display precision
  // reads as "0.15 → 0.15" and is left out, as in the tables below.
  const shown = diff.params.filter((c) => {
    const range = [...expert.inputs, expert.output].find((v) => v.id === c.varId)!.range;
    return formatValue(c.from, range) !== formatValue(c.to, range);
  }).length;

  return `
    <details class="lg:col-span-2">
      <summary class="cursor-pointer text-xs text-brand-700 font-medium">
        <span data-i18n="training.changes"></span>:
        ${t("training.changesCount", { params: shown, rules: diff.rules.length })}
      </summary>
      <p class="mt-2 flex gap-4 text-[11px] text-graphite-500">
        <span class="flex items-center gap-1.5">
          <svg width="18" height="4" aria-hidden="true"><line x1="0" y1="2" x2="18" y2="2" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 2"/></svg>
          <span data-i18n="training.curveBefore"></span>
        </span>
        <span class="flex items-center gap-1.5">
          <svg width="18" height="4" aria-hidden="true"><line x1="0" y1="2" x2="18" y2="2" stroke="currentColor" stroke-width="2"/></svg>
          <span data-i18n="training.curveAfter"></span>
        </span>
      </p>
      <div class="mt-2 grid gap-3 md:grid-cols-2">${cards.join("")}</div>
      ${rulesBlock(expert, record)}
    </details>
  `;
}

function variableCard(before: FuzzyVariable, after: FuzzyVariable): string {
  // Gaussians read as centre and width; break points and singletons as the
  // plain list of numbers that define them.
  const gaussian = before.terms.every((term) => term.shape.kind === "gaussian");
  const rows = before.terms
    .map((term, k) => {
      const next = after.terms[k];
      const cells = gaussian
        ? `<td class="py-1 pr-2 text-right">${pair(term.shape, next.shape, 0, before.range)}</td>
           <td class="py-1 text-right">${pair(term.shape, next.shape, 1, before.range)}</td>`
        : `<td class="py-1 text-right">${pointList(term.shape, next.shape, before.range)}</td>`;
      return `
        <tr class="border-t border-graphite-100">
          <td class="py-1 pr-2 whitespace-nowrap">
            <span class="inline-block w-2 h-2 rounded-full align-middle mr-1" style="background:${term.color}"></span>${t(term.nameKey)}
          </td>
          ${cells}
        </tr>`;
    })
    .join("");

  const singleton = before.terms.every((term) => term.shape.kind === "singleton");
  const head = gaussian
    ? `<th class="pb-1 pr-2 text-right font-normal" data-i18n="training.centre"></th>
       <th class="pb-1 text-right font-normal" data-i18n="training.width"></th>`
    : `<th class="pb-1 text-right font-normal" data-i18n="${singleton ? "training.value" : "training.points"}"></th>`;

  return `
    <div class="rounded-md border border-graphite-200 bg-white p-3 min-w-0">
      <div class="flex items-baseline justify-between gap-2">
        <span class="text-xs font-semibold text-graphite-800">${before.id}</span>
        <span class="text-[11px] text-graphite-500 truncate">${t(before.nameKey)}</span>
      </div>
      ${curves(before, after)}
      <table class="w-full text-[11px] font-mono tabular-nums text-graphite-600">
        <thead>
          <tr class="text-graphite-400">
            <th class="pb-1 text-left font-normal"></th>
            ${head}
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

/** "40.0 → 45.3" when it moved at display precision, a muted single value when not. */
function pair(
  from: MembershipShape,
  to: MembershipShape,
  index: number,
  range: readonly [number, number],
): string {
  const a = formatValue(shapeParams(from)[index]?.[1] ?? NaN, range);
  const b = formatValue(shapeParams(to)[index]?.[1] ?? NaN, range);
  if (a === b) return `<span class="text-graphite-400">${a}</span>`;
  return `<span class="whitespace-nowrap">${a} → <b class="text-graphite-900">${b}</b></span>`;
}

/**
 * The numbers of a term in order, each moved one as "before → after"; a
 * narrow screen wraps between numbers, never inside a pair. A shoulder's
 * repeated edge point is listed once: [0, 0, 0, 8] reads as the triangle
 * "0, 8" the dissertation writes.
 */
function pointList(from: MembershipShape, to: MembershipShape, range: readonly [number, number]): string {
  const a = shapeParams(from).map(([, x]) => x);
  const b = shapeParams(to).map(([, x]) => x);
  return a
    .flatMap((x, i) => (i > 0 && x === a[i - 1] && b[i] === b[i - 1] ? [] : [pair(from, to, i, range)]))
    .join(`<span class="text-graphite-300">, </span>`);
}

/** Each term before (dashed) and after (solid), in its own colour. */
function curves(before: FuzzyVariable, after: FuzzyVariable): string {
  const [min, max] = before.range;
  const path = (shape: MembershipShape) => {
    let d = "";
    for (let i = 0; i <= SAMPLES; i++) {
      const x = min + ((max - min) * i) / SAMPLES;
      const y = evaluateShape(shape, x);
      d += `${i === 0 ? "M" : "L"}${((W * i) / SAMPLES).toFixed(1)},${(H - 2 - y * (H - 4)).toFixed(1)}`;
    }
    return d;
  };
  const lines = before.terms
    .map((term, k) => `
      <path d="${path(term.shape)}" fill="none" stroke="${term.color}" stroke-width="1.2"
            stroke-dasharray="3 2" opacity="0.7" vector-effect="non-scaling-stroke"/>
      <path d="${path(after.terms[k].shape)}" fill="none" stroke="${term.color}" stroke-width="2"
            vector-effect="non-scaling-stroke"/>`)
    .join("");
  return `
    <svg class="my-2 w-full h-12" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
      <line x1="0" y1="${H - 2}" x2="${W}" y2="${H - 2}" stroke="#d8dce0" stroke-width="1" vector-effect="non-scaling-stroke"/>
      ${lines}
    </svg>`;
}

function rulesBlock(expert: FuzzySystem, record: TrainingRecord): string {
  const { rules } = diffSystems(expert, record.system);
  if (rules.length === 0) return "";
  const out = expert.output;
  const outTerm = (id: string) => out.terms.find((x) => x.id === id);
  const conclusion = (id: string | null) => {
    if (id === null) return `<span class="text-graphite-500 italic">${t("training.ruleOff")}</span>`;
    const term = outTerm(id);
    return `<span style="color:${term?.color ?? "inherit"}">${term ? t(term.nameKey) : id}</span>`;
  };

  const items = rules
    .map((c) => {
      const index = expert.rules.findIndex((r) => r.id === c.ruleId);
      const rule = expert.rules[index];
      // Each "variable term" pair is kept whole, so a narrow screen wraps
      // between conditions and never inside one.
      const condition = expert.inputs
        .map((v) => {
          const term = v.terms.find((x) => x.id === rule.if[v.id]);
          return term
            ? `<span class="whitespace-nowrap"><span class="text-graphite-400">${v.id}</span> <span style="color:${term.color}">${t(term.nameKey)}</span></span>`
            : "";
        })
        .filter(Boolean)
        .join(`<span class="text-graphite-300">·</span>`);
      return `
        <li class="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1 border-t border-graphite-100">
          <span class="w-5 text-graphite-400 font-mono tabular-nums">${index + 1}</span>
          <span class="flex flex-wrap gap-x-1.5 min-w-0">${condition}</span>
          <span class="ml-auto whitespace-nowrap">${out.id}: ${conclusion(c.from)} → <b>${conclusion(c.to)}</b></span>
        </li>`;
    })
    .join("");

  return `
    <div class="mt-3 rounded-md border border-graphite-200 bg-white p-3">
      <div class="text-xs font-semibold text-graphite-800 mb-1" data-i18n="training.rulesChanged"></div>
      <ul class="text-[11px]">${items}</ul>
    </div>`;
}
