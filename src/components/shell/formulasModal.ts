import katex from "katex";
import { applyI18n, q, qa } from "../../dom";
import type { FuzzySystem } from "../../fuzzy/types";
import { t } from "../../i18n";
import { ruleToLatex, termToLatex, variableDomainLatex } from "../../utils/formulas";
import type { AppShellCtx, Unmount } from "../context";
import { DOWNLOAD_ICON } from "../icons";

export function mountFormulasModal(container: HTMLElement, ctx: AppShellCtx): Unmount {
  container.innerHTML = `
    <div data-modal
      class="fixed inset-0 z-50 hidden bg-graphite-900/50 backdrop-blur-sm p-4 sm:p-8 flex items-start justify-center">
      <div class="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-full overflow-y-auto relative">
        <header class="sticky top-0 z-10 bg-white px-5 py-3 border-b flex items-center justify-between rounded-t-lg">
          <h2 class="text-lg font-semibold" data-i18n="formulas.title"></h2>
          <div class="flex gap-2">
            <button type="button" data-download
              class="btn-primary inline-flex items-center gap-1.5">
              ${DOWNLOAD_ICON}<span data-i18n="actions.downloadPdf"></span>
            </button>
            <button type="button" data-close
              class="btn"
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
    const { exportFormulasPdf } = await import("../../utils/pdf");
    await exportFormulasPdf(system, body);
  });

  function currentSystem(): FuzzySystem {
    return ctx.getSystem(ctx.store.getState().activeSystemId);
  }

  let lastOpen = false;
  let lastRenderedId: string | null = null;
  let lastRenderedLang: string | null = null;
  let lastRenderedRevision = -1;

  function sync(): void {
    const { formulasOpen, activeSystemId, language, systemRevision } = ctx.store.getState();
    if (formulasOpen !== lastOpen) {
      lastOpen = formulasOpen;
      modal.classList.toggle("hidden", !formulasOpen);
    }
    if (!formulasOpen) return;
    if (
      activeSystemId !== lastRenderedId
      || language !== lastRenderedLang
      || systemRevision !== lastRenderedRevision
    ) {
      lastRenderedId = activeSystemId;
      lastRenderedLang = language;
      lastRenderedRevision = systemRevision;
      const system = currentSystem();
      body.innerHTML = buildBody(system, ctx.getExpertSystem(system.id));
      applyI18n(body, t);
      renderKatex(body);
    }
  }

  sync();
  return ctx.store.subscribe(sync);
}

function buildBody(system: FuzzySystem, expert: FuzzySystem): string {
  const allVars = [...system.inputs, system.output];
  const variables = allVars
    .map(
      (v) => `
      <section class="mb-6">
        <h3 class="font-semibold text-graphite-800 mb-1">${t(v.nameKey)}</h3>
        <div class="text-xs text-graphite-500 mb-3">
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

  // Numbered by the expert rule base, so a rule the GA switched off leaves a
  // gap instead of renumbering the rest.
  const rules = system.rules
    .map(
      (r) => `
      <div class="flex gap-3 items-start py-1.5 border-b border-graphite-100 last:border-0">
        <span class="text-xs font-mono text-graphite-400 tabular-nums mt-1 w-6">${expert.rules.findIndex((x) => x.id === r.id) + 1}</span>
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
    renderNode(node, false);
  }
  for (const node of qa(root, "[data-math-display]")) {
    renderNode(node, true);
  }
}

// The source is kept in data-latex: KaTeX replaces the markup it reads from, and
// the PDF export needs to re-render the same formulas in a variant form.
function renderNode(node: HTMLElement, displayMode: boolean): void {
  const src = node.dataset.latex ?? node.textContent ?? "";
  node.dataset.latex = src;
  node.innerHTML = "";
  katex.render(src, node, { throwOnError: false, displayMode });
}
