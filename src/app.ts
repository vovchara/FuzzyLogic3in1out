import { mountAppShell } from "./components/appShell";
import { createEngine, type FuzzyEngine } from "./fuzzy/engine";
import { systems } from "./fuzzy/systems";
import type { FuzzySystem } from "./fuzzy/types";
import { getLang, initI18n, onLanguageChange } from "./i18n";
import { createStore, type Store } from "./state";

export async function startApp(root: HTMLElement): Promise<void> {
  await initI18n();

  const engines = new Map<string, FuzzyEngine>();
  for (const s of systems) engines.set(s.id, createEngine(s));

  const initialSystem = systems[0];
  const initialInputs = defaultInputs(initialSystem);
  const initialEvaluation = engines.get(initialSystem.id)!.evaluate(initialInputs);

  const store: Store = createStore({
    language: getLang(),
    activeSystemId: initialSystem.id,
    inputs: initialInputs,
    evaluation: initialEvaluation,
    formulasOpen: false,
  });

  function recompute(): void {
    const { activeSystemId, inputs } = store.getState();
    const engine = engines.get(activeSystemId);
    if (!engine) return;
    store.setState({ evaluation: engine.evaluate(inputs) });
  }

  onLanguageChange((lang) => store.setState({ language: lang }));

  mountAppShell(root, { store, systems, recompute });
}

function defaultInputs(system: FuzzySystem): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of system.inputs) out[v.id] = v.defaultValue;
  return out;
}
