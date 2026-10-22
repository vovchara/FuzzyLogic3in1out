import type { FuzzyEngine } from "../fuzzy/engine";
import type { FuzzySystem, FuzzyVariable } from "../fuzzy/types";
import {
  defaultChannel,
  delayMs,
  expendedEnergy,
  linkNoise,
  linkRssi,
  lqFromRssi,
  pdrFromRssi,
  type ChannelParams,
} from "./channel";
import { distance } from "./scenario";
import type { NodeResult, Point, RouteHop, Scenario, SimNode, SimulationResult } from "./types";

/**
 * The three controllers as the simulation chains them: clustering elects the
 * head, aggregation picks the aggregator among the remaining nodes (its Dis
 * and EE inputs depend on the elected head), routing builds the head's route
 * to the base station hop by hop.
 */
export interface SimEngines {
  readonly clustering: FuzzyEngine;
  readonly aggregation: FuzzyEngine;
  readonly routing: FuzzyEngine;
}

/** The base station's id in link-noise keys; node ids are 1-based. */
const BASE_ID = 0;

interface Link {
  readonly dist: number;
  readonly lq: number;
  readonly pdr: number;
}

function clampTo(v: FuzzyVariable, value: number): number {
  return Math.max(v.range[0], Math.min(v.range[1], value));
}

/** An input variable of a controller, by id; throws on a wrong wiring. */
export function inputVar(system: FuzzySystem, id: string): FuzzyVariable {
  const v = system.inputs.find((x) => x.id === id);
  if (!v) throw new Error(`Controller ${system.id} has no input ${id}`);
  return v;
}

export function runSimulation(
  scenario: Scenario,
  engines: SimEngines,
  channel: ChannelParams = defaultChannel,
): SimulationResult {
  const { nodes, base, seed } = scenario;
  const fieldDiag = Math.SQRT2 * scenario.field;

  function link(from: Point, fromId: number, to: Point, toId: number): Link {
    const dist = distance(from, to);
    const rssi = linkRssi(dist, channel, linkNoise(seed, fromId, toId) * channel.noiseSigmaDb);
    return { dist, lq: lqFromRssi(rssi, channel), pdr: pdrFromRssi(rssi, channel) };
  }

  // --- Clustering: score every node's own link to the base station. ---------
  const tdVar = inputVar(engines.clustering.system, "TD");
  // The traffic share of the delay model is relative to the Dat domain's top.
  const datFull = inputVar(engines.aggregation.system, "Dat").range[1];
  const baseLinks = new Map<number, Link>();
  const chsById = new Map<number, number | null>();
  const tdById = new Map<number, number>();

  for (const node of nodes) {
    const l = link(node, node.id, base, BASE_ID);
    baseLinks.set(node.id, l);
    const td = clampTo(tdVar, delayMs(l.pdr, node.dat / datFull, channel));
    tdById.set(node.id, td);
    const ev = engines.clustering.evaluate({ En: node.re, PDR: l.pdr, TD: td });
    chsById.set(node.id, ev.fired ? ev.output : null);
  }

  let headId: number | null = null;
  for (const node of nodes) {
    const chs = chsById.get(node.id);
    if (chs === null || chs === undefined) continue;
    if (headId === null || chs > chsById.get(headId)!) headId = node.id;
  }
  const head = nodes.find((n) => n.id === headId) ?? null;

  // --- Aggregation: priority of every non-head node relative to the head. ---
  const eeVar = inputVar(engines.aggregation.system, "EE");
  const disVar = inputVar(engines.aggregation.system, "Dis");
  const datVar = inputVar(engines.aggregation.system, "Dat");
  const distToHeadById = new Map<number, number>();
  const eeById = new Map<number, number>();
  const apById = new Map<number, number | null>();

  if (head) {
    for (const node of nodes) {
      if (node.id === head.id) continue;
      const dHead = distance(node, head);
      const ee = clampTo(eeVar, expendedEnergy(node.dat, dHead, fieldDiag));
      distToHeadById.set(node.id, dHead);
      eeById.set(node.id, ee);
      const ev = engines.aggregation.evaluate({
        EE: ee,
        Dis: clampTo(disVar, dHead),
        Dat: clampTo(datVar, node.dat),
      });
      apById.set(node.id, ev.fired ? ev.output : null);
    }
  }

  // Exact AP ties are common with this sparse rule base: when one rule
  // dominates, the weighted average collapses to that rule's singleton for
  // every such node. The tie-break is a protocol decision, not a controller
  // one: among equal priorities the node with more residual energy serves,
  // since the role costs extra receptions and transmissions.
  let aggregatorId: number | null = null;
  let bestAp = -Infinity;
  let bestRe = -Infinity;
  for (const node of nodes) {
    const ap = apById.get(node.id);
    if (ap === null || ap === undefined) continue;
    if (ap > bestAp || (ap === bestAp && node.re > bestRe)) {
      aggregatorId = node.id;
      bestAp = ap;
      bestRe = node.re;
    }
  }

  // --- Routing: greedy next-hop chain from the head to the base station. ----
  // Candidates are the nodes strictly closer to the base than the current one
  // (so the chain always terminates) plus the base itself, which is scored
  // with RE = 1: the station has no energy constraint. Each hop keeps the
  // candidate the routing controller scores highest. The aggregator never
  // relays: it is already the busiest node of the round, and routing transit
  // through it would also bounce the data head → aggregator → head.
  const reVar = inputVar(engines.routing.system, "RE");
  const distVar = inputVar(engines.routing.system, "Dist");
  const route: RouteHop[] = [];
  const visited = new Set<number>();

  function hopScore(re: number, l: Link): number | null {
    const ev = engines.routing.evaluate({
      RE: clampTo(reVar, re),
      Dist: clampTo(distVar, l.dist),
      LQ: l.lq,
    });
    return ev.fired ? ev.output : null;
  }

  if (head) {
    let current: SimNode = head;
    let guard = nodes.length + 1;
    while (guard-- > 0) {
      const currentToBase = distance(current, base);
      let best: { to: SimNode | null; rs: number } | null = null;

      const direct = hopScore(1, link(current, current.id, base, BASE_ID));
      if (direct !== null) best = { to: null, rs: direct };
      for (const node of nodes) {
        if (node.id === current.id || node.id === aggregatorId || visited.has(node.id)) continue;
        if (distance(node, base) >= currentToBase) continue;
        const rs = hopScore(node.re, link(current, current.id, node, node.id));
        if (rs !== null && (!best || rs > best.rs)) best = { to: node, rs };
      }

      // Nothing fired for any candidate: fall back to the direct link so the
      // route still reaches the station instead of ending mid-air.
      const hop: RouteHop = best
        ? { from: current.id, to: best.to?.id ?? null, rs: best.rs }
        : { from: current.id, to: null, rs: null };
      route.push(hop);
      if (hop.to === null) break;
      visited.add(hop.to);
      current = nodes.find((n) => n.id === hop.to)!;
    }
  }

  // --- Compose per-node results. ---------------------------------------------
  const results: NodeResult[] = nodes.map((node) => {
    const l = baseLinks.get(node.id)!;
    const role =
      node.id === headId ? "head" : node.id === aggregatorId ? "aggregator" : "member";
    return {
      node,
      distToBase: l.dist,
      lq: l.lq,
      pdr: l.pdr,
      td: tdById.get(node.id)!,
      chs: chsById.get(node.id) ?? null,
      distToHead: distToHeadById.get(node.id) ?? null,
      ee: eeById.get(node.id) ?? null,
      ap: apById.get(node.id) ?? null,
      role,
    };
  });

  return { nodes: results, headId, aggregatorId, route };
}
