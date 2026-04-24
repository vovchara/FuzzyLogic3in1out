import { beforeAll, describe, expect, test } from "vitest";
import { createEngine, type FuzzyEngine } from "../src/fuzzy/engine";
import { aggregationSystem } from "../src/fuzzy/systems/aggregation";

let engine: FuzzyEngine;

beforeAll(() => {
  engine = createEngine(aggregationSystem);
});

describe("Aggregation controller (weighted-average defuzz, singleton output)", () => {
  test("Rule 1: Low E + Low R + Large T → None (A ≈ 0)", () => {
    const a = engine.evaluate({ E: 10, R: 10, T: 80 }).output;
    expect(a).toBeLessThan(15);
  });

  test("Rule 6: High E + High R + Small T → VeryLarge (A ≈ 100)", () => {
    const a = engine.evaluate({ E: 90, R: 90, T: 10 }).output;
    expect(a).toBeGreaterThan(85);
  });

  test("Rule 3: Medium E + Low R + Medium T → Small (A ≈ 40)", () => {
    const a = engine.evaluate({ E: 50, R: 10, T: 40 }).output;
    expect(a).toBeGreaterThan(30);
    expect(a).toBeLessThan(50);
  });

  test("Rule 4: Medium E + High R + Medium T → Medium (A ≈ 60)", () => {
    const a = engine.evaluate({ E: 50, R: 90, T: 40 }).output;
    expect(a).toBeGreaterThan(50);
    expect(a).toBeLessThan(70);
  });

  test("Rule 5: High E + Medium R + Small T → Large (A ≈ 80)", () => {
    const a = engine.evaluate({ E: 90, R: 50, T: 10 }).output;
    expect(a).toBeGreaterThan(70);
    expect(a).toBeLessThan(90);
  });

  test("outputTermActivations is populated for singleton-output systems", () => {
    const r = engine.evaluate({ E: 90, R: 90, T: 10 });
    expect(r.outputTermActivations).toBeDefined();
    expect(r.outputTermActivations?.VeryLarge).toBeGreaterThan(0.5);
    expect(r.outputTermActivations?.None).toBe(0);
  });

  test("Monotonic in E: higher energy → non-decreasing output", () => {
    const p1 = engine.evaluate({ E: 20, R: 50, T: 50 }).output;
    const p2 = engine.evaluate({ E: 50, R: 50, T: 50 }).output;
    const p3 = engine.evaluate({ E: 80, R: 50, T: 50 }).output;
    expect(p2).toBeGreaterThanOrEqual(p1);
    expect(p3).toBeGreaterThanOrEqual(p2);
  });

  test("Monotonic in R: higher reputation → non-decreasing output", () => {
    const p1 = engine.evaluate({ E: 50, R: 20, T: 50 }).output;
    const p2 = engine.evaluate({ E: 50, R: 50, T: 50 }).output;
    const p3 = engine.evaluate({ E: 50, R: 80, T: 50 }).output;
    expect(p2).toBeGreaterThanOrEqual(p1);
    expect(p3).toBeGreaterThanOrEqual(p2);
  });

  test("Monotonic in T: higher load → non-increasing output", () => {
    const p1 = engine.evaluate({ E: 50, R: 50, T: 20 }).output;
    const p2 = engine.evaluate({ E: 50, R: 50, T: 50 }).output;
    const p3 = engine.evaluate({ E: 50, R: 50, T: 80 }).output;
    expect(p2).toBeLessThanOrEqual(p1);
    expect(p3).toBeLessThanOrEqual(p2);
  });

  test("Deterministic", () => {
    const a = engine.evaluate({ E: 75, R: 25, T: 45 }).output;
    const b = engine.evaluate({ E: 75, R: 25, T: 45 }).output;
    expect(a).toBe(b);
  });

  test("Stays in [0, 100] for random inputs", () => {
    for (let i = 0; i < 50; i++) {
      const a = engine.evaluate({
        E: Math.random() * 100,
        R: Math.random() * 100,
        T: Math.random() * 100,
      }).output;
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(100);
      expect(Number.isFinite(a)).toBe(true);
    }
  });
});
