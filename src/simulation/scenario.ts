import { mulberry32 } from "../utils/random";
import type { Point, Scenario, SimNode } from "./types";

export const FIELD_SIZE = 100;

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
