import { beforeAll, describe, expect, test } from "vitest";
import { createEngine, type FuzzyEngine } from "../src/fuzzy/engine";
import { commCtrlSystem } from "../src/fuzzy/systems/commCtrl";

let engine: FuzzyEngine;

beforeAll(() => {
  engine = createEngine(commCtrlSystem);
});

const calc = (En: number, PDR: number, TD: number): number =>
  engine.evaluate({ En, PDR, TD }).output;

describe("Matches ClusterWSN dissertation worked examples", () => {
  test("En=0.2, PDR=0.1, TD=37 -> ChP≈8.32", () => {
    expect(calc(0.2, 0.1, 37)).toBeCloseTo(8.32, 1);
  });

  test("En=0.8, PDR=0.7, TD=5 -> ChP≈75", () => {
    expect(calc(0.8, 0.7, 5)).toBeCloseTo(75, 0);
  });
});

describe("Optimal scenarios (high probability)", () => {
  test("high energy + high delivery ratio + low delay", () => {
    const p = calc(0.9, 0.9, 5);
    expect(p).toBeGreaterThan(75);
    expect(p).toBeLessThanOrEqual(100);
  });

  test("medium energy + high delivery ratio + low delay", () => {
    const p = calc(0.5, 0.9, 5);
    expect(p).toBeGreaterThan(50);
  });
});

describe("Critical scenarios (low probability)", () => {
  test("low energy + low delivery ratio + high delay", () => {
    const p = calc(0.1, 0.1, 45);
    expect(p).toBeLessThan(25);
    expect(p).toBeGreaterThanOrEqual(0);
  });

  test("high energy + low delivery ratio + high delay", () => {
    const p = calc(0.9, 0.1, 45);
    expect(p).toBeLessThan(25);
  });
});

describe("Boundary values", () => {
  test.each([
    [0, 0, 0],
    [1, 1, 50],
    [0.5, 0.5, 25],
  ])("En=%s, PDR=%s, TD=%s is a finite number in [0,100]", (en, pdr, td) => {
    const p = calc(en, pdr, td);
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThanOrEqual(100);
    expect(Number.isFinite(p)).toBe(true);
  });
});

describe("Consistency", () => {
  test("same inputs produce same result", () => {
    expect(calc(0.75, 0.35, 20)).toBe(calc(0.75, 0.35, 20));
  });

  test("monotonic in residual energy (rule 25 vs rule 22 vs rule 19, PDR=High, TD=Low)", () => {
    const p1 = calc(0.1, 0.9, 5);
    const p2 = calc(0.5, 0.9, 5);
    const p3 = calc(0.9, 0.9, 5);
    expect(p1).toBeLessThan(p2);
    expect(p2).toBeLessThan(p3);
  });
});

describe("Rule 25 validation: High En + High PDR + Low TD -> VeryLarge", () => {
  test("fires close to 100", () => {
    expect(calc(1, 1, 0)).toBeGreaterThan(85);
  });
});

describe("Rule 6 validation: Low En + Medium PDR + High TD -> VerySmall", () => {
  test("fires close to 0", () => {
    expect(calc(0, 0.4, 50)).toBeLessThan(15);
  });
});

describe("Stress test", () => {
  test("stays in [0, 100] for random inputs", () => {
    for (let i = 0; i < 100; i++) {
      const p = calc(Math.random(), Math.random(), Math.random() * 50);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(100);
      expect(Number.isFinite(p)).toBe(true);
    }
  });
});
