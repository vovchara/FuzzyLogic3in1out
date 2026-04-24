import { q } from "../dom";
import { t } from "../i18n";
import type { FuzzySystem } from "../fuzzy/types";
import type { AppShellCtx } from "./appShell";

export function mountOutputPanel(
  container: HTMLElement,
  ctx: AppShellCtx,
  system: FuzzySystem,
): void {
  container.innerHTML = `
    <h2 class="card-title" data-i18n="panels.output"></h2>
    <div class="mt-3 grid gap-3">
      <div class="flex items-baseline gap-3">
        <span class="text-sm text-slate-500" data-i18n="output.result"></span>
        <span class="text-3xl font-semibold tabular-nums" data-result>–</span>
        <span class="text-sm text-slate-400">/ 100</span>
      </div>
      <div class="flex items-baseline gap-3">
        <span class="text-sm text-slate-500" data-i18n="output.mostActive"></span>
        <span class="font-medium" data-active-term>–</span>
      </div>
      <button type="button" data-export
        class="mt-2 self-start px-3 py-1.5 text-sm rounded-md bg-slate-900 text-white hover:bg-slate-800 transition disabled:opacity-50"
        data-i18n="actions.exportPdf"></button>
    </div>
  `;

  const resultEl = q(container, "[data-result]");
  const termEl = q(container, "[data-active-term]");
  const exportBtn = q<HTMLButtonElement>(container, "[data-export]");

  function render(): void {
    const { evaluation } = ctx.store.getState();
    if (!evaluation) {
      resultEl.textContent = "–";
      termEl.textContent = "–";
      exportBtn.disabled = true;
      return;
    }
    resultEl.textContent = evaluation.output.toFixed(2);
    const term = system.output.terms.find((t0) => t0.id === evaluation.mostActiveTerm);
    termEl.textContent = term ? t(term.nameKey) : evaluation.mostActiveTerm;
    termEl.style.color = term?.color ?? "";
    exportBtn.disabled = false;
  }

  exportBtn.addEventListener("click", async () => {
    const { evaluation, inputs } = ctx.store.getState();
    if (!evaluation) return;
    const { exportResultPdf } = await import("../utils/pdf");
    await exportResultPdf({ system, inputs, evaluation });
  });

  render();
  ctx.store.subscribe(render);
}
