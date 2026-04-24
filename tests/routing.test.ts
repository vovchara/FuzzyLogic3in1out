import { beforeAll, describe, expect, test } from "vitest";
import { createEngine, type FuzzyEngine } from "../src/fuzzy/engine";
import { routingSystem } from "../src/fuzzy/systems/routing";

let engine: FuzzyEngine;

beforeAll(() => {
  engine = createEngine(routingSystem);
});

const calc = (E: number, D: number, R: number): number => engine.evaluate({ E, D, R }).output;

describe("Routing controller (bisector defuzz, Gaussian MFs)", () => {
  test("Low E + High D + Low R fires VeryLow output (S near 0)", () => {
    const s = calc(0, 100, 0);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThan(25);
  });

  test("High E + Low D + High R fires VeryHigh output (S near 100)", () => {
    const s = calc(100, 0, 100);
    expect(s).toBeGreaterThan(75);
    expect(s).toBeLessThanOrEqual(100);
  });

  test("Low E + Medium D + Medium R fires Low output (S near 35)", () => {
    const s = calc(0, 50, 50);
    expect(s).toBeGreaterThan(20);
    expect(s).toBeLessThan(50);
  });

  test("High E + Medium D + Medium R fires High output (S near 65)", () => {
    const s = calc(100, 50, 50);
    expect(s).toBeGreaterThan(50);
    expect(s).toBeLessThan(80);
  });

  test("Deterministic: same inputs → same output", () => {
    expect(calc(30, 60, 80)).toBe(calc(30, 60, 80));
  });

  test("All outputs stay within [0, 100] for random inputs", () => {
    for (let i = 0; i < 50; i++) {
      const s = calc(Math.random() * 100, Math.random() * 100, Math.random() * 100);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(100);
      expect(Number.isFinite(s)).toBe(true);
    }
  });
});
