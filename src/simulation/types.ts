import type { Link } from "./links";

/**
 * The three controllers chained on one sensor field, in two modes. The
 * simulation is fully virtual: every position-dependent quantity (distance,
 * link quality, delivery, delay) is derived from the virtual topology through
 * the channel model. The experiment runs the same chain on a measured layout:
 * links, delivery and delay come from the testbed, distances from the layout.
 */

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface SimNode extends Point {
  /** 1-based; matches `node_id` in the testbed CSV once telemetry is wired in. */
  readonly id: number;
  /** Residual energy in [0, 1]: scenario-generated now, measured voltage later. */
  readonly re: number;
  /** Packets per round on the aggregation controller's Dat domain. */
  readonly dat: number;
}

export interface Scenario {
  /** Side of the square field, metres. */
  readonly field: number;
  readonly base: Point;
  /** Drives node generation and the per-link channel noise. */
  readonly seed: number;
  readonly nodes: readonly SimNode[];
}

export type NodeRole = "head" | "aggregator" | "member";

export interface NodeResult {
  readonly node: SimNode;
  readonly distToBase: number;
  /** Channel of the node's own link to the base station. */
  readonly lq: number;
  readonly pdr: number;
  readonly td: number;
  /** Cluster-head suitability; null when no clustering rule fired. */
  readonly chs: number | null;
  readonly distToHead: number | null;
  /** Expended energy on the aggregation controller's EE domain. */
  readonly ee: number | null;
  /** Aggregation priority; null for the head and when no rule fired. */
  readonly ap: number | null;
  readonly role: NodeRole;
  /** Which of the node's inputs came from the testbed rather than the model. */
  readonly measured: { readonly link: boolean; readonly td: boolean };
}

/** One hop of the route from the cluster head; `to` is null at the base station. */
export interface RouteHop {
  readonly from: number;
  readonly to: number | null;
  /**
   * The routing controller's score that won this hop; null on the fallback
   * hop taken when no rule fired for any candidate.
   */
  readonly rs: number | null;
}

export interface SimulationResult {
  readonly nodes: readonly NodeResult[];
  readonly headId: number | null;
  readonly aggregatorId: number | null;
  readonly route: readonly RouteHop[];
  /** The link each hop of `route` travels on, index for index. */
  readonly routeLinks: readonly Link[];
}
