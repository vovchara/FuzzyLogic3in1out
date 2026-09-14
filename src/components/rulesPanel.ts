import { qa } from "../dom";
import type { FuzzySystem, FuzzyVariable } from "../fuzzy/types";
import type { AppShellCtx, Unmount } from "./appShell";

export function mountRulesPanel(
  container: HTMLElement,
  ctx: AppShellCtx,
  system: FuzzySystem,
): Unmount {
  const varById = new Map<string, FuzzyVariable>();
  for (const v of system.inputs) varById.set(v.id, v);
  varById.set(system.output.id, system.output);

  container.innerHTML = `
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="text-xs text-slate-500 uppercase">
          <tr>
            <th class="text-left px-2 py-1 font-medium">#</th>
            <th class="text-left px-2 py-1 font-medium" data-i18n="rule.if"></th>
            <th class="text-left px-2 py-1 font-medium" data-i18n="rule.then"></th>
            <th class="text-right px-2 py-1 font-medium" data-i18n="rule.alpha"
                data-i18n-title="rule.alphaHint"></th>
          </tr>
        </thead>
        <tbody>
          ${system.rules
            .map((r, idx) => {
              const conditions = Object.entries(r.if)
                .map(([vid, tid]) => renderRulePart(varById, vid, tid))
                .join(`<span class="text-slate-400 mx-1" data-i18n="rule.and"></span>`);
              const conclusions = Object.entries(r.then)
                .map(([vid, tid]) => renderRulePart(varById, vid, tid))
                .join(" ");
              return `
            <tr data-rule="${r.id}" class="border-t border-slate-100 transition-colors">
              <td class="px-2 py-1.5 text-slate-400 font-mono tabular-nums">${idx + 1}</td>
              <td class="px-2 py-1.5">${conditions}</td>
              <td class="px-2 py-1.5">${conclusions}</td>
              <td class="px-2 py-1.5 text-right font-mono tabular-nums text-xs text-slate-300"
                  data-alpha>0.000</td>
            </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;

  function render(): void {
    const { evaluation } = ctx.store.getState();
    if (!evaluation) return;
    for (const tr of qa(container, "[data-rule]")) {
      const ruleId = tr.dataset.rule!;
      const rule = system.rules.find((r) => r.id === ruleId);
      if (!rule) continue;
      const truth = computeRuleTruth(rule, evaluation.memberships);
      tr.style.backgroundColor = tintFor(truth);
      const alphaEl = tr.querySelector<HTMLElement>("[data-alpha]")!;
      alphaEl.textContent = truth.toFixed(3);
      // A silent rule's zero would only add noise to a 27-row table.
      alphaEl.classList.toggle("text-slate-300", truth <= 0.001);
      alphaEl.classList.toggle("text-slate-700", truth > 0.001);
    }
  }

  render();
  return ctx.store.subscribe(render);
}

// Every rule that fires at all is tinted, with the tint tracking its firing
// strength: the table then reads as a heat map of the inference instead of
// hiding everything below a threshold.
const TINT_RGB = "251, 191, 36"; // amber-400
const TINT_MAX_ALPHA = 0.55;

function tintFor(truth: number): string {
  if (truth <= 0.001) return "";
  return `rgba(${TINT_RGB}, ${(truth * TINT_MAX_ALPHA).toFixed(3)})`;
}

function renderRulePart(
  varById: Map<string, FuzzyVariable>,
  varId: string,
  termId: string,
): string {
  const variable = varById.get(varId);
  const term = variable?.terms.find((x) => x.id === termId);
  if (!variable || !term) return `${varId}=${termId}`;
  return `<span class="inline-flex items-center gap-1">
    <span class="text-xs font-mono text-slate-400">${variable.id}</span>
    <span class="text-xs text-slate-500" data-i18n="rule.is"></span>
    <span class="text-sm font-medium" style="color:${term.color}" data-i18n="${term.nameKey}"></span>
  </span>`;
}

function computeRuleTruth(
  rule: { if: Readonly<Record<string, string>> },
  memberships: Readonly<Record<string, Readonly<Record<string, number>>>>,
): number {
  let min = 1;
  for (const [varId, termId] of Object.entries(rule.if)) {
    const v = memberships[varId]?.[termId] ?? 0;
    if (v < min) min = v;
  }
  return min;
}
