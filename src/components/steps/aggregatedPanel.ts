import { q } from "../../dom";
import { curvePeak } from "../../fuzzy/engine";
import { formatDegree, formatOutput } from "../../utils/format";
import type { FuzzySystem } from "../../fuzzy/types";
import { liveRender } from "../chart/live";
import type { AppShellCtx, Unmount } from "../context";
import { drawMembershipGraph } from "../chart/membershipGraph";

export function mountAggregatedPanel(
  container: HTMLElement,
  ctx: AppShellCtx,
  system: FuzzySystem,
): Unmount {
  const legend = system.output.terms
    .map(
      (term) => `
      <span class="inline-flex items-center gap-1.5" data-legend="${term.id}">
        <span class="w-3 h-3 rounded-sm" style="background:${term.color}55;border:1px solid ${term.color}"></span>
        <span data-i18n="${term.nameKey}"></span>
        <span class="font-mono tabular-nums text-graphite-500" data-level>0.000</span>
      </span>`,
    )
    .join("");

  container.innerHTML = `
    <div class="relative min-w-0">
      <canvas class="w-full h-[280px] rounded-md bg-white"></canvas>
    </div>
    <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-graphite-600">
      <span class="text-graphite-400" data-i18n="panels.aggregatedLevels"></span>
      ${legend}
    </div>
    <p class="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5"
       data-empty hidden data-i18n="output.noRuleFired"></p>
  `;

  const canvas = q<HTMLCanvasElement>(container, "canvas");
  const emptyEl = q(container, "[data-empty]");


  function render(): void {
    const { evaluation } = ctx.store.getState();
    const aggregated = evaluation?.aggregated ?? null;
    emptyEl.hidden = aggregated !== null;

    drawMembershipGraph({
      variable: system.output,
      canvas,
      currentValue: aggregated ? (evaluation?.output ?? null) : null,
      highlightTermId: null,
      aggregated,
      formatMarker: formatOutput,
      titleKey: "panels.aggregatedAxis",
    });

    for (const term of system.output.terms) {
      const levelEl = q(container, `[data-legend="${term.id}"] [data-level]`);
      const curve = aggregated?.clipped[term.id];
      // The clipped curve's plateau height is the term's accumulated activation
      // level; sampling its peak keeps the legend in step with the drawn shape.
      levelEl.textContent = curve ? formatDegree(curvePeak(curve, system.output.range)) : formatDegree(0);
    }
  }

  return liveRender({
    store: ctx.store,
    observe: canvas,
    render,
  });
}

export function supportsAggregatedSet(system: FuzzySystem): boolean {
  return system.output.terms.some((term) => term.shape.kind !== "singleton");
}
