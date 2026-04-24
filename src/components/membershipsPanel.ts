import { qa } from "../dom";
import { t } from "../i18n";
import type { FuzzySystem, FuzzyVariable } from "../fuzzy/types";
import type { AppShellCtx } from "./appShell";

export function mountMembershipsPanel(
  container: HTMLElement,
  ctx: AppShellCtx,
  system: FuzzySystem,
): void {
  const allVars: FuzzyVariable[] = [...system.inputs, system.output];
  container.innerHTML = `
    <h2 class="card-title" data-i18n="panels.memberships"></h2>
    <div class="grid gap-4 mt-3 sm:grid-cols-2 lg:grid-cols-4">
      ${allVars
        .map(
          (v) => `
        <div data-var="${v.id}">
          <h3 class="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2"
              data-i18n="${v.nameKey}"></h3>
          <ul class="flex flex-col gap-1">
            ${v.terms
              .map(
                (term) => `
              <li data-term="${term.id}"
                  class="flex items-center justify-between gap-2 px-2 py-1 rounded transition
                         data-[active=true]:ring-1 data-[active=true]:ring-slate-300 data-[active=true]:bg-slate-50">
                <span class="flex items-center gap-2 text-sm">
                  <span class="w-2.5 h-2.5 rounded-full" style="background:${term.color}"></span>
                  <span data-i18n="${term.nameKey}"></span>
                </span>
                <span class="font-mono tabular-nums text-xs text-slate-700" data-value>0.000</span>
              </li>`,
              )
              .join("")}
          </ul>
        </div>`,
        )
        .join("")}
    </div>
  `;

  function render(): void {
    const { evaluation } = ctx.store.getState();
    if (!evaluation) return;
    for (const varEl of qa(container, "[data-var]")) {
      const varId = varEl.dataset.var!;
      const ms = evaluation.memberships[varId] ?? {};
      for (const termEl of qa(varEl, "[data-term]")) {
        const termId = termEl.dataset.term!;
        const value = ms[termId] ?? 0;
        const valueEl = termEl.querySelector<HTMLElement>("[data-value]")!;
        valueEl.textContent = value.toFixed(3);
        termEl.dataset.active = String(value > 0.1 && isMaxInObject(ms, termId));
      }
    }
  }

  render();
  ctx.store.subscribe(render);
  void t;
}

function isMaxInObject(ms: Readonly<Record<string, number>>, key: string): boolean {
  const target = ms[key] ?? 0;
  for (const v of Object.values(ms)) if (v > target) return false;
  return true;
}
