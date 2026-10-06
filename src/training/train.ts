import type { FuzzySystem } from "../fuzzy/types";
import { trainAnfis, type AnfisOptions } from "./anfis";
import { trainingMethod } from "./config";
import { splitHoldout } from "./dataset";
import { optimizeGenetic, rmse, type GeneticOptions, type Sample } from "./genetic";
import { epochPoint, generationPoint, type ProgressPoint, type TrainingRecord } from "./record";

const TEST_SHARE = 0.2;
const SPLIT_SEED = 7;

export type TrainOptions = Partial<GeneticOptions> & Partial<AnfisOptions>;

/**
 * The training module's one entry point: a controller configuration and a
 * dataset in, a trained configuration and its report out. Which method runs
 * is decided by the module's config, not by the controller. The controller is
 * only ever read here; applying the result is the caller's business.
 */
export function trainController(
  system: FuzzySystem,
  samples: readonly Sample[],
  fileName: string,
  options: TrainOptions = {},
  onProgress?: (point: ProgressPoint) => void,
): TrainingRecord {
  const method = trainingMethod(system);
  if (!method) throw new Error(`No training method for ${system.id}`);
  const { train, test } = splitHoldout(samples, TEST_SHARE, SPLIT_SEED);
  const base = {
    fileName,
    trainedAt: new Date().toISOString(),
    trainCount: train.length,
    testCount: test.length,
    rmseBefore: { train: rmse(system, train), test: rmse(system, test) },
  };

  if (method === "anfis") {
    const result = trainAnfis(system, train, test, options, (e) => onProgress?.(epochPoint(e)));
    return {
      ...base,
      method,
      system: result.system,
      history: result.history,
      stoppedBy: result.stoppedBy,
      bestEpoch: result.bestEpoch,
      rmseAfter: { train: rmse(result.system, train), test: rmse(result.system, test) },
    };
  }

  const span = system.output.range[1] - system.output.range[0];
  const result = optimizeGenetic(system, train, options, (g) => onProgress?.(generationPoint(g, span)));
  return {
    ...base,
    method,
    system: result.system,
    history: result.history,
    stoppedBy: result.stoppedBy,
    rmseAfter: { train: rmse(result.system, train), test: rmse(result.system, test) },
  };
}
