import type { FuzzyEvaluation } from "./fuzzy/types";
import type { Language } from "./i18n";

export interface AppState {
  language: Language;
  activeSystemId: string;
  inputs: Record<string, number>;
  evaluation: FuzzyEvaluation | null;
  formulasOpen: boolean;
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
