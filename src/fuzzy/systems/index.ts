import type { FuzzySystem } from "../types";
import { commCtrlSystem } from "./commCtrl";

export const systems: readonly FuzzySystem[] = [commCtrlSystem];

export function findSystem(id: string): FuzzySystem | undefined {
  return systems.find((s) => s.id === id);
}
