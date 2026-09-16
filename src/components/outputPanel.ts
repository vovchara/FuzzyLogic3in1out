import { q, qa } from "../dom";
import { t } from "../i18n";
import type { FuzzySystem } from "../fuzzy/types";
import type { AppShellCtx, Unmount } from "./appShell";

export function mountOutputPanel(
  container: HTMLElement,
  ctx: AppShellCtx,
  system: FuzzySystem,
): Unmount {
  container.innerHTML = `
    <h2 class="card-title" data-i18n="panels.output"></h2>
    <div class="mt-3 grid gap-3">
      <div class="flex items-baseline gap-3 flex-wrap">
        <span class="text-sm text-slate-500" data-i18n="${system.output.nameKey}"></span>
        <span class="text-3xl font-semibold tabular-nums" data-result>–</span>
        <span class="text-sm text-slate-400">/ ${system.output.range[1]}</span>
      </div>
      <div class="flex items-baseline gap-3" data-term-row>
        <span class="text-sm text-slate-500">
          <span data-label="activations" hidden data-i18n="output.mostActive"></span>
          <span data-label="interpretation" hidden data-i18n="output.resultTerm"></span>
        </span>
        <span class="font-medium" data-active-term>–</span>
      </div>
      <p class="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5"
         data-no-rules hidden data-i18n="output.noRuleFired"></p>
      <div class="flex items-baseline gap-2 text-xs text-slate-500">
        <span data-i18n="output.defuzz"></span>
        <span class="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-medium"
              data-i18n="output.defuzzMethod.${system.defuzz}"></span>
      </div>
      <button type="button" data-export
        class="mt-2 self-start px-3 py-1.5 text-sm rounded-md bg-slate-900 text-white hover:bg-slate-800 transition disabled:opacity-50"
        data-i18n="actions.exportPdf"></button>
    </div>
  `;

  const resultEl = q(container, "[data-result]");
  const termRow = q(container, "[data-term-row]");
  const termEl = q(container, "[data-active-term]");
  const noRulesEl = q(container, "[data-no-rules]");
  const exportBtn = q<HTMLButtonElement>(container, "[data-export]");

  function render(): void {
    const { evaluation } = ctx.store.getState();
    if (!evaluation) {
      resultEl.textContent = "–";
      termEl.textContent = "–";
      exportBtn.disabled = true;
      return;
    }
    exportBtn.disabled = false;

    // Outside the rule base there is no result to report: `output` only holds
    // a fallback, and the "most active" term would be the first zero one.
    termRow.hidden = !evaluation.fired;
    noRulesEl.hidden = evaluation.fired;
    if (!evaluation.fired) {
      resultEl.textContent = "–";
      return;
    }

    // With singleton outputs the term row really is the strongest rule activation;
    // on the centroid path it is the defuzzified value read back through the output
    // MFs, so "most active" would be misleading and the wording differs.
    const activations = evaluation.outputTermActivations !== undefined;
    for (const el of qa(container, "[data-label]")) {
      el.hidden = (el.dataset.label === "activations") !== activations;
    }

    resultEl.textContent = evaluation.output.toFixed(2);
    const term = system.output.terms.find((t0) => t0.id === evaluation.mostActiveTerm);
    termEl.textContent = term ? t(term.nameKey) : evaluation.mostActiveTerm;
    termEl.style.color = term?.color ?? "";
  }

  exportBtn.addEventListener("click", async () => {
    const { evaluation, inputs } = ctx.store.getState();
    if (!evaluation) return;
    const { exportResultPdf } = await import("../utils/pdf");
    await exportResultPdf({ system, inputs, evaluation });
  });

  render();
  return ctx.store.subscribe(render);
}
