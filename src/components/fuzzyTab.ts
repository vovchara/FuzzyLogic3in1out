import { applyI18n, q, qa } from "../dom";
import { systems as allSystems } from "../fuzzy/systems";
import type { FuzzySystem } from "../fuzzy/types";
import { t } from "../i18n";
import { readJson, writeJson } from "../utils/storage";
import type { AppShellCtx, Unmount } from "./appShell";
import { mountAggregatedPanel, supportsAggregatedSet } from "./aggregatedPanel";
import { mountGraphsPanel } from "./graphsPanel";
import { mountInputsPanel } from "./inputsPanel";
import { mountOutputPanel } from "./outputPanel";
import { mountRulesPanel } from "./rulesPanel";

const OPEN_STATE_KEY = "fuzzy.openSections";
const PROCESS_ID = "process";

interface InferenceStep {
  readonly id: string;
  readonly titleKey: string;
  readonly mount: (host: HTMLElement, ctx: AppShellCtx, system: FuzzySystem) => Unmount;
}

// The steps sit in the order the inference actually runs: fuzzify the inputs,
// evaluate the rules, then clip/accumulate into the resulting set the crisp
// answer is read from. Systems with singleton outputs skip the last one.
function stepsFor(system: FuzzySystem): InferenceStep[] {
  const steps: InferenceStep[] = [
    { id: "fuzzification", titleKey: "steps.fuzzification", mount: mountGraphsPanel },
    { id: "rules", titleKey: "steps.rules", mount: mountRulesPanel },
  ];
  if (supportsAggregatedSet(system)) {
    steps.push({ id: "aggregation", titleKey: "steps.aggregation", mount: mountAggregatedPanel });
  }
  return steps;
}

const CHEVRON = `
  <svg class="w-4 h-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180"
       viewBox="0 0 20 20" fill="currentColor">
    <path d="M5 7l5 6 5-6H5z"/>
  </svg>`;

export function mountFuzzyTab(container: HTMLElement, ctx: AppShellCtx): Unmount {
  let childUnmounts: Unmount[] = [];
  const openState = readOpenState();

  function render(system: FuzzySystem): void {
    for (const u of childUnmounts) u();
    childUnmounts = [];

    const draftBanner = system.draft
      ? `<div class="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 mb-4 flex items-start gap-2">
          <span class="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-200 text-amber-900 mt-0.5" data-i18n="status.draft"></span>
          <span data-i18n="status.draftBanner"></span>
        </div>`
      : "";
    const steps = stepsFor(system);
    container.innerHTML = `
      ${draftBanner}
      <div class="grid gap-4 md:grid-cols-2">
        <section id="inputsPanel" class="card"></section>
        <section id="outputPanel" class="card"></section>
      </div>

      <details class="group mt-4" data-section="${PROCESS_ID}" ${isOpen(openState, PROCESS_ID) ? "open" : ""}>
        <summary class="cursor-pointer select-none list-none flex items-center gap-2 px-1 py-1">
          <h2 class="card-title" data-i18n="panels.process"></h2>
          <span class="text-xs text-slate-400 group-open:hidden" data-i18n="panels.processShow"></span>
          <span class="text-xs text-slate-400 hidden group-open:inline" data-i18n="panels.processHide"></span>
          ${CHEVRON}
        </summary>
        <div class="grid gap-4 mt-2">
          ${steps
            .map(
              (step, idx) => `
            <details class="card group/step" data-section="${step.id}" ${isOpen(openState, step.id) ? "open" : ""}>
              <summary class="cursor-pointer select-none list-none flex items-center justify-between gap-2">
                <h3 class="card-title flex items-baseline gap-2">
                  <span class="text-slate-400 tabular-nums">${idx + 1}.</span>
                  <span data-i18n="${step.titleKey}"></span>
                </h3>
                <svg class="w-4 h-4 shrink-0 text-slate-400 transition-transform group-open/step:rotate-180"
                     viewBox="0 0 20 20" fill="currentColor">
                  <path d="M5 7l5 6 5-6H5z"/>
                </svg>
              </summary>
              <div class="mt-3" id="step-${step.id}"></div>
            </details>`,
            )
            .join("")}
        </div>
      </details>
    `;

    childUnmounts.push(mountInputsPanel(q(container, "#inputsPanel"), ctx, system));
    childUnmounts.push(mountOutputPanel(q(container, "#outputPanel"), ctx, system));
    for (const step of steps) {
      childUnmounts.push(step.mount(q(container, `#step-${step.id}`), ctx, system));
    }

    for (const el of qa<HTMLDetailsElement>(container, "[data-section]")) {
      el.addEventListener("toggle", () => {
        openState[el.dataset.section!] = el.open;
        writeOpenState(openState);
      });
    }

    applyI18n(container, t);
  }

  let currentId = ctx.store.getState().activeSystemId;
  render(findSystem(currentId));

  const unsub = ctx.store.subscribe((s) => {
    if (s.activeSystemId !== currentId) {
      currentId = s.activeSystemId;
      render(findSystem(currentId));
    }
  });

  return () => {
    unsub();
    for (const u of childUnmounts) u();
    childUnmounts = [];
  };
}

function isOpen(state: Readonly<Record<string, boolean>>, id: string): boolean {
  return state[id] ?? true;
}

function readOpenState(): Record<string, boolean> {
  return readJson<Record<string, boolean>>(OPEN_STATE_KEY, {});
}

function writeOpenState(state: Readonly<Record<string, boolean>>): void {
  writeJson(OPEN_STATE_KEY, state);
}

function findSystem(id: string): FuzzySystem {
  const s = allSystems.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown system: ${id}`);
  return s;
}
