import { q, qa } from "../../dom";
import { t } from "../../i18n";
import { formatOutput } from "../../utils/format";
import type { FuzzySystem } from "../../fuzzy/types";
import type { AppShellCtx, Unmount } from "../context";

export function mountOutputPanel(
  container: HTMLElement,
  ctx: AppShellCtx,
  system: FuzzySystem,
): Unmount {
  container.innerHTML = `
    <h2 class="card-title" data-i18n="panels.output"></h2>
    <div class="mt-3 grid gap-3">
      <div>
        <p class="metric-label" data-i18n="${system.output.nameKey}"></p>
        <p class="flex items-baseline gap-2">
          <span class="text-4xl font-semibold font-mono tabular-nums text-graphite-900"
                data-result>–</span>
          <span class="text-sm text-graphite-400">/ ${system.output.range[1]}</span>
        </p>
      </div>
      <div class="flex items-baseline gap-2 flex-wrap" data-term-row>
        <span class="text-xs text-graphite-500">
          <span data-label="activations" hidden data-i18n="output.mostActive"></span>
          <span data-label="interpretation" hidden data-i18n="output.resultTerm"></span>
        </span>
        <span class="font-semibold" data-active-term>–</span>
      </div>
      <p class="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5"
         data-no-rules hidden data-i18n="output.noRuleFired"></p>
      <div class="flex items-baseline gap-2 text-xs text-graphite-500">
        <span data-i18n="output.defuzz"></span>
        <span class="px-1.5 py-0.5 rounded bg-brand-50 text-brand-700 border border-brand-100 font-medium"
              data-i18n="output.defuzzMethod.${system.defuzz}"></span>
      </div>
      <button type="button" data-export class="btn-primary self-start"
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

    resultEl.textContent = formatOutput(evaluation.output);
    const term = system.output.terms.find((t0) => t0.id === evaluation.mostActiveTerm);
    termEl.textContent = term ? t(term.nameKey) : evaluation.mostActiveTerm;
    termEl.style.color = term?.color ?? "";
  }

  exportBtn.addEventListener("click", async () => {
    const { evaluation, inputs } = ctx.store.getState();
    if (!evaluation) return;
    const { exportResultPdf } = await import("../../utils/pdf");
    await exportResultPdf({ system, inputs, evaluation });
  });

  render();
  return ctx.store.subscribe(render);
}
