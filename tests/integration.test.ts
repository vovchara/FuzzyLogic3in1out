import { beforeAll, describe, expect, test } from "vitest";
import { createEngine, getMostActiveTerm, membershipsFor, type FuzzyEngine } from "../src/fuzzy/engine";
import { commCtrlSystem } from "../src/fuzzy/systems/commCtrl";

let engine: FuzzyEngine;
const [E, T, D] = commCtrlSystem.inputs;
const P = commCtrlSystem.output;

beforeAll(() => {
  engine = createEngine(commCtrlSystem);
});

describe("End-to-end probability assessment", () => {
  test("high probability scenario (E=85, T=70, D=35)", () => {
    const result = engine.evaluate({ E: 85, T: 70, D: 35 });
    expect(result.output).toBeGreaterThan(75);

    expect(membershipsFor(E, 85).High).toBeGreaterThan(0.5);
    expect(membershipsFor(T, 70).High).toBeGreaterThanOrEqual(0.5);
    expect(membershipsFor(D, 35).Low).toBeGreaterThanOrEqual(0.5);

    expect(["VeryHigh", "High"]).toContain(result.mostActiveTerm);
  });

  test("low probability scenario (E=10, T=50, D=60)", () => {
    const result = engine.evaluate({ E: 10, T: 50, D: 60 });
    expect(result.output).toBeLessThan(25);

    expect(membershipsFor(E, 10).Low).toBeGreaterThan(0.5);
    expect(membershipsFor(T, 50).Medium).toBeGreaterThan(0.5);
    expect(membershipsFor(D, 60).Medium).toBeGreaterThan(0.5);

    expect(["VeryLow", "Low"]).toContain(result.mostActiveTerm);
  });
});

describe("Key rules validation", () => {
  const cases: Array<{ input: [number, number, number]; range: [number, number]; desc: string }> = [
    { input: [85, 70, 35], range: [75, 100], desc: "High-High-Low → VeryHigh (optimal)" },
    { input: [85, 50, 40], range: [75, 100], desc: "High-Medium-Low → VeryHigh (good)" },
    { input: [10, 50, 60], range: [0, 25],   desc: "Low-Medium-Medium → VeryLow (critical)" },
    { input: [5, 50, 80],  range: [0, 25],   desc: "Low-Medium-High → VeryLow (bad)" },
    { input: [40, 50, 60], range: [25, 75],  desc: "Medium-Medium-Medium → Medium (balanced)" },
    { input: [80, 20, 40], range: [50, 100], desc: "High-Low-Low → High (stable)" },
  ];

  test.each(cases)("$desc", ({ input, range }) => {
    const [e, t, d] = input;
    const [min, max] = range;
    const p = engine.evaluate({ E: e, T: t, D: d }).output;
    expect(p).toBeGreaterThanOrEqual(min);
    expect(p).toBeLessThanOrEqual(max);
  });
});

describe("System robustness", () => {
  test("floating point precision tolerance", () => {
    const p1 = engine.evaluate({ E: 33.333, T: 66.666, D: 49.999 }).output;
    const p2 = engine.evaluate({ E: 33.334, T: 66.667, D: 50.0 }).output;
    expect(Math.abs(p1 - p2)).toBeLessThan(5);
  });

  test("stable across repeated calculations", () => {
    const inputs = { E: 75.5, T: 42.3, D: 38.7 };
    const first = engine.evaluate(inputs).output;
    for (let i = 0; i < 10; i++) {
      expect(engine.evaluate(inputs).output).toBe(first);
    }
  });

  test("stress test with random inputs", () => {
    for (let i = 0; i < 100; i++) {
      const p = engine.evaluate({
        E: Math.random() * 100,
        T: Math.random() * 100,
        D: Math.random() * 100,
      }).output;
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(100);
      expect(Number.isFinite(p)).toBe(true);
    }
  });
});

describe("Term coverage", () => {
  test("can produce VeryLow output", () => {
    const p = engine.evaluate({ E: 5, T: 50, D: 60 }).output;
    expect(getMostActiveTerm(membershipsFor(P, p))).toBe("VeryLow");
    expect(p).toBeLessThan(25);
  });

  test("can produce VeryHigh output", () => {
    const p = engine.evaluate({ E: 90, T: 85, D: 35 }).output;
    expect(getMostActiveTerm(membershipsFor(P, p))).toBe("VeryHigh");
    expect(p).toBeGreaterThan(75);
  });

  test("can produce Medium output", () => {
    const p = engine.evaluate({ E: 40, T: 50, D: 60 }).output;
    expect(p).toBeGreaterThanOrEqual(25);
    expect(p).toBeLessThanOrEqual(75);
  });
});
