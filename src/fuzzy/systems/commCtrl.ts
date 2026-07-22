import type { FuzzyRule, FuzzySystem } from "../types";

const COLOR = {
  small: "#4798ce",
  medium: "#e17b4f",
  large: "#efb939",
  outputVeryLow: "#67a8d6",
  outputLow: "#e1794d",
  outputMedium: "#f1c355",
  outputHigh: "#9a5da7",
  outputVeryHigh: "#83b342",
} as const;

const ns = "systems.commCtrl";
const v = (id: string) => `${ns}.variables.${id}`;

const rules: readonly FuzzyRule[] = [
  { id: "r01", if: { En: "Low",    PDR: "Low",    TD: "Low" },    then: { ChP: "VerySmall" } },
  { id: "r02", if: { En: "Low",    PDR: "Low",    TD: "Medium" }, then: { ChP: "VerySmall" } },
  { id: "r03", if: { En: "Low",    PDR: "Low",    TD: "High" },   then: { ChP: "VerySmall" } },
  { id: "r04", if: { En: "Low",    PDR: "Medium", TD: "Low" },    then: { ChP: "Small" } },
  { id: "r05", if: { En: "Low",    PDR: "Medium", TD: "Medium" }, then: { ChP: "VerySmall" } },
  { id: "r06", if: { En: "Low",    PDR: "Medium", TD: "High" },   then: { ChP: "VerySmall" } },
  { id: "r07", if: { En: "Low",    PDR: "High",   TD: "Low" },    then: { ChP: "Small" } },
  { id: "r08", if: { En: "Low",    PDR: "High",   TD: "Medium" }, then: { ChP: "VerySmall" } },
  { id: "r09", if: { En: "Low",    PDR: "High",   TD: "High" },   then: { ChP: "VerySmall" } },
  { id: "r10", if: { En: "Medium", PDR: "Low",    TD: "Low" },    then: { ChP: "Small" } },
  { id: "r11", if: { En: "Medium", PDR: "Low",    TD: "Medium" }, then: { ChP: "VerySmall" } },
  { id: "r12", if: { En: "Medium", PDR: "Low",    TD: "High" },   then: { ChP: "VerySmall" } },
  { id: "r13", if: { En: "Medium", PDR: "Medium", TD: "Low" },    then: { ChP: "Medium" } },
  { id: "r14", if: { En: "Medium", PDR: "Medium", TD: "Medium" }, then: { ChP: "Small" } },
  { id: "r15", if: { En: "Medium", PDR: "Medium", TD: "High" },   then: { ChP: "VerySmall" } },
  { id: "r16", if: { En: "Medium", PDR: "High",   TD: "Low" },    then: { ChP: "Large" } },
  { id: "r17", if: { En: "Medium", PDR: "High",   TD: "Medium" }, then: { ChP: "Medium" } },
  { id: "r18", if: { En: "Medium", PDR: "High",   TD: "High" },   then: { ChP: "Small" } },
  { id: "r19", if: { En: "High",   PDR: "Low",    TD: "Low" },    then: { ChP: "Medium" } },
  { id: "r20", if: { En: "High",   PDR: "Low",    TD: "Medium" }, then: { ChP: "Small" } },
  { id: "r21", if: { En: "High",   PDR: "Low",    TD: "High" },   then: { ChP: "VerySmall" } },
  { id: "r22", if: { En: "High",   PDR: "Medium", TD: "Low" },    then: { ChP: "Large" } },
  { id: "r23", if: { En: "High",   PDR: "Medium", TD: "Medium" }, then: { ChP: "Medium" } },
  { id: "r24", if: { En: "High",   PDR: "Medium", TD: "High" },   then: { ChP: "Small" } },
  { id: "r25", if: { En: "High",   PDR: "High",   TD: "Low" },    then: { ChP: "VeryLarge" } },
  { id: "r26", if: { En: "High",   PDR: "High",   TD: "Medium" }, then: { ChP: "Large" } },
  { id: "r27", if: { En: "High",   PDR: "High",   TD: "High" },   then: { ChP: "Medium" } },
];

export const commCtrlSystem: FuzzySystem = {
  id: "commCtrl",
  nameKey: `${ns}.name`,
  descriptionKey: `${ns}.description`,
  defuzz: "centroid",
  inputs: [
    {
      id: "En",
      nameKey: v("residualEnergy"),
      range: [0, 1],
      defaultValue: 0.5,
      keyPoints: [0.2, 0.4, 0.6, 0.8],
      terms: [
        { id: "Low",    nameKey: "terms.small",  color: COLOR.small,  shape: { kind: "trapezoid", points: [0, 0, 0.2, 0.4] } },
        { id: "Medium", nameKey: "terms.medium", color: COLOR.medium, shape: { kind: "trapezoid", points: [0.2, 0.4, 0.6, 0.8] } },
        { id: "High",   nameKey: "terms.large",  color: COLOR.large,  shape: { kind: "trapezoid", points: [0.6, 0.8, 1, 1] } },
      ],
    },
    {
      id: "PDR",
      nameKey: v("packetDeliveryRatio"),
      range: [0, 1],
      defaultValue: 0.5,
      keyPoints: [0.3, 0.5, 0.7, 0.9],
      terms: [
        { id: "Low",    nameKey: "terms.smallM",  color: COLOR.small,  shape: { kind: "trapezoid", points: [0, 0, 0.3, 0.5] } },
        { id: "Medium", nameKey: "terms.mediumM", color: COLOR.medium, shape: { kind: "trapezoid", points: [0.3, 0.5, 0.7, 0.9] } },
        { id: "High",   nameKey: "terms.largeM",  color: COLOR.large,  shape: { kind: "trapezoid", points: [0.7, 0.9, 1, 1] } },
      ],
    },
    {
      id: "TD",
      nameKey: v("transmissionDelay"),
      range: [0, 50],
      defaultValue: 25,
      keyPoints: [10, 15, 20, 25, 35, 45],
      terms: [
        { id: "Low",    nameKey: "terms.small",  color: COLOR.small,  shape: { kind: "trapezoid", points: [0, 0, 10, 20] } },
        { id: "Medium", nameKey: "terms.medium", color: COLOR.medium, shape: { kind: "trapezoid", points: [15, 25, 35, 45] } },
        { id: "High",   nameKey: "terms.large",  color: COLOR.large,  shape: { kind: "trapezoid", points: [35, 45, 50, 50] } },
      ],
    },
  ],
  output: {
    id: "ChP",
    nameKey: v("probability"),
    range: [0, 100],
    defaultValue: 0,
    keyPoints: [0, 25, 50, 75, 100],
    terms: [
      { id: "VerySmall", nameKey: "terms.verySmall", color: COLOR.outputVeryLow,  shape: { kind: "triangle", points: [0, 0, 25] } },
      { id: "Small",     nameKey: "terms.small",     color: COLOR.outputLow,      shape: { kind: "triangle", points: [0, 25, 50] } },
      { id: "Medium",    nameKey: "terms.medium",    color: COLOR.outputMedium,   shape: { kind: "triangle", points: [25, 50, 75] } },
      { id: "Large",     nameKey: "terms.large",     color: COLOR.outputHigh,     shape: { kind: "triangle", points: [50, 75, 100] } },
      { id: "VeryLarge", nameKey: "terms.veryLarge", color: COLOR.outputVeryHigh, shape: { kind: "triangle", points: [75, 100, 100] } },
    ],
  },
  rules,
};
