import type { ChannelParams } from "./channel";
import type { Layout } from "./layout";
import { measuredLinks, type LinkSource } from "./links";
import type { Telemetry } from "./telemetry";
import type { Scenario } from "./types";

/**
 * A testbed experiment: the measured layout and the capture taken on it,
 * joined into the scenario and the link source the controllers run on.
 */
export interface Experiment {
  readonly scenario: Scenario;
  readonly links: LinkSource;
  /** Nodes whose traffic the layout sets; the rest run on the default. */
  readonly datFromLayout: ReadonlySet<number>;
  /** Layout nodes the station never heard: they sit this round out. */
  readonly missingInCapture: readonly number[];
  /** Capture nodes the layout does not place. */
  readonly missingInLayout: readonly number[];
}

/**
 * Only boards that are both placed and heard take part: energy comes from the
 * capture and position from the layout, and a node lacking either has nothing
 * honest to stand in for it. The seed only keys the fallback model's
 * shadowing, which the measured source switches off, so it is fixed.
 */
export function buildExperiment(
  layout: Layout,
  telemetry: Telemetry,
  datDefault: number,
  channel: ChannelParams,
): Experiment {
  const heard = new Map(telemetry.nodes.map((n) => [n.nodeId, n]));
  const placed = new Set(layout.nodes.map((n) => n.id));
  const nodes = layout.nodes
    .filter((n) => heard.has(n.id))
    .map((n) => ({ id: n.id, x: n.x, y: n.y, re: heard.get(n.id)!.re, dat: n.dat ?? datDefault }));
  const scenario: Scenario = { field: layout.field, base: layout.base, seed: 0, nodes };
  return {
    scenario,
    links: measuredLinks(scenario, telemetry, channel),
    datFromLayout: new Set(layout.nodes.filter((n) => n.dat !== null).map((n) => n.id)),
    missingInCapture: layout.nodes.filter((n) => !heard.has(n.id)).map((n) => n.id),
    missingInLayout: telemetry.nodes.map((n) => n.nodeId).filter((id) => !placed.has(id)),
  };
}
