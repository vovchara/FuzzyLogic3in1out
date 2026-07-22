import { describe, expect, test } from "vitest";
import { membershipsFor } from "../src/fuzzy/engine";
import { commCtrlSystem } from "../src/fuzzy/systems/commCtrl";

const [En, PDR, TD] = commCtrlSystem.inputs;
const ChP = commCtrlSystem.output;

describe("Calculate membership values", () => {
  test("residualEnergy (En) at x=0.3", () => {
    const m = membershipsFor(En, 0.3);
    expect(m.Low).toBeCloseTo(0.5, 5);
    expect(m.Medium).toBeCloseTo(0.5, 5);
    expect(m.High).toBe(0);
  });

  test("packetDeliveryRatio (PDR) at x=0.4", () => {
    const m = membershipsFor(PDR, 0.4);
    expect(m.Low).toBeCloseTo(0.5, 5);
    expect(m.Medium).toBeCloseTo(0.5, 5);
    expect(m.High).toBe(0);
  });

  test("transmissionDelay (TD) at x=17.5", () => {
    const m = membershipsFor(TD, 17.5);
    expect(m.Low).toBeCloseTo(0.25, 5);
    expect(m.Medium).toBeCloseTo(0.25, 5);
    expect(m.High).toBe(0);
  });

  test("probability (ChP) at x=37.5", () => {
    const m = membershipsFor(ChP, 37.5);
    expect(m.Small).toBeCloseTo(0.5, 5);
    expect(m.Medium).toBeCloseTo(0.5, 5);
    expect(m.VerySmall).toBe(0);
    expect(m.Large).toBe(0);
    expect(m.VeryLarge).toBe(0);
  });
});
