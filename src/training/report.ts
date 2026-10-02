import type { FuzzySystem } from "../fuzzy/types";
import { diffSystems, type TrainingRecord } from "./record";

export interface ReportSheet {
  readonly name: string;
  readonly rows: (string | number)[][];
}

const r4 = (x: number) => Number(x.toFixed(4));

/** Translation hook: the module stays free of i18n, the caller passes its own. */
export type Translate = (key: string, options?: Record<string, unknown>) => string;

/**
 * What training did, as plain tables an engineer can open in Excel: the run
 * summary, every MF parameter before and after, the rule base before and
 * after, and the objective per generation to chart convergence from. Written
 * in the interface language; variable ids (RE, Dist…) stay as they are, the
 * same symbols the charts use.
 */
export function reportSheets(expert: FuzzySystem, record: TrainingRecord, t: Translate): ReportSheet[] {
  const k = (key: string) => t(`training.report.${key}`);
  const diff = diffSystems(expert, record.system);
  const trainedVars = [...record.system.inputs, record.system.output];
  const out = expert.output;
  const outTermName = (id: string) => {
    const term = out.terms.find((x) => x.id === id);
    return term ? t(term.nameKey) : id;
  };

  const params: (string | number)[][] = [
    [k("variable"), k("term"), k("parameter"), k("before"), k("after"), k("delta")],
  ];
  for (const v of [...expert.inputs, expert.output]) {
    const tv = trainedVars.find((x) => x.id === v.id);
    for (const term of v.terms) {
      const after = tv?.terms.find((x) => x.id === term.id)?.shape;
      if (term.shape.kind !== "gaussian" || after?.kind !== "gaussian") continue;
      for (const p of ["bias", "sigma"] as const) {
        params.push([
          v.id,
          t(term.nameKey),
          k(p),
          r4(term.shape[p]),
          r4(after[p]),
          r4(after[p] - term.shape[p]),
        ]);
      }
    }
  }

  const rules: (string | number)[][] = [
    [k("rule"), ...expert.inputs.map((v) => v.id), `${out.id} ${k("before")}`, `${out.id} ${k("after")}`],
  ];
  expert.rules.forEach((rule, i) => {
    const after = record.system.rules.find((r) => r.id === rule.id)?.then[out.id];
    rules.push([
      i + 1,
      ...expert.inputs.map((v) => {
        const term = v.terms.find((x) => x.id === rule.if[v.id]);
        return term ? t(term.nameKey) : "";
      }),
      outTermName(rule.then[out.id]),
      after ? outTermName(after) : t("training.ruleOff"),
    ]);
  });

  const summary: (string | number)[][] = [
    [k("controller"), t(expert.nameKey)],
    [k("dataset"), record.fileName],
    [k("trainedAt"), record.trainedAt.replace("T", " ").slice(0, 19)],
    [k("trainRows"), record.trainCount],
    [k("testRows"), record.testCount],
    [k("generations"), record.history.length - 1],
    [k("stoppedBy"), t(`training.stoppedBy.${record.stoppedBy}`)],
    [k("rmseTrainBefore"), r4(record.rmseBefore.train)],
    [k("rmseTrainAfter"), r4(record.rmseAfter.train)],
    [k("rmseTestBefore"), r4(record.rmseBefore.test)],
    [k("rmseTestAfter"), r4(record.rmseAfter.test)],
    [k("changedParams"), diff.params.length],
    [k("changedRules"), diff.rules.length],
  ];

  // RMSE is what the card's chart shows; J is what the GA minimised, kept for
  // anyone matching the run against the objective in section 4.3.3.3.
  const generations: (string | number)[][] = [
    [k("generation"), t("training.legendBest"), t("training.legendMean"), k("objectiveBest")],
  ];
  const span = out.range[1] - out.range[0];
  for (const g of record.history) {
    generations.push([g.generation, r4(g.bestRmse ?? g.best * span), r4(g.meanRmse ?? g.mean * span), r4(g.best)]);
  }

  return [
    { name: k("sheetSummary"), rows: summary },
    { name: k("sheetParameters"), rows: params },
    { name: k("sheetRules"), rows: rules },
    { name: k("sheetGenerations"), rows: generations },
  ];
}
