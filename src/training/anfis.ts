import type { FuzzySystem, FuzzyVariable, MembershipShape } from "../fuzzy/types";
import { rmse, type Sample } from "./genetic";

/**
 * ANFIS training of a zero-order Sugeno controller, after section 3.5 of the
 * dissertation (chapter 3, aggregation).
 *
 * Each epoch is one pass of the hybrid method (3.5.1.3): with the MFs fixed,
 * the singletons are solved by least squares (3.20–3.21); with the singletons
 * fixed, the break points of the triangular MFs take one gradient step
 * (3.22). Rules are never added or removed — ANFIS tunes parameters only.
 *
 * The network runs the controller's own inference, so training changes
 * parameters and never the way an answer is computed. For aggregation that
 * is the textbook ANFIS: product AND (3.4) and the weighted average of the
 * singletons (3.17). Min AND and the plain weighted sum are trained too: the
 * output is linear in the singletons either way, and min passes the gradient
 * to the weakest condition of each rule.
 *
 * A step is never allowed to leave a training row outside every rule. With
 * six rules over 27 term combinations a moved foot easily opens a dead zone,
 * and a row there drops out of the error instead of counting against it.
 */

export interface AnfisOptions {
  /** Hard cap on epochs; 1000 is what Рис. 3.9 ran. */
  readonly epochs: number;
  /** Stop once the training RMSE reaches this; 0, as in Рис. 3.9, never stops early. */
  readonly errorGoal: number;
  /**
   * Stop once the test error has not set a new low for this many epochs —
   * the third criterion of 3.5.1.3, the sign of overfitting. The held-out
   * test rows play MATLAB's checking data; they never move a parameter.
   */
  readonly patience: number;
  /**
   * Length of one gradient step, as a share of each variable's domain. The
   * step is adapted as MATLAB's anfis does it, starting from its defaults.
   */
  readonly initialStep: number;
  readonly stepIncrease: number;
  readonly stepDecrease: number;
  /** Longest a step may grow, as a share of the domain. */
  readonly maxStep: number;
  /** Closest two break points of one MF may come, as a share of the domain. */
  readonly minGapShare: number;
}

export const DEFAULT_ANFIS_OPTIONS: AnfisOptions = {
  epochs: 1000,
  errorGoal: 0,
  patience: 50,
  initialStep: 0.01,
  stepIncrease: 1.1,
  stepDecrease: 0.9,
  maxStep: 0.05,
  minGapShare: 0.01,
};

/** Errors after one epoch, as RMSE in output units. */
export interface EpochStat {
  readonly epoch: number;
  readonly train: number;
  readonly test: number;
}

export interface AnfisResult {
  readonly system: FuzzySystem;
  readonly history: readonly EpochStat[];
  readonly stoppedBy: "epochs" | "goal" | "checking";
  /** The epoch whose parameters were kept; later ones only confirmed the stop. */
  readonly bestEpoch: number;
}

/** One input MF as the network sees it: its break points and which of them may move. */
interface Node {
  readonly kind: "triangle" | "trapezoid";
  readonly points: number[];
  /**
   * A point on the domain edge, or one shared with its neighbour, is the
   * shoulder of a half-open term — µ_S(EE) = (8 − EE)/8 keeps its peak at 0 —
   * so only the points strictly inside the domain and apart are trained.
   */
  readonly free: readonly boolean[];
  /** Whether point i keeps a gap from point i − 1. */
  readonly apart: readonly boolean[];
}

interface Network {
  readonly vars: readonly FuzzyVariable[];
  /** nodes[v][k]: term k of input v. */
  readonly nodes: Node[][];
  /** For every rule, the term index it takes from every input. */
  readonly antecedents: readonly (readonly number[])[];
  /** For every rule, the index of its output singleton. */
  readonly consequent: readonly number[];
  readonly singletons: number[];
  /** Weighted average (3.17) rather than the plain weighted sum. */
  readonly normalise: boolean;
  /** Product AND (3.4) rather than min. */
  readonly product: boolean;
}

function buildNetwork(system: FuzzySystem): Network {
  const vars = system.inputs;
  const nodes = vars.map((v) =>
    v.terms.map((term): Node => {
      const shape = term.shape;
      if (shape.kind !== "triangle" && shape.kind !== "trapezoid") {
        throw new Error(`ANFIS needs triangular MFs: ${v.id}.${term.id}`);
      }
      const points = [...shape.points];
      const [min, max] = v.range;
      const apart = points.map((p, i) => i > 0 && p > points[i - 1]);
      const free = points.map((p, i) => p > min && p < max && (i === 0 || apart[i]) && (i === points.length - 1 || apart[i + 1]));
      return { kind: shape.kind, points, free, apart };
    }),
  );

  const outIds = system.output.terms.map((t) => t.id);
  const singletons = system.output.terms.map((t) => {
    if (t.shape.kind !== "singleton") throw new Error(`ANFIS needs singleton outputs: ${t.id}`);
    return t.shape.at;
  });
  const antecedents = system.rules.map((r) =>
    vars.map((v) => {
      const k = v.terms.findIndex((t) => t.id === r.if[v.id]);
      if (k < 0) throw new Error(`Rule ${r.id} must name a term of every input`);
      return k;
    }),
  );
  const consequent = system.rules.map((r) => outIds.indexOf(r.then[system.output.id]));
  return { vars, nodes, antecedents, consequent, singletons, normalise: system.defuzz === "weighted-average", product: system.conjunction === "product" };
}

/** Membership and its derivative by every break point; mirrors evaluateShape. */
function membership(node: Node, x: number, grad: number[]): number {
  grad.fill(0);
  const p = node.points;
  if (node.kind === "trapezoid") {
    const [a, b, c, d] = p;
    if (x < a || x > d) return 0;
    if (x >= b && x <= c) return 1;
    if (x < b) {
      grad[0] = (x - b) / ((b - a) * (b - a));
      grad[1] = -(x - a) / ((b - a) * (b - a));
      return (x - a) / (b - a);
    }
    grad[2] = (d - x) / ((d - c) * (d - c));
    grad[3] = (x - c) / ((d - c) * (d - c));
    return (d - x) / (d - c);
  }
  const [a, b, c] = p;
  if (x < a || x > c) return 0;
  if (a === b) {
    grad[0] = (c - x) / ((c - a) * (c - a));
    grad[2] = (x - a) / ((c - a) * (c - a));
    return (c - x) / (c - a);
  }
  if (b === c) {
    grad[0] = (x - b) / ((b - a) * (b - a));
    grad[1] = -(x - a) / ((b - a) * (b - a));
    return (x - a) / (b - a);
  }
  if (x <= b) {
    grad[0] = (x - b) / ((b - a) * (b - a));
    grad[1] = -(x - a) / ((b - a) * (b - a));
    return (x - a) / (b - a);
  }
  grad[1] = (c - x) / ((c - b) * (c - b));
  grad[2] = (x - b) / ((c - b) * (c - b));
  return (c - x) / (c - b);
}

/** Layer outputs for one sample. */
interface Forward {
  readonly mu: number[][];
  readonly dmu: number[][][];
  /** Per rule, the input whose membership is its strength: the min the gradient flows through. */
  readonly weakest: number[];
  /**
   * Weight of every rule's singleton in the output — its strength, divided by
   * the total under normalisation — or null when every rule is silent.
   */
  readonly weights: number[] | null;
  readonly total: number;
}

function forward(net: Network, inputs: Readonly<Record<string, number>>): Forward {
  const mu = net.nodes.map(() => [] as number[]);
  const dmu = net.nodes.map(() => [] as number[][]);
  net.vars.forEach((v, i) => {
    const x = inputs[v.id];
    net.nodes[i].forEach((node, k) => {
      const grad = new Array<number>(node.points.length);
      mu[i][k] = membership(node, x, grad);
      dmu[i][k] = grad;
    });
  });
  const weakest = net.antecedents.map((terms) => {
    let at = 0;
    terms.forEach((k, i) => {
      if (mu[i][k] < mu[at][terms[at]]) at = i;
    });
    return at;
  });
  const strengths = net.antecedents.map((terms, j) =>
    net.product ? terms.reduce((w, k, i) => w * mu[i][k], 1) : mu[weakest[j]][terms[weakest[j]]],
  );
  const total = strengths.reduce((s, w) => s + w, 0);
  const weights = total > 0 ? strengths.map((w) => (net.normalise ? w / total : w)) : null;
  return { mu, dmu, weakest, total, weights };
}

/** Layer 5: the weighted singletons, or the engine's fallback when nothing fires. */
function outputOf(net: Network, f: Forward, range: readonly [number, number]): number {
  if (!f.weights) return (range[0] + range[1]) / 2;
  return f.weights.reduce((y, w, j) => y + w * net.singletons[net.consequent[j]], 0);
}

/**
 * Least-squares singletons for fixed MFs (3.20–3.21). Rules sharing an output
 * term share its singleton, so a column of the design matrix sums the
 * weights of those rules. A tiny ridge towards the current
 * values stands in for the pseudo-inverse when a term never fires on the data.
 */
function solveSingletons(net: Network, passes: readonly Forward[], samples: readonly Sample[], range: readonly [number, number]): void {
  const k = net.singletons.length;
  const ata = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const aty = new Array<number>(k).fill(0);
  passes.forEach((f, p) => {
    if (!f.weights) return;
    const row = new Array<number>(k).fill(0);
    f.weights.forEach((w, j) => (row[net.consequent[j]] += w));
    for (let r = 0; r < k; r++) {
      if (row[r] === 0) continue;
      aty[r] += row[r] * samples[p].target;
      for (let c = 0; c < k; c++) ata[r][c] += row[r] * row[c];
    }
  });
  const ridge = 1e-9 * Math.max(1, passes.length);
  for (let r = 0; r < k; r++) {
    ata[r][r] += ridge;
    aty[r] += ridge * net.singletons[r];
  }
  const solved = solveLinear(ata, aty);
  solved.forEach((x, r) => {
    // A singleton outside the output domain would fall off every chart.
    net.singletons[r] = Math.min(range[1], Math.max(range[0], x));
  });
}

/** Gaussian elimination with partial pivoting; the systems here are 6×6. */
function solveLinear(m: number[][], rhs: number[]): number[] {
  const n = rhs.length;
  const a = m.map((row, i) => [...row, rhs[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    for (let r = col + 1; r < n; r++) {
      const f = a[r][col] / a[col][col];
      for (let c = col; c <= n; c++) a[r][c] -= f * a[col][c];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = a[r][n];
    for (let c = r + 1; c < n; c++) s -= a[r][c] * x[c];
    x[r] = s / a[r][r];
  }
  return x;
}

/**
 * Gradient of E = ½ Σ (y − t)² by every break point, through the chain of
 * 3.5.3.2: ∂E/∂y · ∂y/∂w_j · ∂w_j/∂µ · ∂µ/∂θ, accumulated over all rules that
 * use the term and over all samples. Scaled to each variable's domain, so one
 * step moves EE and Dis by the same share of their ranges.
 */
function gradient(net: Network, passes: readonly Forward[], samples: readonly Sample[], outputs: readonly number[]): number[][][] {
  const grad = net.nodes.map((terms) => terms.map((node) => new Array<number>(node.points.length).fill(0)));
  passes.forEach((f, p) => {
    if (!f.weights) return;
    const e = outputs[p] - samples[p].target;
    net.antecedents.forEach((terms, j) => {
      const c = net.singletons[net.consequent[j]];
      // ∂y/∂w_j: the singleton itself for a plain sum, its pull away from y under normalisation.
      const dy = e * (net.normalise ? (c - outputs[p]) / f.total : c);
      if (dy === 0) return;
      if (!net.product) {
        // ∂w_j/∂µ is 1 for the weakest condition of the rule and 0 for the rest.
        const i = f.weakest[j];
        const d = f.dmu[i][terms[i]];
        for (let q = 0; q < d.length; q++) grad[i][terms[i]][q] += dy * d[q];
        return;
      }
      terms.forEach((k, i) => {
        // ∂w_j/∂µ_i: the product of the rule's other memberships.
        let others = 1;
        terms.forEach((kk, ii) => {
          if (ii !== i) others *= f.mu[ii][kk];
        });
        if (others === 0) return;
        const d = f.dmu[i][k];
        for (let q = 0; q < d.length; q++) grad[i][k][q] += dy * others * d[q];
      });
    });
  });
  net.vars.forEach((v, i) => {
    const span = v.range[1] - v.range[0];
    for (const g of grad[i]) for (let q = 0; q < g.length; q++) g[q] *= span;
  });
  return grad;
}

/**
 * Keeps a moved MF a valid shape: points in order, apart, inside the domain,
 * and on the grid the result is saved with, so the coverage check judges the
 * very MFs the controller will run on.
 */
function project(node: Node, range: readonly [number, number], gap: number): void {
  const p = node.points;
  for (let q = 0; q < p.length; q++) {
    if (!node.free[q]) continue;
    p[q] = Math.min(range[1] - gap, Math.max(range[0] + gap, p[q]));
  }
  for (let q = 1; q < p.length; q++) {
    if (node.free[q] && node.apart[q]) p[q] = Math.max(p[q], p[q - 1] + gap);
  }
  for (let q = p.length - 2; q >= 0; q--) {
    if (node.free[q] && node.apart[q + 1]) p[q] = Math.min(p[q], p[q + 1] - gap);
  }
  // The sweeps can push a point of a squeezed MF past the domain; clamping
  // last may then close a gap, which beats an MF outside its variable.
  for (let q = 0; q < p.length; q++) {
    if (node.free[q]) p[q] = round(Math.min(range[1], Math.max(range[0], p[q])), range);
  }
}

/** One gradient step of fixed length (3.22), the direction normalised as in Jang's ANFIS. */
function step(net: Network, grad: number[][][], length: number, opts: AnfisOptions): void {
  let norm = 0;
  net.nodes.forEach((terms, i) =>
    terms.forEach((node, k) => node.free.forEach((free, q) => {
      if (free) norm += grad[i][k][q] ** 2;
    })),
  );
  norm = Math.sqrt(norm);
  if (norm === 0) return;
  net.vars.forEach((v, i) => {
    const span = v.range[1] - v.range[0];
    net.nodes[i].forEach((node, k) => {
      node.points.forEach((_, q) => {
        if (node.free[q]) node.points[q] -= (length * grad[i][k][q] / norm) * span;
      });
      project(node, v.range, opts.minGapShare * span);
    });
  });
}

function snapshot(net: Network): { points: number[][][]; singletons: number[] } {
  return {
    points: net.nodes.map((terms) => terms.map((node) => [...node.points])),
    singletons: [...net.singletons],
  };
}

function restorePoints(net: Network, points: readonly (readonly (readonly number[])[])[]): void {
  net.nodes.forEach((terms, i) => terms.forEach((node, k) => node.points.splice(0, node.points.length, ...points[i][k])));
}

function round(value: number, range: readonly [number, number]): number {
  const unit = (range[1] - range[0]) / 10000;
  return Number((Math.round(value / unit) * unit).toFixed(6));
}

function decode(system: FuzzySystem, state: ReturnType<typeof snapshot>): FuzzySystem {
  const inputs = system.inputs.map((v, i): FuzzyVariable => ({
    ...v,
    terms: v.terms.map((term, k) => {
      const points = state.points[i][k].map((x) => round(x, v.range));
      const shape = (term.shape.kind === "triangle"
        ? { kind: "triangle", points: points as [number, number, number] }
        : { kind: "trapezoid", points: points as [number, number, number, number] }) as MembershipShape;
      return { ...term, shape };
    }),
  }));
  const range = system.output.range;
  const output: FuzzyVariable = {
    ...system.output,
    terms: system.output.terms.map((term, k) => ({
      ...term,
      shape: { kind: "singleton", at: round(state.singletons[k], range) },
    })),
  };
  return { ...system, inputs, output };
}

function rmseOf(outputs: readonly number[], samples: readonly Sample[]): number {
  if (samples.length === 0) return NaN;
  const sse = outputs.reduce((s, y, p) => s + (y - samples[p].target) ** 2, 0);
  return Math.sqrt(sse / samples.length);
}

/**
 * Trains the controller on `train`, reporting the error on `test` after every
 * epoch the way anfisedit plots training and testing data side by side. Epoch
 * 0 is the expert controller as handed in. Like MATLAB's
 * anfis, the result is the epoch with the lowest training error, epoch 0
 * included.
 */
export function trainAnfis(
  system: FuzzySystem,
  train: readonly Sample[],
  test: readonly Sample[],
  options: Partial<AnfisOptions> = {},
  onEpoch?: (stat: EpochStat) => void,
): AnfisResult {
  const opts = { ...DEFAULT_ANFIS_OPTIONS, ...options };
  const net = buildNetwork(system);
  const range = system.output.range;
  const history: EpochStat[] = [];
  const record = (stat: EpochStat) => {
    history.push(stat);
    onEpoch?.(stat);
  };

  record({ epoch: 0, train: rmse(system, train), test: rmse(system, test) });

  // The expert itself is a candidate, so the result is never worse than it.
  let best = { error: history[0].train, epoch: 0, state: snapshot(net) };
  let bestTest = { error: Infinity, epoch: 0 };
  let length = opts.initialStep;
  let stoppedBy: AnfisResult["stoppedBy"] = "epochs";
  const covered = train.filter((s) => forward(net, s.inputs).total > 0);
  const coversAll = () => covered.every((s) => forward(net, s.inputs).total > 0);

  for (let epoch = 1; epoch <= opts.epochs; epoch++) {
    const passes = train.map((s) => forward(net, s.inputs));
    solveSingletons(net, passes, train, range);
    const outputs = passes.map((f) => outputOf(net, f, range));
    const error = rmseOf(outputs, train);
    const testError = rmseOf(test.map((s) => outputOf(net, forward(net, s.inputs), range)), test);
    record({ epoch, train: error, test: testError });

    if (error < best.error) best = { error, epoch, state: snapshot(net) };
    if (error <= opts.errorGoal) {
      stoppedBy = "goal";
      break;
    }
    if (testError < bestTest.error) bestTest = { error: testError, epoch };
    else if (epoch - bestTest.epoch >= opts.patience) {
      stoppedBy = "checking";
      break;
    }
    length = adaptStep(history, length, opts);
    const before = snapshot(net);
    step(net, gradient(net, passes, train, outputs), length, opts);
    // Undo a step that would lose a training row. The next epoch then sees
    // the same error, and adaptStep shortens the step for the retry.
    if (!coversAll()) restorePoints(net, before.points);
  }

  return { system: decode(system, best.state), history, stoppedBy, bestEpoch: best.epoch };
}

/**
 * MATLAB's step-size rule, made safe for long runs: grow the step by 10%
 * after four reductions of the error in a row, up to a cap; shrink it by 10%
 * whenever the error did not go down. MATLAB shrinks only after the error
 * went up and down twice; with that alone a step that overshot onto a
 * clamped MF stalls the error at one value and never shrinks again.
 */
function adaptStep(history: readonly EpochStat[], length: number, opts: AnfisOptions): number {
  // Epoch 0 is the untrained network, not a step of this run.
  const errors = history.slice(1).map((h) => h.train);
  const n = errors.length;
  if (n < 2) return length;
  const down = (i: number) => errors[i] < errors[i - 1];
  if (!down(n - 1)) return length * opts.stepDecrease;
  if (n >= 5 && down(n - 2) && down(n - 3) && down(n - 4)) return Math.min(opts.maxStep, length * opts.stepIncrease);
  return length;
}
