import { applyI18n, q, qa } from "../../dom";
import type { FuzzySystem } from "../../fuzzy/types";
import { t } from "../../i18n";
import type { AppShellCtx, InferenceStep, Unmount } from "../context";

export interface FlowStripHandle {
  readonly unmount: Unmount;
  /** Marks which step the reader is currently on; null clears the highlight. */
  setActive(stepId: string | null): void;
}

const ARROW = `
  <li aria-hidden="true" class="shrink-0 self-center text-graphite-300">
    <svg class="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path d="M7 4l6 6-6 6V4z"/></svg>
  </li>`;

/**
 * The inference read left to right, one node per stage. It is a diagram of the
 * pipeline and the navigation through it at once — each node carries a live
 * reading of what its stage is currently doing, and clicking it opens that
 * section.
 *
 * Nodes share the available width rather than taking a fixed one. Fixed widths
 * plus a leading "inputs" and trailing "result" node added up to more than the
 * column, which left the strip with a horizontal scrollbar that was easy to
 * miss — and both of those nodes only repeated what the control rail already
 * shows right beside them.
 */
export function mountFlowStrip(
  container: HTMLElement,
  ctx: AppShellCtx,
  system: FuzzySystem,
  steps: readonly InferenceStep[],
  onSelect: (stepId: string) => void,
): FlowStripHandle {
  const nodes = steps.map((step, idx) => stepHtml(step, idx + 1));

  container.innerHTML = `
    <nav data-i18n-aria-label="flow.label"
         class="lg:sticky lg:top-[var(--header-h)] lg:z-20 lg:py-2 lg:-my-1 lg:bg-graphite-50">
      <ol class="flex items-stretch gap-1.5 max-lg:overflow-x-auto pb-1">
        ${nodes.join(ARROW)}
      </ol>
    </nav>
  `;

  const buttons = qa<HTMLButtonElement>(container, "[data-flow]");

  for (const btn of buttons) {
    btn.addEventListener("click", () => {
      onSelect(btn.dataset.flow!);
    });
  }

  function render(): void {
    const state = ctx.store.getState();
    for (const step of steps) {
      q(container, `[data-flow="${step.id}"] [data-status]`).textContent = step.status(
        system,
        state,
      );
    }
  }

  function setActive(stepId: string | null): void {
    for (const btn of buttons) btn.dataset.active = String(btn.dataset.flow === stepId);
  }

  render();
  const unsub = ctx.store.subscribe(render);
  applyI18n(container, t);

  return { unmount: unsub, setActive };
}

const NODE_BASE = `w-full text-left rounded-lg border px-2.5 py-1.5 transition`;

function stepHtml(step: InferenceStep, index: number): string {
  return `
    <li class="flex flex-1 min-w-[7rem]">
      <button type="button" data-flow="${step.id}" data-active="false"
        class="${NODE_BASE} border-graphite-200 bg-white hover:border-brand-300 hover:bg-brand-50/50
               data-[active=true]:border-brand-500 data-[active=true]:bg-brand-50
               data-[active=true]:ring-1 data-[active=true]:ring-brand-300">
        <span class="flex items-center gap-1.5">
          <span class="w-4 h-4 shrink-0 rounded bg-graphite-100 text-graphite-600
                       text-[10px] font-semibold grid place-items-center tabular-nums">${index}</span>
          <span class="text-[11px] font-semibold text-graphite-700 truncate"
                data-i18n="${step.shortKey}"></span>
        </span>
        <span class="block mt-0.5 h-4 text-[11px] font-mono tabular-nums text-graphite-500 truncate"
              data-status></span>
      </button>
    </li>`;
}

