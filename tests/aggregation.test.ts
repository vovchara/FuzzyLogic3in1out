import { beforeAll, describe, expect, test } from "vitest";
import { createEngine, type FuzzyEngine } from "../src/fuzzy/engine";
import { aggregationSystem } from "../src/fuzzy/systems/aggregation";

let engine: FuzzyEngine;

beforeAll(() => {
  engine = createEngine(aggregationSystem);
});

const calc = (EE: number, Dist: number, DR: number): number =>
  engine.evaluate({ EE, Dist, DR }).output;

describe("Aggregation controller (weighted-sum defuzz, singleton output)", () => {
  test("Matches AggregWSN.fis worked example: EE=3, Dist=19, DR=7 -> AP≈68.3", () => {
    expect(calc(3, 19, 7)).toBeCloseTo(68.3, 1);
  });

  test("Rule 1: Small EE + Small Dist + Small DR -> VeryLarge (AP = 100)", () => {
    expect(calc(0, 0, 0)).toBeCloseTo(100, 5);
  });

  test("Rule 2: Small EE + Medium Dist + Medium DR -> Large (AP = 80)", () => {
    expect(calc(0, 60, 40)).toBeCloseTo(80, 5);
  });

  test("Rule 3: Medium EE + Medium Dist + Small DR -> Medium (AP = 60)", () => {
    expect(calc(15, 60, 0)).toBeCloseTo(60, 5);
  });

  test("Rule 4: Medium EE + Large Dist + Medium DR -> Small (AP = 40)", () => {
    expect(calc(15, 214, 40)).toBeCloseTo(40, 5);
  });

  test("Rule 5: Large EE + Small Dist + Large DR -> VerySmall (AP = 20)", () => {
    expect(calc(45, 0, 124)).toBeCloseTo(20, 5);
  });

  test("Rule 6: Large EE + Large Dist + Large DR -> None (AP = 0)", () => {
    expect(calc(45, 214, 124)).toBeCloseTo(0, 5);
  });

  test("outputTermActivations is populated for singleton-output systems", () => {
    const r = engine.evaluate({ EE: 0, Dist: 0, DR: 0 });
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
      const a = calc(Math.random() * 45, Math.random() * 214, Math.random() * 124);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(100);
      expect(Number.isFinite(a)).toBe(true);
    }
  });
});
