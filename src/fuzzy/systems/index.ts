import type { FuzzySystem } from "../types";
import { aggregationSystem } from "./aggregation";
import { commCtrlSystem } from "./commCtrl";
import { routingSystem } from "./routing";

export const systems: readonly FuzzySystem[] = [commCtrlSystem, routingSystem, aggregationSystem];

export function findSystem(id: string): FuzzySystem | undefined {
  return systems.find((s) => s.id === id);
}
