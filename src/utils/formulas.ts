import type { FuzzyRule, FuzzySystem, FuzzyTerm, FuzzyVariable, MembershipShape } from "../fuzzy/types";

export function shapeToLatex(shape: MembershipShape): string {
  switch (shape.kind) {
    case "trapezoid": {
      const [a, b, c, d] = shape.points;
      // Shoulders collapse when a === b or c === d, and the plateau collapses
      // to a point when b === c. Emitting those branches unconditionally would
      // print empty intervals and zero denominators, so each is skipped.
      const rows: string[] = [];
      if (a < b) {
        rows.push(String.raw`0 & x \le ${a}`);
        rows.push(String.raw`\dfrac{x - ${a}}{${b} - ${a}} & ${a} < x < ${b}`);
      } else {
        rows.push(String.raw`0 & x < ${a}`);
      }
      rows.push(b < c ? String.raw`1 & ${b} \le x \le ${c}` : String.raw`1 & x = ${b}`);
      if (c < d) {
        rows.push(String.raw`\dfrac{${d} - x}{${d} - ${c}} & ${c} < x < ${d}`);
        rows.push(String.raw`0 & x \ge ${d}`);
      } else {
        rows.push(String.raw`0 & x > ${d}`);
      }
      return casesToLatex(rows);
    }
    case "triangle": {
      const [a, b, c] = shape.points;
      if (a === b) {
        return String.raw`\mu(x) = \begin{cases}
          \dfrac{${c} - x}{${c} - ${a}} & ${a} \le x < ${c} \\[2pt]
          0 & \text{otherwise}
        \end{cases}`;
      }
      if (b === c) {
        return String.raw`\mu(x) = \begin{cases}
          \dfrac{x - ${a}}{${b} - ${a}} & ${a} < x \le ${b} \\[2pt]
          0 & \text{otherwise}
        \end{cases}`;
      }
      return String.raw`\mu(x) = \begin{cases}
        \dfrac{x - ${a}}{${b} - ${a}} & ${a} \le x \le ${b} \\[2pt]
        \dfrac{${c} - x}{${c} - ${b}} & ${b} < x \le ${c} \\[2pt]
        0 & \text{otherwise}
      \end{cases}`;
    }
    case "gaussian":
      return String.raw`\mu(x) = \exp\!\left( -\dfrac{(x - ${shape.bias})^{2}}{2 \cdot ${shape.sigma}^{2}} \right)`;
    case "singleton":
      return String.raw`\mu(x) = \begin{cases}
        1 & x = ${shape.at} \\[2pt]
        0 & \text{otherwise}
      \end{cases}`;
  }
}

/**
 * Rewrites \dfrac{a}{b} as (a) / (b). Used for the PDF export only: KaTeX
 * stacks fractions with zero-height positioned spans, and html2canvas puts the
 * fraction rule at its flow position instead, striking through the numerator.
 */
export function inlineFractions(latex: string): string {
  let out = "";
  let i = 0;
  while (i < latex.length) {
    const opener = /^\\[dt]?frac\{/.exec(latex.slice(i));
    if (!opener) {
      out += latex[i];
      i += 1;
      continue;
    }
    const numStart = i + opener[0].length;
    const numEnd = closingBrace(latex, numStart);
    if (numEnd < 0 || latex[numEnd + 1] !== "{") {
      out += latex[i];
      i += 1;
      continue;
    }
    const denStart = numEnd + 2;
    const denEnd = closingBrace(latex, denStart);
    if (denEnd < 0) {
      out += latex[i];
      i += 1;
      continue;
    }
    const num = inlineFractions(latex.slice(numStart, numEnd));
    const den = inlineFractions(latex.slice(denStart, denEnd));
    out += `(${num}) / (${den})`;
    i = denEnd + 1;
  }
  return out;
}

/** Index of the brace closing the group that starts at `start`. */
function closingBrace(latex: string, start: number): number {
  let depth = 1;
  for (let i = start; i < latex.length; i++) {
    if (latex[i] === "\\") {
      i += 1;
      continue;
    }
    if (latex[i] === "{") depth += 1;
    else if (latex[i] === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function casesToLatex(rows: readonly string[]): string {
  return String.raw`\mu(x) = \begin{cases}
        ${rows.join(String.raw` \\[2pt]
        `)}
      \end{cases}`;
}

export function termToLatex(term: FuzzyTerm): string {
  return term.latex ?? shapeToLatex(term.shape);
}

export function variableDomainLatex(variable: FuzzyVariable): string {
  return `x \\in [${variable.range[0]},\\, ${variable.range[1]}]`;
}

export function ruleToLatex(
  rule: FuzzyRule,
  system: FuzzySystem,
  i18n: { t: (key: string) => string },
): string {
  const varById = new Map<string, FuzzyVariable>();
  for (const v of system.inputs) varById.set(v.id, v);
  varById.set(system.output.id, system.output);
  const resolveTerm = (vid: string, tid: string): string => {
    const v = varById.get(vid);
    const term = v?.terms.find((t) => t.id === tid);
    return term ? escapeLatex(i18n.t(term.nameKey)) : tid;
  };
  const IF = i18n.t("rule.if");
  const AND = i18n.t("rule.and");
  const THEN = i18n.t("rule.then");
  const conds = Object.entries(rule.if)
    .map(([vid, tid]) => `\\text{${vid}} = \\text{${resolveTerm(vid, tid)}}`)
    .join(` \\; \\text{${escapeLatex(AND)}} \\; `);
  const concs = Object.entries(rule.then)
    .map(([vid, tid]) => `\\text{${vid}} = \\text{${resolveTerm(vid, tid)}}`)
    .join(", ");
  return `\\text{${escapeLatex(IF)}}\\; ${conds}\\; \\text{${escapeLatex(THEN)}}\\; ${concs}`;
}

function escapeLatex(s: string): string {
  return s.replace(/([\\{}$%&#_^~])/g, "\\$1");
}
