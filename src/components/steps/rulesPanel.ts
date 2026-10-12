import { q, qa } from "../../dom";
import { fireThreshold, ruleStrength } from "../../fuzzy/engine";
import { formatDegree } from "../../utils/format";
import type { FuzzySystem, FuzzyVariable } from "../../fuzzy/types";
import type { AppShellCtx, Unmount } from "../context";
import { supportsAggregatedSet } from "./aggregatedPanel";

export function mountRulesPanel(
  container: HTMLElement,
  ctx: AppShellCtx,
  system: FuzzySystem,
): Unmount {
  // Numbered by the expert rule base, not by position: once the GA switches a
  // rule off, positions shift and would no longer match "r11 → off".
  const expertRules = ctx.getExpertSystem(system.id).rules;
  const ruleNumber = (id: string) => expertRules.findIndex((r) => r.id === id) + 1;
  const varById = new Map<string, FuzzyVariable>();
  for (const v of system.inputs) varById.set(v.id, v);
  varById.set(system.output.id, system.output);
  // Only a clipped output has a level set by its strongest rule; singletons
  // are summed rule by rule, so a "max" mark would explain nothing there.
  const clipping = supportsAggregatedSet(system);
  const threshold = fireThreshold(system);

  container.innerHTML = `
    <p class="text-[11px] text-graphite-400 mb-2">
      <span data-i18n="rule.legendTint"></span>
      ${clipping ? `<span class="mx-1 text-graphite-300">·</span>
      <span data-i18n="rule.legendDominant"></span>` : ""}
    </p>
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="text-xs text-graphite-500 uppercase">
          <tr>
            <th class="text-left px-2 py-1 font-medium">#</th>
            <th class="text-left px-2 py-1 font-medium" data-i18n="rule.if"></th>
            <th class="text-left px-2 py-1 font-medium" data-i18n="rule.then"></th>
            <th class="text-right px-2 py-1 font-medium" data-i18n="rule.alpha"
                data-i18n-title="${system.conjunction === "product" ? "rule.alphaHintProduct" : "rule.alphaHint"}"></th>
          </tr>
        </thead>
        <tbody>
          ${system.rules.map((r) => rowHtml(varById, r, ruleNumber(r.id))).join("")}
        </tbody>
      </table>
    </div>
  `;

  function render(): void {
    const { evaluation } = ctx.store.getState();
    if (!evaluation) return;

    const truths = new Map<string, number>();
    for (const rule of system.rules) {
      truths.set(rule.id, ruleStrength(rule, evaluation.memberships, system.conjunction));
    }
    const dominant = dominantRuleIds(system, truths, threshold);

    for (const tr of qa(container, "[data-rule]")) {
      const ruleId = tr.dataset.rule!;
      const truth = truths.get(ruleId);
      if (truth === undefined) continue;

      tr.style.backgroundColor = tintFor(truth, threshold);

      const alphaEl = q(tr, "[data-alpha]");
      alphaEl.textContent = formatDegree(truth);
      // A silent rule's zero would only add noise to a 27-row table.
      alphaEl.classList.toggle("text-graphite-300", truth <= threshold);
      alphaEl.classList.toggle("text-graphite-800", truth > threshold);

      const isDominant = clipping && dominant.has(ruleId);
      q(tr, "[data-dominant]").hidden = !isDominant;
      // The clipping level of an output term is the strongest of the rules
      // concluding it, so exactly those rows survive into the resulting set.
      tr.style.boxShadow = isDominant
        ? `inset 3px 0 0 ${colorOfConclusion(system, ruleId)}`
        : "";
    }
  }

  render();
  return ctx.store.subscribe(render);
}

/**
 * For every output term, the one rule whose firing strength sets that term's
 * clipping level. Rules that fire but lose to a stronger sibling contribute
 * nothing further to the result.
 */
function dominantRuleIds(
  system: FuzzySystem,
  truths: ReadonlyMap<string, number>,
  threshold: number,
): Set<string> {
  const best = new Map<string, { id: string; truth: number }>();
  for (const rule of system.rules) {
    const termId = rule.then[system.output.id];
    if (termId === undefined) continue;
    const truth = truths.get(rule.id) ?? 0;
    if (truth <= threshold) continue;
    const current = best.get(termId);
    if (!current || truth > current.truth) best.set(termId, { id: rule.id, truth });
  }
  return new Set([...best.values()].map((b) => b.id));
}

function colorOfConclusion(system: FuzzySystem, ruleId: string): string {
  const rule = system.rules.find((r) => r.id === ruleId);
  const termId = rule?.then[system.output.id];
  return system.output.terms.find((x) => x.id === termId)?.color ?? "#000000";
}

// Every rule that fires at all is tinted, with the tint tracking its firing
// strength: the table then reads as a heat map of the inference instead of
// hiding everything below a threshold.
const TINT_RGB = "251, 191, 36"; // amber-400
const TINT_MAX_ALPHA = 0.55;
// A product of three memberships is often far below 0.1, yet the rule fired;
// a floor keeps such a row visibly tinted.
const TINT_MIN_ALPHA = 0.08;

function tintFor(truth: number, threshold: number): string {
  if (truth <= threshold) return "";
  return `rgba(${TINT_RGB}, ${Math.max(TINT_MIN_ALPHA, truth * TINT_MAX_ALPHA).toFixed(3)})`;
}

function rowHtml(
  varById: ReadonlyMap<string, FuzzyVariable>,
  rule: FuzzySystem["rules"][number],
  number: number,
): string {
  const conditions = Object.entries(rule.if)
    .map(([vid, tid]) => renderRulePart(varById, vid, tid))
    .join(`<span class="text-graphite-400 mx-1" data-i18n="rule.and"></span>`);
  const conclusions = Object.entries(rule.then)
    .map(([vid, tid]) => renderRulePart(varById, vid, tid))
    .join(" ");
  return `
    <tr data-rule="${rule.id}" class="border-t border-graphite-100 transition-colors">
      <td class="px-2 py-1.5 text-graphite-400 font-mono tabular-nums">${number}</td>
      <td class="px-2 py-1.5">${conditions}</td>
      <td class="px-2 py-1.5">
        ${conclusions}
        <span data-dominant hidden data-i18n="rule.dominant" data-i18n-title="rule.dominantHint"
              class="ml-1.5 align-middle text-[9px] font-semibold uppercase tracking-wide
                     px-1 py-0.5 rounded bg-graphite-800 text-white"></span>
      </td>
      <td class="px-2 py-1.5 text-right font-mono tabular-nums text-xs text-graphite-300"
          data-alpha>0.000</td>
    </tr>`;
}

function renderRulePart(
  varById: ReadonlyMap<string, FuzzyVariable>,
  varId: string,
  termId: string,
): string {
  const variable = varById.get(varId);
  const term = variable?.terms.find((x) => x.id === termId);
  if (!variable || !term) return `${varId}=${termId}`;
  return `<span class="inline-flex items-center gap-1">
    <span class="text-xs font-mono text-graphite-400">${variable.id}</span>
    <span class="text-xs text-graphite-500" data-i18n="rule.is"></span>
    <span class="text-sm font-medium" style="color:${term.color}" data-i18n="${term.nameKey}"></span>
  </span>`;
}
