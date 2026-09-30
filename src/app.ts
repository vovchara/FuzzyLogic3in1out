import { mountAppShell } from "./components/shell/appShell";
import { createEngine, type FuzzyEngine } from "./fuzzy/engine";
import { systems } from "./fuzzy/systems";
import { canTrain } from "./training/config";
import { rebase, sameStructure, type TrainingRecord } from "./training/record";
import type { FuzzySystem } from "./fuzzy/types";
import { getLang, initI18n, onLanguageChange } from "./i18n";
import { createStore, type Store } from "./state";
import { readJson, readString, writeJson, writeString } from "./utils/storage";

const INPUTS_KEY = "fuzzy.inputs";
const ACTIVE_SYSTEM_KEY = "fuzzy.activeSystem";
const TRAINING_KEY = "fuzzy.training";

type SavedInputs = Record<string, Record<string, number>>;
type SavedTraining = Record<string, TrainingRecord>;

export async function startApp(root: HTMLElement): Promise<void> {
  await initI18n();

  const expertById = new Map(systems.map((s) => [s.id, s]));
  const current = new Map(expertById);
  const engines = new Map<string, FuzzyEngine>();

  // An optimised controller outlives a reload: losing a result that took a
  // run to produce to an accidental refresh mid-demo is the worse failure.
  // It is dropped only when the expert controller has changed shape since.
  const training: SavedTraining = {};
  for (const [id, record] of Object.entries(readJson<SavedTraining>(TRAINING_KEY, {}))) {
    const expert = expertById.get(id);
    if (!expert || !canTrain(expert) || !record?.system || !sameStructure(expert, record.system)) continue;
    training[id] = record;
    current.set(id, rebase(expert, record.system));
  }
  for (const s of current.values()) engines.set(s.id, createEngine(s));

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
    systemRevision: 0,
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

  function getSystem(systemId: string): FuzzySystem {
    const system = current.get(systemId);
    if (!system) throw new Error(`Unknown system: ${systemId}`);
    return system;
  }

  function getExpertSystem(systemId: string): FuzzySystem {
    const system = expertById.get(systemId);
    if (!system) throw new Error(`Unknown system: ${systemId}`);
    return system;
  }

  function setTraining(systemId: string, record: TrainingRecord | null): void {
    const expert = getExpertSystem(systemId);
    const system = record ? rebase(expert, record.system) : expert;
    current.set(systemId, system);
    engines.set(systemId, createEngine(system));
    if (record) training[systemId] = record;
    else delete training[systemId];
    writeJson(TRAINING_KEY, training);

    store.setState((s) => ({
      systemRevision: s.systemRevision + 1,
      evaluation: s.activeSystemId === systemId ? getEngine(systemId).evaluate(s.inputs) : s.evaluation,
    }));
  }

  mountAppShell(root, {
    store,
    systems,
    updateInputs,
    switchSystem,
    getEngine,
    getSystem,
    getExpertSystem,
    getTraining: (id) => training[id],
    setTraining,
  });
}
