import type { FuzzyRule, FuzzySystem } from "../types";

const COLOR = {
  low: "#e74c3c",
  medium: "#3498db",
  high: "#27ae60",
  veryLow: "#9b59b6",
  veryHigh: "#f39c12",
} as const;

const ns = "systems.routing";
const v = (id: string) => `${ns}.variables.${id}`;

const rules: readonly FuzzyRule[] = [
  { id: "r01", if: { E: "Low",    D: "High",   R: "Low" },    then: { S: "VeryLow" } },
  { id: "r02", if: { E: "Low",    D: "Medium", R: "Low" },    then: { S: "VeryLow" } },
  { id: "r03", if: { E: "Low",    D: "High",   R: "Medium" }, then: { S: "VeryLow" } },
  { id: "r04", if: { E: "Low",    D: "Medium", R: "Medium" }, then: { S: "Low" } },
  { id: "r05", if: { E: "Medium", D: "High",   R: "Medium" }, then: { S: "Low" } },
  { id: "r06", if: { E: "Medium", D: "Medium", R: "Low" },    then: { S: "Low" } },
  { id: "r07", if: { E: "Medium", D: "Medium", R: "High" },   then: { S: "High" } },
  { id: "r08", if: { E: "Medium", D: "Low",    R: "Medium" }, then: { S: "High" } },
  { id: "r09", if: { E: "High",   D: "Medium", R: "Medium" }, then: { S: "High" } },
  { id: "r10", if: { E: "High",   D: "Low",    R: "Medium" }, then: { S: "VeryHigh" } },
  { id: "r11", if: { E: "High",   D: "Medium", R: "High" },   then: { S: "VeryHigh" } },
  { id: "r12", if: { E: "High",   D: "Low",    R: "High" },   then: { S: "VeryHigh" } },
];

export const routingSystem: FuzzySystem = {
  id: "routing",
  nameKey: `${ns}.name`,
  descriptionKey: `${ns}.description`,
  defuzz: "bisector",
  draft: true,
  inputs: [
    {
      id: "E",
      nameKey: v("energy"),
      range: [0, 100],
      defaultValue: 50,
      keyPoints: [0, 50, 100],
      terms: [
        { id: "Low",    nameKey: "terms.low",    color: COLOR.low,    shape: { kind: "gaussian", bias: 0,   sigma: 15 } },
        { id: "Medium", nameKey: "terms.medium", color: COLOR.medium, shape: { kind: "gaussian", bias: 50,  sigma: 20 } },
        { id: "High",   nameKey: "terms.high",   color: COLOR.high,   shape: { kind: "gaussian", bias: 100, sigma: 15 } },
      ],
    },
    {
      id: "D",
      nameKey: v("distance"),
      range: [0, 100],
      defaultValue: 50,
      keyPoints: [0, 50, 100],
      terms: [
        { id: "Low",    nameKey: "terms.low",    color: COLOR.low,    shape: { kind: "gaussian", bias: 0,   sigma: 18 } },
        { id: "Medium", nameKey: "terms.medium", color: COLOR.medium, shape: { kind: "gaussian", bias: 50,  sigma: 18 } },
        { id: "High",   nameKey: "terms.high",   color: COLOR.high,   shape: { kind: "gaussian", bias: 100, sigma: 18 } },
      ],
    },
    {
      id: "R",
      nameKey: v("reputation"),
      range: [0, 100],
      defaultValue: 50,
      keyPoints: [0, 50, 100],
      terms: [
        { id: "Low",    nameKey: "terms.low",    color: COLOR.low,    shape: { kind: "gaussian", bias: 0,   sigma: 20 } },
        { id: "Medium", nameKey: "terms.medium", color: COLOR.medium, shape: { kind: "gaussian", bias: 50,  sigma: 15 } },
        { id: "High",   nameKey: "terms.high",   color: COLOR.high,   shape: { kind: "gaussian", bias: 100, sigma: 20 } },
      ],
    },
  ],
  output: {
    id: "S",
    nameKey: v("routeStatus"),
    range: [0, 100],
    defaultValue: 50,
    keyPoints: [0, 35, 65, 100],
    terms: [
      { id: "VeryLow",  nameKey: "terms.veryLow",  color: COLOR.veryLow,  shape: { kind: "gaussian", bias: 0,   sigma: 10 } },
      { id: "Low",      nameKey: "terms.low",      color: COLOR.low,      shape: { kind: "gaussian", bias: 35,  sigma: 10 } },
      { id: "High",     nameKey: "terms.high",     color: COLOR.high,     shape: { kind: "gaussian", bias: 65,  sigma: 10 } },
      { id: "VeryHigh", nameKey: "terms.veryHigh", color: COLOR.veryHigh, shape: { kind: "gaussian", bias: 100, sigma: 10 } },
    ],
  },
  rules,
};
