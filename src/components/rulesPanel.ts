import { q, qa } from "../dom";
import { t } from "../i18n";
import type { FuzzySystem, FuzzyVariable } from "../fuzzy/types";
import type { AppShellCtx } from "./appShell";

export function mountRulesPanel(
  container: HTMLElement,
  ctx: AppShellCtx,
  system: FuzzySystem,
): void {
  const varById = new Map<string, FuzzyVariable>();
  for (const v of system.inputs) varById.set(v.id, v);
  varById.set(system.output.id, system.output);

  container.innerHTML = `
    <details class="group">
      <summary class="cursor-pointer select-none list-none flex items-center justify-between gap-2">
        <h2 class="card-title" data-i18n="panels.rules"></h2>
        <svg class="w-4 h-4 text-slate-500 transition-transform group-open:rotate-180"
             viewBox="0 0 20 20" fill="currentColor">
          <path d="M5 7l5 6 5-6H5z"/>
        </svg>
      </summary>
      <div class="mt-3 overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="text-xs text-slate-500 uppercase">
            <tr>
              <th class="text-left px-2 py-1 font-medium">#</th>
              <th class="text-left px-2 py-1 font-medium" data-i18n="rule.if"></th>
              <th class="text-left px-2 py-1 font-medium" data-i18n="rule.then"></th>
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
              <tr data-rule="${r.id}" class="border-t border-slate-100 data-[active=true]:bg-amber-50">
                <td class="px-2 py-1.5 text-slate-400 font-mono tabular-nums">${idx + 1}</td>
                <td class="px-2 py-1.5">${conditions}</td>
                <td class="px-2 py-1.5">${conclusions}</td>
              </tr>`;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    </details>
  `;

  function render(): void {
    const { evaluation } = ctx.store.getState();
    if (!evaluation) return;
    for (const tr of qa(container, "[data-rule]")) {
      const ruleId = tr.dataset.rule!;
      const rule = system.rules.find((r) => r.id === ruleId);
      if (!rule) continue;
      const truth = computeRuleTruth(rule, evaluation.memberships);
      tr.dataset.active = String(truth > 0.5);
    }
  }

  render();
  ctx.store.subscribe(render);
  void t;
  void q;
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
