import type { FuzzyEngine } from "../fuzzy/engine";
import type { FuzzySystem, FuzzyVariable } from "../fuzzy/types";
import { defaultChannel, expendedEnergy, type ChannelParams } from "./channel";
import { modelLinks, type Link, type LinkSource } from "./links";
import { distance } from "./scenario";
import type { NodeResult, RouteHop, Scenario, SimNode, SimulationResult } from "./types";

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

function clampTo(v: FuzzyVariable, value: number): number {
  return Math.max(v.range[0], Math.min(v.range[1], value));
}

/** An input variable of a controller, by id; throws on a wrong wiring. */
export function inputVar(system: FuzzySystem, id: string): FuzzyVariable {
  const v = system.inputs.find((x) => x.id === id);
  if (!v) throw new Error(`Controller ${system.id} has no input ${id}`);
  return v;
}

/**
 * `links` decides where link quality, delivery and delay come from; by default
 * the channel model on the virtual topology. Distances, Dis and EE always come
 * from the coordinates.
 */
export function runSimulation(
  scenario: Scenario,
  engines: SimEngines,
  channel: ChannelParams = defaultChannel,
  links: LinkSource = modelLinks(scenario, channel),
): SimulationResult {
  const { nodes, base } = scenario;
  const fieldDiag = Math.SQRT2 * scenario.field;

  // --- Clustering: score every node's own link to the base station. ---------
  const tdVar = inputVar(engines.clustering.system, "TD");
  // The traffic share of the delay model is relative to the Dat domain's top.
  const datFull = inputVar(engines.aggregation.system, "Dat").range[1];
  const baseLinks = new Map<number, Link>();
  const chsById = new Map<number, number | null>();
  const tdById = new Map<number, number>();
  const tdMeasured = new Set<number>();

  for (const node of nodes) {
    const l = links.link(node, "base");
    baseLinks.set(node.id, l);
    const delay = links.baseDelay(node, l, node.dat / datFull);
    const td = clampTo(tdVar, delay.value);
    tdById.set(node.id, td);
    if (delay.measured) tdMeasured.add(node.id);
    const ev = engines.clustering.evaluate({ En: node.re, PDR: l.pdr, TD: td });
    chsById.set(node.id, ev.fired ? ev.output : null);
  }

  // CHS ties are common: a dominant rule clips every such node at the same
  // level. As for the aggregator below, the node with more residual energy
  // takes the role; a remaining tie goes to the lower id.
  let head: SimNode | null = null;
  let bestChs = -Infinity;
  for (const node of nodes) {
    const chs = chsById.get(node.id);
    if (chs === null || chs === undefined) continue;
    if (chs > bestChs || (chs === bestChs && node.re > head!.re)) {
      head = node;
      bestChs = chs;
    }
  }
  const headId = head?.id ?? null;

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
  const routeLinks: Link[] = [];
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
      const directLink = links.link(current, "base");
      let best: { to: SimNode | null; rs: number; link: Link } | null = null;

      const direct = hopScore(1, directLink);
      if (direct !== null) best = { to: null, rs: direct, link: directLink };
      for (const node of nodes) {
        if (node.id === current.id || node.id === aggregatorId || visited.has(node.id)) continue;
        if (distance(node, base) >= currentToBase) continue;
        const l = links.link(current, node);
        const rs = hopScore(node.re, l);
        if (rs !== null && (!best || rs > best.rs)) best = { to: node, rs, link: l };
      }

      // Nothing fired for any candidate: fall back to the direct link so the
      // route still reaches the station instead of ending mid-air.
      const hop: RouteHop = best
        ? { from: current.id, to: best.to?.id ?? null, rs: best.rs }
        : { from: current.id, to: null, rs: null };
      route.push(hop);
      routeLinks.push(best?.link ?? directLink);
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
      measured: { link: l.measured, td: tdMeasured.has(node.id) },
    };
  });

  return { nodes: results, headId, aggregatorId, route, routeLinks };
}
