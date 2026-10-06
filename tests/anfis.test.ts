import { describe, expect, test } from "vitest";
import { createEngine, FIRE_EPS, fireThreshold, ruleStrength } from "../src/fuzzy/engine";
import { routingSystem } from "../src/fuzzy/systems/routing";
import { aggregationSystem } from "../src/fuzzy/systems/aggregation";
import { trainAnfis } from "../src/training/anfis";
import { canTrain, trainingMethod } from "../src/training/config";
import { hasTemplate, parseDataset, splitHoldout, templateRows, templateSizes } from "../src/training/dataset";
import { rmse } from "../src/training/genetic";
import { diffSystems, progressOf, rebase, sameStructure } from "../src/training/record";
import { reportSheets } from "../src/training/report";
import { trainController } from "../src/training/train";

// The full defaults: a run on 150 rows takes a fraction of a second.
const DEFAULTS = {};

const template = parseDataset(aggregationSystem, templateRows(aggregationSystem, 150));

describe("ANFIS dataset", () => {
  test("the default size splits 40 / 10 like Рис. 3.8 and 3.11", () => {
    const parsed = parseDataset(aggregationSystem, templateRows(aggregationSystem));
    expect(parsed.samples).toHaveLength(50);
    const { train, test: holdout } = splitHoldout(parsed.samples, 0.2, 7);
    expect([train.length, holdout.length]).toEqual([40, 10]);
  });

  test("is deterministic, parses cleanly and counts packets in whole numbers", () => {
    expect(templateRows(aggregationSystem, 150)).toEqual(templateRows(aggregationSystem, 150));
    expect(template.error).toBeUndefined();
    expect(template.skipped).toBe(0);
    expect(templateRows(aggregationSystem)[0]).toEqual(["EE", "Dis", "Dat", "AP"]);
    for (const s of template.samples) expect(Number.isInteger(s.inputs.Dat)).toBe(true);
  });

  test("every row fires an expert rule and rows run from high priority down", () => {
    const engine = createEngine(aggregationSystem);
    for (const s of template.samples) expect(engine.evaluate(s.inputs).fired).toBe(true);
    const targets = template.samples.map((s) => s.target);
    expect([...targets].sort((a, b) => b - a)).toEqual(targets);
  });

  test("a good share of rows sits where two rules share the output", () => {
    const engine = createEngine(aggregationSystem);
    const overlaps = template.samples.filter((s) => {
      const { memberships } = engine.evaluate(s.inputs);
      const w = aggregationSystem.rules.map((r) => ruleStrength(r, memberships, aggregationSystem.conjunction));
      const total = w.reduce((a, b) => a + b, 0);
      return w.filter((x) => x / total >= 0.1).length >= 2;
    });
    // Rows are picked by the overlaps of the moved MFs, which the expert MFs
    // only partly share; before the overlap rows it was 2 rows in 500.
    expect(overlaps.length).toBeGreaterThan(template.samples.length * 0.05);
  });

  test("every offered size yields that many valid rows", () => {
    for (const { rows } of templateSizes(aggregationSystem)) {
      expect(parseDataset(aggregationSystem, templateRows(aggregationSystem, rows)).samples).toHaveLength(rows);
    }
  });

  test("the card is switched on with the ANFIS method", () => {
    expect(trainingMethod(aggregationSystem)).toBe("anfis");
    expect(canTrain(aggregationSystem)).toBe(true);
    expect(hasTemplate(aggregationSystem)).toBe(true);
  });
});

describe("fired rules", () => {
  test("any non-zero product counts as fired; gaussian systems keep FIRE_EPS", () => {
    expect(fireThreshold(aggregationSystem)).toBe(0);
    expect(fireThreshold(routingSystem)).toBe(FIRE_EPS);
    // A strength far below FIRE_EPS that still decides the whole output.
    const ev = createEngine(aggregationSystem).evaluate({ EE: 0, Dis: 26, Dat: 128 });
    const strengths = aggregationSystem.rules.map((r) => ruleStrength(r, ev.memberships, "product"));
    expect(Math.max(...strengths)).toBeLessThan(FIRE_EPS);
    expect(ev.fired).toBe(true);
    expect(strengths.filter((w) => w > fireThreshold(aggregationSystem)).length).toBeGreaterThan(0);
  });
});

describe("ANFIS training", () => {
  const { train, test: holdout } = splitHoldout(template.samples, 0.2, 7);
  const snapshot = JSON.stringify(aggregationSystem);
  const result = trainAnfis(aggregationSystem, train, holdout, DEFAULTS);

  test("leaves the controller it was given untouched", () => {
    expect(JSON.stringify(aggregationSystem)).toBe(snapshot);
  });

  test("fits the data far better than the expert parameters", () => {
    const before = rmse(aggregationSystem, train);
    expect(result.history[0].train).toBeCloseTo(before, 6);
    expect(rmse(result.system, train)).toBeLessThan(before * 0.3);
    expect(rmse(result.system, holdout)).toBeLessThan(rmse(aggregationSystem, holdout) * 0.3);
  });

  test("returns the epoch with the lowest training error and says which", () => {
    const best = Math.min(...result.history.map((h) => h.train));
    expect(result.history[result.bestEpoch].train).toBe(best);
    expect(rmse(result.system, train)).toBeCloseTo(best, 2);
  });

  test("moves the MFs towards those that produced the data", () => {
    const point = (varId: string, termId: string, q: number) => {
      const shape = result.system.inputs.find((v) => v.id === varId)!.terms.find((t) => t.id === termId)!.shape;
      if (shape.kind !== "triangle" && shape.kind !== "trapezoid") throw new Error("shape changed kind");
      return shape.points[q];
    };
    // Expert → template: EE.Small foot 8 → 10, Dis.Large foot 80 → 95, Dat.Medium peak 60 → 70.
    expect(Math.abs(point("EE", "Small", 3) - 10)).toBeLessThan(Math.abs(8 - 10) / 2);
    expect(Math.abs(point("Dis", "Large", 0) - 95)).toBeLessThan(Math.abs(80 - 95) / 2);
    expect(Math.abs(point("Dat", "Medium", 1) - 70)).toBeLessThan(Math.abs(60 - 70));
  });

  test("stops once the test error has not set a new low for `patience` epochs", () => {
    expect(result.stoppedBy).toBe("checking");
    const tests = result.history.slice(1).map((h) => h.test);
    const lowAt = tests.indexOf(Math.min(...tests)) + 1;
    expect(result.history.length - 1 - lowAt).toBe(50);
  });

  test("runs every epoch without the checking stop, stops early on a reachable goal", () => {
    const all = trainAnfis(aggregationSystem, train, holdout, { epochs: 120, patience: Infinity });
    expect(all.stoppedBy).toBe("epochs");
    expect(all.history).toHaveLength(121);
    const goal = trainAnfis(aggregationSystem, train, holdout, { errorGoal: 3, patience: Infinity });
    expect(goal.stoppedBy).toBe("goal");
    expect(goal.history[goal.history.length - 1].train).toBeLessThanOrEqual(3);
  });

  test("keeps the rules, moves only inner break points and keeps them in order", () => {
    expect(result.system.rules).toEqual(aggregationSystem.rules);
    expect(result.system.defuzz).toBe(aggregationSystem.defuzz);
    expect(result.system.conjunction).toBe(aggregationSystem.conjunction);
    result.system.inputs.forEach((v, i) => {
      const expert = aggregationSystem.inputs[i];
      v.terms.forEach((term, k) => {
        const before = expert.terms[k].shape;
        const shape = term.shape;
        if (shape.kind === "singleton" || shape.kind === "gaussian") throw new Error("shape changed kind");
        if (before.kind !== shape.kind) throw new Error("shape changed kind");
        const points = [...shape.points];
        expect([...points].sort((a, b) => a - b)).toEqual(points);
        before.points.forEach((x, q) => {
          if (x === v.range[0] || x === v.range[1]) expect(points[q]).toBe(x);
        });
      });
    });
    for (const term of result.system.output.terms) {
      if (term.shape.kind !== "singleton") throw new Error("output must stay singleton");
      expect(term.shape.at).toBeGreaterThanOrEqual(0);
      expect(term.shape.at).toBeLessThanOrEqual(100);
    }
    expect(sameStructure(aggregationSystem, result.system)).toBe(true);
  });

  test("never leaves a training row outside every rule", () => {
    const engine = createEngine(result.system);
    for (const s of train) expect(engine.evaluate(s.inputs).fired).toBe(true);
  });

  test("a record trained under another inference is rejected", () => {
    expect(sameStructure(aggregationSystem, { ...result.system, defuzz: "weighted-sum" })).toBe(false);
    expect(sameStructure(aggregationSystem, { ...result.system, conjunction: undefined })).toBe(false);
  });

  test("is reproducible", () => {
    expect(trainAnfis(aggregationSystem, train, holdout, DEFAULTS).system).toEqual(result.system);
  });
});

describe("ANFIS training record", () => {
  const record = trainController(aggregationSystem, template.samples, "demo.xlsx");

  test("is an ANFIS record whose 'before' is the expert controller and the start of its chart", () => {
    expect(record.method).toBe("anfis");
    expect(record.trainCount + record.testCount).toBe(150);
    const points = progressOf(record, 100);
    expect(points[0].primary).toBeCloseTo(record.rmseBefore.train, 6);
    expect(points[0].secondary).toBeCloseTo(record.rmseBefore.test, 6);
    expect(record.rmseAfter.test).toBeLessThan(record.rmseBefore.test);
  });

  test("applying it keeps the controller's inference, so its answers move only as far as the data asks", () => {
    const applied = rebase(aggregationSystem, record.system);
    expect(applied.defuzz).toBe("weighted-average");
    expect(applied.conjunction).toBe("product");
    // Fig. 3.6: only rule 1 fires, so the answer is its singleton, which moves only a little.
    const before = createEngine(aggregationSystem).evaluate({ EE: 3, Dis: 19, Dat: 7 }).output;
    const after = createEngine(applied).evaluate({ EE: 3, Dis: 19, Dat: 7 }).output;
    expect(before).toBeCloseTo(100, 6);
    expect(Math.abs(after - before)).toBeLessThan(10);
    expect(applied.output.nameKey).toBe(aggregationSystem.output.nameKey);
    expect(rmse(applied, template.samples)).toBeCloseTo(rmse(record.system, template.samples), 9);
  });

  test("lists moved break points and singletons as changes", () => {
    const { params, rules } = diffSystems(aggregationSystem, record.system);
    expect(rules).toEqual([]);
    expect(params.some((p) => p.varId === "AP" && p.param === "at")).toBe(true);
    expect(params.some((p) => p.varId === "EE" && ["a", "b", "c", "d"].includes(p.param))).toBe(true);
    // Edge points of the shoulders are never trained.
    const edges = (id: string) => aggregationSystem.inputs.find((v) => v.id === id)?.range ?? ([] as number[]);
    expect(params.some((p) => edges(p.varId).includes(p.from))).toBe(false);
  });

  test("report has an epochs sheet with training and test error", () => {
    const sheets = reportSheets(aggregationSystem, record, (key) => key);
    expect(sheets.map((s) => s.name)).toEqual([
      "training.report.sheetSummary",
      "training.report.sheetParameters",
      "training.report.sheetRules",
      "training.report.sheetEpochs",
    ]);
    // 3 inputs × (4 + 3 + 4 points) + 6 singletons + header
    expect(sheets[1].rows).toHaveLength(40);
    expect(sheets[3].rows[0]).toEqual(["training.report.epoch", "training.anfis.legendBest", "training.anfis.legendMean"]);
    expect(sheets[3].rows).toHaveLength(record.history.length + 1);
    const summary = Object.fromEntries(sheets[0].rows.map(([k, v]) => [k, v]));
    expect(summary["training.report.method"]).toBe("training.anfis.method");
  });
});
