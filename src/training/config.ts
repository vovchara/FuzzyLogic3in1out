import type { FuzzySystem } from "../fuzzy/types";

/**
 * Controllers that get the genetic optimisation card. The one switch for it:
 * add an id to turn the card on for a controller, remove it to turn it off.
 * The controllers themselves know nothing about training.
 */
export const TRAINING_ENABLED: readonly string[] = ["routing"];

/** The GA codes gaussian MFs only, so a controller with other shapes is never offered. */
export function canTrain(system: FuzzySystem): boolean {
  return TRAINING_ENABLED.includes(system.id)
    && [...system.inputs, system.output].every((v) => v.terms.every((t) => t.shape.kind === "gaussian"));
}
