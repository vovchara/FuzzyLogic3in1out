import { applyI18n, el, q } from "../../dom";
import { t } from "../../i18n";
import { FIELD_SIZE } from "../../simulation/scenario";
import { defaultChannel, lqFromRssi } from "../../simulation/channel";
import { demoExperiment } from "../../simulation/demo";
import { buildExperiment, type Experiment } from "../../simulation/experiment";
import { parseLayout, type Layout, type LayoutError } from "../../simulation/layout";
import { inputVar, runSimulation, type SimEngines } from "../../simulation/orchestrator";
import { parseTelemetry, type Telemetry } from "../../simulation/telemetry";
import type { SimulationResult } from "../../simulation/types";
import { formatOutput, formatValue } from "../../utils/format";
import { readJson, writeJson } from "../../utils/storage";
import type { AppShellCtx, Unmount } from "../context";
import { BASE_COLOR, MEASURED_COLOR, ROLE_COLOR, mountFieldPanel } from "../simulation/fieldPanel";
import { legendChip, legendLine } from "../simulation/legend";
import {
  mountResultsTable,
  type CellSource,
  type ColumnId,
  type ResultsTable,
  SIGMA_NOTATION,
} from "../simulation/resultsTable";

const FILES_KEY = "fuzzy.experiment";

/** A loaded file: its name for the chip, its text to re-parse after a reload. */
interface LoadedFile {
  readonly name: string;
  readonly text: string;
}

interface StoredFiles {
  layout?: LoadedFile | null;
  capture?: LoadedFile | null;
}

/**
 * The testbed experiment: a measured layout and the capture taken on it, run
 * through the same three controllers as the simulation. Nothing here is
 * edited or dragged — whatever came from the stand is locked — and every cell
 * says whether the testbed measured it or the model filled it in.
 */
export function mountExperimentScreen(container: HTMLElement, ctx: AppShellCtx): Unmount {
  const stored = readJson<StoredFiles>(FILES_KEY, {});
  let layoutFile: LoadedFile | null = isLoaded(stored.layout) ? stored.layout : null;
  let captureFile: LoadedFile | null = isLoaded(stored.capture) ? stored.capture : null;
  let selectedId: number | null = null;

  container.innerHTML = `
    <div class="card">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-3">
        <button type="button" class="btn-primary" data-pick="layout" data-i18n="experiment.layout"></button>
        <input type="file" accept=".json,application/json" data-file="layout" hidden />
        <button type="button" class="btn-primary" data-pick="capture" data-i18n="experiment.capture"></button>
        <input type="file" accept=".csv,text/csv,text/plain" data-file="capture" hidden />
        <button type="button" class="btn" data-sample data-i18n="experiment.sample"></button>
        <button type="button" class="btn-danger" data-reset data-i18n="experiment.reset"></button>
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
          <span class="inline-flex items-center gap-1.5 text-xs">
            <span class="font-mono font-semibold" style="color:${MEASURED_COLOR}">0.00</span>
            <span class="text-graphite-600" data-i18n="experiment.legendMeasured"></span>
          </span>
          <span class="inline-flex items-center gap-1.5 text-xs">
            <span class="font-mono italic text-graphite-400">0.00</span>
            <span class="text-graphite-600" data-i18n="experiment.legendModel"></span>
          </span>
        </div>
      </div>
      <div class="mt-2 flex flex-wrap gap-2" data-chips></div>
      <div class="mt-2 text-xs space-y-0.5" data-status></div>
    </div>
    <div class="card mt-3 text-sm text-graphite-500" data-empty data-i18n="experiment.empty"></div>
    <div data-run hidden>
      <div class="mt-3 lg:grid lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-3 lg:items-start">
        <div class="card" id="expField"></div>
        <div class="card mt-3 lg:mt-0 min-w-0" id="expTable"></div>
      </div>
      <div class="card mt-3 min-w-0">
        <h2 class="card-title" data-i18n="experiment.links.title"></h2>
        <div class="overflow-x-auto mt-3">
          <table class="w-full text-sm">
            <thead>
              <tr>
                <th class="metric-label text-left py-1.5 px-1" data-i18n="experiment.links.from"></th>
                <th class="metric-label text-left py-1.5 px-1" data-i18n="experiment.links.to"></th>
                <th class="metric-label text-right py-1.5 px-1" data-i18n="simulation.columns.pdr"></th>
                <th class="metric-label text-right py-1.5 px-1" data-i18n="simulation.columns.lq"></th>
                <th class="metric-label text-right py-1.5 px-1" data-i18n="experiment.links.rssi"></th>
                <th class="metric-label text-right py-1.5 px-1"><span data-i18n="simulation.columns.sigma"></span>${SIGMA_NOTATION}</th>
                <th class="metric-label text-right py-1.5 px-1" data-i18n="simulation.columns.packets"></th>
              </tr>
            </thead>
            <tbody data-links></tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  const chipsBox = q(container, "[data-chips]");
  const resetButton = q<HTMLButtonElement>(container, "[data-reset]");
  const statusBox = q(container, "[data-status]");
  const emptyBox = q(container, "[data-empty]");
  const runBox = q(container, "[data-run]");
  const linksBody = q(container, "[data-links]");

  const datVar = () => inputVar(ctx.getSystem("aggregation"), "Dat");
  function inputRange(systemId: string, varId: string): readonly [number, number] {
    return inputVar(ctx.getSystem(systemId), varId).range;
  }

  // Derived from the two texts whenever a file changes (or a controller does,
  // which moves the Dat default); selecting a node only re-renders.
  let experiment: Experiment | null = null;
  let telemetry: Telemetry | null = null;
  let layout: Layout | null = null;
  let layoutErrors: readonly LayoutError[] = [];

  const field = mountFieldPanel(q(container, "#expField"), {
    autoZoom: true,
    onSelect(id) {
      selectedId = selectedId === id ? null : id;
      render();
    },
  });

  // The coordinate columns' domains are the layout's field, so the table is
  // remounted whenever a layout with another field size comes in.
  const tableBox = q(container, "#expTable");
  let tableField = 0;
  let table = mountTable(FIELD_SIZE);

  function mountTable(fieldSize: number): ResultsTable {
    tableField = fieldSize;
    const mounted = mountResultsTable(tableBox, {
      onSelect(id) {
        selectedId = selectedId === id ? null : id;
        render();
      },
      ranges: {
        x: [0, fieldSize],
        y: [0, fieldSize],
        re: inputRange("routing", "RE"),
        dat: inputRange("aggregation", "Dat"),
        dist: [0, Math.round(Math.SQRT2 * fieldSize)],
        lq: inputRange("routing", "LQ"),
        pdr: inputRange("commCtrl", "PDR"),
        td: inputRange("commCtrl", "TD"),
        chs: ctx.getSystem("commCtrl").output.range,
        ee: inputRange("aggregation", "EE"),
        ap: ctx.getSystem("aggregation").output.range,
      },
      extraColumns: ["sigma", "packets"],
      extra(id, column) {
        const series = telemetry?.nodes.find((n) => n.nodeId === id);
        if (!series) return null;
        return column === "packets" ? series.packets : series.noiseSigmaDb;
      },
      source: cellSource,
      baseSource: "measured",
    });
    applyI18n(tableBox, t);
    return mounted;
  }

  let lastResult: SimulationResult | null = null;
  function cellSource(id: number, column: ColumnId): CellSource | null {
    const r = lastResult?.nodes.find((n) => n.node.id === id);
    if (!r || !experiment) return null;
    // The layout is measured on site as much as the radio is (tape and
    // column marks), so its coordinates and distances count as measured. EE
    // does not: the stand only sees the voltage, the expended energy comes
    // from the first-order radio model, even if on a real distance.
    switch (column) {
      case "re":
      case "sigma":
      case "packets":
      case "x":
      case "y":
      case "dist":
        return "measured";
      case "lq":
      case "pdr":
        return r.measured.link ? "measured" : "model";
      case "td":
        return r.measured.td ? "measured" : "model";
      // Traffic is a parameter of the run, not a measurement: the boards send
      // at a fixed rate, so a Dat from the layout is set, not measured.
      case "dat":
        return experiment.datFromLayout.has(id) ? null : "model";
      case "ee":
        return "model";
      default:
        return null;
    }
  }

  function engines(): SimEngines {
    return {
      clustering: ctx.getEngine("commCtrl"),
      aggregation: ctx.getEngine("aggregation"),
      routing: ctx.getEngine("routing"),
    };
  }

  function load(): void {
    const parsed = layoutFile ? parseLayout(layoutFile.text, { datMax: datVar().range[1] }) : null;
    layout = parsed?.layout ?? null;
    layoutErrors = parsed?.errors ?? [];
    telemetry = captureFile ? parseTelemetry(captureFile.text) : null;
    experiment =
      layout && telemetry
        ? buildExperiment(layout, telemetry, datVar().defaultValue, defaultChannel)
        : null;
    if (selectedId !== null && !experiment?.scenario.nodes.some((n) => n.id === selectedId)) {
      selectedId = null;
    }
  }

  function render(): void {
    renderChips();
    renderStatus();

    const ready = experiment !== null && experiment.scenario.nodes.length > 0;
    emptyBox.hidden = ready;
    runBox.hidden = !ready;
    if (!experiment || !ready) {
      lastResult = null;
      return;
    }
    const { scenario, links } = experiment;
    lastResult = runSimulation(scenario, engines(), defaultChannel, links);
    if (scenario.field !== tableField) {
      table.unmount();
      table = mountTable(scenario.field);
    }
    field.update(scenario, lastResult, selectedId);
    table.update(lastResult, scenario.base, selectedId);
    renderLinks();
  }

  function renderChips(): void {
    resetButton.disabled = !layoutFile && !captureFile;
    chipsBox.innerHTML = "";
    for (const kind of ["layout", "capture"] as const) {
      const file = kind === "layout" ? layoutFile : captureFile;
      if (!file) continue;
      const clear = el("button", {
        type: "button",
        class: "px-1 text-graphite-400 hover:text-graphite-700 leading-none",
        "aria-label": t("experiment.clear"),
      });
      clear.textContent = "×";
      clear.addEventListener("click", () => {
        if (kind === "layout") layoutFile = null;
        else captureFile = null;
        persist();
        load();
        render();
      });
      const label = el("span", { class: "text-graphite-700" });
      label.textContent = `${t(`experiment.${kind}Short`)}: ${file.name}`;
      chipsBox.append(
        el("span", { class: "inline-flex items-center gap-1 text-xs rounded bg-graphite-100 px-2 py-1" }, [
          label,
          clear,
        ]),
      );
    }
  }

  // Rebuilt from t() on every render, so a language switch localises it.
  const MAX_ERROR_LINES = 5;
  function renderStatus(): void {
    statusBox.innerHTML = "";
    const line = (text: string, cls: string) => {
      const row = el("div", { class: cls });
      row.textContent = text;
      statusBox.append(row);
    };

    if (layout) {
      const meta = [layout.name, layout.date, layout.orientation].filter((s) => s !== "").join(" · ");
      if (meta) line(meta, "text-graphite-700 font-medium");
      if (layout.notes) line(layout.notes, "text-graphite-600");
    }
    for (const err of layoutErrors.slice(0, MAX_ERROR_LINES)) {
      const where = err.path === "" ? "" : err.nodeId ? `${t("experiment.node", { id: err.nodeId })} · ${err.path}` : err.path;
      const reason = t(`experiment.layoutReasons.${err.reason}`);
      line(where ? `${where}: ${reason}` : reason, "text-red-700");
    }
    if (layoutErrors.length > MAX_ERROR_LINES) {
      line(t("experiment.more", { count: layoutErrors.length - MAX_ERROR_LINES }), "text-red-700");
    }

    if (experiment?.missingInLayout.length) {
      line(t("experiment.missingInLayout", { ids: experiment.missingInLayout.join(", ") }), "text-amber-800");
    }
    if (experiment?.missingInCapture.length) {
      line(t("experiment.missingInCapture", { ids: experiment.missingInCapture.join(", ") }), "text-amber-800");
    }
    const rowErrors = telemetry?.errors ?? [];
    for (const err of rowErrors.slice(0, MAX_ERROR_LINES)) {
      line(
        t("experiment.row", { line: err.line, reason: t(`experiment.rowReasons.${err.reason}`) }),
        "text-red-700",
      );
    }
    if (rowErrors.length > MAX_ERROR_LINES) {
      line(t("experiment.more", { count: rowErrors.length - MAX_ERROR_LINES }), "text-red-700");
    }
  }

  /**
   * Every directed pair of the experiment's nodes plus each node's link to the
   * station. The list reads the way the round does: "from" sends, "to" hears.
   */
  function renderLinks(): void {
    if (!experiment || !telemetry) return;
    const ids = experiment.scenario.nodes.map((n) => n.id);
    const byPair = new Map(telemetry.links.map((l) => [`${l.from}>${l.to}`, l]));
    const byNode = new Map(telemetry.nodes.map((n) => [n.nodeId, n]));
    const unit: readonly [number, number] = [0, 1];
    const measured = `style="color:${MEASURED_COLOR};font-weight:600"`;
    const cell = (v: string, attrs = "") =>
      `<td class="py-1.5 px-1 text-right font-mono tabular-nums text-graphite-800" ${attrs}>${v}</td>`;

    let rows = "";
    for (const from of ids) {
      const targets: (number | "base")[] = ["base", ...ids.filter((id) => id !== from)];
      for (const to of targets) {
        const stat =
          to === "base"
            ? (() => {
                const n = byNode.get(from)!;
                return { pdr: n.pdr, rssiMean: n.rssiMean, noiseSigmaDb: n.noiseSigmaDb, heard: n.packets };
              })()
            : byPair.get(`${from}>${to}`) ?? null;
        const involved = selectedId !== null && (from === selectedId || to === selectedId);
        const toLabel = to === "base" ? t("simulation.baseShort") : String(to);
        const head = `
          <td class="py-1.5 px-1 font-mono tabular-nums font-semibold text-graphite-900">${from}</td>
          <td class="py-1.5 px-1 font-mono tabular-nums font-semibold text-graphite-900">${toLabel}</td>`;
        const rowClass = `border-t border-graphite-100 ${involved ? "bg-brand-50" : ""}`;
        if (!stat) {
          rows += `<tr class="${rowClass}">${head}
            <td colspan="5" class="py-1.5 px-1 text-right italic text-graphite-400">${t("experiment.links.unknown")}</td>
          </tr>`;
          continue;
        }
        const lq = stat.rssiMean === null ? 0 : lqFromRssi(stat.rssiMean, defaultChannel);
        rows += `<tr class="${rowClass}">${head}
          ${cell(formatValue(stat.pdr, unit), measured)}
          ${cell(formatValue(lq, unit), measured)}
          ${cell(stat.rssiMean === null ? "—" : stat.rssiMean.toFixed(1), measured)}
          ${cell(stat.noiseSigmaDb === null ? "—" : formatOutput(stat.noiseSigmaDb), measured)}
          ${cell(String(stat.heard), measured)}
        </tr>`;
      }
    }
    linksBody.innerHTML = rows;
  }

  function persist(): void {
    writeJson(FILES_KEY, { layout: layoutFile, capture: captureFile } satisfies StoredFiles);
  }

  for (const kind of ["layout", "capture"] as const) {
    const input = q<HTMLInputElement>(container, `[data-file="${kind}"]`);
    q(container, `[data-pick="${kind}"]`).addEventListener("click", () => input.click());
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      // Reset right away, or picking the same (re-captured) file fires nothing.
      input.value = "";
      if (!file) return;
      const loaded = { name: file.name, text: await file.text() };
      if (kind === "layout") layoutFile = loaded;
      else captureFile = loaded;
      persist();
      load();
      render();
    });
  }

  q(container, "[data-sample]").addEventListener("click", () => {
    const dat = datVar();
    const demo = demoExperiment(dat.range[1], dat.defaultValue, defaultChannel);
    layoutFile = { name: demo.layoutFileName, text: demo.layoutJson };
    captureFile = { name: demo.captureFileName, text: demo.csv };
    persist();
    load();
    render();
  });

  resetButton.addEventListener("click", () => {
    layoutFile = null;
    captureFile = null;
    selectedId = null;
    persist();
    load();
    render();
  });

  // A new revision means a controller was retrained or reset: the same
  // measurements may now elect different roles. Language is rendered into the
  // markup, so a switch rebuilds it too.
  let revision = ctx.store.getState().systemRevision;
  let language = ctx.store.getState().language;
  const unsub = ctx.store.subscribe((s) => {
    if (s.systemRevision === revision && s.language === language) return;
    revision = s.systemRevision;
    language = s.language;
    applyI18n(container, t);
    load();
    render();
  });

  applyI18n(container, t);
  load();
  render();

  return () => {
    unsub();
    field.unmount();
    table.unmount();
  };
}


function isLoaded(f: unknown): f is LoadedFile {
  if (typeof f !== "object" || f === null) return false;
  const { name, text } = f as Record<string, unknown>;
  return typeof name === "string" && typeof text === "string";
}
