import { describe, expect, test } from "vitest";
import { membershipsFor } from "../src/fuzzy/engine";
import { commCtrlSystem } from "../src/fuzzy/systems/commCtrl";

const [E, T, D] = commCtrlSystem.inputs;
const P = commCtrlSystem.output;

describe("Calculate membership values", () => {
  test("residualEnergy at x=20", () => {
    const m = membershipsFor(E, 20);
    expect(m.Low).toBeCloseTo(0.5, 2);
    expect(m.Medium).toBeCloseTo(0.5, 2);
    expect(m.High).toBe(0);
  });

  test("transmissionCoefficient at x=30", () => {
    const m = membershipsFor(T, 30);
    expect(m.Low).toBeCloseTo(0.5, 2);
    expect(m.Medium).toBeCloseTo(0.5, 2);
    expect(m.High).toBe(0);
  });

  test("delayCoefficient at x=40", () => {
    const m = membershipsFor(D, 40);
    expect(m.Low).toBeCloseTo(0.5, 2);
    expect(m.Medium).toBeCloseTo(0.5, 2);
    expect(m.High).toBe(0);
  });

  test("probability at x=37.5", () => {
    const m = membershipsFor(P, 37.5);
    expect(m.Low).toBeCloseTo(0.5, 2);
    expect(m.Medium).toBeCloseTo(0.5, 2);
    expect(m.VeryLow).toBe(0);
    expect(m.High).toBe(0);
    expect(m.VeryHigh).toBe(0);
  });
});
