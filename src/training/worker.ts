/// <reference lib="webworker" />
import type { FuzzySystem } from "../fuzzy/types";
import type { GenerationStat, Sample } from "./genetic";
import type { TrainingRecord } from "./record";
import { trainController } from "./train";

export interface TrainRequest {
  readonly system: FuzzySystem;
  readonly samples: readonly Sample[];
  readonly fileName: string;
}

export type TrainMessage =
  | { readonly type: "generation"; readonly stat: GenerationStat }
  | { readonly type: "done"; readonly record: TrainingRecord }
  | { readonly type: "error"; readonly message: string };

// Training takes seconds of pure CPU; off the main thread the page keeps
// scrolling and can show every generation as it lands.
const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (e: MessageEvent<TrainRequest>) => {
  const post = (m: TrainMessage) => scope.postMessage(m);
  try {
    const { system, samples, fileName } = e.data;
    const record = trainController(system, samples, fileName, {}, (stat) => {
      post({ type: "generation", stat });
    });
    post({ type: "done", record });
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
