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

// Rule base (27 rules, full coverage of 3 inputs × 3 terms).
//
// The dissertation (Розділ3-Нейромережа-Агрегація) specifies six canonical
// rules for the aggregation controller — they are preserved verbatim below as
// rules r01…r06 in the exact order and outputs from the reference PDF.
//
// The remaining 21 combinations (prefixed "d07"…"d27" to flag them as
// derived, not thesis-original) were interpolated from the canonical rules
// using a monotonic score:
//
//   score = rank(E) + rank(R) − rank(T)
//   where Low/Small = 0, Medium = 1, High/Large = 2
//
// The score → output mapping is taken from the canonical rules:
//   score −2 → None,        score −1 → VerySmall,   score 0 → Small,
//   score  1 → Small,       score  2 → Medium,      score 3 → Large,
//   score  4 → VeryLarge
//
// This extension eliminates the previous midpoint-fallback behavior for
// uncovered input combinations, so the controller produces sensible output
// across the entire [0, 100]³ input space. The six canonical rules can be
// recovered by filtering on ids starting with "r".
const rules: readonly FuzzyRule[] = [
  // Canonical (from dissertation reference PDF)
  { id: "r01", if: { E: "Low",    R: "Low",    T: "Large" },  then: { A: "None" } },
  { id: "r02", if: { E: "Low",    R: "Medium", T: "Large" },  then: { A: "VerySmall" } },
  { id: "r03", if: { E: "Medium", R: "Low",    T: "Medium" }, then: { A: "Small" } },
  { id: "r04", if: { E: "Medium", R: "High",   T: "Medium" }, then: { A: "Medium" } },
  { id: "r05", if: { E: "High",   R: "Medium", T: "Small" },  then: { A: "Large" } },
  { id: "r06", if: { E: "High",   R: "High",   T: "Small" },  then: { A: "VeryLarge" } },

  // Derived via monotonic score (not in dissertation — mark for review).
  // E=Low
  { id: "d07", if: { E: "Low",    R: "Low",    T: "Small" },  then: { A: "Small" } },      // s=0
  { id: "d08", if: { E: "Low",    R: "Low",    T: "Medium" }, then: { A: "VerySmall" } },  // s=-1
  { id: "d09", if: { E: "Low",    R: "Medium", T: "Small" },  then: { A: "Small" } },      // s=1
  { id: "d10", if: { E: "Low",    R: "Medium", T: "Medium" }, then: { A: "Small" } },      // s=0
  { id: "d11", if: { E: "Low",    R: "High",   T: "Small" },  then: { A: "Medium" } },     // s=2
  { id: "d12", if: { E: "Low",    R: "High",   T: "Medium" }, then: { A: "Small" } },      // s=1
  { id: "d13", if: { E: "Low",    R: "High",   T: "Large" },  then: { A: "Small" } },      // s=0
  // E=Medium
  { id: "d14", if: { E: "Medium", R: "Low",    T: "Small" },  then: { A: "Small" } },      // s=1
  { id: "d15", if: { E: "Medium", R: "Low",    T: "Large" },  then: { A: "VerySmall" } },  // s=-1
  { id: "d16", if: { E: "Medium", R: "Medium", T: "Small" },  then: { A: "Medium" } },     // s=2
  { id: "d17", if: { E: "Medium", R: "Medium", T: "Medium" }, then: { A: "Small" } },      // s=1
  { id: "d18", if: { E: "Medium", R: "Medium", T: "Large" },  then: { A: "Small" } },      // s=0
  { id: "d19", if: { E: "Medium", R: "High",   T: "Small" },  then: { A: "Large" } },      // s=3
  { id: "d20", if: { E: "Medium", R: "High",   T: "Large" },  then: { A: "Small" } },      // s=1
  // E=High
  { id: "d21", if: { E: "High",   R: "Low",    T: "Small" },  then: { A: "Medium" } },     // s=2
  { id: "d22", if: { E: "High",   R: "Low",    T: "Medium" }, then: { A: "Small" } },      // s=1
  { id: "d23", if: { E: "High",   R: "Low",    T: "Large" },  then: { A: "Small" } },      // s=0
  { id: "d24", if: { E: "High",   R: "Medium", T: "Medium" }, then: { A: "Medium" } },     // s=2
  { id: "d25", if: { E: "High",   R: "Medium", T: "Large" },  then: { A: "Small" } },      // s=1
  { id: "d26", if: { E: "High",   R: "High",   T: "Medium" }, then: { A: "Large" } },      // s=3
  { id: "d27", if: { E: "High",   R: "High",   T: "Large" },  then: { A: "Medium" } },     // s=2
];

export const aggregationSystem: FuzzySystem = {
  id: "aggregation",
  nameKey: `${ns}.name`,
  descriptionKey: `${ns}.description`,
  defuzz: "weighted-average",
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
