import type { FuzzyEvaluation } from "./fuzzy/types";
import type { Language } from "./i18n";

/** What the main area shows: one controller's workbench, or the field simulation. */
export type AppView = "workbench" | "simulation";

export interface AppState {
  language: Language;
  view: AppView;
  activeSystemId: string;
  inputs: Record<string, number>;
  evaluation: FuzzyEvaluation | null;
  formulasOpen: boolean;
  /** Bumped whenever a controller's parameters change, so views rebuild from it. */
  systemRevision: number;
}

type Listener = (state: AppState) => void;

export interface Store {
  getState(): AppState;
  setState(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)): void;
  subscribe(listener: Listener): () => void;
}

export function createStore(initial: AppState): Store {
  let state: AppState = initial;
  const listeners = new Set<Listener>();

  return {
    getState: () => state,
    setState: (patch) => {
      const update = typeof patch === "function" ? patch(state) : patch;
      state = { ...state, ...update };
      for (const l of listeners) l(state);
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
