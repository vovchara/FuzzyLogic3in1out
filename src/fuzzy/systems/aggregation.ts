import type { FuzzyRule, FuzzySystem } from "../types";

const COLOR = {
  low: "#e74c3c",
  medium: "#3498db",
  high: "#27ae60",
  none: "#94a3b8",
  verySmall: "#a78bfa",
  small: "#e74c3c",
  mid: "#3498db",
  large: "#27ae60",
  veryLarge: "#f39c12",
} as const;

const ns = "systems.aggregation";
const v = (id: string) => `${ns}.variables.${id}`;

const rules: readonly FuzzyRule[] = [
  { id: "r01", if: { E: "Low",    R: "Low",    T: "Large" },  then: { A: "None" } },
  { id: "r02", if: { E: "Low",    R: "Medium", T: "Large" },  then: { A: "VerySmall" } },
  { id: "r03", if: { E: "Medium", R: "Low",    T: "Medium" }, then: { A: "Small" } },
  { id: "r04", if: { E: "Medium", R: "High",   T: "Medium" }, then: { A: "Medium" } },
  { id: "r05", if: { E: "High",   R: "Medium", T: "Small" },  then: { A: "Large" } },
  { id: "r06", if: { E: "High",   R: "High",   T: "Small" },  then: { A: "VeryLarge" } },
];

export const aggregationSystem: FuzzySystem = {
  id: "aggregation",
  nameKey: `${ns}.name`,
  descriptionKey: `${ns}.description`,
  defuzz: "weighted-average",
  draft: true,
  inputs: [
    {
      id: "E",
      nameKey: v("energy"),
      range: [0, 100],
      defaultValue: 50,
      keyPoints: [30, 50, 60, 70, 90],
      terms: [
        { id: "Low",    nameKey: "terms.low",    color: COLOR.low,    shape: { kind: "trapezoid", points: [0, 0, 0, 50] } },
        { id: "Medium", nameKey: "terms.medium", color: COLOR.medium, shape: { kind: "triangle", points: [30, 60, 90] } },
        { id: "High",   nameKey: "terms.high",   color: COLOR.high,   shape: { kind: "trapezoid", points: [70, 100, 100, 100] } },
      ],
    },
    {
      id: "R",
      nameKey: v("reputation"),
      range: [0, 100],
      defaultValue: 50,
      keyPoints: [10, 40, 50, 60, 90],
      terms: [
        { id: "Low",    nameKey: "terms.low",    color: COLOR.low,    shape: { kind: "trapezoid", points: [0, 0, 0, 40] } },
        { id: "Medium", nameKey: "terms.medium", color: COLOR.medium, shape: { kind: "triangle", points: [10, 50, 90] } },
        { id: "High",   nameKey: "terms.high",   color: COLOR.high,   shape: { kind: "trapezoid", points: [60, 100, 100, 100] } },
      ],
    },
    {
      id: "T",
      nameKey: v("load"),
      range: [0, 100],
      defaultValue: 50,
      keyPoints: [10, 30, 40, 50, 70],
      terms: [
        { id: "Small",  nameKey: "terms.small",  color: COLOR.low,    shape: { kind: "trapezoid", points: [0, 0, 0, 30] } },
        { id: "Medium", nameKey: "terms.medium", color: COLOR.medium, shape: { kind: "triangle", points: [10, 40, 70] } },
        { id: "Large",  nameKey: "terms.large",  color: COLOR.high,   shape: { kind: "trapezoid", points: [50, 100, 100, 100] } },
      ],
    },
  ],
  output: {
    id: "A",
    nameKey: v("aggregation"),
    range: [0, 100],
    defaultValue: 0,
    keyPoints: [0, 20, 40, 60, 80, 100],
    terms: [
      { id: "None",      nameKey: "terms.none",      color: COLOR.none,      shape: { kind: "singleton", at: 0 } },
      { id: "VerySmall", nameKey: "terms.verySmall", color: COLOR.verySmall, shape: { kind: "singleton", at: 20 } },
      { id: "Small",     nameKey: "terms.small",     color: COLOR.small,     shape: { kind: "singleton", at: 40 } },
      { id: "Medium",    nameKey: "terms.medium",    color: COLOR.mid,       shape: { kind: "singleton", at: 60 } },
      { id: "Large",     nameKey: "terms.large",     color: COLOR.large,     shape: { kind: "singleton", at: 80 } },
      { id: "VeryLarge", nameKey: "terms.veryLarge", color: COLOR.veryLarge, shape: { kind: "singleton", at: 100 } },
    ],
  },
  rules,
};
