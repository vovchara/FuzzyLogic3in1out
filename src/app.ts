import { mountAppShell } from "./components/shell/appShell";
import { createEngine, type FuzzyEngine } from "./fuzzy/engine";
import { systems } from "./fuzzy/systems";
import type { FuzzySystem } from "./fuzzy/types";
import { getLang, initI18n, onLanguageChange } from "./i18n";
import { createStore, type Store } from "./state";
import { readJson, readString, writeJson, writeString } from "./utils/storage";

const INPUTS_KEY = "fuzzy.inputs";
const ACTIVE_SYSTEM_KEY = "fuzzy.activeSystem";

type SavedInputs = Record<string, Record<string, number>>;

export async function startApp(root: HTMLElement): Promise<void> {
  await initI18n();

  const engines = new Map<string, FuzzyEngine>();
  for (const s of systems) engines.set(s.id, createEngine(s));

  const saved = readJson<SavedInputs>(INPUTS_KEY, {});

  function inputsFor(system: FuzzySystem): Record<string, number> {
    const stored = saved[system.id] ?? {};
    const out: Record<string, number> = {};
    for (const v of system.inputs) {
      const value = stored[v.id];
      // A stored value is dropped when it no longer fits the variable: ranges
      // and terms may have changed since the value was written.
      out[v.id] =
        typeof value === "number" && Number.isFinite(value)
          && value >= v.range[0] && value <= v.range[1]
          ? value
          : v.defaultValue;
    }
    return out;
  }

  function remember(systemId: string, inputs: Readonly<Record<string, number>>): void {
    saved[systemId] = { ...inputs };
    writeJson(INPUTS_KEY, saved);
  }

  // An id from storage is only honoured while that system still exists.
  const storedId = readString(ACTIVE_SYSTEM_KEY);
  const initialSystem = systems.find((x) => x.id === storedId) ?? systems[0];
  const initialInputs = inputsFor(initialSystem);
  const initialEvaluation = engines.get(initialSystem.id)!.evaluate(initialInputs);

  const store: Store = createStore({
    language: getLang(),
    activeSystemId: initialSystem.id,
    inputs: initialInputs,
    evaluation: initialEvaluation,
    formulasOpen: false,
  });

  function updateInputs(patch: Readonly<Record<string, number>>): void {
    store.setState((s) => {
      const newInputs = { ...s.inputs, ...patch };
      const engine = engines.get(s.activeSystemId)!;
      return { inputs: newInputs, evaluation: engine.evaluate(newInputs) };
    });
    const s = store.getState();
    remember(s.activeSystemId, s.inputs);
  }

  function switchSystem(id: string): void {
    const system = systems.find((x) => x.id === id);
    if (!system) return;
    const newInputs = inputsFor(system);
    const engine = engines.get(id)!;
    writeString(ACTIVE_SYSTEM_KEY, id);
    store.setState({
      activeSystemId: id,
      inputs: newInputs,
      evaluation: engine.evaluate(newInputs),
    });
  }

  onLanguageChange((lang) => store.setState({ language: lang }));

  function getEngine(systemId: string): FuzzyEngine {
    const engine = engines.get(systemId);
    if (!engine) throw new Error(`Unknown system: ${systemId}`);
    return engine;
  }

  mountAppShell(root, { store, systems, updateInputs, switchSystem, getEngine });
}
