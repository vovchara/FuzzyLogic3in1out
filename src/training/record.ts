import type { FuzzySystem, FuzzyVariable } from "../fuzzy/types";
import type { GenerationStat, GeneticResult } from "./genetic";

export interface ErrorPair {
  readonly train: number;
  readonly test: number;
}

/** One finished optimisation: the controller it produced and how it got there. */
export interface TrainingRecord {
  readonly system: FuzzySystem;
  readonly history: readonly GenerationStat[];
  readonly stoppedBy: GeneticResult["stoppedBy"];
  readonly fileName: string;
  readonly trainedAt: string;
  readonly trainCount: number;
  readonly testCount: number;
  readonly rmseBefore: ErrorPair;
  readonly rmseAfter: ErrorPair;
}

export interface ParamChange {
  readonly varId: string;
  readonly termId: string;
  readonly param: "bias" | "sigma";
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
      if (term.shape.kind !== "gaussian" || at?.shape.kind !== "gaussian") continue;
      for (const param of ["bias", "sigma"] as const) {
        const from = term.shape[param];
        const to = at.shape[param];
        if (Math.abs(to - from) > eps) params.push({ varId: v.id, termId: term.id, param, from, to });
      }
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
 * trained from: same variables, ranges and terms, and rules that exist with
 * the same antecedents. A stale record would otherwise put terms or rules on
 * screen that the code no longer defines.
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
        && w.terms.every((t, k) => {
          const s = t.shape;
          return t.id === v.terms[k].id && s.kind === "gaussian"
            && Number.isFinite(s.bias) && Number.isFinite(s.sigma) && s.sigma > 0;
        });
    });
    const outIds = new Set(expert.output.terms.map((t) => t.id));
    const rulesMatch = trained.rules.length > 0 && trained.rules.every((r) => {
      const e = expert.rules.find((x) => x.id === r.id);
      return e !== undefined
        && JSON.stringify(e.if) === JSON.stringify(r.if)
        && outIds.has(r.then[expert.output.id]);
    });
    return varsMatch && rulesMatch;
  } catch {
    return false;
  }
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
