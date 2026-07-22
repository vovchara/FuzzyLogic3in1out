import type { FuzzyRule, FuzzySystem } from "../types";

const COLOR = {
  small: "#4798ce",
  medium: "#e17b4f",
  large: "#efb939",
  none: "#94a3b8",
  verySmall: "#a78bfa",
  veryLarge: "#f39c12",
} as const;

const ns = "systems.aggregation";
const v = (id: string) => `${ns}.variables.${id}`;

const rules: readonly FuzzyRule[] = [
  { id: "r01", if: { EE: "Small",  Dist: "Small",  DR: "Small" }, then: { AP: "VeryLarge" } },
  { id: "r02", if: { EE: "Small",  Dist: "Medium", DR: "Medium" }, then: { AP: "Large" } },
  { id: "r03", if: { EE: "Medium", Dist: "Medium", DR: "Small" }, then: { AP: "Medium" } },
  { id: "r04", if: { EE: "Medium", Dist: "Large",  DR: "Medium" }, then: { AP: "Small" } },
  { id: "r05", if: { EE: "Large",  Dist: "Small",  DR: "Large" }, then: { AP: "VerySmall" } },
  { id: "r06", if: { EE: "Large",  Dist: "Large",  DR: "Large" }, then: { AP: "None" } },
];

export const aggregationSystem: FuzzySystem = {
  id: "aggregation",
  nameKey: `${ns}.name`,
  descriptionKey: `${ns}.description`,
  defuzz: "weighted-sum",
  inputs: [
    {
      id: "EE",
      nameKey: v("expandedEnergy"),
      range: [0, 45],
      defaultValue: 22.5,
      keyPoints: [5, 15, 25, 30],
      terms: [
        { id: "Small",  nameKey: "terms.small",  color: COLOR.small,  shape: { kind: "trapezoid", points: [0, 0, 0, 15] } },
        { id: "Medium", nameKey: "terms.medium", color: COLOR.medium, shape: { kind: "triangle", points: [5, 15, 30] } },
        { id: "Large",  nameKey: "terms.large",  color: COLOR.large,  shape: { kind: "trapezoid", points: [25, 45, 45, 45] } },
      ],
    },
    {
      id: "Dist",
      nameKey: v("distanceToCH"),
      range: [0, 214],
      defaultValue: 107,
      keyPoints: [30, 60, 90, 120],
      terms: [
        { id: "Small",  nameKey: "terms.small",  color: COLOR.small,  shape: { kind: "trapezoid", points: [0, 0, 0, 60] } },
        { id: "Medium", nameKey: "terms.medium", color: COLOR.medium, shape: { kind: "triangle", points: [30, 60, 120] } },
        { id: "Large",  nameKey: "terms.large",  color: COLOR.large,  shape: { kind: "trapezoid", points: [90, 214, 214, 214] } },
      ],
    },
    {
      id: "DR",
      nameKey: v("dataRate"),
      range: [0, 124],
      defaultValue: 62,
      keyPoints: [15, 30, 40, 60, 80],
      terms: [
        { id: "Small",  nameKey: "terms.small",  color: COLOR.small,  shape: { kind: "trapezoid", points: [0, 0, 0, 30] } },
        { id: "Medium", nameKey: "terms.medium", color: COLOR.medium, shape: { kind: "triangle", points: [15, 40, 80] } },
        { id: "Large",  nameKey: "terms.large",  color: COLOR.large,  shape: { kind: "trapezoid", points: [60, 124, 124, 124] } },
      ],
    },
  ],
  output: {
    id: "AP",
    nameKey: v("priority"),
    range: [0, 100],
    defaultValue: 0,
    keyPoints: [0, 20, 40, 60, 80, 100],
    terms: [
      { id: "None",      nameKey: "terms.none",      color: COLOR.none,      shape: { kind: "singleton", at: 0 } },
      { id: "VerySmall", nameKey: "terms.verySmall", color: COLOR.verySmall, shape: { kind: "singleton", at: 20 } },
      { id: "Small",     nameKey: "terms.small",     color: COLOR.small,     shape: { kind: "singleton", at: 40 } },
      { id: "Medium",    nameKey: "terms.medium",    color: COLOR.medium,    shape: { kind: "singleton", at: 60 } },
      { id: "Large",     nameKey: "terms.large",     color: COLOR.large,     shape: { kind: "singleton", at: 80 } },
      { id: "VeryLarge", nameKey: "terms.veryLarge", color: COLOR.veryLarge, shape: { kind: "singleton", at: 100 } },
    ],
  },
  rules,
};
