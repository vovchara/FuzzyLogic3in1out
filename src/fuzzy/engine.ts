import {
  and,
  bisectorStrategy,
  centroidStrategy,
  defuzz,
  gaussian as gaussianFn,
  point,
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
const SINGLETON_EPS = 0.5;

function shapeFn(shape: MembershipShape) {
  switch (shape.kind) {
    case "trapezoid":
      return trapezoid(...shape.points);
    case "triangle":
      return triangle(...shape.points);
    case "gaussian":
      return gaussianFn(shape.bias, shape.sigma);
    case "singleton":
      return point(shape.at, SINGLETON_EPS);
  }
}

function toLVar(v: FuzzyVariable): LVar<string> {
  const terms: Record<string, ReturnType<typeof triangle>> = {};
  for (const t of v.terms) terms[t.id] = shapeFn(t.shape);
  return variable([v.range[0], v.range[1]], terms);
}

function hasSingletonOutput(system: FuzzySystem): boolean {
  return system.output.terms.every((t) => t.shape.kind === "singleton");
}

function weightedAverageSingletons(
  system: FuzzySystem,
  inputs: Readonly<Record<string, number>>,
): { output: number; activations: Record<string, number> } {
  const inputEvals: Record<string, Record<string, number>> = {};
  for (const v of system.inputs) {
    const evals: Record<string, number> = {};
    for (const t of v.terms) evals[t.id] = evaluateShape(t.shape, inputs[v.id] ?? v.defaultValue);
    inputEvals[v.id] = evals;
  }

  const activations: Record<string, number> = {};
  for (const term of system.output.terms) activations[term.id] = 0;

  let numerator = 0;
  let denominator = 0;

  for (const rule of system.rules) {
    let strength = 1;
    for (const [varId, termId] of Object.entries(rule.if)) {
      const m = inputEvals[varId]?.[termId] ?? 0;
      if (m < strength) strength = m;
    }
    if (strength <= 0) continue;

    for (const [varId, termId] of Object.entries(rule.then)) {
      if (varId !== system.output.id) continue;
      const outTerm = system.output.terms.find((t) => t.id === termId);
      if (!outTerm || outTerm.shape.kind !== "singleton") continue;
      numerator += strength * outTerm.shape.at;
      denominator += strength;
      if (strength > activations[termId]) activations[termId] = strength;
    }
  }

  const output = denominator > 0
    ? numerator / denominator
    : (system.output.range[0] + system.output.range[1]) / 2;
  return { output, activations };
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
  const singletonOutput = hasSingletonOutput(system);

  function runStrategyDefuzz(inputs: Readonly<Record<string, number>>): number {
    const strategy = system.defuzz === "bisector" ? bisectorStrategy() : centroidStrategy();
    try {
      const result = defuzz(inputVars, outputVars, thiRules, inputs, strategy);
      const val = result[system.output.id];
      if (val === undefined || Number.isNaN(val)) return FALLBACK_OUTPUT;
      return val;
    } catch (err) {
      if (err instanceof Error && err.message === "no fuzzy sets given") return FALLBACK_OUTPUT;
      throw err;
    }
  }

  function evaluate(inputs: Readonly<Record<string, number>>): FuzzyEvaluation {
    let output: number;
    let outputTermActivations: Record<string, number> | undefined;

    if (system.defuzz === "weighted-average" || singletonOutput) {
      const r = weightedAverageSingletons(system, inputs);
      output = r.output;
      outputTermActivations = r.activations;
    } else {
      output = runStrategyDefuzz(inputs);
    }

    const memberships: Record<string, Record<string, number>> = {};
    for (const v of system.inputs) {
      memberships[v.id] = membershipsFor(v, inputs[v.id] ?? v.defaultValue);
    }
    memberships[system.output.id] = outputTermActivations
      ? { ...outputTermActivations }
      : membershipsFor(system.output, output);

    const mostActiveTerm = getMostActiveTerm(memberships[system.output.id]);

    return outputTermActivations
      ? { output, memberships, mostActiveTerm, outputTermActivations }
      : { output, memberships, mostActiveTerm };
  }

  return { system, evaluate };
}

export function membershipsFor(v: FuzzyVariable, x: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of v.terms) out[t.id] = evaluateShape(t.shape, x);
  return out;
}

export function evaluateShape(shape: MembershipShape, x: number): number {
  switch (shape.kind) {
    case "trapezoid": {
      const [a, b, c, d] = shape.points;
      if (x < a || x > d) return 0;
      if (x >= b && x <= c) return 1;
      if (x >= a && x < b) return (x - a) / (b - a);
      return (d - x) / (d - c);
    }
    case "triangle": {
      const [a, b, c] = shape.points;
      if (x < a || x > c) return 0;
      if (a === b) return (c - x) / (c - a);
      if (b === c) return (x - a) / (b - a);
      if (x <= b) return (x - a) / (b - a);
      return (c - x) / (c - b);
    }
    case "gaussian": {
      const d = x - shape.bias;
      return Math.exp(-(d * d) / (2 * shape.sigma * shape.sigma));
    }
    case "singleton":
      return Math.abs(x - shape.at) < SINGLETON_EPS ? 1 : 0;
  }
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
