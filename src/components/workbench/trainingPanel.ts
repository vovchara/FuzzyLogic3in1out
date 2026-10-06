import { applyI18n, q } from "../../dom";
import type { FuzzySystem } from "../../fuzzy/types";
import { t } from "../../i18n";
import { DEFAULT_ANFIS_OPTIONS } from "../../training/anfis";
import { trainInWorker, type TrainingRun } from "../../training/client";
import { trainingMethod, type TrainingMethod } from "../../training/config";
import { hasTemplate, parseDataset, templateRows, templateSizes, type DatasetError } from "../../training/dataset";
import { DEFAULT_GENETIC_OPTIONS } from "../../training/genetic";
import { progressOf, type ProgressPoint, type TrainingRecord } from "../../training/record";
import { reportSheets } from "../../training/report";
import { downloadXlsx, readTable } from "../../utils/excel";
import { readString, writeString } from "../../utils/storage";
import { drawConvergence } from "../chart/convergence";
import { chooseDialog, confirmDialog } from "../shell/confirmDialog";
import type { AppShellCtx, Unmount } from "../context";
import { DOWNLOAD_ICON, ROLLBACK_ICON } from "../icons";
import { changesHtml } from "./trainingChanges";

const OPEN_KEY = "fuzzy.trainingOpen";

/**
 * Strings that name the method or its steps; ANFIS has its own under
 * `training.anfis`, everything else on the card is shared.
 */
const METHOD_KEYS = new Set([
  "title", "stateTrained", "hint", "upload", "progress", "cancelled", "trainedNote", "chartEmpty",
  "legendBest", "legendMean", "generations", "axisGenerations", "stopHint", "errors.failed",
  "resetConfirm.title", "resetConfirm.body", "sizeDialog.body",
]);

function keyFor(method: TrainingMethod): (key: string) => string {
  return (key) => (method === "anfis" && METHOD_KEYS.has(key) ? `training.anfis.${key}` : `training.${key}`);
}

/**
 * The workbench's door to the training module: a collapsible card above the
 * inference steps, present only for controllers the module is switched on
 * for. It hands the expert controller and the uploaded dataset to the module
 * and passes whatever comes back to `ctx.setTraining`; applying it rebuilds
 * the workbench, this card included, so the card itself only ever holds the
 * state of a running job.
 */
export function mountTrainingPanel(
  host: HTMLElement,
  ctx: AppShellCtx,
  system: FuzzySystem,
): Unmount {
  const expert = ctx.getExpertSystem(system.id);
  const record = ctx.getTraining(system.id);
  const method = trainingMethod(expert) ?? "genetic";
  const key = keyFor(method);
  const open = readString(OPEN_KEY) === "1";

  // The one place that says the controller runs on optimised parameters, so
  // the whole card changes colour for it rather than a badge alone.
  const cardClasses = record ? "!border-brand-500 ring-2 ring-brand-500/30 !bg-brand-50" : "";
  const summaryLine = record
    ? `<span class="block mt-0.5 text-xs font-medium text-brand-800">
         <span data-i18n="${key("trainedNote")}"></span>
         <span class="block sm:inline font-mono tabular-nums whitespace-nowrap"><span class="hidden sm:inline">· </span>RMSE ${record.rmseBefore.test.toFixed(2)} → ${record.rmseAfter.test.toFixed(2)}</span>
       </span>`
    : `<span class="block mt-0.5 text-xs text-graphite-500" data-i18n="${key("hint")}"></span>`;

  host.innerHTML = `
    <details class="card group p-0 min-w-0 ${cardClasses}" data-training ${open ? "open" : ""}>
      <summary class="cursor-pointer select-none list-none flex items-start justify-between gap-3 p-4">
        <span class="flex items-start gap-3 min-w-0">
          <span class="shrink-0 mt-0.5 w-6 h-6 rounded-md grid place-items-center
                       ${record ? "bg-brand-600 text-white" : "border border-brand-200 bg-brand-50 text-brand-700"}">
            ${TRAINING_ICON}
          </span>
          <span class="min-w-0">
            <span class="card-title block ${record ? "!text-brand-800" : ""}" data-i18n="${key("title")}"></span>
            ${summaryLine}
          </span>
        </span>
        <span class="flex items-center gap-2 shrink-0">
          <span class="whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded
                       ${record ? "bg-brand-600 text-white" : "bg-graphite-100 text-graphite-600"}"
                data-i18n="${record ? key("stateTrained") : "training.stateExpert"}"></span>
          ${CHEVRON}
        </span>
      </summary>

      <div class="px-4 pb-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div class="min-w-0">
          ${record ? `<p class="text-xs text-graphite-500 mb-3" data-i18n="${key("hint")}"></p>` : ""}
          <!-- Optimise and its undo side by side: action and counter-action. -->
          <div class="grid gap-2 justify-items-start" data-idle>
            <div class="flex flex-wrap gap-2">
              <button type="button" class="btn-primary" data-upload data-i18n="${key("upload")}"></button>
              ${record ? `
              <!-- Tinted red: it throws the optimisation result away. -->
              <button type="button" data-reset
                class="btn inline-flex items-center gap-1.5 whitespace-nowrap
                       !border-red-300 !text-red-700 hover:!bg-red-50 hover:!border-red-400">
                ${ROLLBACK_ICON}<span data-i18n="training.reset"></span>
              </button>` : ""}
            </div>
            ${hasTemplate(expert) ? `<button type="button" class="btn inline-flex items-center gap-1.5" data-template>
              ${DOWNLOAD_ICON}<span data-i18n="training.template"></span>
            </button>` : ""}
            <input type="file" accept=".xlsx,.csv" hidden data-file />
          </div>

          <div class="grid gap-2" data-running hidden>
            <div class="flex items-baseline justify-between gap-2 text-xs">
              <span class="text-graphite-600" data-progress-label></span>
              <button type="button" class="btn !px-2 !py-0.5 !text-xs" data-cancel data-i18n="training.cancel"></button>
            </div>
            <!-- Indeterminate: the run ends when the curve flattens, not at a known
                 generation, so a filling bar would promise an end it cannot know. -->
            <div class="h-1.5 rounded-full bg-brand-100 overflow-hidden">
              <div class="h-full w-full bg-brand-600 animate-pulse"></div>
            </div>
            <p class="text-[11px] text-graphite-500" data-i18n="${key("stopHint")}"></p>
          </div>

          <p class="mt-3 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5"
             data-message hidden></p>

          ${record ? resultHtml(record, key) : ""}
        </div>

        <div class="min-w-0">
          <div class="grid gap-2" data-chart-block hidden>
            <canvas class="w-full h-[200px]" data-chart></canvas>
            <div class="flex gap-3 text-[11px] text-graphite-500">
              <span class="flex items-center gap-1"><span class="w-3 h-0.5 bg-brand-700"></span><span data-i18n="${key("legendBest")}"></span></span>
              <span class="flex items-center gap-1"><span class="w-3 h-0.5 bg-graphite-300"></span><span data-i18n="${key("legendMean")}"></span></span>
            </div>
          </div>
          <p class="h-full min-h-[120px] grid place-items-center rounded-md border border-dashed border-graphite-200
                    px-4 text-center text-xs text-graphite-400" data-chart-empty data-i18n="${key("chartEmpty")}"></p>
        </div>

        ${record ? changesHtml(expert, record) : ""}
      </div>
    </details>
  `;

  const container = q(host, "[data-training]");
  container.addEventListener("toggle", () => {
    writeString(OPEN_KEY, (container as HTMLDetailsElement).open ? "1" : "0");
    // A canvas laid out while the card was closed measured zero width.
    redrawChart();
  });

  const idle = q(container, "[data-idle]");
  const running = q(container, "[data-running]");
  const fileInput = q<HTMLInputElement>(container, "[data-file]");
  const message = q(container, "[data-message]");
  const chartBlock = q(container, "[data-chart-block]");
  const chartEmpty = q(container, "[data-chart-empty]");
  const chart = q<HTMLCanvasElement>(container, "[data-chart]");
  const progressLabel = q(container, "[data-progress-label]");
  const outputSpan = expert.output.range[1] - expert.output.range[0];
  // While a run goes the axis grows with it, starting at the window of its
  // stop test so the first steps are not stretched across the chart.
  const minSteps = method === "anfis" ? DEFAULT_ANFIS_OPTIONS.patience : DEFAULT_GENETIC_OPTIONS.stallGenerations;

  let run: TrainingRun | null = null;
  let history: ProgressPoint[] = record ? progressOf(record, outputSpan) : [];

  function showMessage(text: string | null): void {
    message.hidden = text === null;
    message.textContent = text ?? "";
  }

  function redrawChart(): void {
    chartBlock.hidden = history.length === 0;
    chartEmpty.hidden = history.length > 0;
    if (history.length > 0) {
      drawConvergence(chart, history, Math.max(minSteps, history.length - 1), {
        y: "RMSE",
        x: t(key("axisGenerations")),
      });
    }
  }

  container.querySelector("[data-template]")?.addEventListener("click", async () => {
    const choice = await chooseDialog({
      titleKey: "training.sizeDialog.title",
      bodyKey: key("sizeDialog.body"),
      confirmKey: "training.sizeDialog.confirm",
      initial: String(templateSizes(expert)[0].rows),
      choices: templateSizes(expert).map(({ rows, seconds }, i) => ({
        value: String(rows),
        label: t("training.sizeDialog.rows", { n: rows }) + ` · ${t(`training.sizeDialog.tag${i}`)}`,
        hint: seconds < 60
          ? t("training.sizeDialog.timeSec", { n: seconds })
          : t("training.sizeDialog.timeMin", { n: Math.round(seconds / 60) }),
      })),
    });
    if (choice === null) return;
    const rows = Number(choice);
    void downloadXlsx([{ name: "dataset", rows: templateRows(expert, rows) }], `${expert.id}-test-dataset-${rows}.xlsx`);
  });

  q(container, "[data-upload]").addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (!file) return;
    showMessage(null);

    let rows;
    try {
      rows = await readTable(file);
    } catch (err) {
      showMessage(t("training.errors.unreadable"));
      console.error(err);
      return;
    }
    const parsed = parseDataset(expert, rows);
    if (parsed.error) {
      showMessage(datasetErrorText(parsed.error));
      return;
    }
    if (parsed.skipped > 0) showMessage(t("training.skipped", { n: parsed.skipped }));

    idle.hidden = true;
    running.hidden = false;
    history = [];
    // An ANFIS epoch takes about a millisecond, so the chart is redrawn once
    // per frame rather than once per step.
    let frame = 0;
    const onProgress = (point: ProgressPoint) => {
      history.push(point);
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const last = history[history.length - 1];
        progressLabel.textContent = t(key("progress"), { gen: last.step, rmse: last.primary.toFixed(2) });
        redrawChart();
      });
    };

    // Training always starts from the expert controller, never from a
    // previous result, so two runs on one file give the same answer.
    run = trainInWorker(expert, parsed.samples, file.name, onProgress);
    try {
      const result: TrainingRecord = await run.done;
      run = null;
      ctx.setTraining(system.id, result);
    } catch (err) {
      run = null;
      idle.hidden = false;
      running.hidden = true;
      if (err instanceof DOMException && err.name === "AbortError") {
        showMessage(t(key("cancelled")));
        return;
      }
      showMessage(t(key("errors.failed")));
      console.error(err);
    }
  });

  q(container, "[data-cancel]").addEventListener("click", () => run?.cancel());

  container.querySelector("[data-reset]")?.addEventListener("click", async () => {
    const confirmed = await confirmDialog({
      titleKey: key("resetConfirm.title"),
      bodyKey: key("resetConfirm.body"),
      confirmKey: "training.resetConfirm.confirm",
    });
    if (confirmed) ctx.setTraining(system.id, null);
  });
  container.querySelector("[data-report]")?.addEventListener("click", () => {
    if (!record) return;
    void downloadXlsx(reportSheets(expert, record, t), `${expert.id}-training-report.xlsx`);
  });

  redrawChart();
  applyI18n(container, t);

  return () => run?.cancel();
}

function datasetErrorText(error: DatasetError): string {
  switch (error.kind) {
    case "empty":
      return t("training.errors.empty");
    case "missingColumns":
      return t("training.errors.missingColumns", { columns: error.columns.join(", ") });
    case "tooFew":
      return t("training.errors.tooFew", { valid: error.valid, min: error.min });
  }
}

function resultHtml(record: TrainingRecord, key: (k: string) => string): string {
  const fmt = (x: number) => x.toFixed(2);
  return `
    <dl class="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
      <dt class="text-graphite-500" data-i18n="training.rmseTrain"></dt>
      <dd class="font-mono tabular-nums text-right">${fmt(record.rmseBefore.train)} → <b>${fmt(record.rmseAfter.train)}</b></dd>
      <dt class="text-graphite-500" data-i18n="training.rmseTest"></dt>
      <dd class="font-mono tabular-nums text-right">${fmt(record.rmseBefore.test)} → <b>${fmt(record.rmseAfter.test)}</b></dd>
      <dt class="text-graphite-500" data-i18n="${key("generations")}"></dt>
      <dd class="text-right"><span class="font-mono tabular-nums">${record.history.length - 1}</span>
        ${record.method === "anfis" && record.bestEpoch !== undefined
          ? `· <span class="whitespace-nowrap">${t("training.anfis.bestEpoch", { n: record.bestEpoch })}</span>`
          : ""}
        · <span data-i18n="training.stoppedBy.${record.stoppedBy}"></span></dd>
      <dt class="text-graphite-500" data-i18n="training.dataset"></dt>
      <dd class="text-right truncate" title="${escapeHtml(record.fileName)}">${escapeHtml(record.fileName)}</dd>
    </dl>

    <div class="mt-4 flex flex-wrap gap-2">
      <button type="button" class="btn inline-flex items-center gap-1.5 whitespace-nowrap" data-report>
        ${DOWNLOAD_ICON}<span data-i18n="training.export"></span>
      </button>
    </div>
  `;
}

const CHEVRON = `
  <svg class="w-4 h-4 shrink-0 text-graphite-400 transition-transform group-open:rotate-180"
       viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
    <path d="M5 7l5 6 5-6H5z"/>
  </svg>`;

// Convergence curve: what the card is about.
const TRAINING_ICON = `
  <svg class="w-3.5 h-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor"
       stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M3 4c2 8 5 11 14 12"/>
    <path d="M3 17h14"/>
  </svg>`;

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
