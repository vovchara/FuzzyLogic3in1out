import { createEngine, ruleStrength } from "../fuzzy/engine";
import type { FuzzySystem, FuzzyVariable, MembershipShape } from "../fuzzy/types";
import { gaussianNoise, mulberry32, type Sample } from "./genetic";

export type Cell = string | number | boolean | Date | null | undefined;

export const MIN_SAMPLES = 20;

export type DatasetError =
  | { readonly kind: "empty" }
  | { readonly kind: "missingColumns"; readonly columns: readonly string[] }
  | { readonly kind: "tooFew"; readonly valid: number; readonly min: number };

export interface ParsedDataset {
  readonly samples: readonly Sample[];
  /** Data rows dropped for a missing, non-numeric or out-of-range value. */
  readonly skipped: number;
  readonly error?: DatasetError;
}

function toNumber(cell: Cell): number {
  if (typeof cell === "number") return cell;
  if (typeof cell !== "string") return NaN;
  const text = cell.trim().replace(",", ".");
  return text === "" ? NaN : Number(text);
}

function columnsOf(system: FuzzySystem): FuzzyVariable[] {
  return [...system.inputs, system.output];
}

/**
 * Reads a table whose first row names the columns by variable id (RE, Dist,
 * LQ, RS for routing), in any order and any case. Extra columns are ignored.
 * Decimal commas are accepted: that is what a Ukrainian Excel writes.
 */
export function parseDataset(system: FuzzySystem, rows: readonly (readonly Cell[])[]): ParsedDataset {
  if (rows.length === 0) return { samples: [], skipped: 0, error: { kind: "empty" } };

  const header = rows[0].map((c) => String(c ?? "").trim().toLowerCase());
  const vars = columnsOf(system);
  const index = vars.map((v) => header.indexOf(v.id.toLowerCase()));
  const missing = vars.filter((_, i) => index[i] < 0).map((v) => v.id);
  if (missing.length > 0) {
    return { samples: [], skipped: 0, error: { kind: "missingColumns", columns: missing } };
  }

  const samples: Sample[] = [];
  let skipped = 0;
  for (const row of rows.slice(1)) {
    if (row.every((c) => c == null || String(c).trim() === "")) continue;
    const values = index.map((col) => toNumber(row[col]));
    const valid = values.every(
      (x, i) => Number.isFinite(x) && x >= vars[i].range[0] && x <= vars[i].range[1],
    );
    if (!valid) {
      skipped++;
      continue;
    }
    const inputs: Record<string, number> = {};
    system.inputs.forEach((v, i) => (inputs[v.id] = values[i]));
    samples.push({ inputs, target: values[values.length - 1] });
  }

  if (samples.length < MIN_SAMPLES) {
    return { samples, skipped, error: { kind: "tooFew", valid: samples.length, min: MIN_SAMPLES } };
  }
  return { samples, skipped };
}

/**
 * Splits off a share of the samples as a test set the GA never sees, so the
 * reported improvement is not only memorised training rows.
 */
export function splitHoldout(
  samples: readonly Sample[],
  testShare: number,
  seed: number,
): { train: Sample[]; test: Sample[] } {
  const rand = mulberry32(seed);
  const shuffled = samples.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const testSize = Math.round(samples.length * testShare);
  return { test: shuffled.slice(0, testSize), train: shuffled.slice(testSize) };
}

interface ShapePatch {
  readonly bias?: number;
  readonly sigma?: number;
  readonly points?: readonly number[];
  readonly at?: number;
}
type SystemPatch = Readonly<Record<string, Readonly<Record<string, ShapePatch>>>>;

interface TemplateSize {
  readonly rows: number;
  /** What the dialog promises, measured on a laptop and only ever shown as approximate. */
  readonly seconds: number;
}

interface Template {
  /**
   * The made-up "real network" behind the demo dataset: the expert controller
   * with a few MFs moved. Training on rows it produced should pull the expert
   * parameters visibly toward these values. Placeholder until the real
   * dataset arrives.
   */
  readonly patch: SystemPatch;
  /**
   * Sizes offered. GA training time grows about linearly with the row count,
   * so its sizes are picked for how long a run takes rather than for a round
   * number; an ANFIS run takes about a second whatever the size.
   */
  readonly sizes: readonly TemplateSize[];
  readonly noise: number;
  /**
   * ANFIS data as in Рис. 3.8: inputs drawn around the rules and in their
   * overlaps so that every row fires one — six rules leave half of the input
   * space uncovered, and a row there teaches nothing — and listed from the
   * highest priority down.
   */
  readonly anfis?: boolean;
  /** Variables that count something and are written as whole numbers. */
  readonly integers?: readonly string[];
}

const TEMPLATES: Readonly<Record<string, Template>> = {
  routing: {
    patch: {
      RE: { Medium: { bias: 0.6, sigma: 0.165 } },
      Dist: { Low: { sigma: 13.5 }, Medium: { bias: 45 } },
      LQ: { Medium: { bias: 0.7 } },
      RS: { Low: { bias: 34 }, High: { bias: 66 } },
    },
    sizes: [
      { rows: 40, seconds: 5 },
      { rows: 120, seconds: 30 },
      { rows: 500, seconds: 120 },
    ],
    noise: 1.5,
  },
  aggregation: {
    patch: {
      EE: { Small: { points: [0, 0, 0, 10] }, Medium: { points: [5, 17, 30] }, Large: { points: [23, 45, 45, 45] } },
      Dis: { Small: { points: [0, 0, 0, 55] }, Medium: { points: [30, 75, 130] }, Large: { points: [95, 214, 214, 214] } },
      Dat: { Small: { points: [0, 0, 0, 32] }, Medium: { points: [20, 70, 140] }, Large: { points: [100, 240, 240, 240] } },
      AP: {
        None: { at: 4 },
        VerySmall: { at: 24 },
        Small: { at: 37 },
        Medium: { at: 55 },
        Large: { at: 75 },
        VeryLarge: { at: 96 },
      },
    },
    // 50 rows split 40 / 10 exactly like Рис. 3.8 and 3.11.
    sizes: [
      { rows: 50, seconds: 1 },
      { rows: 150, seconds: 1 },
      { rows: 500, seconds: 2 },
    ],
    noise: 0.8,
    anfis: true,
    integers: ["Dat"],
  },
};
const TEMPLATE_SEED = 20260930;
/** Share of a term's support, around its peak, that rule-core rows are drawn from. */
const CORE_SHARE = 0.5;
/**
 * Share of ANFIS rows drawn where two rules fire together. Under the
 * weighted average a row with one firing rule reads exactly that rule's
 * singleton, whatever the MFs, so only rows in an overlap tell the network
 * where the break points belong.
 */
const OVERLAP_SHARE = 0.5;
/** A rule counts towards an overlap once it carries this share of the output. */
const OVERLAP_WEIGHT = 0.15;

function patched(system: FuzzySystem, patch: SystemPatch): FuzzySystem {
  const apply = (v: FuzzyVariable): FuzzyVariable => ({
    ...v,
    terms: v.terms.map((term) => {
      const p = patch[v.id]?.[term.id];
      const shape = term.shape;
      if (!p) return term;
      if (shape.kind === "gaussian") return { ...term, shape: { ...shape, bias: p.bias ?? shape.bias, sigma: p.sigma ?? shape.sigma } };
      if (shape.kind === "singleton") return { ...term, shape: { ...shape, at: p.at ?? shape.at } };
      if (!p.points || p.points.length !== shape.points.length) return term;
      return { ...term, shape: { ...shape, points: p.points } as MembershipShape };
    }),
  });
  return { ...system, inputs: system.inputs.map(apply), output: apply(system.output) };
}

/** Whether a synthetic test dataset can be generated for this controller. */
export function hasTemplate(system: FuzzySystem): boolean {
  return system.id in TEMPLATES;
}

export function templateSizes(system: FuzzySystem): readonly TemplateSize[] {
  return TEMPLATES[system.id]?.sizes ?? [];
}

function decimalsFor(v: FuzzyVariable, template: Template): number {
  if (template.integers?.includes(v.id)) return 0;
  return v.range[1] - v.range[0] <= 1 ? 2 : 1;
}

/** Where a term is non-zero and where it peaks; a draw from it lands near the peak. */
function supportOf(shape: MembershipShape): { lo: number; peak: number; hi: number } {
  switch (shape.kind) {
    case "triangle":
      return { lo: shape.points[0], peak: shape.points[1], hi: shape.points[2] };
    case "trapezoid":
      return { lo: shape.points[0], peak: (shape.points[1] + shape.points[2]) / 2, hi: shape.points[3] };
    case "gaussian":
      return { lo: shape.bias - 2 * shape.sigma, peak: shape.bias, hi: shape.bias + 2 * shape.sigma };
    case "singleton":
      return { lo: shape.at, peak: shape.at, hi: shape.at };
  }
}

/** A draw from the triangular distribution on [lo, hi] with its mode at `peak`. */
function triangular(rand: () => number, lo: number, peak: number, hi: number): number {
  if (hi <= lo) return lo;
  const u = rand();
  const f = (peak - lo) / (hi - lo);
  return u < f
    ? lo + Math.sqrt(u * (hi - lo) * (peak - lo))
    : hi - Math.sqrt((1 - u) * (hi - lo) * (hi - peak));
}

/** Header plus rows of the demo dataset. Deterministic, so every download matches. */
export function templateRows(expert: FuzzySystem, count?: number): (string | number)[][] {
  const template = TEMPLATES[expert.id];
  if (!template) throw new Error(`No template dataset for ${expert.id}`);
  const rows = count ?? template.sizes[0].rows;
  const truth = patched(expert, template.patch);
  const engine = createEngine(truth);
  const start = template.anfis ? createEngine(expert) : null;
  const rand = mulberry32(TEMPLATE_SEED);
  const vars = columnsOf(expert);
  const fix = (x: number, v: FuzzyVariable) => Number(x.toFixed(decimalsFor(v, template)));
  const [min, max] = expert.output.range;

  const draw = (): Record<string, number> => {
    const inputs: Record<string, number> = {};
    if (!template.anfis) {
      for (const v of expert.inputs) inputs[v.id] = fix(v.range[0] + rand() * (v.range[1] - v.range[0]), v);
      return inputs;
    }
    if (rand() < OVERLAP_SHARE) {
      const overlap = drawOverlap();
      if (overlap) return overlap;
    }
    const rule = truth.rules[Math.floor(rand() * truth.rules.length)];
    for (const v of truth.inputs) {
      const term = v.terms.find((x) => x.id === rule.if[v.id])!;
      // Draws from the inner part of the support: near a foot the expert and
      // the moved terms barely overlap, and such rows teach where the foot
      // is rather than what the rule concludes — the fit gets markedly worse.
      const { lo, peak, hi } = supportOf(term.shape);
      const near = (edge: number) => peak + CORE_SHARE * (edge - peak);
      const x = triangular(rand, Math.max(v.range[0], near(lo)), peak, Math.min(v.range[1], near(hi)));
      inputs[v.id] = fix(x, v);
    }
    return inputs;
  };

  // Uniform draws kept only where at least two rules of the moved controller
  // share the output; overlaps are thin with six rules, hence the retries.
  const drawOverlap = (): Record<string, number> | null => {
    for (let attempt = 0; attempt < 2000; attempt++) {
      const inputs: Record<string, number> = {};
      for (const v of expert.inputs) inputs[v.id] = fix(v.range[0] + rand() * (v.range[1] - v.range[0]), v);
      const { memberships } = engine.evaluate(inputs);
      const strengths = truth.rules.map((r) => ruleStrength(r, memberships, truth.conjunction));
      const total = strengths.reduce((a, b) => a + b, 0);
      if (total > 0 && strengths.filter((w) => w / total >= OVERLAP_WEIGHT).length >= 2) return inputs;
    }
    return null;
  };

  const body: number[][] = [];
  while (body.length < rows) {
    const inputs = draw();
    // A row no expert rule covers gives the network nothing to learn from.
    if (start && (!engine.evaluate(inputs).fired || !start.evaluate(inputs).fired)) continue;
    const target = engine.crisp(inputs) + gaussianNoise(rand) * template.noise;
    const clamped = Math.min(max, Math.max(min, target));
    body.push([...expert.inputs.map((v) => inputs[v.id]), fix(clamped, expert.output)]);
  }
  if (template.anfis) body.sort((a, b) => b[b.length - 1] - a[a.length - 1]);
  return [vars.map((v) => v.id), ...body];
}
