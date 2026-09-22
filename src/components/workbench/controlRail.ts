import { applyI18n, q } from "../../dom";
import type { FuzzySystem } from "../../fuzzy/types";
import { t } from "../../i18n";
import { formatOutput, formatValue } from "../../utils/format";
import type { AppShellCtx, Unmount } from "../context";
import { mountInputsPanel } from "./inputsPanel";
import { mountOutputPanel } from "./outputPanel";

/**
 * Inputs and result, kept reachable while the reader scrolls through the
 * inference. From `lg` up they sit in a sticky side column. Below that they
 * become a sheet anchored to the bottom of the screen: a bar showing the
 * result, which expands upward into the same two panels.
 *
 * The bar is `fixed`, not `sticky`. A sticky bar needs a container taller than
 * itself to travel inside, which it does not have here — it used to scroll off
 * the top of the screen and leave the inputs unreachable without scrolling all
 * the way back up. Anchoring to the bottom also puts it where a thumb is.
 */
export function mountControlRail(
  container: HTMLElement,
  ctx: AppShellCtx,
  system: FuzzySystem,
): Unmount {
  container.innerHTML = `
    <div data-rail-backdrop hidden
         class="lg:hidden fixed inset-0 z-30 bg-graphite-900/40"></div>

    <aside class="max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-40
                  max-lg:flex max-lg:flex-col-reverse
                  lg:sticky lg:top-[calc(var(--header-h)+1rem)] lg:z-10">
      <button type="button" data-rail-toggle aria-expanded="false"
        class="lg:hidden w-full flex items-center justify-between gap-3 px-4 py-3 text-left
               border-t border-graphite-200 bg-white shadow-[0_-2px_12px_rgba(0,0,0,0.10)]">
        <span class="min-w-0">
          <span class="flex items-baseline gap-2 min-w-0">
            <span class="metric-label" data-i18n="panels.output"></span>
            <span class="text-xl font-semibold font-mono tabular-nums text-graphite-900" data-bar-result>–</span>
            <span class="text-xs font-medium truncate" data-bar-term></span>
          </span>
          <span class="block text-[11px] font-mono tabular-nums text-graphite-500 truncate"
                data-bar-inputs></span>
        </span>
        <span class="flex items-center gap-1.5 text-xs font-medium text-brand-700 shrink-0">
          <span data-i18n="panels.inputs"></span>
          <svg class="w-4 h-4 transition-transform" data-bar-chevron viewBox="0 0 20 20"
               fill="currentColor" aria-hidden="true"><path d="M15 13l-5-6-5 6h10z"/></svg>
        </span>
      </button>

      <div data-rail-body
        class="grid gap-3
               max-lg:hidden max-lg:p-3 max-lg:bg-graphite-100
               max-lg:border-t max-lg:border-graphite-200
               max-lg:max-h-[70vh] max-lg:overflow-y-auto
               lg:max-h-[calc(100vh-var(--header-h)-2rem)] lg:overflow-y-auto lg:pr-0.5">
        <section id="inputsPanel" class="card"></section>
        <section id="outputPanel" class="card"></section>
      </div>
    </aside>
  `;

  const toggle = q<HTMLButtonElement>(container, "[data-rail-toggle]");
  const body = q(container, "[data-rail-body]");
  const backdrop = q(container, "[data-rail-backdrop]");
  const chevron = q(container, "[data-bar-chevron]");
  const barResult = q(container, "[data-bar-result]");
  const barTerm = q(container, "[data-bar-term]");
  const barInputs = q(container, "[data-bar-inputs]");

  function setOpen(open: boolean): void {
    // Toggling the literal class rather than a data-variant: `hidden` and
    // `grid` are the same specificity, so their source order would decide the
    // winner instead of the attribute.
    body.classList.toggle("max-lg:hidden", !open);
    backdrop.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    chevron.classList.toggle("rotate-180", open);
  }

  toggle.addEventListener("click", () => {
    setOpen(body.classList.contains("max-lg:hidden"));
  });
  backdrop.addEventListener("click", () => setOpen(false));

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === "Escape") setOpen(false);
  }
  document.addEventListener("keydown", onKeydown);

  function syncBar(): void {
    const { evaluation, inputs } = ctx.store.getState();

    // The collapsed bar carries the inputs too, so the reader can see what
    // produced the result without opening the sheet. Short ids keep it to one
    // line at phone width; the panels behind the bar spell the names out.
    barInputs.textContent = system.inputs
      .map((v) => `${v.id} ${formatValue(inputs[v.id] ?? v.defaultValue, v.range)}`)
      .join(" · ");

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
