import { beforeAll, describe, expect, test } from "vitest";
import { createEngine, type FuzzyEngine } from "../src/fuzzy/engine";
import { commCtrlSystem } from "../src/fuzzy/systems/commCtrl";
import { aggregationSystem } from "../src/fuzzy/systems/aggregation";
import type { AggregatedSet, FuzzyCurve } from "../src/fuzzy/types";

let engine: FuzzyEngine;

beforeAll(() => {
  engine = createEngine(commCtrlSystem);
});

const setFor = (En: number, PDR: number, TD: number): AggregatedSet => {
  const aggregated = engine.evaluate({ En, PDR, TD }).aggregated;
  if (!aggregated) throw new Error("expected an aggregated set");
  return aggregated;
};

const peak = (curve: FuzzyCurve): number => {
  let max = 0;
  for (let i = 0; i <= 400; i++) {
    const y = curve((100 * i) / 400);
    if (y > max) max = y;
  }
  return max;
};

const centroid = (curve: FuzzyCurve): number => {
  const steps = 4000;
  let num = 0;
  let den = 0;
  for (let i = 0; i <= steps; i++) {
    const x = (100 * i) / steps;
    const y = curve(x);
    num += x * y;
    den += y;
  }
  return num / den;
};

describe("Aggregated set exposed by the engine", () => {
  test("its centroid is the defuzzified output", () => {
    const inputs = { En: 0.66, PDR: 0.46, TD: 14 };
    const { output, aggregated } = engine.evaluate(inputs);
    expect(aggregated).toBeDefined();
    expect(centroid(aggregated!.envelope)).toBeCloseTo(output, 1);
  });

  test("clipped term plateaus are the rule activation levels", () => {
    // En=0.66 -> M 0.7 / H 0.3; PDR=0.46 -> L 0.2 / M 0.8; TD=14 -> L 0.6 only.
    // Four rules fire: (M,L,L)->Small 0.2, (M,M,L)->Medium 0.6,
    // (H,L,L)->Medium 0.2, (H,M,L)->Large 0.3.
    const { clipped } = setFor(0.66, 0.46, 14);
    expect(peak(clipped.Small)).toBeCloseTo(0.2, 6);
    expect(peak(clipped.Medium)).toBeCloseTo(0.6, 6);
    expect(peak(clipped.Large)).toBeCloseTo(0.3, 6);
    expect(clipped.VerySmall).toBeUndefined();
    expect(clipped.VeryLarge).toBeUndefined();
  });

  test("envelope is the pointwise maximum of the clipped terms", () => {
    const { envelope, clipped } = setFor(0.66, 0.46, 14);
    const curves = Object.values(clipped);
    for (let x = 0; x <= 100; x += 0.5) {
      const expected = Math.max(...curves.map((c) => c(x)));
      expect(envelope(x)).toBeCloseTo(expected, 10);
    }
  });

  test("never exceeds the base membership functions", () => {
    const { envelope } = setFor(0.9, 0.9, 5);
    for (let x = 0; x <= 100; x += 0.5) {
      expect(envelope(x)).toBeLessThanOrEqual(1);
    }
  });

  test("is absent for a singleton-output system", () => {
    const singletonEngine = createEngine(aggregationSystem);
    const inputs: Record<string, number> = {};
    for (const v of aggregationSystem.inputs) inputs[v.id] = v.defaultValue;
    expect(singletonEngine.evaluate(inputs).aggregated).toBeUndefined();
  });
});
