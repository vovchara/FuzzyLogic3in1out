import type { FuzzyRule, FuzzySystem } from "../types";

const COLOR = {
  low: "#e74c3c",
  medium: "#3498db",
  high: "#27ae60",
  veryLow: "#9b59b6",
  veryHigh: "#f39c12",
} as const;

const ns = "systems.commCtrl";
const v = (id: string) => `${ns}.variables.${id}`;

const rules: readonly FuzzyRule[] = [
  // E = Low
  { id: "r01", if: { E: "Low", T: "Low", D: "Low" },       then: { P: "Low" } },
  { id: "r02", if: { E: "Low", T: "Low", D: "Medium" },    then: { P: "VeryLow" } },
  { id: "r03", if: { E: "Low", T: "Low", D: "High" },      then: { P: "VeryLow" } },
  { id: "r04", if: { E: "Low", T: "Medium", D: "Low" },    then: { P: "VeryLow" } },
  { id: "r05", if: { E: "Low", T: "Medium", D: "Medium" }, then: { P: "VeryLow" } },
  { id: "r06", if: { E: "Low", T: "Medium", D: "High" },   then: { P: "VeryLow" } },
  { id: "r07", if: { E: "Low", T: "High", D: "Low" },      then: { P: "Low" } },
  { id: "r08", if: { E: "Low", T: "High", D: "Medium" },   then: { P: "Low" } },
  { id: "r09", if: { E: "Low", T: "High", D: "High" },     then: { P: "Low" } },
  // E = Medium
  { id: "r10", if: { E: "Medium", T: "Low", D: "Low" },       then: { P: "Medium" } },
  { id: "r11", if: { E: "Medium", T: "Low", D: "Medium" },    then: { P: "Low" } },
  { id: "r12", if: { E: "Medium", T: "Low", D: "High" },      then: { P: "Low" } },
  { id: "r13", if: { E: "Medium", T: "Medium", D: "Low" },    then: { P: "Medium" } },
  { id: "r14", if: { E: "Medium", T: "Medium", D: "Medium" }, then: { P: "Medium" } },
  { id: "r15", if: { E: "Medium", T: "Medium", D: "High" },   then: { P: "Medium" } },
  { id: "r16", if: { E: "Medium", T: "High", D: "Low" },      then: { P: "High" } },
  { id: "r17", if: { E: "Medium", T: "High", D: "Medium" },   then: { P: "High" } },
  { id: "r18", if: { E: "Medium", T: "High", D: "High" },     then: { P: "Medium" } },
  // E = High
  { id: "r19", if: { E: "High", T: "Low", D: "Low" },       then: { P: "High" } },
  { id: "r20", if: { E: "High", T: "Low", D: "Medium" },    then: { P: "High" } },
  { id: "r21", if: { E: "High", T: "Low", D: "High" },      then: { P: "High" } },
  { id: "r22", if: { E: "High", T: "Medium", D: "Low" },    then: { P: "VeryHigh" } },
  { id: "r23", if: { E: "High", T: "Medium", D: "Medium" }, then: { P: "VeryHigh" } },
  { id: "r24", if: { E: "High", T: "Medium", D: "High" },   then: { P: "VeryHigh" } },
  { id: "r25", if: { E: "High", T: "High", D: "Low" },      then: { P: "VeryHigh" } },
  { id: "r26", if: { E: "High", T: "High", D: "Medium" },   then: { P: "VeryHigh" } },
  { id: "r27", if: { E: "High", T: "High", D: "High" },     then: { P: "High" } },
];

export const commCtrlSystem: FuzzySystem = {
  id: "commCtrl",
  nameKey: `${ns}.name`,
  descriptionKey: `${ns}.description`,
  defuzz: "centroid",
  inputs: [
    {
      id: "E",
      nameKey: v("residualEnergy"),
      range: [0, 100],
      defaultValue: 50,
      keyPoints: [10, 30, 50, 70],
      terms: [
        { id: "Low",    nameKey: "terms.low",    color: COLOR.low,    shape: { kind: "trapezoid", points: [0, 0, 10, 30] } },
        { id: "Medium", nameKey: "terms.medium", color: COLOR.medium, shape: { kind: "trapezoid", points: [10, 30, 50, 70] } },
        { id: "High",   nameKey: "terms.high",   color: COLOR.high,   shape: { kind: "trapezoid", points: [50, 70, 100, 100] } },
      ],
    },
    {
      id: "T",
      nameKey: v("transmissionCoefficient"),
      range: [0, 100],
      defaultValue: 50,
      keyPoints: [20, 40, 60, 80],
      terms: [
        { id: "Low",    nameKey: "terms.low",    color: COLOR.low,    shape: { kind: "trapezoid", points: [0, 0, 20, 40] } },
        { id: "Medium", nameKey: "terms.medium", color: COLOR.medium, shape: { kind: "trapezoid", points: [20, 40, 60, 80] } },
        { id: "High",   nameKey: "terms.high",   color: COLOR.high,   shape: { kind: "trapezoid", points: [60, 80, 100, 100] } },
      ],
    },
    {
      id: "D",
      nameKey: v("delayCoefficient"),
      range: [0, 100],
      defaultValue: 50,
      keyPoints: [30, 50, 70, 90],
      terms: [
        { id: "Low",    nameKey: "terms.low",    color: COLOR.low,    shape: { kind: "trapezoid", points: [0, 0, 30, 50] } },
        { id: "Medium", nameKey: "terms.medium", color: COLOR.medium, shape: { kind: "trapezoid", points: [30, 50, 70, 90] } },
        { id: "High",   nameKey: "terms.high",   color: COLOR.high,   shape: { kind: "trapezoid", points: [70, 90, 100, 100] } },
      ],
    },
  ],
  output: {
    id: "P",
    nameKey: v("probability"),
    range: [0, 100],
    defaultValue: 0,
    keyPoints: [25, 50, 75],
    terms: [
      { id: "VeryLow",  nameKey: "terms.veryLow",  color: COLOR.veryLow,  shape: { kind: "triangle", points: [0, 0, 25] } },
      { id: "Low",      nameKey: "terms.low",      color: COLOR.low,      shape: { kind: "triangle", points: [0, 25, 50] } },
      { id: "Medium",   nameKey: "terms.medium",   color: COLOR.medium,   shape: { kind: "triangle", points: [25, 50, 75] } },
      { id: "High",     nameKey: "terms.high",     color: COLOR.high,     shape: { kind: "triangle", points: [50, 75, 100] } },
      { id: "VeryHigh", nameKey: "terms.veryHigh", color: COLOR.veryHigh, shape: { kind: "triangle", points: [75, 100, 100] } },
    ],
  },
  rules,
};
