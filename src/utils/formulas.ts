import type { FuzzyRule, FuzzySystem, FuzzyTerm, FuzzyVariable, MembershipShape } from "../fuzzy/types";

export function shapeToLatex(shape: MembershipShape): string {
  switch (shape.kind) {
    case "trapezoid": {
      const [a, b, c, d] = shape.points;
      return String.raw`\mu(x) = \begin{cases}
        0 & x \le ${a} \\[2pt]
        \dfrac{x - ${a}}{${b} - ${a}} & ${a} < x < ${b} \\[2pt]
        1 & ${b} \le x \le ${c} \\[2pt]
        \dfrac{${d} - x}{${d} - ${c}} & ${c} < x < ${d} \\[2pt]
        0 & x \ge ${d}
      \end{cases}`;
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
