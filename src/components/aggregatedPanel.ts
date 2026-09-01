import { q } from "../dom";
import type { FuzzySystem } from "../fuzzy/types";
import type { AppShellCtx, Unmount } from "./appShell";
import { drawMembershipGraph } from "./membershipGraph";

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
        <span class="font-mono tabular-nums text-slate-500" data-level>0.000</span>
      </span>`,
    )
    .join("");

  container.innerHTML = `
    <h2 class="card-title" data-i18n="panels.aggregated"></h2>
    <div class="relative mt-3">
      <canvas class="w-full h-[260px] rounded-md bg-white"></canvas>
    </div>
    <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
      <span class="text-slate-400" data-i18n="panels.aggregatedLevels"></span>
      ${legend}
    </div>
    <p class="mt-2 text-xs text-slate-500" data-empty hidden data-i18n="panels.aggregatedEmpty"></p>
  `;

  const canvas = q<HTMLCanvasElement>(container, "canvas");
  const emptyEl = q(container, "[data-empty]");

  let rafId: number | null = null;
  function scheduleRender(): void {
    if (rafId !== null) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      render();
    });
  }

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
      titleKey: "panels.aggregatedAxis",
    });

    for (const term of system.output.terms) {
      const levelEl = q(container, `[data-legend="${term.id}"] [data-level]`);
      const curve = aggregated?.clipped[term.id];
      levelEl.textContent = curve ? peakOf(curve).toFixed(3) : "0.000";
    }
  }

  // The clipped curve's plateau height is the term's accumulated activation
  // level; sampling its peak keeps the legend in step with the drawn shape.
  function peakOf(curve: (x: number) => number): number {
    const [xMin, xMax] = system.output.range;
    const steps = 400;
    let peak = 0;
    for (let i = 0; i <= steps; i++) {
      const y = curve(xMin + ((xMax - xMin) * i) / steps);
      if (y > peak) peak = y;
    }
    return peak;
  }

  render();
  const unsub = ctx.store.subscribe(scheduleRender);
  const onResize = () => scheduleRender();
  window.addEventListener("resize", onResize);

  return () => {
    if (rafId !== null) cancelAnimationFrame(rafId);
    window.removeEventListener("resize", onResize);
    unsub();
  };
}

export function supportsAggregatedSet(system: FuzzySystem): boolean {
  return system.output.terms.some((term) => term.shape.kind !== "singleton");
}
