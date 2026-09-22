import { applyI18n, q, qa } from "../../dom";
import { curvePeak, ruleStrength } from "../../fuzzy/engine";
import { systems as allSystems } from "../../fuzzy/systems";
import type { FuzzySystem } from "../../fuzzy/types";
import { t } from "../../i18n";
import { formatDegree } from "../../utils/format";
import { readJson, writeJson } from "../../utils/storage";
import { mountAggregatedPanel, supportsAggregatedSet } from "../steps/aggregatedPanel";
import type { AppShellCtx, InferenceStep, Unmount } from "../context";
import { mountControlRail } from "./controlRail";
import { mountDefuzzPanel } from "../steps/defuzzPanel";
import { mountFlowStrip } from "./flowStrip";
import { mountGraphsPanel } from "../steps/graphsPanel";
import { mountRulesPanel } from "../steps/rulesPanel";

const OPEN_STATE_KEY = "fuzzy.openSections";

// The steps sit in the order the inference actually runs: fuzzify the inputs,
// evaluate the rules, accumulate the clipped conclusions, then read a crisp
// number back off the resulting set.
function stepsFor(system: FuzzySystem): InferenceStep[] {
  const steps: InferenceStep[] = [
    {
      id: "fuzzification",
      titleKey: "steps.fuzzification",
      shortKey: "flow.short.fuzzification",
      hintKey: "steps.fuzzificationHint",
      mount: mountGraphsPanel,
      status: (s, state) => {
        const ev = state.evaluation;
        if (!ev) return "";
        let active = 0;
        for (const v of s.inputs) {
          for (const term of v.terms) if ((ev.memberships[v.id]?.[term.id] ?? 0) > 0) active++;
        }
        return t("flow.status.activeTerms", { n: active });
      },
    },
    {
      id: "rules",
      titleKey: "steps.rules",
      shortKey: "flow.short.rules",
      hintKey: "steps.rulesHint",
      mount: mountRulesPanel,
      status: (s, state) => {
        const ev = state.evaluation;
        if (!ev) return "";
        const fired = s.rules.filter((r) => ruleStrength(r, ev.memberships) > 0).length;
        return t("flow.status.firedRules", { n: fired, total: s.rules.length });
      },
    },
  ];

  if (supportsAggregatedSet(system)) {
    steps.push({
      id: "aggregation",
      titleKey: "steps.aggregation",
      shortKey: "flow.short.aggregation",
      hintKey: "steps.aggregationHint",
      mount: mountAggregatedPanel,
      status: (s, state) => {
        const set = state.evaluation?.aggregated;
        if (!set) return "";
        return `μΣmax = ${formatDegree(curvePeak(set.envelope, s.output.range))}`;
      },
    });
  }

  steps.push({
    id: "defuzzification",
    titleKey: "steps.defuzzification",
    shortKey: "flow.short.defuzzification",
    hintKey: "steps.defuzzificationHint",
    mount: mountDefuzzPanel,
    status: (s) => t(`output.defuzzMethod.${s.defuzz}`),
  });

  return steps;
}

const CHEVRON = `
  <svg class="w-4 h-4 shrink-0 text-graphite-400 transition-transform group-open:rotate-180"
       viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
    <path d="M5 7l5 6 5-6H5z"/>
  </svg>`;

export function mountWorkbench(container: HTMLElement, ctx: AppShellCtx): Unmount {
  let childUnmounts: Unmount[] = [];
  let sectionObserver: IntersectionObserver | null = null;
  const openState = readOpenState();

  function render(system: FuzzySystem): void {
    teardown();

    const draftBanner = system.draft
      ? `<div class="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 mb-4 flex items-start gap-2">
          <span class="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-200 text-amber-900 mt-0.5" data-i18n="status.draft"></span>
          <span data-i18n="status.draftBanner"></span>
        </div>`
      : "";

    const steps = stepsFor(system);

    container.innerHTML = `
      ${draftBanner}
      <!-- No items-start here: it would shrink the rail column to its own
           height, leaving the sticky rail inside no room to travel. -->
      <div class="lg:grid lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] lg:gap-6">
        <div id="controlRail"></div>

        <div class="min-w-0 mt-4 lg:mt-0">
          <div id="flowStrip"></div>
          <div class="grid gap-3 mt-3">
            ${steps.map((step, idx) => sectionHtml(step, idx, openState)).join("")}
          </div>
        </div>
      </div>
    `;

    childUnmounts.push(mountControlRail(q(container, "#controlRail"), ctx, system));

    const strip = mountFlowStrip(q(container, "#flowStrip"), ctx, system, steps, revealStep);
    childUnmounts.push(strip.unmount);

    for (const step of steps) {
      childUnmounts.push(step.mount(q(container, `#step-${step.id}`), ctx, system));
    }

    for (const el of qa<HTMLDetailsElement>(container, "[data-step-section]")) {
      el.addEventListener("toggle", () => {
        openState[el.dataset.stepSection!] = el.open;
        writeOpenState(openState);
      });
    }

    // Which step the reader is looking at drives the strip's highlight, so the
    // strip doubles as a position indicator and not only as a jump list.
    sectionObserver = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) strip.setActive((visible.target as HTMLElement).dataset.stepSection ?? null);
      },
      { rootMargin: "-25% 0px -60% 0px" },
    );
    for (const el of qa(container, "[data-step-section]")) sectionObserver.observe(el);

    applyI18n(container, t);
  }

  /** Opens a collapsed step and brings it into view: the strip's click target. */
  function revealStep(stepId: string): void {
    const section = container.querySelector<HTMLDetailsElement>(
      `[data-step-section="${stepId}"]`,
    );
    if (!section) return;
    section.open = true;
    section.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function teardown(): void {
    sectionObserver?.disconnect();
    sectionObserver = null;
    for (const u of childUnmounts) u();
    childUnmounts = [];
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
    teardown();
  };
}

function sectionHtml(
  step: InferenceStep,
  idx: number,
  openState: Readonly<Record<string, boolean>>,
): string {
  return `
    <details class="card group p-0 min-w-0" data-step-section="${step.id}" ${isOpen(openState, step) ? "open" : ""}>
      <summary class="cursor-pointer select-none list-none flex items-start justify-between gap-3 p-4">
        <span class="flex items-start gap-3 min-w-0">
          <span class="shrink-0 mt-0.5 w-6 h-6 rounded-md border border-brand-200 bg-brand-50
                       text-brand-700 text-xs font-semibold grid place-items-center tabular-nums">${idx + 1}</span>
          <span class="min-w-0">
            <span class="card-title block" data-i18n="${step.titleKey}"></span>
            <span class="block mt-0.5 text-xs text-graphite-500" data-i18n="${step.hintKey}"></span>
          </span>
        </span>
        ${CHEVRON}
      </summary>
      <div class="px-4 pb-4" id="step-${step.id}"></div>
    </details>`;
}

function isOpen(state: Readonly<Record<string, boolean>>, step: InferenceStep): boolean {
  return state[step.id] ?? step.defaultOpen ?? true;
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
