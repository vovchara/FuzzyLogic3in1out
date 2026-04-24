import katex from "katex";
import { applyI18n, q, qa } from "../dom";
import { systems as allSystems } from "../fuzzy/systems";
import type { FuzzySystem } from "../fuzzy/types";
import { t } from "../i18n";
import { ruleToLatex, termToLatex, variableDomainLatex } from "../utils/formulas";
import type { AppShellCtx, Unmount } from "./appShell";

export function mountFormulasModal(container: HTMLElement, ctx: AppShellCtx): Unmount {
  container.innerHTML = `
    <div data-modal
      class="fixed inset-0 z-50 hidden bg-slate-900/50 backdrop-blur-sm overflow-y-auto p-4 flex items-start justify-center">
      <div class="bg-white rounded-lg shadow-xl max-w-3xl w-full my-8 relative">
        <header class="sticky top-0 bg-white px-5 py-3 border-b flex items-center justify-between rounded-t-lg">
          <h2 class="text-lg font-semibold" data-i18n="formulas.title"></h2>
          <div class="flex gap-2">
            <button type="button" data-download
              class="px-3 py-1.5 text-sm rounded-md bg-slate-900 text-white hover:bg-slate-800"
              data-i18n="actions.downloadPdf"></button>
            <button type="button" data-close
              class="px-3 py-1.5 text-sm rounded-md border border-slate-300 hover:bg-slate-50"
              data-i18n="actions.close"></button>
          </div>
        </header>
        <div data-body class="px-5 py-4"></div>
      </div>
    </div>
  `;

  const modal = q(container, "[data-modal]");
  const body = q(container, "[data-body]");

  q(container, "[data-close]").addEventListener("click", () => {
    ctx.store.setState({ formulasOpen: false });
  });
  modal.addEventListener("click", (e) => {
    if (e.target === modal) ctx.store.setState({ formulasOpen: false });
  });
  q(container, "[data-download]").addEventListener("click", async () => {
    const system = currentSystem();
    const { exportFormulasPdf } = await import("../utils/pdf");
    await exportFormulasPdf(system, body);
  });

  function currentSystem(): FuzzySystem {
    const id = ctx.store.getState().activeSystemId;
    return allSystems.find((s) => s.id === id) ?? allSystems[0];
  }

  let lastOpen = false;
  let lastRenderedId: string | null = null;
  let lastRenderedLang: string | null = null;

  function sync(): void {
    const { formulasOpen, activeSystemId, language } = ctx.store.getState();
    if (formulasOpen !== lastOpen) {
      lastOpen = formulasOpen;
      modal.classList.toggle("hidden", !formulasOpen);
    }
    if (!formulasOpen) return;
    if (activeSystemId !== lastRenderedId || language !== lastRenderedLang) {
      lastRenderedId = activeSystemId;
      lastRenderedLang = language;
      const system = currentSystem();
      body.innerHTML = buildBody(system);
      applyI18n(body, t);
      renderKatex(body);
    }
  }

  sync();
  return ctx.store.subscribe(sync);
}

function buildBody(system: FuzzySystem): string {
  const allVars = [...system.inputs, system.output];
  const variables = allVars
    .map(
      (v) => `
      <section class="mb-6">
        <h3 class="font-semibold text-slate-800 mb-1">${t(v.nameKey)}</h3>
        <div class="text-xs text-slate-500 mb-3">
          <span data-i18n="formulas.domain"></span>: <span data-math>${variableDomainLatex(v)}</span>
        </div>
        <div class="grid gap-3">
          ${v.terms
            .map(
              (term) => `
            <div class="border-l-4 pl-3" style="border-color:${term.color}">
              <div class="font-medium text-sm mb-1">${t(term.nameKey)}</div>
              <div data-math-display>${termToLatex(term)}</div>
            </div>`,
            )
            .join("")}
        </div>
      </section>`,
    )
    .join("");

  const rules = system.rules
    .map(
      (r, i) => `
      <div class="flex gap-3 items-start py-1.5 border-b border-slate-100 last:border-0">
        <span class="text-xs font-mono text-slate-400 tabular-nums mt-1 w-6">${i + 1}</span>
        <div data-math class="flex-1">${ruleToLatex(r, system, { t })}</div>
      </div>`,
    )
    .join("");

  return `
    <h3 class="text-base font-semibold mb-3" data-i18n="formulas.variablesSection"></h3>
    ${variables}
    <h3 class="text-base font-semibold mb-3" data-i18n="formulas.rulesSection"></h3>
    <div>${rules}</div>
  `;
}

function renderKatex(root: HTMLElement): void {
  for (const node of qa(root, "[data-math]")) {
    const src = node.textContent ?? "";
    node.innerHTML = "";
    katex.render(src, node, { throwOnError: false, displayMode: false });
  }
  for (const node of qa(root, "[data-math-display]")) {
    const src = node.textContent ?? "";
    node.innerHTML = "";
    katex.render(src, node, { throwOnError: false, displayMode: true });
  }
}
