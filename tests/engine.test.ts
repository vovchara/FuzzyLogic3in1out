import { describe, expect, test } from "vitest";
import { evaluateShape, getMostActiveTerm } from "../src/fuzzy/engine";
import type { MembershipShape } from "../src/fuzzy/types";

const trap = (a: number, b: number, c: number, d: number): MembershipShape => ({
  kind: "trapezoid",
  points: [a, b, c, d],
});
const tri = (a: number, b: number, c: number): MembershipShape => ({
  kind: "triangle",
  points: [a, b, c],
});

describe("Trapezoidal membership function", () => {
  test("returns 0 outside range", () => {
    expect(evaluateShape(trap(0, 0, 10, 30), -5)).toBe(0);
    expect(evaluateShape(trap(0, 0, 10, 30), 40)).toBe(0);
  });

  test("returns 1 in flat-top region", () => {
    expect(evaluateShape(trap(0, 0, 10, 30), 5)).toBe(1);
    expect(evaluateShape(trap(0, 0, 10, 30), 10)).toBe(1);
  });

  test("returns correct slope values", () => {
    expect(evaluateShape(trap(10, 30, 50, 70), 20)).toBe(0.5);
    expect(evaluateShape(trap(10, 30, 50, 70), 60)).toBe(0.5);
    expect(evaluateShape(trap(10, 30, 50, 70), 40)).toBe(1);
  });

  test("handles edge cases", () => {
    expect(evaluateShape(trap(0, 0, 10, 30), 0)).toBe(1);
    expect(evaluateShape(trap(0, 0, 10, 30), 10)).toBe(1);
    expect(evaluateShape(trap(0, 0, 10, 30), 30)).toBe(0);
  });
});

describe("Triangular membership function", () => {
  test("returns 0 outside range", () => {
    expect(evaluateShape(tri(25, 50, 75), 20)).toBe(0);
    expect(evaluateShape(tri(25, 50, 75), 80)).toBe(0);
  });

  test("returns 1 at peak", () => {
    expect(evaluateShape(tri(25, 50, 75), 50)).toBe(1);
  });

  test("returns correct slope values", () => {
    expect(evaluateShape(tri(25, 50, 75), 37.5)).toBe(0.5);
    expect(evaluateShape(tri(25, 50, 75), 62.5)).toBe(0.5);
  });

  test("handles left rectangular case (VeryLow)", () => {
    expect(evaluateShape(tri(0, 0, 25), 0)).toBe(1);
    expect(evaluateShape(tri(0, 0, 25), 12.5)).toBe(0.5);
    expect(evaluateShape(tri(0, 0, 25), 25)).toBe(0);
  });

  test("handles right rectangular case (VeryHigh)", () => {
    expect(evaluateShape(tri(75, 100, 100), 75)).toBe(0);
    expect(evaluateShape(tri(75, 100, 100), 87.5)).toBe(0.5);
    expect(evaluateShape(tri(75, 100, 100), 100)).toBe(1);
  });
});

describe("getMostActiveTerm", () => {
  test("returns term with highest membership", () => {
    expect(
      getMostActiveTerm({ VeryLow: 0.1, Low: 0.8, Medium: 0.3, High: 0, VeryHigh: 0 }),
    ).toBe("Low");
  });

  test("handles ties by returning first max found", () => {
    const result = getMostActiveTerm({ Low: 0.5, Medium: 0.5, High: 0 });
    expect(["Low", "Medium"]).toContain(result);
  });

  test("returns N/A for empty memberships", () => {
    expect(getMostActiveTerm({})).toBe("N/A");
  });
});
