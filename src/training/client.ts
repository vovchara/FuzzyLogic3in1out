import type { FuzzySystem } from "../fuzzy/types";
import type { GenerationStat, Sample } from "./genetic";
import type { TrainingRecord } from "./record";
import type { TrainMessage, TrainRequest } from "./worker";

export interface TrainingRun {
  readonly done: Promise<TrainingRecord>;
  /** Stops the run; `done` then rejects with an AbortError. */
  cancel(): void;
}

export function trainInWorker(
  system: FuzzySystem,
  samples: readonly Sample[],
  fileName: string,
  onGeneration: (stat: GenerationStat) => void,
): TrainingRun {
  const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  let rejectRun: (err: Error) => void = () => {};

  const done = new Promise<TrainingRecord>((resolve, reject) => {
    rejectRun = reject;
    worker.onmessage = (e: MessageEvent<TrainMessage>) => {
      const m = e.data;
      if (m.type === "generation") return onGeneration(m.stat);
      worker.terminate();
      if (m.type === "done") resolve(m.record);
      else reject(new Error(m.message));
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message));
    };
  });

  const request: TrainRequest = { system, samples, fileName };
  worker.postMessage(request);

  return {
    done,
    cancel() {
      worker.terminate();
      rejectRun(new DOMException("Training cancelled", "AbortError"));
    },
  };
}
