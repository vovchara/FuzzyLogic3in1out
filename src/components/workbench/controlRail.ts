import { applyI18n, q } from "../../dom";
import type { FuzzySystem } from "../../fuzzy/types";
import { t } from "../../i18n";
import { formatOutput } from "../../utils/format";
import type { AppShellCtx, Unmount } from "../context";
import { mountInputsPanel } from "./inputsPanel";
import { mountOutputPanel } from "./outputPanel";

/**
 * Inputs and result, pinned where they stay readable while the reader scrolls
 * through the inference: a side column from `lg` up, and below that a compact
 * sticky bar that expands into the same two panels as an overlay. Both cases
 * mount the very same panels — only the frame around them differs.
 */
export function mountControlRail(
  container: HTMLElement,
  ctx: AppShellCtx,
  system: FuzzySystem,
): Unmount {
  container.innerHTML = `
    <aside class="sticky top-[var(--header-h)] z-30 lg:top-[calc(var(--header-h)+1rem)] lg:z-10">
      <button type="button" data-rail-toggle aria-expanded="false"
        class="lg:hidden w-full flex items-center justify-between gap-3 px-3 py-2
               rounded-lg border border-graphite-200 bg-white shadow-sm text-left">
        <span class="flex items-baseline gap-2 min-w-0">
          <span class="metric-label" data-i18n="panels.output"></span>
          <span class="text-lg font-semibold font-mono tabular-nums text-graphite-900" data-bar-result>–</span>
          <span class="text-xs font-medium truncate" data-bar-term></span>
        </span>
        <span class="flex items-center gap-1 text-xs text-graphite-500 shrink-0">
          <span data-i18n="panels.railToggle"></span>
          <svg class="w-4 h-4 transition-transform" data-bar-chevron viewBox="0 0 20 20"
               fill="currentColor" aria-hidden="true"><path d="M5 7l5 6 5-6H5z"/></svg>
        </span>
      </button>

      <div data-rail-body
        class="grid gap-3 max-lg:hidden max-lg:absolute max-lg:inset-x-0 max-lg:top-full max-lg:mt-2
               max-lg:p-2 max-lg:rounded-lg max-lg:bg-graphite-100 max-lg:shadow-xl
               max-lg:border max-lg:border-graphite-200 max-lg:max-h-[70vh] max-lg:overflow-y-auto
               lg:max-h-[calc(100vh-var(--header-h)-2rem)] lg:overflow-y-auto lg:pr-0.5">
        <section id="inputsPanel" class="card"></section>
        <section id="outputPanel" class="card"></section>
      </div>
    </aside>
  `;

  const toggle = q<HTMLButtonElement>(container, "[data-rail-toggle]");
  const body = q(container, "[data-rail-body]");
  const chevron = q(container, "[data-bar-chevron]");
  const barResult = q(container, "[data-bar-result]");
  const barTerm = q(container, "[data-bar-term]");

  function setOpen(open: boolean): void {
    // Toggling the literal class rather than a data-variant: `hidden` and
    // `block` are the same specificity, so their source order would decide
    // the winner instead of the attribute.
    body.classList.toggle("max-lg:hidden", !open);
    toggle.setAttribute("aria-expanded", String(open));
    chevron.classList.toggle("rotate-180", open);
  }

  toggle.addEventListener("click", () => {
    setOpen(body.classList.contains("max-lg:hidden"));
  });

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === "Escape") setOpen(false);
  }
  document.addEventListener("keydown", onKeydown);

  function syncBar(): void {
    const { evaluation } = ctx.store.getState();
    if (!evaluation?.fired) {
      barResult.textContent = "–";
      barTerm.textContent = "";
      return;
    }
    barResult.textContent = formatOutput(evaluation.output);
    const term = system.output.terms.find((x) => x.id === evaluation.mostActiveTerm);
    barTerm.textContent = term ? t(term.nameKey) : "";
    barTerm.style.color = term?.color ?? "";
  }

  const unmounts: Unmount[] = [
    mountInputsPanel(q(container, "#inputsPanel"), ctx, system),
    mountOutputPanel(q(container, "#outputPanel"), ctx, system),
  ];

  syncBar();
  const unsub = ctx.store.subscribe(syncBar);
  applyI18n(container, t);

  return () => {
    document.removeEventListener("keydown", onKeydown);
    unsub();
    for (const u of unmounts) u();
  };
}
