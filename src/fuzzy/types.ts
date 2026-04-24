export type MembershipShape =
  | { readonly kind: "trapezoid"; readonly points: readonly [number, number, number, number] }
  | { readonly kind: "triangle"; readonly points: readonly [number, number, number] }
  | { readonly kind: "gaussian"; readonly bias: number; readonly sigma: number }
  | { readonly kind: "singleton"; readonly at: number };

export type DefuzzMethod = "centroid" | "bisector" | "weighted-average";

export interface FuzzyTerm {
  readonly id: string;
  readonly nameKey: string;
  readonly shape: MembershipShape;
  readonly color: string;
  readonly latex?: string;
}

export interface FuzzyVariable {
  readonly id: string;
  readonly nameKey: string;
  readonly unitKey?: string;
  readonly range: readonly [number, number];
  readonly defaultValue: number;
  readonly keyPoints?: readonly number[];
  readonly terms: readonly FuzzyTerm[];
}

export interface FuzzyRule {
  readonly id: string;
  readonly if: Readonly<Record<string, string>>;
  readonly then: Readonly<Record<string, string>>;
  readonly descriptionKey?: string;
}

export interface FuzzySystem {
  readonly id: string;
  readonly nameKey: string;
  readonly descriptionKey: string;
  readonly defuzz: DefuzzMethod;
  readonly inputs: readonly FuzzyVariable[];
  readonly output: FuzzyVariable;
  readonly rules: readonly FuzzyRule[];
}

export interface FuzzyEvaluation {
  readonly output: number;
  readonly memberships: Readonly<Record<string, Readonly<Record<string, number>>>>;
  readonly mostActiveTerm: string;
  readonly outputTermActivations?: Readonly<Record<string, number>>;
}
