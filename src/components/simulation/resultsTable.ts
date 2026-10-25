import { q } from "../../dom";
import { getLang, t } from "../../i18n";
import { formatOutput, formatValue } from "../../utils/format";
import type { Point, SimulationResult } from "../../simulation/types";
import type { Unmount } from "../context";
import { BASE_COLOR, MEASURED_COLOR, ROLE_COLOR } from "./fieldPanel";

export interface ResultsTable {
  update(result: SimulationResult, base: Point, selectedId: number | null): void;
  unmount: Unmount;
}

/** Where a cell's value came from, for a table that mixes the two. */
export type CellSource = "measured" | "model";

export interface ResultsTableOpts {
  onSelect(id: number): void;
  /** Domain of every numeric column, shown in the header and used to format. */
  ranges: Readonly<Record<ControllerColumnId, readonly [number, number]>>;
  /** The columns after the controller ones; none by default. */
  extraColumns?: readonly ExtraColumnId[];
  /** Value of an extra column; null shows as a dash. */
  extra?(id: number, column: ExtraColumnId): number | null;
  /** Marks a cell as measured or modelled; null leaves it unmarked. */
  source?(id: number, column: ColumnId): CellSource | null;
  /** Marks the base station's coordinates the same way. */
  baseSource?: CellSource;
}

/**
 * Full localised variable names, with the thesis notation in parentheses.
 * Ordered by role: position, the controllers' input variables, then their
 * output variables, so each group can be headed and tinted as one block.
 */
const NUMERIC_COLUMNS = [
  "x", "y", "re", "dat", "dist", "lq", "pdr", "td", "ee", "chs", "ap",
] as const;
const INPUT_COLUMNS = 7;
const OUTPUTS: ReadonlySet<ColumnId> = new Set(["chs", "ap"]);
/** A translucent tint, so a selected row still shows through output cells. */
const OUTPUT_TINT = "bg-brand-600/[0.06]";
type ControllerColumnId = (typeof NUMERIC_COLUMNS)[number];
/** Testbed statistics of the node's link to the station: RSSI spread, packets. */
export type ExtraColumnId = "sigma" | "packets";
export type ColumnId = ControllerColumnId | ExtraColumnId;

/**
 * The label's uppercase styling would turn σ into Σ, so the notation sits
 * outside the localised name, exempt from the transform.
 */
export const SIGMA_NOTATION = ` <span class="normal-case">(σ)</span>`;

/** Measured values speak the testbed's colour; the rest recede. */
const SOURCE_STYLE: Record<CellSource, string> = {
  measured: `color:${MEASURED_COLOR};font-weight:600`,
  model: "color:#9aa3ab;font-style:italic",
};

const EMPTY = "—";

export function mountResultsTable(container: HTMLElement, opts: ResultsTableOpts): ResultsTable {
  const columns: readonly ColumnId[] = [...NUMERIC_COLUMNS, ...(opts.extraColumns ?? [])];
  const rangeOf = (c: ColumnId) => (isControllerColumn(c) ? opts.ranges[c] : null);

  container.innerHTML = `
    <h2 class="card-title" data-i18n="simulation.results"></h2>
    <div class="overflow-x-auto mt-3">
      <table class="w-full text-sm">
        <thead>
          <tr>
            <th colspan="4"></th>
            ${groupHeader("simulation.groups.inputs", INPUT_COLUMNS, "")}
            ${groupHeader("simulation.groups.outputs", OUTPUTS.size, OUTPUT_TINT)}
            ${opts.extraColumns?.length ? groupHeader("simulation.groups.testbed", opts.extraColumns.length, "") : ""}
          </tr>
          <tr>
            <th class="w-4 py-1.5 pl-1"><span class="sr-only" data-i18n="simulation.role"></span></th>
            <th class="metric-label text-left align-bottom py-1.5 px-1" data-i18n="simulation.columns.id"></th>
            ${columns.map(
              (c) => `
              <th class="metric-label text-right align-bottom py-1.5 px-1 ${OUTPUTS.has(c) ? OUTPUT_TINT : ""}">
                <span data-i18n="simulation.columns.${c}"></span>${c === "sigma" ? SIGMA_NOTATION : ""}
                <span class="block font-normal tracking-normal text-graphite-300">${rangeLabel(rangeOf(c))}</span>
              </th>`,
            ).join("")}
          </tr>
        </thead>
        <tbody data-rows></tbody>
      </table>
    </div>
  `;

  const tbody = q(container, "[data-rows]");

  tbody.addEventListener("click", (e) => {
    const row = (e.target as Element).closest<HTMLElement>("[data-row-id]");
    if (row) opts.onSelect(Number(row.dataset.rowId));
  });

  // Rows are built once per node set and then patched in place, so a new
  // selection only rewrites values instead of the whole tbody.
  let structure = "";

  function buildRows(result: SimulationResult): void {
    const baseRow = `
      <tr class="border-t border-graphite-100 bg-graphite-50" data-base-row>
        <td class="py-1.5 pl-1">${roleIcon(BASE_COLOR, t("simulation.legendBase"), true)}</td>
        <td class="py-1.5 px-1 font-mono text-graphite-900 font-semibold whitespace-nowrap">${t("simulation.baseShort")}</td>
        <td class="py-1.5 px-1 text-right font-mono tabular-nums text-graphite-800" data-cell="x"></td>
        <td class="py-1.5 px-1 text-right font-mono tabular-nums text-graphite-800" data-cell="y"></td>
        <td colspan="${columns.length - 2}"></td>
      </tr>`;

    tbody.innerHTML =
      baseRow +
      result.nodes
        .map(
          (r) => `
        <tr data-row-id="${r.node.id}"
            class="border-t border-graphite-100 cursor-pointer hover:bg-graphite-50
                   data-[selected=true]:bg-brand-50">
          <td class="py-1.5 pl-1" data-cell="role"></td>
          <td class="py-1.5 px-1 font-mono tabular-nums text-graphite-900 font-semibold whitespace-nowrap"
              data-cell="id">${r.node.id}</td>
          ${columns.map((c) => `
            <td class="py-1.5 px-1 text-right font-mono tabular-nums text-graphite-800
                       ${OUTPUTS.has(c) ? `${OUTPUT_TINT} font-semibold` : ""}" data-cell="${c}"></td>`,
          ).join("")}
        </tr>`,
        )
        .join("");
  }

  function update(result: SimulationResult, base: Point, selectedId: number | null): void {
    // The language is part of the signature: the base row bakes t() strings
    // in, so a switch rebuilds the rows the same way a node-set change does.
    const sig = `${getLang()}|${result.nodes.map((r) => r.node.id).join(",")}`;
    if (sig !== structure) {
      structure = sig;
      buildRows(result);
    }

    const baseRow = q(tbody, "[data-base-row]");
    for (const axis of ["x", "y"] as const) {
      const cell = q(baseRow, `[data-cell="${axis}"]`);
      cell.textContent = formatValue(base[axis], opts.ranges[axis]);
      cell.setAttribute("style", sourceStyle(opts.baseSource ?? null));
    }

    for (const r of result.nodes) {
      const row = q(tbody, `[data-row-id="${r.node.id}"]`);
      row.dataset.selected = String(r.node.id === selectedId);

      const values: Record<ControllerColumnId, number | null> = {
        x: r.node.x,
        y: r.node.y,
        re: r.node.re,
        dat: r.node.dat,
        dist: r.distToBase,
        lq: r.lq,
        pdr: r.pdr,
        td: r.td,
        chs: r.chs,
        ee: r.ee,
        ap: r.ap,
      };
      for (const c of columns) {
        if (!isControllerColumn(c)) {
          const v = opts.extra?.(r.node.id, c) ?? null;
          const cell = q(row, `[data-cell="${c}"]`);
          cell.textContent = v === null ? EMPTY : c === "packets" ? String(v) : formatOutput(v);
          cell.setAttribute("style", sourceStyle(opts.source?.(r.node.id, c) ?? null));
          continue;
        }
        const v = values[c];
        // CHS and AP are controller answers, so they are written the way the
        // workbench writes a defuzzified result: always two decimals.
        const cell = q(row, `[data-cell="${c}"]`);
        cell.textContent =
          v === null
            ? EMPTY
            : c === "chs" || c === "ap"
              ? formatOutput(v)
              : c === "dat"
                ? String(v)
                : formatValue(v, opts.ranges[c]);
        cell.setAttribute("style", sourceStyle(opts.source?.(r.node.id, c) ?? null));
      }

      q(row, '[data-cell="role"]').innerHTML = roleIcon(
        ROLE_COLOR[r.role],
        t(`simulation.roles.${r.role}`),
      );
    }
  }

  // Nothing to detach: every listener lives on elements the owner discards.
  return { update, unmount: () => {} };
}

/**
 * The role as the legend draws it: the name is only a tooltip and screen-reader
 * text, so a long role name never pushes a column off a narrow table.
 */
function roleIcon(color: string, name: string, square = false): string {
  return `<span class="block w-2.5 h-2.5 ${square ? "rotate-45" : "rounded-full"}"
    style="background:${color}" title="${name}" role="img" aria-label="${name}"></span>`;
}

/** One group's caption over its block of columns, underlined to span it. */
function groupHeader(key: string, span: number, tint: string): string {
  return `
    <th colspan="${span}" class="px-1 pt-1 ${tint}">
      <span class="block border-b border-graphite-200 pb-1 text-center text-[11px] font-semibold
                   uppercase tracking-wide text-graphite-500" data-i18n="${key}"></span>
    </th>`;
}

function rangeLabel(range: readonly [number, number] | null): string {
  return range ? `${range[0]}–${range[1]}` : "";
}

function isControllerColumn(c: ColumnId): c is ControllerColumnId {
  return c !== "sigma" && c !== "packets";
}

function sourceStyle(source: CellSource | null): string {
  return source ? SOURCE_STYLE[source] : "";
}
