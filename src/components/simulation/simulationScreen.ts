import { applyI18n, q } from "../../dom";
import { t } from "../../i18n";
import { inputVar, runSimulation, type SimEngines } from "../../simulation/orchestrator";
import {
  FIELD_SIZE,
  NODE_COUNT_DEFAULT,
  NODE_COUNT_MAX,
  NODE_COUNT_MIN,
  generateScenario,
  moveBase,
  moveNode,
  parseScenario,
  updateNode,
} from "../../simulation/scenario";
import { readJson, writeJson } from "../../utils/storage";
import type { AppShellCtx, Unmount } from "../context";
import { REFRESH_ICON } from "../icons";
import { BASE_COLOR, ROLE_COLOR, mountFieldPanel } from "./fieldPanel";
import { legendChip, legendLine } from "./legend";
import { mountResultsTable } from "./resultsTable";

const SCENARIO_KEY = "fuzzy.simulation";

/** Fixed first-visit seed: everyone's demo starts from the same field. */
const DEFAULT_SEED = 1;

export function mountSimulationScreen(container: HTMLElement, ctx: AppShellCtx): Unmount {
  let scenario =
    parseScenario(readJson<unknown>(SCENARIO_KEY, null)) ??
    generateScenario(NODE_COUNT_DEFAULT, DEFAULT_SEED);
  let selectedId: number | null = null;

  container.innerHTML = `
    <div class="card">
      <div class="flex flex-wrap items-center gap-x-6 gap-y-3">
        <label class="block grow min-w-[11rem] max-w-xs">
          <div class="flex items-baseline justify-between text-sm">
            <span class="font-medium text-graphite-700" data-i18n="simulation.nodeCount"></span>
            <span class="font-mono tabular-nums text-graphite-900" data-count-display></span>
          </div>
          <input type="range" min="${NODE_COUNT_MIN}" max="${NODE_COUNT_MAX}" step="1"
                 data-count class="w-full mt-1" />
        </label>
        <button type="button" class="btn inline-flex items-center gap-1.5" data-regenerate>
          ${REFRESH_ICON}<span data-i18n="simulation.regenerate"></span>
        </button>
        <div class="flex flex-wrap gap-x-4 gap-y-1.5 items-center lg:ml-auto">
          ${legendChip(ROLE_COLOR.head, "simulation.roles.head")}
          ${legendChip(ROLE_COLOR.aggregator, "simulation.roles.aggregator")}
          ${legendChip(ROLE_COLOR.member, "simulation.roles.member")}
          ${legendChip(BASE_COLOR, "simulation.legendBase", true)}
          ${legendLine(`<line x1="0" y1="4" x2="16" y2="4" stroke="#16a694" stroke-width="2"></line>
                        <path d="M15 0.5L23 4L15 7.5z" fill="#16a694"></path>`, "simulation.legendRoute")}
          ${legendLine(`<line x1="0" y1="4" x2="16" y2="4" stroke="#b6bdc4" stroke-width="1.6"
                              stroke-dasharray="3 3"></line>
                        <path d="M15 0.5L23 4L15 7.5z" fill="#b6bdc4"></path>`, "simulation.legendFlow")}
        </div>
      </div>
    </div>
    <div class="mt-3 lg:grid lg:grid-cols-[minmax(0,25rem)_minmax(0,1fr)] lg:gap-3 lg:items-start">
      <div class="card" id="simField"></div>
      <div class="card mt-3 lg:mt-0 min-w-0" id="simTable"></div>
    </div>
  `;

  const countSlider = q<HTMLInputElement>(container, "[data-count]");
  const countDisplay = q(container, "[data-count-display]");

  const field = mountFieldPanel(q(container, "#simField"), {
    onMove(target, x, y, done) {
      scenario = target === "base" ? moveBase(scenario, x, y) : moveNode(scenario, target, x, y);
      if (done) apply(true);
      else scheduleApply();
    },
    onSelect(id) {
      selectedId = selectedId === id ? null : id;
      render();
    },
  });

  // Column domains come from the controllers' own definitions, so the table
  // can never promise a range the inference does not accept.
  function inputRange(systemId: string, varId: string): readonly [number, number] {
    return inputVar(ctx.getSystem(systemId), varId).range;
  }

  const table = mountResultsTable(q(container, "#simTable"), {
    onSelect(id) {
      selectedId = selectedId === id ? null : id;
      render();
    },
    onEdit(id, field, value) {
      scenario = updateNode(scenario, id, { [field]: value });
      apply(true);
    },
    onCommit() {
      render();
    },
    ranges: {
      x: [0, FIELD_SIZE],
      y: [0, FIELD_SIZE],
      re: inputRange("routing", "RE"),
      dat: inputRange("aggregation", "Dat"),
      dist: [0, Math.round(Math.SQRT2 * FIELD_SIZE)],
      lq: inputRange("routing", "LQ"),
      pdr: inputRange("commCtrl", "PDR"),
      td: inputRange("commCtrl", "TD"),
      chs: ctx.getSystem("commCtrl").output.range,
      ee: inputRange("aggregation", "EE"),
      ap: ctx.getSystem("aggregation").output.range,
    },
  });

  function engines(): SimEngines {
    return {
      clustering: ctx.getEngine("commCtrl"),
      aggregation: ctx.getEngine("aggregation"),
      routing: ctx.getEngine("routing"),
    };
  }

  function render(): void {
    const result = runSimulation(scenario, engines());
    field.update(scenario, result, selectedId);
    table.update(result, scenario.base, selectedId);
    countSlider.value = String(scenario.nodes.length);
    countDisplay.textContent = String(scenario.nodes.length);
  }

  function apply(persist: boolean): void {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    render();
    if (persist) writeJson(SCENARIO_KEY, scenario);
  }

  // Dragging reruns the whole simulation; one run per frame is plenty.
  let rafId = 0;
  function scheduleApply(): void {
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      render();
    });
  }

  countSlider.addEventListener("input", () => {
    const count = Number(countSlider.value);
    if (count === scenario.nodes.length) return;
    scenario = generateScenario(count, scenario.seed);
    selectedId = null;
    apply(true);
  });

  q(container, "[data-regenerate]").addEventListener("click", () => {
    scenario = generateScenario(scenario.nodes.length, Math.floor(Math.random() * 2 ** 31));
    selectedId = null;
    apply(true);
  });

  // A new revision means a controller was retrained or reset: the same field
  // may now elect different roles. Language is rendered into the field and
  // table markup, so a switch rebuilds them too.
  let revision = ctx.store.getState().systemRevision;
  let language = ctx.store.getState().language;
  const unsub = ctx.store.subscribe((s) => {
    if (s.systemRevision === revision && s.language === language) return;
    revision = s.systemRevision;
    language = s.language;
    applyI18n(container, t);
    render();
  });

  applyI18n(container, t);
  apply(false);

  return () => {
    unsub();
    if (rafId) cancelAnimationFrame(rafId);
    field.unmount();
    table.unmount();
  };
}
