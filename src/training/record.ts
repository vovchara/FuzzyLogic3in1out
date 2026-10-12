import type { FuzzySystem, FuzzyVariable, MembershipShape } from "../fuzzy/types";
import type { AnfisResult, EpochStat } from "./anfis";
import type { GenerationStat, GeneticResult } from "./genetic";

export interface ErrorPair {
  readonly train: number;
  readonly test: number;
}

interface RecordBase {
  readonly system: FuzzySystem;
  readonly fileName: string;
  readonly trainedAt: string;
  readonly trainCount: number;
  readonly testCount: number;
  readonly rmseBefore: ErrorPair;
  readonly rmseAfter: ErrorPair;
}

/** A finished genetic optimisation. Records stored before ANFIS existed carry no `method`. */
export interface GeneticRecord extends RecordBase {
  readonly method?: "genetic";
  readonly history: readonly GenerationStat[];
  readonly stoppedBy: GeneticResult["stoppedBy"];
}

export interface AnfisRecord extends RecordBase {
  readonly method: "anfis";
  readonly history: readonly EpochStat[];
  readonly stoppedBy: AnfisResult["stoppedBy"];
  /** Absent in records stored before it was kept. */
  readonly bestEpoch?: number;
}

/** One finished training run: the controller it produced and how it got there. */
export type TrainingRecord = GeneticRecord | AnfisRecord;

/**
 * One point of the convergence chart, both curves as RMSE in output units:
 * for the GA the best and the population-mean error per generation, for
 * ANFIS the training and the test error per epoch.
 */
export interface ProgressPoint {
  readonly step: number;
  readonly primary: number;
  readonly secondary: number;
}

/**
 * A generation as the chart shows it. Records stored before RMSE was kept per
 * generation fall back to the objective scaled back up, which differs only by
 * the small rule-count term.
 */
export function generationPoint(g: GenerationStat, outputSpan: number): ProgressPoint {
  return { step: g.generation, primary: g.bestRmse ?? g.best * outputSpan, secondary: g.meanRmse ?? g.mean * outputSpan };
}

export function epochPoint(e: EpochStat): ProgressPoint {
  return { step: e.epoch, primary: e.train, secondary: e.test };
}

export function progressOf(record: TrainingRecord, outputSpan: number): ProgressPoint[] {
  return record.method === "anfis"
    ? record.history.map(epochPoint)
    : record.history.map((g) => generationPoint(g, outputSpan));
}

export type ShapeParam = "bias" | "sigma" | "a" | "b" | "c" | "d" | "at";

/** The numbers that define a membership function, by name. */
export function shapeParams(shape: MembershipShape): [ShapeParam, number][] {
  switch (shape.kind) {
    case "gaussian":
      return [["bias", shape.bias], ["sigma", shape.sigma]];
    case "triangle":
    case "trapezoid":
      return shape.points.map((x, i) => [(["a", "b", "c", "d"] as const)[i], x]);
    case "singleton":
      return [["at", shape.at]];
  }
}

export interface ParamChange {
  readonly varId: string;
  readonly termId: string;
  readonly param: ShapeParam;
  readonly from: number;
  readonly to: number;
}

export interface RuleChange {
  readonly ruleId: string;
  readonly from: string;
  /** Null when the GA switched the rule off. */
  readonly to: string | null;
}

function allVars(system: FuzzySystem): FuzzyVariable[] {
  return [...system.inputs, system.output];
}

export function diffSystems(before: FuzzySystem, after: FuzzySystem): { params: ParamChange[]; rules: RuleChange[] } {
  const params: ParamChange[] = [];
  const afterVars = allVars(after);
  for (const v of allVars(before)) {
    const av = afterVars.find((x) => x.id === v.id);
    const eps = (v.range[1] - v.range[0]) / 1000;
    for (const term of v.terms) {
      const at = av?.terms.find((x) => x.id === term.id);
      if (!at || at.shape.kind !== term.shape.kind) continue;
      const after = shapeParams(at.shape);
      shapeParams(term.shape).forEach(([param, from], i) => {
        const to = after[i][1];
        if (Math.abs(to - from) > eps) params.push({ varId: v.id, termId: term.id, param, from, to });
      });
    }
  }

  const out = before.output.id;
  const rules: RuleChange[] = [];
  for (const rule of before.rules) {
    const from = rule.then[out];
    const to = after.rules.find((r) => r.id === rule.id)?.then[out] ?? null;
    if (to !== from) rules.push({ ruleId: rule.id, from, to });
  }
  return { params, rules };
}

/**
 * Whether a stored optimised controller still fits the expert one it was
 * trained from: same variables, ranges and terms, rules that exist with the
 * same antecedents, and the same inference. A stale record would otherwise
 * put terms or rules on screen that the code no longer defines, or apply
 * parameters fitted to a different way of computing the answer.
 */
export function sameStructure(expert: FuzzySystem, trained: FuzzySystem): boolean {
  try {
    const ev = allVars(expert);
    const tv = allVars(trained);
    if (ev.length !== tv.length) return false;
    const varsMatch = ev.every((v, i) => {
      const w = tv[i];
      return w.id === v.id
        && w.range[0] === v.range[0] && w.range[1] === v.range[1]
        && w.terms.length === v.terms.length
        && w.terms.every((t, k) => t.id === v.terms[k].id && validShape(t.shape, v.terms[k].shape));
    });
    const outIds = new Set(expert.output.terms.map((t) => t.id));
    const rulesMatch = trained.rules.length > 0 && trained.rules.every((r) => {
      const e = expert.rules.find((x) => x.id === r.id);
      return e !== undefined
        && JSON.stringify(e.if) === JSON.stringify(r.if)
        && outIds.has(r.then[expert.output.id]);
    });
    // Parameters trained under another inference mean something else here.
    const sameInference = trained.defuzz === expert.defuzz
      && (trained.conjunction ?? "min") === (expert.conjunction ?? "min");
    return varsMatch && rulesMatch && sameInference;
  } catch {
    return false;
  }
}

/** Same kind as the expert term, finite numbers, a positive width, points in order. */
function validShape(shape: MembershipShape, expert: MembershipShape): boolean {
  if (shape.kind !== expert.kind) return false;
  const values = shapeParams(shape).map(([, x]) => x);
  if (!values.every(Number.isFinite)) return false;
  if (shape.kind === "gaussian") return shape.sigma > 0;
  return values.length === shapeParams(expert).length && values.every((x, i) => i === 0 || x >= values[i - 1]);
}

/**
 * The expert controller carrying only what training changed — MF shapes and
 * rule consequents. Names, colours and everything else come from the current
 * code, so a stored record never freezes an old label on screen.
 */
export function rebase(expert: FuzzySystem, trained: FuzzySystem): FuzzySystem {
  const tv = allVars(trained);
  const take = (v: FuzzyVariable): FuzzyVariable => {
    const w = tv.find((x) => x.id === v.id)!;
    return { ...v, terms: v.terms.map((t, k) => ({ ...t, shape: w.terms[k].shape })) };
  };
  const out = expert.output.id;
  const rules = expert.rules.flatMap((r) => {
    const t = trained.rules.find((x) => x.id === r.id);
    return t ? [{ ...r, then: { [out]: t.then[out] } }] : [];
  });
  return { ...expert, inputs: expert.inputs.map(take), output: take(expert.output), rules };
}
