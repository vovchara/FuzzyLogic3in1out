import { FIELD_SIZE } from "./scenario";
import type { Point } from "./types";

/**
 * The layout of a testbed experiment: where the boards stood, in metres, with
 * the origin at the bottom left like the simulation field. JSON, so the app
 * and the capture tools read it without libraries. Distances, Dis and EE of
 * the experiment come from these coordinates; traffic is a parameter of the
 * run (the boards send at a fixed rate), so it lives here too.
 */
export interface LayoutNode extends Point {
  readonly id: number;
  /** Null when the file leaves it out: the controller's default applies. */
  readonly dat: number | null;
}

export interface Layout {
  readonly name: string;
  readonly date: string;
  /** Side of the square field, metres. */
  readonly field: number;
  readonly base: Point;
  /** Free text for the method section; the app only shows it. */
  readonly orientation: string;
  readonly notes: string;
  /** Sorted by id. */
  readonly nodes: readonly LayoutNode[];
}

export type LayoutErrorReason = "json" | "required" | "type" | "range" | "duplicate" | "empty";

export interface LayoutError {
  /** The offending field, e.g. `base.x` or `nodes[2].id`. */
  readonly path: string;
  readonly reason: LayoutErrorReason;
  /** The node's id, when the node has a readable one. */
  readonly nodeId?: number;
}

export type LayoutParse =
  | { readonly layout: Layout; readonly errors: readonly [] }
  | { readonly layout: null; readonly errors: readonly LayoutError[] };

export interface LayoutOptions {
  /** Upper end of the traffic domain a node's `dat` must fit. */
  readonly datMax?: number;
}

/**
 * Validates the whole file and names every problem by field instead of
 * stopping at the first one: a layout is typed by hand on a parking lot, and
 * one round trip per typo is one too many. Unlike a stored scenario nothing is
 * clamped: a coordinate off the field is a measuring mistake to fix, not a
 * drift to hide.
 */
export function parseLayout(text: string, options: LayoutOptions = {}): LayoutParse {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail([{ path: "", reason: "json" }]);
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return fail([{ path: "", reason: "json" }]);
  }
  const obj = raw as Record<string, unknown>;
  const errors: LayoutError[] = [];

  const readText = (key: string): string => {
    const v = obj[key];
    if (v === undefined) return "";
    if (typeof v !== "string") errors.push({ path: key, reason: "type" });
    return typeof v === "string" ? v : "";
  };
  const name = readText("name");
  const date = readText("date");
  const orientation = readText("orientation");
  const notes = readText("notes");

  let field = FIELD_SIZE;
  if (obj.field !== undefined) {
    if (!isNumber(obj.field)) errors.push({ path: "field", reason: "type" });
    else if (obj.field <= 0) errors.push({ path: "field", reason: "range" });
    else field = obj.field;
  }

  const coord = (v: unknown, path: string, nodeId?: number): number => {
    if (v === undefined) errors.push({ path, reason: "required", nodeId });
    else if (!isNumber(v)) errors.push({ path, reason: "type", nodeId });
    else if (v < 0 || v > field) errors.push({ path, reason: "range", nodeId });
    else return v;
    return 0;
  };

  let base: Point = { x: 0, y: 0 };
  if (obj.base === undefined) errors.push({ path: "base", reason: "required" });
  else if (!isObject(obj.base)) errors.push({ path: "base", reason: "type" });
  else base = { x: coord(obj.base.x, "base.x"), y: coord(obj.base.y, "base.y") };

  const nodes: LayoutNode[] = [];
  if (obj.nodes === undefined) errors.push({ path: "nodes", reason: "required" });
  else if (!Array.isArray(obj.nodes)) errors.push({ path: "nodes", reason: "type" });
  else if (obj.nodes.length === 0) errors.push({ path: "nodes", reason: "empty" });
  else {
    const seen = new Set<number>();
    obj.nodes.forEach((n: unknown, i: number) => {
      const at = `nodes[${i}]`;
      if (!isObject(n)) {
        errors.push({ path: at, reason: "type" });
        return;
      }
      let id = 0;
      if (n.id === undefined) errors.push({ path: `${at}.id`, reason: "required" });
      else if (!isNumber(n.id) || !Number.isInteger(n.id) || n.id <= 0) {
        errors.push({ path: `${at}.id`, reason: "type" });
      } else if (seen.has(n.id)) {
        errors.push({ path: `${at}.id`, reason: "duplicate", nodeId: n.id });
      } else {
        id = n.id;
        seen.add(id);
      }
      const nodeId = id || undefined;
      const x = coord(n.x, `${at}.x`, nodeId);
      const y = coord(n.y, `${at}.y`, nodeId);
      let dat: number | null = null;
      if (n.dat !== undefined) {
        if (!isNumber(n.dat)) errors.push({ path: `${at}.dat`, reason: "type", nodeId });
        else if (n.dat < 0 || (options.datMax !== undefined && n.dat > options.datMax)) {
          errors.push({ path: `${at}.dat`, reason: "range", nodeId });
        } else dat = n.dat;
      }
      nodes.push({ id, x, y, dat });
    });
  }

  if (errors.length) return fail(errors);
  return {
    layout: {
      name,
      date,
      field,
      base,
      orientation,
      notes,
      nodes: nodes.sort((a, b) => a.id - b.id),
    },
    errors: [],
  };
}

function fail(errors: readonly LayoutError[]): LayoutParse {
  return { layout: null, errors };
}

function isNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
