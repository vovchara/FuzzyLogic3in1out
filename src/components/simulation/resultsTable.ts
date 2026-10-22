import { q } from "../../dom";
import { getLang, t } from "../../i18n";
import { formatOutput, formatValue, valueStep } from "../../utils/format";
import type { Point, SimulationResult } from "../../simulation/types";
import type { Unmount } from "../context";
import { BASE_COLOR, ROLE_COLOR } from "./fieldPanel";

export interface ResultsTable {
  update(result: SimulationResult, base: Point, selectedId: number | null): void;
  unmount: Unmount;
}

/** The two scenario values dragging cannot change; everything else is derived. */
export type EditableField = "re" | "dat";

export interface ResultsTableOpts {
  onSelect(id: number): void;
  onEdit(id: number, field: EditableField, value: number): void;
  /** Fired when an editable cell loses focus, so the owner can re-render it. */
  onCommit(): void;
  /** Domain of every numeric column, shown in the header and used to format. */
  ranges: Readonly<Record<ColumnId, readonly [number, number]>>;
}

/** Full localised variable names, with the thesis notation in parentheses. */
const NUMERIC_COLUMNS = [
  "x", "y", "re", "dat", "dist", "lq", "pdr", "td", "chs", "ee", "ap",
] as const;
export type ColumnId = (typeof NUMERIC_COLUMNS)[number];

const EDITABLE: ReadonlySet<ColumnId> = new Set(["re", "dat"]);

const EMPTY = "—";

export function mountResultsTable(container: HTMLElement, opts: ResultsTableOpts): ResultsTable {
  container.innerHTML = `
    <h2 class="card-title" data-i18n="simulation.results"></h2>
    <div class="overflow-x-auto mt-3">
      <table class="w-full text-sm">
        <thead>
          <tr>
            <th class="metric-label text-left align-bottom py-1.5 px-1" data-i18n="simulation.columns.id"></th>
            ${NUMERIC_COLUMNS.map(
              (c) => `
              <th class="metric-label text-right align-bottom py-1.5 px-1">
                <span data-i18n="simulation.columns.${c}"></span>
                <span class="block font-normal tracking-normal text-graphite-300">${rangeLabel(opts.ranges[c])}</span>
              </th>`,
            ).join("")}
            <th class="metric-label text-left align-bottom py-1.5 px-1" data-i18n="simulation.role"></th>
          </tr>
        </thead>
        <tbody data-rows></tbody>
      </table>
    </div>
  `;

  const tbody = q(container, "[data-rows]");

  tbody.addEventListener("click", (e) => {
    // A click into an editable cell is editing, not row selection.
    if ((e.target as Element).closest("input")) return;
    const row = (e.target as Element).closest<HTMLElement>("[data-row-id]");
    if (row) opts.onSelect(Number(row.dataset.rowId));
  });

  // While an input is focused, patching skips it to protect the caret, so a
  // raw or out-of-range entry can linger on screen; once the focus leaves, a
  // re-render writes back the clamped, formatted value the simulation used.
  tbody.addEventListener("focusout", (e) => {
    if ((e.target as Element).matches("[data-edit]")) opts.onCommit();
  });

  tbody.addEventListener("input", (e) => {
    const input = (e.target as Element).closest<HTMLInputElement>("[data-edit]");
    if (!input) return;
    const field = input.dataset.edit as EditableField;
    const parsed = Number.parseFloat(input.value);
    if (!Number.isFinite(parsed)) return;
    const [lo, hi] = opts.ranges[field];
    const clamped = Math.max(lo, Math.min(hi, field === "dat" ? Math.round(parsed) : parsed));
    opts.onEdit(Number(input.closest<HTMLElement>("[data-row-id]")!.dataset.rowId), field, clamped);
  });

  // Rows are built once per node set and then patched in place: rebuilding the
  // tbody on every recompute would steal the focus from the cell being edited.
  let structure = "";

  function buildRows(result: SimulationResult): void {
    const baseRow = `
      <tr class="border-t border-graphite-100 bg-graphite-50" data-base-row>
        <td class="py-1.5 px-1 font-mono text-graphite-900 font-semibold whitespace-nowrap">${t("simulation.baseShort")}</td>
        <td class="py-1.5 px-1 text-right font-mono tabular-nums text-graphite-800" data-cell="x"></td>
        <td class="py-1.5 px-1 text-right font-mono tabular-nums text-graphite-800" data-cell="y"></td>
        <td colspan="9"></td>
        <td class="py-1.5 px-1 whitespace-nowrap">
          <span class="inline-flex items-center gap-1.5 text-graphite-700">
            <span class="w-2 h-2 shrink-0 rotate-45" style="background:${BASE_COLOR}"></span>
            ${t("simulation.legendBase")}
          </span>
        </td>
      </tr>`;

    tbody.innerHTML =
      baseRow +
      result.nodes
        .map(
          (r) => `
        <tr data-row-id="${r.node.id}"
            class="border-t border-graphite-100 cursor-pointer hover:bg-graphite-50
                   data-[selected=true]:bg-brand-50">
          <td class="py-1.5 px-1 font-mono tabular-nums text-graphite-900 font-semibold">${r.node.id}</td>
          ${NUMERIC_COLUMNS.map((c) =>
            EDITABLE.has(c)
              ? `<td class="py-1 px-1 text-right">
                   <input type="number" data-edit="${c}"
                     min="${opts.ranges[c][0]}" max="${opts.ranges[c][1]}"
                     step="${c === "dat" ? 1 : valueStep(opts.ranges[c])}"
                     aria-label="${t(`simulation.columns.${c}`)}"
                     class="field w-14 px-1 py-0.5 text-right font-mono tabular-nums text-sm" />
                 </td>`
              : `<td class="py-1.5 px-1 text-right font-mono tabular-nums text-graphite-800" data-cell="${c}"></td>`,
          ).join("")}
          <td class="py-1.5 px-1 whitespace-nowrap" data-cell="role"></td>
        </tr>`,
        )
        .join("");
  }

  function update(result: SimulationResult, base: Point, selectedId: number | null): void {
    // The language is part of the signature: the base row and the input
    // aria-labels bake t() strings in, so a switch rebuilds the rows the same
    // way a node-set change does.
    const sig = `${getLang()}|${result.nodes.map((r) => r.node.id).join(",")}`;
    if (sig !== structure) {
      structure = sig;
      buildRows(result);
    }

    const baseRow = q(tbody, "[data-base-row]");
    q(baseRow, '[data-cell="x"]').textContent = formatValue(base.x, opts.ranges.x);
    q(baseRow, '[data-cell="y"]').textContent = formatValue(base.y, opts.ranges.y);

    for (const r of result.nodes) {
      const row = q(tbody, `[data-row-id="${r.node.id}"]`);
      row.dataset.selected = String(r.node.id === selectedId);

      const values: Record<ColumnId, number | null> = {
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
      for (const c of NUMERIC_COLUMNS) {
        const v = values[c];
        if (EDITABLE.has(c)) {
          const input = q<HTMLInputElement>(row, `[data-edit="${c}"]`);
          if (document.activeElement !== input) {
            input.value = c === "dat" ? String(v) : formatValue(v!, opts.ranges[c]);
          }
        } else {
          // CHS and AP are controller answers, so they are written the way the
          // workbench writes a defuzzified result: always two decimals.
          q(row, `[data-cell="${c}"]`).textContent =
            v === null
              ? EMPTY
              : c === "chs" || c === "ap"
                ? formatOutput(v)
                : formatValue(v, opts.ranges[c]);
        }
      }

      q(row, '[data-cell="role"]').innerHTML = `
        <span class="inline-flex items-center gap-1.5 text-graphite-700">
          <span class="w-2 h-2 rounded-full shrink-0" style="background:${ROLE_COLOR[r.role]}"></span>
          ${t(`simulation.roles.${r.role}`)}
        </span>`;
    }
  }

  // Nothing to detach: every listener lives on elements the owner discards.
  return { update, unmount: () => {} };
}

function rangeLabel(range: readonly [number, number]): string {
  return `${range[0]}–${range[1]}`;
}
