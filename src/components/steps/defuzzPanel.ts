import { q, qa } from "../../dom";
import { strongestTerm } from "../../fuzzy/engine";
import { formatDegree, formatOutput } from "../../utils/format";
import type { FuzzySystem } from "../../fuzzy/types";
import { liveRender } from "../chart/live";
import type { AppShellCtx, Unmount } from "../context";
import { drawMembershipGraph } from "../chart/membershipGraph";

/**
 * Defuzzification: the crisp number the strategy read off the resulting set,
 * placed back on the output's own membership functions. This is the last thing
 * the inference does, which is why the output chart lives here and not beside
 * the input charts it visually resembles.
 */
export function mountDefuzzPanel(
  container: HTMLElement,
  ctx: AppShellCtx,
  system: FuzzySystem,
): Unmount {
  const output = system.output;

  container.innerHTML = `
    <div class="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div class="min-w-0">
        <canvas class="w-full h-[240px] rounded-md bg-white"></canvas>
      </div>
      <div class="min-w-0">
        <div class="flex items-baseline gap-2 flex-wrap">
          <span class="metric-label" data-i18n="${output.nameKey}"></span>
          <span class="text-2xl font-semibold font-mono tabular-nums text-graphite-900"
                data-result>–</span>
          <span class="text-xs text-graphite-400">/ ${output.range[1]}</span>
        </div>
        <p class="mt-1 text-[11px] text-graphite-400">
          <span data-caption="activations" hidden data-i18n="memberships.activationLevels"></span>
          <span data-caption="interpretation" hidden data-i18n="memberships.linguisticInterpretation"></span>
        </p>
        <ul class="mt-2 flex flex-col gap-1">
          ${output.terms
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
        <p class="mt-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5"
           data-empty hidden data-i18n="output.noRuleFired"></p>
      </div>
    </div>
  `;

  const canvas = q<HTMLCanvasElement>(container, "canvas");
  const resultEl = q(container, "[data-result]");
  const emptyEl = q(container, "[data-empty]");


  function render(): void {
    const { evaluation } = ctx.store.getState();
    const fired = evaluation?.fired ?? false;
    const value = fired ? (evaluation?.output ?? null) : null;

    emptyEl.hidden = fired;
    resultEl.textContent = value === null ? "–" : formatOutput(value);

    // Singleton outputs report rule activations; on the centroid path the same
    // list is the result read back through the output MFs. Different meanings,
    // different caption.
    if (evaluation) {
      const activations = evaluation.outputTermActivations !== undefined;
      for (const el of qa(container, "[data-caption]")) {
        el.hidden = (el.dataset.caption === "activations") !== activations;
      }
    }

    const ms = evaluation?.memberships[output.id];
    const strongest = ms && fired ? strongestTerm(ms) : null;

    drawMembershipGraph({
      variable: output,
      canvas,
      currentValue: value,
      highlightTermId: strongest,
      readout: value !== null,
      formatMarker: formatOutput,
      titleKey: "panels.defuzzAxis",
    });

    if (!ms) return;
    for (const termEl of qa(container, "[data-term]")) {
      const termId = termEl.dataset.term!;
      q(termEl, "[data-value]").textContent = formatDegree(ms[termId] ?? 0);
      termEl.dataset.active = String(termId === strongest);
    }
  }

  return liveRender({
    store: ctx.store,
    observe: canvas,
    render,
  });
}

