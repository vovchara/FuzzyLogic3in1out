/// <reference lib="webworker" />
import type { FuzzySystem } from "../fuzzy/types";
import type { Sample } from "./genetic";
import type { ProgressPoint, TrainingRecord } from "./record";
import { trainController } from "./train";

export interface TrainRequest {
  readonly system: FuzzySystem;
  readonly samples: readonly Sample[];
  readonly fileName: string;
}

export type TrainMessage =
  | { readonly type: "progress"; readonly point: ProgressPoint }
  | { readonly type: "done"; readonly record: TrainingRecord }
  | { readonly type: "error"; readonly message: string };

// Training takes seconds of pure CPU; off the main thread the page keeps
// scrolling and can show every generation or epoch as it lands.
const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (e: MessageEvent<TrainRequest>) => {
  const post = (m: TrainMessage) => scope.postMessage(m);
  try {
    const { system, samples, fileName } = e.data;
    const record = trainController(system, samples, fileName, {}, (point) => {
      post({ type: "progress", point });
    });
    post({ type: "done", record });
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
