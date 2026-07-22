import type { FuzzyRule, FuzzySystem } from "../types";

const COLOR = {
  low: "#4798ce",
  medium: "#e17b4f",
  high: "#efb939",
  veryHigh: "#9452a1",
} as const;

const ns = "systems.routing";
const v = (id: string) => `${ns}.variables.${id}`;

const rules: readonly FuzzyRule[] = [
  { id: "r01", if: { RE: "Low",    Dist: "High",   LQ: "Low" },    then: { RS: "VeryLow" } },
  { id: "r02", if: { RE: "Low",    Dist: "Medium", LQ: "Medium" }, then: { RS: "VeryLow" } },
  { id: "r03", if: { RE: "Low",    Dist: "High",   LQ: "High" },   then: { RS: "Low" } },
  { id: "r04", if: { RE: "Medium", Dist: "High",   LQ: "Low" },    then: { RS: "VeryLow" } },
  { id: "r05", if: { RE: "Medium", Dist: "High",   LQ: "High" },   then: { RS: "Low" } },
  { id: "r06", if: { RE: "Medium", Dist: "Medium", LQ: "Medium" }, then: { RS: "High" } },
  { id: "r07", if: { RE: "Medium", Dist: "Low",    LQ: "Medium" }, then: { RS: "High" } },
  { id: "r08", if: { RE: "Medium", Dist: "Low",    LQ: "High" },   then: { RS: "VeryHigh" } },
  { id: "r09", if: { RE: "High",   Dist: "High",   LQ: "Low" },    then: { RS: "Low" } },
  { id: "r10", if: { RE: "High",   Dist: "High",   LQ: "High" },   then: { RS: "High" } },
  { id: "r11", if: { RE: "High",   Dist: "Medium", LQ: "Medium" }, then: { RS: "High" } },
  { id: "r12", if: { RE: "High",   Dist: "Low",    LQ: "High" },   then: { RS: "VeryHigh" } },
];

export const routingSystem: FuzzySystem = {
  id: "routing",
  nameKey: `${ns}.name`,
  descriptionKey: `${ns}.description`,
  defuzz: "centroid",
  inputs: [
    {
      id: "RE",
      nameKey: v("residualEnergy"),
      range: [0, 1],
      defaultValue: 0.5,
      keyPoints: [0, 0.65, 1],
      terms: [
        { id: "Low",    nameKey: "terms.low",    color: COLOR.low,    shape: { kind: "gaussian", bias: 0,    sigma: 0.25 } },
        { id: "Medium", nameKey: "terms.medium", color: COLOR.medium, shape: { kind: "gaussian", bias: 0.65, sigma: 0.15 } },
        { id: "High",   nameKey: "terms.high",   color: COLOR.high,   shape: { kind: "gaussian", bias: 1,    sigma: 0.15 } },
      ],
    },
    {
      id: "Dist",
      nameKey: v("distance"),
      range: [0, 100],
      defaultValue: 50,
      keyPoints: [10, 40, 100],
      terms: [
        { id: "Low",    nameKey: "terms.low",    color: COLOR.low,    shape: { kind: "gaussian", bias: 10,  sigma: 15 } },
        { id: "Medium", nameKey: "terms.medium", color: COLOR.medium, shape: { kind: "gaussian", bias: 40,  sigma: 15 } },
        { id: "High",   nameKey: "terms.high",   color: COLOR.high,   shape: { kind: "gaussian", bias: 100, sigma: 30 } },
      ],
    },
    {
      id: "LQ",
      nameKey: v("linkQuality"),
      range: [0, 1],
      defaultValue: 0.5,
      keyPoints: [0.3, 0.75, 1],
      terms: [
        { id: "Low",    nameKey: "terms.low",    color: COLOR.low,    shape: { kind: "gaussian", bias: 0.3,  sigma: 0.25 } },
        { id: "Medium", nameKey: "terms.medium", color: COLOR.medium, shape: { kind: "gaussian", bias: 0.75, sigma: 0.1 } },
        { id: "High",   nameKey: "terms.high",   color: COLOR.high,   shape: { kind: "gaussian", bias: 1,    sigma: 0.1 } },
      ],
    },
  ],
  output: {
    id: "RS",
    nameKey: v("routeStatus"),
    range: [0, 100],
    defaultValue: 50,
    keyPoints: [0, 30, 70, 100],
    terms: [
      { id: "VeryLow",  nameKey: "terms.veryLow",  color: COLOR.low,      shape: { kind: "gaussian", bias: 0,   sigma: 10 } },
      { id: "Low",      nameKey: "terms.low",      color: COLOR.medium,   shape: { kind: "gaussian", bias: 30,  sigma: 15 } },
      { id: "High",     nameKey: "terms.high",     color: COLOR.high,     shape: { kind: "gaussian", bias: 70,  sigma: 15 } },
      { id: "VeryHigh", nameKey: "terms.veryHigh", color: COLOR.veryHigh, shape: { kind: "gaussian", bias: 100, sigma: 10 } },
    ],
  },
  rules,
};
