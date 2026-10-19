import { mulberry32 } from "../utils/random";
import type { Point, Scenario, SimNode } from "./types";

export const FIELD_SIZE = 100;
export const NODE_COUNT_MIN = 3;
export const NODE_COUNT_MAX = 15;
export const NODE_COUNT_DEFAULT = 8;

/** Nodes are not generated right on the border: a marker there is half-clipped. */
const MARGIN = 6;

/** Traffic domain of the generated nodes; stays inside the Dat variable's range. */
const DAT_MIN = 10;
const DAT_MAX = 240;

/** Residual energy floor: a completely dead node would only produce a flat demo. */
const RE_MIN = 0.15;

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function clampToField(value: number, field: number = FIELD_SIZE): number {
  return Math.max(0, Math.min(field, value));
}

export function generateScenario(count: number, seed: number): Scenario {
  const rand = mulberry32(seed);
  const span = FIELD_SIZE - 2 * MARGIN;
  const nodes: SimNode[] = [];
  for (let i = 0; i < count; i++) {
    nodes.push({
      id: i + 1,
      x: MARGIN + rand() * span,
      y: MARGIN + rand() * span,
      re: RE_MIN + rand() * (1 - RE_MIN),
      dat: Math.round(DAT_MIN + rand() * (DAT_MAX - DAT_MIN)),
    });
  }
  return {
    field: FIELD_SIZE,
    base: { x: FIELD_SIZE / 2, y: FIELD_SIZE / 2 },
    seed,
    nodes,
  };
}

export function moveNode(scenario: Scenario, id: number, x: number, y: number): Scenario {
  return {
    ...scenario,
    nodes: scenario.nodes.map((n) =>
      n.id === id ? { ...n, x: clampToField(x, scenario.field), y: clampToField(y, scenario.field) } : n,
    ),
  };
}

/** Per-node values the field cannot change by dragging: energy and traffic. */
export function updateNode(
  scenario: Scenario,
  id: number,
  patch: Partial<Pick<SimNode, "re" | "dat">>,
): Scenario {
  return {
    ...scenario,
    nodes: scenario.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
  };
}

export function moveBase(scenario: Scenario, x: number, y: number): Scenario {
  return {
    ...scenario,
    base: { x: clampToField(x, scenario.field), y: clampToField(y, scenario.field) },
  };
}

/**
 * A stored scenario is only honoured while it still fits the current model.
 * Structural problems — wrong shapes, node counts outside the slider, a
 * duplicated id (it would break row patching, moving and the tie-breaks) —
 * reject the whole scenario; a value that merely drifted out of range is
 * clamped back in. Nodes come out sorted by id, which the elections' "first
 * wins the remaining tie" rule relies on.
 */
export function parseScenario(raw: unknown): Scenario | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { field, seed, base, nodes } = raw as Record<string, unknown>;
  if (field !== FIELD_SIZE || typeof seed !== "number" || !Number.isFinite(seed)) return null;
  if (!isPoint(base) || !Array.isArray(nodes)) return null;
  if (nodes.length < NODE_COUNT_MIN || nodes.length > NODE_COUNT_MAX) return null;
  if (!nodes.every(isRawNode)) return null;
  const ids = new Set(nodes.map((n) => n.id));
  if (ids.size !== nodes.length) return null;
  return {
    field: FIELD_SIZE,
    seed,
    base: { x: clampToField(base.x), y: clampToField(base.y) },
    nodes: nodes
      .map((n) => ({
        id: n.id,
        x: clampToField(n.x),
        y: clampToField(n.y),
        re: Math.max(0, Math.min(1, n.re)),
        dat: Math.max(0, Math.min(DAT_MAX, Math.round(n.dat))),
      }))
      .sort((a, b) => a.id - b.id),
  };
}

function isPoint(p: unknown): p is Point {
  if (typeof p !== "object" || p === null) return false;
  const { x, y } = p as Record<string, unknown>;
  return typeof x === "number" && Number.isFinite(x) && typeof y === "number" && Number.isFinite(y);
}

function isRawNode(n: unknown): n is SimNode {
  if (!isPoint(n)) return false;
  const { id, re, dat } = n as unknown as Record<string, unknown>;
  return (
    typeof id === "number" && Number.isInteger(id) && id > 0 &&
    typeof re === "number" && Number.isFinite(re) &&
    typeof dat === "number" && Number.isFinite(dat)
  );
}
