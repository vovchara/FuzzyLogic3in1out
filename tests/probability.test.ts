import { beforeAll, describe, expect, test } from "vitest";
import { createEngine, type FuzzyEngine } from "../src/fuzzy/engine";
import { commCtrlSystem } from "../src/fuzzy/systems/commCtrl";

let engine: FuzzyEngine;

beforeAll(() => {
  engine = createEngine(commCtrlSystem);
});

const calc = (E: number, T: number, D: number): number => engine.evaluate({ E, T, D }).output;

describe("Optimal scenarios (high probability)", () => {
  test("high energy + medium/high transmission", () => {
    const p = calc(85, 50, 40);
    expect(p).toBeGreaterThan(75);
    expect(p).toBeLessThanOrEqual(100);
  });

  test("high energy conditions", () => {
    const p = calc(80, 70, 40);
    expect(p).toBeGreaterThan(75);
    expect(p).toBeLessThanOrEqual(100);
  });

  test("medium energy + good transmission", () => {
    const p = calc(40, 80, 30);
    expect(p).toBeGreaterThan(50);
    expect(p).toBeLessThanOrEqual(100);
  });
});

describe("Critical scenarios (low probability)", () => {
  test("low energy + medium transmission", () => {
    const p = calc(5, 50, 60);
    expect(p).toBeLessThan(25);
    expect(p).toBeGreaterThanOrEqual(0);
  });

  test("low energy conditions", () => {
    const p = calc(15, 25, 30);
    expect(p).toBeLessThan(50);
    expect(p).toBeGreaterThanOrEqual(0);
  });

  test("medium energy + low transmission + high delay", () => {
    const p = calc(40, 20, 80);
    expect(p).toBeLessThan(50);
    expect(p).toBeGreaterThanOrEqual(0);
  });
});

describe("Boundary values", () => {
  test.each([
    [0, 0, 0],
    [100, 100, 100],
    [50, 50, 50],
  ])("%i, %i, %i is a finite number in [0,100]", (e, t, d) => {
    const p = calc(e, t, d);
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThanOrEqual(100);
    expect(Number.isFinite(p)).toBe(true);
  });
});

describe("Consistency", () => {
  test("same inputs produce same result", () => {
    expect(calc(75, 35, 20)).toBe(calc(75, 35, 20));
  });

  test("monotonic in residual energy", () => {
    const p1 = calc(20, 50, 50);
    const p2 = calc(50, 50, 50);
    const p3 = calc(80, 50, 50);
    expect(p1).toBeLessThan(p2);
    expect(p2).toBeLessThan(p3);
  });

  test("higher transmission raises probability at high energy", () => {
    expect(calc(80, 30, 40)).toBeLessThan(calc(80, 70, 40));
  });
});

describe("Rule validation", () => {
  test("High E + Medium T + Low D → VeryHigh", () => {
    expect(calc(85, 50, 35)).toBeGreaterThan(75);
  });

  test("Low E + Medium T + Medium D → VeryLow", () => {
    expect(calc(10, 50, 60)).toBeLessThan(25);
  });

  test("Medium E + Low T + Low D → Medium", () => {
    const p = calc(40, 20, 35);
    expect(p).toBeGreaterThanOrEqual(25);
    expect(p).toBeLessThanOrEqual(75);
  });

  test("Medium E + High T + Low D → High", () => {
    expect(calc(40, 85, 35)).toBeGreaterThan(50);
  });
});
