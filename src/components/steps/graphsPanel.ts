import { strongestTerm } from "../../fuzzy/engine";
import { formatDegree } from "../../utils/format";
import { q, qa } from "../../dom";
import type { FuzzySystem, FuzzyVariable } from "../../fuzzy/types";
import { liveRender } from "../chart/live";
import type { AppShellCtx, Unmount } from "../context";
import { drawMembershipGraph } from "../chart/membershipGraph";

/**
 * Fuzzification: every input's membership functions with the current value cut
 * across them, and each term's degree projected onto the μ axis. The charts
 * only display — inputs are edited in the control rail, which is on screen
 * anyway, so a click here never silently moves the system.
 */
export function mountGraphsPanel(
  container: HTMLElement,
  ctx: AppShellCtx,
  system: FuzzySystem,
): Unmount {
  container.innerHTML = `
    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      ${system.inputs.map(graphCardHtml).join("")}
    </div>
  `;

  const wrappers = qa(container, "[data-graph]");


  function renderAll(): void {
    const { evaluation, inputs } = ctx.store.getState();

    for (const wrap of wrappers) {
      const varId = wrap.dataset.graph!;
      const variable = system.inputs.find((v) => v.id === varId)!;
      const ms = evaluation?.memberships[varId];
      const strongest = ms ? strongestTerm(ms) : null;

      drawMembershipGraph({
        variable,
        canvas: q<HTMLCanvasElement>(wrap, "canvas"),
        currentValue: inputs[varId] ?? variable.defaultValue,
        highlightTermId: strongest,
        readout: true,
      });

      if (!ms) continue;
      for (const termEl of qa(wrap, "[data-term]")) {
        const termId = termEl.dataset.term!;
        q(termEl, "[data-value]").textContent = formatDegree(ms[termId] ?? 0);
        termEl.dataset.active = String(termId === strongest);
      }
    }
  }

  return liveRender({
    store: ctx.store,
    observe: wrappers.map((w) => q<HTMLCanvasElement>(w, "canvas")),
    render: renderAll,
  });
}

function graphCardHtml(v: FuzzyVariable): string {
  return `
    <div class="min-w-0" data-graph="${v.id}">
      <canvas class="w-full h-[230px] rounded-md bg-white"
              role="img" data-i18n-aria-label="${v.nameKey}"></canvas>
      <ul class="mt-2 flex flex-col gap-1">
        ${v.terms
          .map(
            (term) => `
          <li data-term="${term.id}"
              class="flex items-center justify-between gap-2 px-2 py-1 rounded transition
                     data-[active=true]:ring-1 data-[active=true]:ring-brand-200
                     data-[active=true]:bg-brand-50">
            <span class="flex items-center gap-2 text-sm">
              <span class="w-2.5 h-2.5 rounded-full" style="background:${term.color}"></span>
              <span data-i18n="${term.nameKey}"></span>
            </span>
            <span class="font-mono tabular-nums text-xs text-graphite-700" data-value>0.000</span>
          </li>`,
          )
          .join("")}
      </ul>
    </div>`;
}

