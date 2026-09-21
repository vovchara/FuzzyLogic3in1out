import type { FuzzyEngine } from "../fuzzy/engine";
import type { FuzzySystem } from "../fuzzy/types";
import type { AppState, Store } from "../state";

/**
 * Everything a component is allowed to reach outside itself. Keeping it here
 * rather than in the shell that happens to build it means a component depends
 * on the contract, not on the shell: the dependency graph stays a tree.
 */
export interface AppShellCtx {
  store: Store;
  systems: readonly FuzzySystem[];
  updateInputs(patch: Readonly<Record<string, number>>): void;
  switchSystem(id: string): void;
  getEngine(systemId: string): FuzzyEngine;
}

/** Every component returns one of these; calling it releases all its listeners. */
export type Unmount = () => void;

/**
 * One stage of the inference, as the workbench presents it. The same
 * descriptor drives both the expandable section and its node in the flow
 * strip, so the strip can never name a step the page does not show.
 */
export interface InferenceStep {
  readonly id: string;
  /** Full heading on the section. */
  readonly titleKey: string;
  /** Two-word label for the flow strip node. */
  readonly shortKey: string;
  /** One line of plain language: what this stage does and why. */
  readonly hintKey: string;
  readonly mount: (host: HTMLElement, ctx: AppShellCtx, system: FuzzySystem) => Unmount;
  /** Live one-liner under the strip node. Empty while nothing is computed. */
  readonly status: (system: FuzzySystem, state: AppState) => string;
  /** Whether the section starts expanded, before the reader has an opinion. */
  readonly defaultOpen?: boolean;
}
