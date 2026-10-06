import { describe, expect, test } from "vitest";
import readXlsx from "read-excel-file/universal";
import writeXlsxFile from "write-excel-file/universal";
import { routingSystem } from "../src/fuzzy/systems/routing";
import { commCtrlSystem } from "../src/fuzzy/systems/commCtrl";
import { hasTemplate, MIN_SAMPLES, parseDataset, TEMPLATE_SIZES, templateRows, type Cell } from "../src/training/dataset";
import { canTrain } from "../src/training/config";
import { optimizeGenetic, rmse, stallChange, type GenerationStat } from "../src/training/genetic";
import { diffSystems, rebase, sameStructure } from "../src/training/record";
import { reportSheets } from "../src/training/report";
import { trainController } from "../src/training/train";
import { parseCsv } from "../src/utils/excel";

// Small enough to run in a second or two; the defaults are for the browser.
const QUICK = { populationSize: 16, generations: 25 };

const template = parseDataset(routingSystem, templateRows(routingSystem, 150));

describe("dataset", () => {
  test("template is deterministic and parses cleanly", () => {
    expect(templateRows(routingSystem, 150)).toEqual(templateRows(routingSystem, 150));
    expect(template.error).toBeUndefined();
    expect(template.skipped).toBe(0);
    expect(template.samples).toHaveLength(150);
    expect(templateRows(routingSystem)[0]).toEqual(["RE", "Dist", "LQ", "RS"]);
  });

  test("every offered size yields that many valid rows", () => {
    for (const { rows } of TEMPLATE_SIZES) {
      const parsed = parseDataset(routingSystem, templateRows(routingSystem, rows));
      expect(parsed.samples).toHaveLength(rows);
      expect(parsed.skipped).toBe(0);
    }
  });

  test("header is matched by id in any order and case; bad rows are skipped", () => {
    const rows: Cell[][] = [["rs", "LQ", "re", "dist", "note"]];
    for (let i = 0; i < MIN_SAMPLES; i++) rows.push([50, "0,5", 0.5, 40, "x"]);
    rows.push([50, 2, 0.5, 40]); // LQ out of range
    rows.push([50, "abc", 0.5, 40]);
    const parsed = parseDataset(routingSystem, rows);
    expect(parsed.error).toBeUndefined();
    expect(parsed.skipped).toBe(2);
    expect(parsed.samples[0]).toEqual({ inputs: { RE: 0.5, Dist: 40, LQ: 0.5 }, target: 50 });
  });

  test("reports missing columns and too few rows", () => {
    expect(parseDataset(routingSystem, [["RE", "Dist"]]).error)
      .toEqual({ kind: "missingColumns", columns: ["LQ", "RS"] });
    expect(parseDataset(routingSystem, [["RE", "Dist", "LQ", "RS"], [0.5, 40, 0.5, 50]]).error)
      .toEqual({ kind: "tooFew", valid: 1, min: MIN_SAMPLES });
    expect(parseDataset(routingSystem, []).error).toEqual({ kind: "empty" });
  });

  test("CSV in both the comma and the semicolon dialect", () => {
    expect(parseCsv("RE,Dist\n0.5,40\n")).toEqual([["RE", "Dist"], ["0.5", "40"]]);
    expect(parseCsv("﻿RE;Dist\r\n0,5;40\r\n")).toEqual([["RE", "Dist"], ["0,5", "40"]]);
  });

  test("the template survives an .xlsx round trip", async () => {
    const rows = templateRows(routingSystem, 150);
    const blob = await writeXlsxFile(rows.map((r) => r.map((value) => ({ value })))).toBlob();
    const [sheet] = await readXlsx(await blob.arrayBuffer());
    expect(parseDataset(routingSystem, sheet.data as Cell[][]).samples).toEqual(template.samples);
  });

  test("the optimisation card is switched on per controller", () => {
    expect(canTrain(routingSystem)).toBe(true);
    expect(canTrain(commCtrlSystem)).toBe(false);
    expect(hasTemplate(routingSystem)).toBe(true);
  });
});

describe("genetic optimisation", () => {
  const snapshot = JSON.stringify(routingSystem);
  const result = optimizeGenetic(routingSystem, template.samples, QUICK);

  test("leaves the controller it was given untouched", () => {
    expect(JSON.stringify(routingSystem)).toBe(snapshot);
  });

  test("fits the template better than the expert parameters", () => {
    const before = rmse(routingSystem, template.samples);
    const after = rmse(result.system, template.samples);
    expect(after).toBeLessThan(before * 0.8);
  });

  test("best objective never gets worse across generations (elitism)", () => {
    for (let i = 1; i < result.history.length; i++) {
      expect(result.history[i].best).toBeLessThanOrEqual(result.history[i - 1].best);
    }
  });

  test("keeps terms ordered and inside their domains", () => {
    for (const v of [...result.system.inputs, result.system.output]) {
      const centres = v.terms.map((t) => (t.shape.kind === "gaussian" ? t.shape.bias : NaN));
      expect([...centres].sort((a, b) => a - b)).toEqual(centres);
      for (const c of centres) {
        expect(c).toBeGreaterThanOrEqual(v.range[0]);
        expect(c).toBeLessThanOrEqual(v.range[1]);
      }
    }
    expect(sameStructure(routingSystem, result.system)).toBe(true);
  });

  test("stops on the MATLAB stall test once the curve is flat", () => {
    const flat = optimizeGenetic(routingSystem, template.samples, {
      ...QUICK,
      generations: 300,
      stallGenerations: 3,
      functionTolerance: 1,
    });
    expect(flat.stoppedBy).toBe("tolerance");
    expect(flat.history).toHaveLength(4);
  });

  test("stall measure is the average relative change of best over the window", () => {
    const h = (bests: number[]): GenerationStat[] => bests.map((best, generation) => ({ generation, best, mean: best, bestRmse: best, meanRmse: best }));
    expect(stallChange(h([0.5, 0.4, 0.3]), 3)).toBeNull();
    expect(stallChange(h([0.5, 0.4, 0.3, 0.2]), 3)).toBeCloseTo(0.1);
    // Relative to |f| once it exceeds 1.
    expect(stallChange(h([40, 20]), 1)).toBeCloseTo(1);
  });

  test("is reproducible for a fixed seed", () => {
    expect(optimizeGenetic(routingSystem, template.samples, QUICK).system).toEqual(result.system);
  });
});

describe("training record", () => {
  const record = trainController(routingSystem, template.samples, "demo.xlsx", QUICK);

  test("reports errors on a held-out test set the GA never saw", () => {
    expect(record.trainCount + record.testCount).toBe(150);
    expect(record.testCount).toBe(30);
    expect(record.rmseAfter.train).toBeLessThan(record.rmseBefore.train);
    expect(record.rmseAfter.test).toBeLessThan(record.rmseBefore.test);
  });

  test("rebase takes only shapes and consequents from the trained controller", () => {
    const stale = { ...record.system, output: { ...record.system.output, nameKey: "old.name" } };
    const applied = rebase(routingSystem, stale);
    expect(applied.output.nameKey).toBe(routingSystem.output.nameKey);
    expect(applied.output.terms.map((t) => t.shape)).toEqual(record.system.output.terms.map((t) => t.shape));
    expect(diffSystems(routingSystem, applied)).toEqual(diffSystems(routingSystem, record.system));
  });

  test("a stored record whose structure no longer matches is rejected", () => {
    const renamed = { ...record.system, inputs: record.system.inputs.slice(1) };
    expect(sameStructure(routingSystem, renamed)).toBe(false);
    expect(sameStructure(routingSystem, { ...record.system, rules: [] })).toBe(false);
  });

  test("report has summary, parameters, rules and generations sheets", () => {
    // Identity translation: the keys themselves show where each label comes from.
    const sheets = reportSheets(routingSystem, record, (key) => key);
    expect(sheets.map((s) => s.name)).toEqual([
      "training.report.sheetSummary",
      "training.report.sheetParameters",
      "training.report.sheetRules",
      "training.report.sheetGenerations",
    ]);
    expect(sheets[1].rows[1].slice(0, 3)).toEqual(["RE", "terms.low", "training.report.bias"]);
    // 13 terms × (bias, sigma) + header
    expect(sheets[1].rows).toHaveLength(27);
    expect(sheets[2].rows).toHaveLength(routingSystem.rules.length + 1);
    expect(sheets[3].rows).toHaveLength(record.history.length + 1);
  });
});
