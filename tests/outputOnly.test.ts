import { describe, expect, test } from "vitest";
import { createEngine, curvePeak, ruleStrength } from "../src/fuzzy/engine";
import { systems } from "../src/fuzzy/systems";
import type { FuzzySystem } from "../src/fuzzy/types";

function midpoint(system: FuzzySystem): Record<string, number> {
  const inputs: Record<string, number> = {};
  for (const v of system.inputs) inputs[v.id] = (v.range[0] + v.range[1]) / 2;
  return inputs;
}

/** A point no term of the first input covers, so no rule can fire there. */
function outsideEveryRule(system: FuzzySystem): Record<string, number> | null {
  const v = system.inputs[0];
  const step = (v.range[1] - v.range[0]) / 200;
  for (let x = v.range[0]; x <= v.range[1]; x += step) {
    if (v.terms.every((term) => evaluate(term.shape, x) === 0)) {
      return { ...midpoint(system), [v.id]: x };
    }
  }
  return null;
}

// Local copy of the shape evaluation the helper above needs, kept tiny so the
// test does not depend on the engine's internals beyond its public surface.
function evaluate(shape: FuzzySystem["inputs"][number]["terms"][number]["shape"], x: number): number {
  if (shape.kind !== "trapezoid" && shape.kind !== "triangle") return 1;
  const pts = shape.points as readonly number[];
  return x < pts[0] || x > pts[pts.length - 1] ? 0 : 1;
}

describe.each(systems.map((s) => [s.id, s] as const))("outputOnly for %s", (_id, system) => {
  const engine = createEngine(system);

  test("agrees with evaluate() on the crisp result", () => {
    const inputs = midpoint(system);
    const full = engine.evaluate(inputs);
    const quick = engine.outputOnly(inputs);
    expect(full.fired).toBe(quick !== null);
    if (quick !== null) expect(quick).toBeCloseTo(full.output, 9);
  });

  test("agrees with evaluate() across a sweep of the first input", () => {
    const v = system.inputs[0];
    for (let i = 0; i <= 20; i++) {
      const x = v.range[0] + ((v.range[1] - v.range[0]) * i) / 20;
      const inputs = { ...midpoint(system), [v.id]: x };
      const full = engine.evaluate(inputs);
      const quick = engine.outputOnly(inputs);
      expect(quick !== null).toBe(full.fired);
      if (quick !== null) expect(quick).toBeCloseTo(full.output, 9);
    }
  });

  test("returns null where no rule fires", () => {
    const inputs = outsideEveryRule(system);
    if (!inputs) return;
    expect(engine.evaluate(inputs).fired).toBe(false);
    expect(engine.outputOnly(inputs)).toBeNull();
  });
});

describe("ruleStrength", () => {
  const memberships = { A: { low: 0.7, high: 0.2 }, B: { low: 0.4 } };

  test("takes the minimum of the antecedent memberships", () => {
    expect(ruleStrength({ if: { A: "low", B: "low" } }, memberships)).toBe(0.4);
  });

  test("treats an unknown variable or term as zero", () => {
    expect(ruleStrength({ if: { A: "low", C: "low" } }, memberships)).toBe(0);
    expect(ruleStrength({ if: { A: "missing" } }, memberships)).toBe(0);
  });
});

describe("curvePeak", () => {
  test("finds the maximum of a curve over the range", () => {
    expect(curvePeak((x) => 1 - Math.abs(x - 50) / 50, [0, 100])).toBeCloseTo(1, 6);
    expect(curvePeak(() => 0.35, [0, 1])).toBeCloseTo(0.35, 9);
  });
});
