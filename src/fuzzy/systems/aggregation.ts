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
  { id: "r01", if: { EE: "Small",  Dis: "Small",  Dat: "Small" }, then: { AP: "VeryLarge" } },
  { id: "r02", if: { EE: "Small",  Dis: "Medium", Dat: "Medium" }, then: { AP: "Large" } },
  { id: "r03", if: { EE: "Medium", Dis: "Medium", Dat: "Small" }, then: { AP: "Medium" } },
  { id: "r04", if: { EE: "Medium", Dis: "Large",  Dat: "Medium" }, then: { AP: "Small" } },
  { id: "r05", if: { EE: "Large",  Dis: "Small",  Dat: "Large" }, then: { AP: "VerySmall" } },
  { id: "r06", if: { EE: "Large",  Dis: "Large",  Dat: "Large" }, then: { AP: "None" } },
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
      keyPoints: [4, 8, 15, 20, 28],
      terms: [
        { id: "Small",  nameKey: "terms.smallPl",  color: COLOR.small,  shape: { kind: "trapezoid", points: [0, 0, 0, 8] } },
        { id: "Medium", nameKey: "terms.mediumPl", color: COLOR.medium, shape: { kind: "triangle", points: [4, 15, 28] } },
        { id: "Large",  nameKey: "terms.largePl",  color: COLOR.large,  shape: { kind: "trapezoid", points: [20, 45, 45, 45] } },
      ],
    },
    {
      id: "Dis",
      nameKey: v("distanceToCH"),
      range: [0, 214],
      defaultValue: 107,
      keyPoints: [25, 45, 65, 80, 120],
      terms: [
        { id: "Small",  nameKey: "terms.small",  color: COLOR.small,  shape: { kind: "trapezoid", points: [0, 0, 0, 45] } },
        { id: "Medium", nameKey: "terms.medium", color: COLOR.medium, shape: { kind: "triangle", points: [25, 65, 120] } },
        { id: "Large",  nameKey: "terms.large",  color: COLOR.large,  shape: { kind: "trapezoid", points: [80, 214, 214, 214] } },
      ],
    },
    {
      // Chapter 3 puts the Large peak at 244 while MATLAB's range stops at
      // 240, so within the range Large never quite reaches 1.
      id: "Dat",
      nameKey: v("packetCount"),
      range: [0, 240],
      defaultValue: 120,
      keyPoints: [15, 25, 60, 90, 130],
      terms: [
        { id: "Small",  nameKey: "terms.small",  color: COLOR.small,  shape: { kind: "trapezoid", points: [0, 0, 0, 25] } },
        { id: "Medium", nameKey: "terms.medium", color: COLOR.medium, shape: { kind: "triangle", points: [15, 60, 130] } },
        { id: "Large",  nameKey: "terms.large",  color: COLOR.large,  shape: { kind: "trapezoid", points: [90, 244, 244, 244] } },
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
      { id: "None",      nameKey: "terms.noneM",     color: COLOR.none,      shape: { kind: "singleton", at: 0 } },
      { id: "VerySmall", nameKey: "terms.verySmallM", color: COLOR.verySmall, shape: { kind: "singleton", at: 20 } },
      { id: "Small",     nameKey: "terms.smallM",    color: COLOR.small,     shape: { kind: "singleton", at: 40 } },
      { id: "Medium",    nameKey: "terms.mediumM",   color: COLOR.medium,    shape: { kind: "singleton", at: 60 } },
      { id: "Large",     nameKey: "terms.largeM",    color: COLOR.large,     shape: { kind: "singleton", at: 80 } },
      { id: "VeryLarge", nameKey: "terms.veryLargeM", color: COLOR.veryLarge, shape: { kind: "singleton", at: 100 } },
    ],
  },
  rules,
};
