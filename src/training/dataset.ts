import { createEngine } from "../fuzzy/engine";
import type { FuzzySystem, FuzzyVariable } from "../fuzzy/types";
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

type ShapePatch = Readonly<Record<string, Readonly<Record<string, { bias?: number; sigma?: number }>>>>;

/**
 * The made-up "real network" behind the demo dataset: the expert controller
 * with a few centres and widths moved. Training on rows it produced should
 * pull the expert parameters visibly toward these values. Placeholder until
 * the real dataset arrives.
 */
const TEMPLATE_TARGETS: Readonly<Record<string, ShapePatch>> = {
  routing: {
    RE: { Medium: { bias: 0.6, sigma: 0.165 } },
    Dist: { Low: { sigma: 13.5 }, Medium: { bias: 45 } },
    LQ: { Medium: { bias: 0.7 } },
    RS: { Low: { bias: 34 }, High: { bias: 66 } },
  },
};

/**
 * Sizes offered for the demo dataset. Training time grows about linearly with
 * the row count, so each size is picked for how long a run takes rather than
 * for a round number; `seconds` is what the dialog promises, measured on a
 * laptop and only ever shown as approximate.
 */
export const TEMPLATE_SIZES = [
  { rows: 40, seconds: 5 },
  { rows: 120, seconds: 30 },
  { rows: 500, seconds: 120 },
] as const;
const TEMPLATE_NOISE = 1.5;
const TEMPLATE_SEED = 20260930;

function patched(system: FuzzySystem, patch: ShapePatch): FuzzySystem {
  const apply = (v: FuzzyVariable): FuzzyVariable => ({
    ...v,
    terms: v.terms.map((term) => {
      const p = patch[v.id]?.[term.id];
      if (!p || term.shape.kind !== "gaussian") return term;
      return { ...term, shape: { ...term.shape, ...p } };
    }),
  });
  return { ...system, inputs: system.inputs.map(apply), output: apply(system.output) };
}

/** Whether a synthetic test dataset can be generated for this controller. */
export function hasTemplate(system: FuzzySystem): boolean {
  return system.id in TEMPLATE_TARGETS;
}

function decimalsFor(v: FuzzyVariable): number {
  return v.range[1] - v.range[0] <= 1 ? 2 : 1;
}

/** Header plus rows of the demo dataset. Deterministic, so every download matches. */
export function templateRows(expert: FuzzySystem, count: number = TEMPLATE_SIZES[0].rows): (string | number)[][] {
  const patch = TEMPLATE_TARGETS[expert.id];
  if (!patch) throw new Error(`No template dataset for ${expert.id}`);
  const engine = createEngine(patched(expert, patch));
  const rand = mulberry32(TEMPLATE_SEED);
  const vars = columnsOf(expert);
  const fix = (x: number, v: FuzzyVariable) => Number(x.toFixed(decimalsFor(v)));

  const rows: (string | number)[][] = [vars.map((v) => v.id)];
  for (let i = 0; i < count; i++) {
    const inputs: Record<string, number> = {};
    for (const v of expert.inputs) {
      inputs[v.id] = fix(v.range[0] + rand() * (v.range[1] - v.range[0]), v);
    }
    const [min, max] = expert.output.range;
    const target = engine.crisp(inputs) + gaussianNoise(rand) * TEMPLATE_NOISE;
    const clamped = Math.min(max, Math.max(min, target));
    rows.push([...expert.inputs.map((v) => inputs[v.id]), fix(clamped, expert.output)]);
  }
  return rows;
}
