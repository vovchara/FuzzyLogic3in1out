import type { FuzzySystem } from "../fuzzy/types";
import { splitHoldout } from "./dataset";
import { optimizeGenetic, rmse, type GenerationStat, type GeneticOptions, type Sample } from "./genetic";
import type { TrainingRecord } from "./record";

const TEST_SHARE = 0.2;
const SPLIT_SEED = 7;

/**
 * The training module's one entry point: a controller configuration and a
 * dataset in, an optimised configuration and its report out. The controller
 * is only ever read here; applying the result is the caller's business.
 */
export function trainController(
  system: FuzzySystem,
  samples: readonly Sample[],
  fileName: string,
  options: Partial<GeneticOptions> = {},
  onGeneration?: (stat: GenerationStat) => void,
): TrainingRecord {
  const { train, test } = splitHoldout(samples, TEST_SHARE, SPLIT_SEED);
  const result = optimizeGenetic(system, train, options, onGeneration);
  return {
    system: result.system,
    history: result.history,
    stoppedBy: result.stoppedBy,
    fileName,
    trainedAt: new Date().toISOString(),
    trainCount: train.length,
    testCount: test.length,
    rmseBefore: { train: rmse(system, train), test: rmse(system, test) },
    rmseAfter: { train: rmse(result.system, train), test: rmse(result.system, test) },
  };
}
