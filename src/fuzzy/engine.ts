import {
  and,
  centroidStrategy,
  defuzz,
  trapezoid,
  triangle,
  variable,
  type LVar,
} from "@thi.ng/fuzzy";
import type {
  FuzzyEvaluation,
  FuzzySystem,
  FuzzyVariable,
  MembershipShape,
} from "./types";

const FALLBACK_OUTPUT = 25;

function shapeFn(shape: MembershipShape) {
  if (shape.kind === "trapezoid") {
    const [a, b, c, d] = shape.points;
    return trapezoid(a, b, c, d);
  }
  const [a, b, c] = shape.points;
  return triangle(a, b, c);
}

function toLVar(v: FuzzyVariable): LVar<string> {
  const terms: Record<string, ReturnType<typeof triangle>> = {};
  for (const t of v.terms) terms[t.id] = shapeFn(t.shape);
  return variable([v.range[0], v.range[1]], terms);
}

export interface FuzzyEngine {
  readonly system: FuzzySystem;
  evaluate(inputs: Readonly<Record<string, number>>): FuzzyEvaluation;
}

export function createEngine(system: FuzzySystem): FuzzyEngine {
  const inputVars: Record<string, LVar<string>> = {};
  for (const v of system.inputs) inputVars[v.id] = toLVar(v);
  const outputVars: Record<string, LVar<string>> = { [system.output.id]: toLVar(system.output) };
  const thiRules = system.rules.map((r) => and(r.if, r.then));

  function runDefuzz(inputs: Readonly<Record<string, number>>): number {
    try {
      const result = defuzz(inputVars, outputVars, thiRules, inputs, centroidStrategy());
      const val = result[system.output.id];
      if (val === undefined || Number.isNaN(val)) return FALLBACK_OUTPUT;
      return val;
    } catch (err) {
      if (err instanceof Error && err.message === "no fuzzy sets given") return FALLBACK_OUTPUT;
      throw err;
    }
  }

  function evaluate(inputs: Readonly<Record<string, number>>): FuzzyEvaluation {
    const output = runDefuzz(inputs);

    const memberships: Record<string, Record<string, number>> = {};
    for (const v of system.inputs) {
      memberships[v.id] = membershipsFor(v, inputs[v.id] ?? v.defaultValue);
    }
    memberships[system.output.id] = membershipsFor(system.output, output);

    const mostActiveTerm = getMostActiveTerm(memberships[system.output.id]);

    return { output, memberships, mostActiveTerm };
  }

  return { system, evaluate };
}

export function membershipsFor(v: FuzzyVariable, x: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of v.terms) out[t.id] = evaluateShape(t.shape, x);
  return out;
}

export function evaluateShape(shape: MembershipShape, x: number): number {
  if (shape.kind === "trapezoid") {
    const [a, b, c, d] = shape.points;
    if (x < a || x > d) return 0;
    if (x >= b && x <= c) return 1;
    if (x >= a && x < b) return (x - a) / (b - a);
    return (d - x) / (d - c);
  }
  const [a, b, c] = shape.points;
  if (x < a || x > c) return 0;
  if (a === b) return (c - x) / (c - a);
  if (b === c) return (x - a) / (b - a);
  if (x <= b) return (x - a) / (b - a);
  return (c - x) / (c - b);
}

export function getMostActiveTerm(memberships: Readonly<Record<string, number>>): string {
  let max = -1;
  let winner = "N/A";
  for (const [term, value] of Object.entries(memberships)) {
    if (value > max) {
      max = value;
      winner = term;
    }
  }
  return winner;
}
