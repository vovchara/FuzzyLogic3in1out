import { beforeAll, describe, expect, test } from "vitest";
import { createEngine, type FuzzyEngine } from "../src/fuzzy/engine";
import { aggregationSystem } from "../src/fuzzy/systems/aggregation";

let engine: FuzzyEngine;

beforeAll(() => {
  engine = createEngine(aggregationSystem);
});

const calc = (EE: number, Dis: number, Dat: number): number =>
  engine.evaluate({ EE, Dis, Dat }).output;

describe("Aggregation controller (weighted-sum defuzz, singleton output)", () => {
  test("Matches chapter 3 worked example (Fig. 3.6): EE=3, Dis=19, Dat=7 -> AP≈57.8", () => {
    // Only rule 1 fires, at min(0.625, 0.578, 0.72) = 26/45.
    expect(calc(3, 19, 7)).toBeCloseTo(57.8, 1);
  });

  test("Reports no result where the sparse rule base has a hole", () => {
    // Small EE + Large Dis + Large Dat is one of the 21 term combinations the
    // 6 expert rules never cover, so `output` is a fallback, not an answer.
    const ev = engine.evaluate({ EE: 2, Dis: 200, Dat: 200 });
    expect(ev.fired).toBe(false);
  });

  test("Reports a result wherever a rule does cover the inputs", () => {
    expect(engine.evaluate({ EE: 3, Dis: 19, Dat: 7 }).fired).toBe(true);
  });

  test("Rule 1: Small EE + Small Dis + Small Dat -> VeryLarge (AP = 100)", () => {
    expect(calc(0, 0, 0)).toBeCloseTo(100, 5);
  });

  test("Rule 2: Small EE + Medium Dis + Medium Dat -> Large (AP = 80)", () => {
    expect(calc(0, 65, 60)).toBeCloseTo(80, 5);
  });

  test("Rule 3: Medium EE + Medium Dis + Small Dat -> Medium (AP = 60)", () => {
    expect(calc(15, 65, 0)).toBeCloseTo(60, 5);
  });

  test("Rule 4: Medium EE + Large Dis + Medium Dat -> Small (AP = 40)", () => {
    expect(calc(15, 214, 60)).toBeCloseTo(40, 5);
  });

  test("Rule 5: Large EE + Small Dis + Large Dat -> VerySmall (AP = 20)", () => {
    // Large Dat peaks at 244, past the 240 range end, so it tops out at 150/154.
    expect(calc(45, 0, 240)).toBeCloseTo(20 * 150 / 154, 5);
  });

  test("Rule 6: Large EE + Large Dis + Large Dat -> None (AP = 0)", () => {
    expect(calc(45, 214, 240)).toBeCloseTo(0, 5);
  });

  test("outputTermActivations is populated for singleton-output systems", () => {
    const r = engine.evaluate({ EE: 0, Dis: 0, Dat: 0 });
    expect(r.outputTermActivations).toBeDefined();
    expect(r.outputTermActivations?.VeryLarge).toBeGreaterThan(0.5);
    expect(r.outputTermActivations?.None).toBe(0);
  });

  test("Uncovered input combination falls back to range midpoint", () => {
    expect(calc(15, 0, 124)).toBe(50);
  });

  test("Deterministic", () => {
    const a = calc(10, 50, 30);
    const b = calc(10, 50, 30);
    expect(a).toBe(b);
  });

  test("Stays in [0, 100] for random inputs", () => {
    for (let i = 0; i < 50; i++) {
      const a = calc(Math.random() * 45, Math.random() * 214, Math.random() * 240);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(100);
      expect(Number.isFinite(a)).toBe(true);
    }
  });
});
