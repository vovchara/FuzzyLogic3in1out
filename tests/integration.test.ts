import { beforeAll, describe, expect, test } from "vitest";
import { createEngine, getMostActiveTerm, membershipsFor, type FuzzyEngine } from "../src/fuzzy/engine";
import { commCtrlSystem } from "../src/fuzzy/systems/commCtrl";

let engine: FuzzyEngine;
const [En, PDR, TD] = commCtrlSystem.inputs;
const ChP = commCtrlSystem.output;

beforeAll(() => {
  engine = createEngine(commCtrlSystem);
});

describe("End-to-end cluster head probability assessment", () => {
  test("high probability scenario (En=0.8, PDR=0.7, TD=5) matches dissertation Fig. 2.9", () => {
    const result = engine.evaluate({ En: 0.8, PDR: 0.7, TD: 5 });
    expect(result.output).toBeCloseTo(75, 0);

    expect(membershipsFor(En, 0.8).High).toBeCloseTo(1, 5);
    expect(membershipsFor(PDR, 0.7).Medium).toBeCloseTo(1, 5);
    expect(membershipsFor(TD, 5).Low).toBeCloseTo(1, 5);

    expect(result.mostActiveTerm).toBe("Large");
  });

  test("low probability scenario (En=0.2, PDR=0.1, TD=37) matches dissertation Fig. 2.8", () => {
    const result = engine.evaluate({ En: 0.2, PDR: 0.1, TD: 37 });
    expect(result.output).toBeCloseTo(8.32, 1);

    expect(membershipsFor(En, 0.2).Low).toBeCloseTo(1, 5);
    expect(membershipsFor(PDR, 0.1).Low).toBeCloseTo(1, 5);

    expect(result.mostActiveTerm).toBe("VerySmall");
  });
});

describe("Key rules validation (Таблиця 2.1)", () => {
  const cases: Array<{ input: [number, number, number]; range: [number, number]; desc: string }> = [
    { input: [0, 0, 0],       range: [0, 25],    desc: "Low-Low-Low -> VerySmall (rule 1)" },
    { input: [0.5, 0.9, 5],   range: [50, 100],  desc: "Medium-High-Low -> Large (rule 16)" },
    { input: [1, 0.1, 40],    range: [0, 25],    desc: "High-Low-High -> VerySmall (rule 21)" },
    { input: [0.5, 0.5, 5],   range: [25, 75],   desc: "Medium-Medium-Low -> Medium (rule 13)" },
    { input: [1, 1, 0],       range: [75, 100],  desc: "High-High-Low -> VeryLarge (rule 25)" },
  ];

  test.each(cases)("$desc", ({ input, range }) => {
    const [en, pdr, td] = input;
    const [min, max] = range;
    const p = engine.evaluate({ En: en, PDR: pdr, TD: td }).output;
    expect(p).toBeGreaterThanOrEqual(min);
    expect(p).toBeLessThanOrEqual(max);
  });
});

describe("System robustness", () => {
  test("floating point precision tolerance", () => {
    const p1 = engine.evaluate({ En: 0.33333, PDR: 0.66666, TD: 24.999 }).output;
    const p2 = engine.evaluate({ En: 0.33334, PDR: 0.66667, TD: 25.0 }).output;
    expect(Math.abs(p1 - p2)).toBeLessThan(5);
  });

  test("stable across repeated calculations", () => {
    const inputs = { En: 0.755, PDR: 0.423, TD: 38.7 };
    const first = engine.evaluate(inputs).output;
    for (let i = 0; i < 10; i++) {
      expect(engine.evaluate(inputs).output).toBe(first);
    }
  });

  test("stress test with random inputs", () => {
    for (let i = 0; i < 100; i++) {
      const p = engine.evaluate({
        En: Math.random(),
        PDR: Math.random(),
        TD: Math.random() * 50,
      }).output;
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(100);
      expect(Number.isFinite(p)).toBe(true);
    }
  });
});

describe("Term coverage", () => {
  test("can produce VerySmall output", () => {
    const p = engine.evaluate({ En: 0, PDR: 0, TD: 0 }).output;
    expect(getMostActiveTerm(membershipsFor(ChP, p))).toBe("VerySmall");
    expect(p).toBeLessThan(25);
  });

  test("can produce VeryLarge output", () => {
    const p = engine.evaluate({ En: 1, PDR: 1, TD: 0 }).output;
    expect(getMostActiveTerm(membershipsFor(ChP, p))).toBe("VeryLarge");
    expect(p).toBeGreaterThan(75);
  });

  test("can produce Medium output", () => {
    const p = engine.evaluate({ En: 0.5, PDR: 0.5, TD: 5 }).output;
    expect(p).toBeGreaterThanOrEqual(25);
    expect(p).toBeLessThanOrEqual(75);
  });
});
