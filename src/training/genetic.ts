import { createEngine } from "../fuzzy/engine";
import type { FuzzyRule, FuzzySystem, FuzzyVariable } from "../fuzzy/types";

/**
 * Genetic optimisation of a Mamdani controller, after section 4.3.3 of the
 * dissertation (chapter 4, routing).
 *
 * The chromosome is hybrid: a real-valued part holding every gaussian MF and
 * an integer part holding the consequent of every rule. MF centres are coded
 * incrementally — the first centre, then positive gaps to the next one — so
 * crossover and mutation can never swap the order of a variable's terms. A
 * rule gene is the 1-based index of its output term, 0 switching the rule off:
 * that is the structural half of the optimisation.
 */

export interface Sample {
  readonly inputs: Readonly<Record<string, number>>;
  readonly target: number;
}

export interface GeneticOptions {
  readonly populationSize: number;
  /** Hard cap on generations; normally the stall test stops the run first. */
  readonly generations: number;
  readonly eliteCount: number;
  readonly tournamentSize: number;
  readonly crossoverRate: number;
  /** Per-gene mutation probability. Defaults to 1/L, L being the chromosome length. */
  readonly mutationRate?: number;
  /**
   * Stall test, as MATLAB's ga does it: stop once the average relative change
   * of the best objective over the last `stallGenerations` generations is at
   * most `functionTolerance`.
   */
  readonly stallGenerations: number;
  readonly functionTolerance: number;
  /** Weight of the rule-count criterion in the objective. */
  readonly rulePenalty: number;
  /** How far a centre or gap may move from the expert value, as a share of the domain. */
  readonly shiftShare: number;
  /** Widths may shrink or grow by this factor of the expert sigma. */
  readonly sigmaFactor: number;
  readonly seed: number;
}

export const DEFAULT_GENETIC_OPTIONS: GeneticOptions = {
  populationSize: 40,
  generations: 300,
  eliteCount: 2,
  tournamentSize: 3,
  crossoverRate: 0.8,
  stallGenerations: 50,
  functionTolerance: 1e-5,
  rulePenalty: 0.001,
  shiftShare: 0.15,
  sigmaFactor: 0.5,
  seed: 1,
};

/** Objective values of one generation; lower is better. */
export interface GenerationStat {
  readonly generation: number;
  readonly best: number;
  readonly mean: number;
}

export interface GeneticResult {
  readonly system: FuzzySystem;
  readonly history: readonly GenerationStat[];
  readonly stoppedBy: "generations" | "tolerance";
}

interface Individual {
  readonly mf: number[];
  readonly rules: number[];
  objective: number;
}

interface Layout {
  readonly vars: readonly FuzzyVariable[];
  readonly lo: readonly number[];
  readonly hi: readonly number[];
  readonly expert: Individual;
  readonly outputTermCount: number;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gaussianNoise(rand: () => number): number {
  const u = Math.max(rand(), Number.EPSILON);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

function gaussianTerms(v: FuzzyVariable): { bias: number; sigma: number }[] {
  return v.terms.map((term) => {
    if (term.shape.kind !== "gaussian") {
      throw new Error(`Genetic optimisation needs gaussian terms: ${v.id}.${term.id}`);
    }
    return { bias: term.shape.bias, sigma: term.shape.sigma };
  });
}

function buildLayout(system: FuzzySystem, opts: GeneticOptions): Layout {
  const vars = [...system.inputs, system.output];
  const lo: number[] = [];
  const hi: number[] = [];
  const mf: number[] = [];

  for (const v of vars) {
    const [min, max] = v.range;
    const shift = opts.shiftShare * (max - min);
    const minGap = 0.02 * (max - min);
    const terms = gaussianTerms(v);

    terms.forEach(({ bias }, k) => {
      if (k === 0) {
        mf.push(bias);
        lo.push(Math.max(min, bias - shift));
        hi.push(Math.min(max, bias + shift));
        return;
      }
      const gap = bias - terms[k - 1].bias;
      if (gap <= 0) throw new Error(`Terms of ${v.id} must be ordered by centre`);
      mf.push(gap);
      lo.push(Math.max(minGap, gap - shift));
      hi.push(gap + shift);
    });
    for (const { sigma } of terms) {
      mf.push(sigma);
      lo.push(sigma * (1 - opts.sigmaFactor));
      hi.push(sigma * (1 + opts.sigmaFactor));
    }
  }

  const outIds = system.output.terms.map((x) => x.id);
  const rules = system.rules.map((r) => outIds.indexOf(r.then[system.output.id]) + 1);
  return {
    vars,
    lo,
    hi,
    expert: { mf, rules, objective: Infinity },
    outputTermCount: outIds.length,
  };
}

function round(value: number, range: readonly [number, number]): number {
  const step = (range[1] - range[0]) / 10000;
  return Number((Math.round(value / step) * step).toFixed(6));
}

/** Rebuilds a controller from a chromosome. Switched-off rules are dropped. */
function decode(system: FuzzySystem, layout: Layout, ind: Individual, tidy = false): FuzzySystem {
  let g = 0;
  const decoded = layout.vars.map((v): FuzzyVariable => {
    const n = v.terms.length;
    const centres: number[] = [];
    for (let k = 0; k < n; k++) {
      const c = k === 0 ? ind.mf[g] : centres[k - 1] + ind.mf[g + k];
      centres.push(Math.min(v.range[1], Math.max(v.range[0], c)));
    }
    const sigmas = ind.mf.slice(g + n, g + 2 * n);
    g += 2 * n;
    const fix = (x: number) => (tidy ? round(x, v.range) : x);
    return {
      ...v,
      terms: v.terms.map((term, k) => ({
        ...term,
        shape: { kind: "gaussian", bias: fix(centres[k]), sigma: fix(sigmas[k]) },
      })),
    };
  });

  const output = decoded[decoded.length - 1];
  const rules: FuzzyRule[] = [];
  system.rules.forEach((rule, i) => {
    const gene = ind.rules[i];
    if (gene === 0) return;
    rules.push({ ...rule, then: { [output.id]: output.terms[gene - 1].id } });
  });

  return { ...system, inputs: decoded.slice(0, -1), output, rules };
}

/** Root-mean-square error of a controller over a sample set, in output units. */
export function rmse(system: FuzzySystem, samples: readonly Sample[]): number {
  if (samples.length === 0) return NaN;
  const engine = createEngine(system);
  let sse = 0;
  for (const s of samples) {
    const d = engine.crisp(s.inputs) - s.target;
    sse += d * d;
  }
  return Math.sqrt(sse / samples.length);
}

/**
 * Two criteria folded into one: RMSE normalised by the output domain, plus a
 * penalty per active rule. Minimised; the GA's fitness is 1 / (1 + objective).
 */
function objective(system: FuzzySystem, layout: Layout, ind: Individual, samples: readonly Sample[], opts: GeneticOptions): number {
  const active = ind.rules.filter((x) => x > 0).length;
  if (active === 0) return Infinity;
  const [min, max] = system.output.range;
  const error = rmse(decode(system, layout, ind), samples) / (max - min);
  return error + opts.rulePenalty * (active / ind.rules.length);
}

function randomIndividual(layout: Layout, rand: () => number): Individual {
  return {
    mf: layout.lo.map((lo, i) => lo + rand() * (layout.hi[i] - lo)),
    rules: layout.expert.rules.slice(),
    objective: Infinity,
  };
}

function tournament(pop: readonly Individual[], size: number, rand: () => number): Individual {
  let best = pop[Math.floor(rand() * pop.length)];
  for (let i = 1; i < size; i++) {
    const c = pop[Math.floor(rand() * pop.length)];
    if (c.objective < best.objective) best = c;
  }
  return best;
}

/** Arithmetic crossover on the MF part, two-point crossover on the rule part. */
function crossover(a: Individual, b: Individual, rand: () => number): [Individual, Individual] {
  const alpha = rand();
  const mf1 = a.mf.map((x, i) => alpha * x + (1 - alpha) * b.mf[i]);
  const mf2 = a.mf.map((x, i) => (1 - alpha) * x + alpha * b.mf[i]);

  const n = a.rules.length;
  let p = Math.floor(rand() * (n + 1));
  let q = Math.floor(rand() * (n + 1));
  if (p > q) [p, q] = [q, p];
  const r1 = a.rules.map((x, i) => (i >= p && i < q ? b.rules[i] : x));
  const r2 = b.rules.map((x, i) => (i >= p && i < q ? a.rules[i] : x));

  return [
    { mf: mf1, rules: r1, objective: Infinity },
    { mf: mf2, rules: r2, objective: Infinity },
  ];
}

/**
 * Gaussian mutation of MF genes with a spread that narrows as generations
 * pass, for fine local tuning at the end; uniform mutation of rule genes to
 * any other value of the alphabet, including 0 (switch off) and back.
 */
function mutate(ind: Individual, layout: Layout, rate: number, progress: number, rand: () => number): void {
  const spread = Math.max(0.01, 0.1 * (1 - progress));
  for (let i = 0; i < ind.mf.length; i++) {
    if (rand() >= rate) continue;
    const width = layout.hi[i] - layout.lo[i];
    const x = ind.mf[i] + gaussianNoise(rand) * spread * width;
    ind.mf[i] = Math.min(layout.hi[i], Math.max(layout.lo[i], x));
  }
  for (let i = 0; i < ind.rules.length; i++) {
    if (rand() >= rate) continue;
    const other = Math.floor(rand() * layout.outputTermCount);
    ind.rules[i] = other >= ind.rules[i] ? other + 1 : other;
  }
}

/**
 * MATLAB's ga stall measure: the relative change of the best objective,
 * averaged over the last `window` generations. Relative to max(1, |f|), so an
 * objective near zero does not blow the ratio up. Null until `window`
 * generations have passed.
 */
export function stallChange(history: readonly GenerationStat[], window: number): number | null {
  const n = history.length - 1;
  if (n < window) return null;
  const now = history[n].best;
  return Math.abs(history[n - window].best - now) / Math.max(1, Math.abs(now)) / window;
}

export function optimizeGenetic(
  system: FuzzySystem,
  samples: readonly Sample[],
  options: Partial<GeneticOptions> = {},
  onGeneration?: (stat: GenerationStat) => void,
): GeneticResult {
  const opts = { ...DEFAULT_GENETIC_OPTIONS, ...options };
  const layout = buildLayout(system, opts);
  const rand = mulberry32(opts.seed);
  const rate = opts.mutationRate ?? 1 / (layout.lo.length + layout.expert.rules.length);

  const score = (ind: Individual) => {
    if (ind.objective === Infinity) ind.objective = objective(system, layout, ind, samples, opts);
  };

  // The expert controller joins the initial population, so the result is
  // never worse than what the expert wrote on the training data.
  const expert: Individual = { mf: layout.expert.mf.slice(), rules: layout.expert.rules.slice(), objective: Infinity };
  let pop: Individual[] = [expert];
  while (pop.length < opts.populationSize) pop.push(randomIndividual(layout, rand));
  pop.forEach(score);

  const history: GenerationStat[] = [];
  const record = (generation: number) => {
    pop.sort((a, b) => a.objective - b.objective);
    const finite = pop.filter((x) => Number.isFinite(x.objective));
    const mean = finite.reduce((sum, x) => sum + x.objective, 0) / Math.max(1, finite.length);
    const stat = { generation, best: pop[0].objective, mean };
    history.push(stat);
    onGeneration?.(stat);
  };

  record(0);
  let stoppedBy: GeneticResult["stoppedBy"] = "generations";

  for (let gen = 1; gen <= opts.generations; gen++) {
    const next: Individual[] = pop.slice(0, opts.eliteCount);
    while (next.length < opts.populationSize) {
      const a = tournament(pop, opts.tournamentSize, rand);
      const b = tournament(pop, opts.tournamentSize, rand);
      const children: Individual[] = rand() < opts.crossoverRate
        ? crossover(a, b, rand)
        : [
            { mf: a.mf.slice(), rules: a.rules.slice(), objective: Infinity },
            { mf: b.mf.slice(), rules: b.rules.slice(), objective: Infinity },
          ];
      for (const child of children) {
        if (next.length >= opts.populationSize) break;
        mutate(child, layout, rate, gen / opts.generations, rand);
        next.push(child);
      }
    }
    pop = next;
    pop.forEach(score);
    record(gen);

    const change = stallChange(history, opts.stallGenerations);
    if (change !== null && change <= opts.functionTolerance) {
      stoppedBy = "tolerance";
      break;
    }
  }

  return { system: decode(system, layout, pop[0], true), history, stoppedBy };
}
