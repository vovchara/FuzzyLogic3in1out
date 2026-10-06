import type { FuzzySystem } from "../fuzzy/types";

export type TrainingMethod = "genetic" | "anfis";

/**
 * Controllers that get the training card, and how each is trained. The one
 * switch for it: add an id to turn the card on for a controller, remove it to
 * turn it off. The controllers themselves know nothing about training.
 * Routing is optimised genetically (section 4.3.3), aggregation trained as an
 * ANFIS (section 3.5).
 */
export const TRAINING_METHODS: Readonly<Record<string, TrainingMethod>> = {
  routing: "genetic",
  aggregation: "anfis",
};

/**
 * The GA codes gaussian MFs only; ANFIS trains triangular input MFs of a
 * Sugeno controller with singleton outputs and a weighted sum or average.
 * A controller whose shapes do not fit its method is never offered.
 */
export function trainingMethod(system: FuzzySystem): TrainingMethod | null {
  const method = TRAINING_METHODS[system.id];
  if (!method) return null;
  const fits = method === "genetic"
    ? [...system.inputs, system.output].every((v) => v.terms.every((t) => t.shape.kind === "gaussian"))
    : system.inputs.every((v) => v.terms.every((t) => t.shape.kind === "triangle" || t.shape.kind === "trapezoid"))
      && system.output.terms.every((t) => t.shape.kind === "singleton")
      && (system.defuzz === "weighted-sum" || system.defuzz === "weighted-average");
  return fits ? method : null;
}

export function canTrain(system: FuzzySystem): boolean {
  return trainingMethod(system) !== null;
}
