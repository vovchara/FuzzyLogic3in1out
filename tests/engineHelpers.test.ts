import { describe, expect, test } from "vitest";
import { curvePeak, ruleStrength } from "../src/fuzzy/engine";

describe("ruleStrength", () => {
  const memberships = { A: { low: 0.7, high: 0.2 }, B: { low: 0.4 } };

  test("takes the minimum of the antecedent memberships", () => {
    expect(ruleStrength({ if: { A: "low", B: "low" } }, memberships)).toBe(0.4);
  });

  test("treats an unknown variable or term as zero", () => {
    expect(ruleStrength({ if: { A: "low", C: "low" } }, memberships)).toBe(0);
    expect(ruleStrength({ if: { A: "missing" } }, memberships)).toBe(0);
  });
});

describe("curvePeak", () => {
  test("finds the maximum of a curve over the range", () => {
    expect(curvePeak((x) => 1 - Math.abs(x - 50) / 50, [0, 100])).toBeCloseTo(1, 6);
    expect(curvePeak(() => 0.35, [0, 1])).toBeCloseTo(0.35, 9);
  });
});
