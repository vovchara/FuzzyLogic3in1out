import { describe, expect, test } from "vitest";
import { inlineFractions, shapeToLatex } from "../src/utils/formulas";
import { systems } from "../src/fuzzy/systems";
import type { MembershipShape } from "../src/fuzzy/types";

const trap = (a: number, b: number, c: number, d: number): MembershipShape => ({
  kind: "trapezoid",
  points: [a, b, c, d],
});

const allShapes = (): MembershipShape[] =>
  systems.flatMap((s) =>
    [...s.inputs, s.output].flatMap((v) => v.terms.map((term) => term.shape)),
  );

describe("Piecewise LaTeX of membership shapes", () => {
  test("no empty interval for a collapsed left shoulder", () => {
    const latex = shapeToLatex(trap(0, 0, 0.2, 0.4));
    expect(latex).not.toContain("0 < x < 0");
    expect(latex).toContain(String.raw`0 & x < 0`);
    expect(latex).toContain(String.raw`1 & 0 \le x \le 0.2`);
  });

  test("no empty interval for a collapsed right shoulder", () => {
    const latex = shapeToLatex(trap(0.6, 0.8, 1, 1));
    expect(latex).not.toContain("1 < x < 1");
    expect(latex).toContain(String.raw`0 & x > 1`);
  });

  test("collapsed plateau renders as a single point", () => {
    const latex = shapeToLatex(trap(25, 45, 45, 45));
    expect(latex).not.toContain("45 < x < 45");
    expect(latex).toContain(String.raw`1 & x = 45`);
  });

  test("both shoulders collapsed leaves only the falling ramp", () => {
    const latex = shapeToLatex(trap(0, 0, 0, 15));
    expect(latex).not.toContain("0 < x < 0");
    expect(latex).toContain(String.raw`1 & x = 0`);
    expect(latex).toContain(String.raw`\dfrac{15 - x}{15 - 0} & 0 < x < 15`);
  });

  test("a regular trapezoid keeps all five branches", () => {
    const latex = shapeToLatex(trap(0.2, 0.4, 0.6, 0.8));
    expect(latex).toContain(String.raw`0 & x \le 0.2`);
    expect(latex).toContain(String.raw`\dfrac{x - 0.2}{0.4 - 0.2} & 0.2 < x < 0.4`);
    expect(latex).toContain(String.raw`1 & 0.4 \le x \le 0.6`);
    expect(latex).toContain(String.raw`\dfrac{0.8 - x}{0.8 - 0.6} & 0.6 < x < 0.8`);
    expect(latex).toContain(String.raw`0 & x \ge 0.8`);
  });

  test("no shape in any system renders a degenerate interval or denominator", () => {
    for (const shape of allShapes()) {
      const latex = shapeToLatex(shape);
      expect(latex, JSON.stringify(shape)).not.toMatch(/(-?[\d.]+) < x < \1\b/);
      expect(latex, JSON.stringify(shape)).not.toMatch(/\{(-?[\d.]+) - \1\}/);
    }
  });
});

describe("Flattening fractions for the PDF export", () => {
  test("rewrites a simple fraction", () => {
    expect(inlineFractions(String.raw`\dfrac{x - 0.2}{0.4 - 0.2}`)).toBe("(x - 0.2) / (0.4 - 0.2)");
  });

  test("keeps nested braces intact", () => {
    expect(inlineFractions(String.raw`\dfrac{(x - 50)^{2}}{2 \cdot 10^{2}}`)).toBe(
      String.raw`((x - 50)^{2}) / (2 \cdot 10^{2})`,
    );
  });

  test("handles a fraction nested inside another", () => {
    expect(inlineFractions(String.raw`\dfrac{\dfrac{a}{b}}{c}`)).toBe("((a) / (b)) / (c)");
  });

  test("also rewrites \\frac and \\tfrac", () => {
    expect(inlineFractions(String.raw`\frac{a}{b}`)).toBe("(a) / (b)");
    expect(inlineFractions(String.raw`\tfrac{a}{b}`)).toBe("(a) / (b)");
  });

  test("leaves other markup untouched", () => {
    const cases = shapeToLatex({ kind: "trapezoid", points: [0.2, 0.4, 0.6, 0.8] });
    const flat = inlineFractions(cases);
    expect(flat).toContain(String.raw`\begin{cases}`);
    expect(flat).toContain(String.raw`0 & x \le 0.2`);
    expect(flat).not.toContain(String.raw`\dfrac`);
  });

  test("leaves a fraction-free formula unchanged", () => {
    const singleton = shapeToLatex({ kind: "singleton", at: 40 });
    expect(inlineFractions(singleton)).toBe(singleton);
  });

  test("no system formula still contains a stacked fraction after flattening", () => {
    for (const shape of allShapes()) {
      expect(inlineFractions(shapeToLatex(shape))).not.toContain("frac");
    }
  });
});
