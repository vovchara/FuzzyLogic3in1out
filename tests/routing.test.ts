import { beforeAll, describe, expect, test } from "vitest";
import { createEngine, type FuzzyEngine } from "../src/fuzzy/engine";
import { routingSystem } from "../src/fuzzy/systems/routing";

let engine: FuzzyEngine;

beforeAll(() => {
  engine = createEngine(routingSystem);
});

const calc = (RE: number, Dist: number, LQ: number): number =>
  engine.evaluate({ RE, Dist, LQ }).output;

describe("Routing controller (centroid defuzz, Gaussian MFs)", () => {
  test("Matches dissertation worked example: RE=0.7, Dist=15, LQ=0.9 -> RS≈72.3", () => {
    const rs = calc(0.7, 15, 0.9);
    expect(rs).toBeCloseTo(72.3, 0);
  });

  test("Low RE + High Dist + Low LQ fires VeryLow output (RS near 0)", () => {
    const rs = calc(0, 100, 0.3);
    expect(rs).toBeGreaterThanOrEqual(0);
    expect(rs).toBeLessThan(25);
  });

  test("High RE + Low Dist + High LQ fires VeryHigh output (RS near 100)", () => {
    const rs = calc(1, 10, 1);
    expect(rs).toBeGreaterThan(75);
    expect(rs).toBeLessThanOrEqual(100);
  });

  test("Medium RE + Medium Dist + Medium LQ fires High output (RS near 70)", () => {
    const rs = calc(0.65, 40, 0.75);
    expect(rs).toBeGreaterThan(50);
    expect(rs).toBeLessThan(85);
  });

  test("High RE + High Dist + Low LQ fires Low output (RS near 30)", () => {
    const rs = calc(1, 100, 0.3);
    expect(rs).toBeGreaterThan(15);
    expect(rs).toBeLessThan(50);
  });

  test("Deterministic: same inputs → same output", () => {
    expect(calc(0.3, 60, 0.6)).toBe(calc(0.3, 60, 0.6));
  });

  test("All outputs stay within [0, 100] for random inputs", () => {
    for (let i = 0; i < 50; i++) {
      const rs = calc(Math.random(), Math.random() * 100, Math.random());
      expect(rs).toBeGreaterThanOrEqual(0);
      expect(rs).toBeLessThanOrEqual(100);
      expect(Number.isFinite(rs)).toBe(true);
    }
  });
});
