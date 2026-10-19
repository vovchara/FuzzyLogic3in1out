import { describe, expect, it } from "vitest";
import { createEngine } from "../src/fuzzy/engine";
import { aggregationSystem } from "../src/fuzzy/systems/aggregation";
import { commCtrlSystem } from "../src/fuzzy/systems/commCtrl";
import { routingSystem } from "../src/fuzzy/systems/routing";
import {
  defaultChannel,
  delayMs,
  expendedEnergy,
  linkNoise,
  linkRssi,
  lqFromRssi,
  pdrFromRssi,
} from "../src/simulation/channel";
import { runSimulation, type SimEngines } from "../src/simulation/orchestrator";
import {
  FIELD_SIZE,
  distance,
  generateScenario,
  moveBase,
  moveNode,
  parseScenario,
  updateNode,
} from "../src/simulation/scenario";
import type { FuzzyEngine } from "../src/fuzzy/engine";
import type { FuzzySystem } from "../src/fuzzy/types";
import type { Scenario, SimNode } from "../src/simulation/types";

function engines(): SimEngines {
  return {
    clustering: createEngine(commCtrlSystem),
    aggregation: createEngine(aggregationSystem),
    routing: createEngine(routingSystem),
  };
}

function scenarioOf(nodes: SimNode[], base = { x: 50, y: 50 }, seed = 7): Scenario {
  return { field: FIELD_SIZE, base, seed, nodes };
}

/**
 * A controller stub: real variable ids and ranges (the orchestrator clamps
 * against them), but a hand-written response. `null` means "no rule fired".
 * This is what lets the election and routing logic be tested deterministically
 * instead of hoping a generated field makes the real engines behave.
 */
type StubFn = (inputs: Record<string, number>) => number | null;

function stubEngine(inputs: readonly { id: string; range: [number, number] }[], fn: StubFn): FuzzyEngine {
  const system = {
    id: "stub",
    nameKey: "",
    descriptionKey: "",
    defuzz: "centroid",
    inputs: inputs.map((v) => ({ id: v.id, nameKey: "", range: v.range, defaultValue: 0, terms: [] })),
    output: { id: "out", nameKey: "", range: [0, 100], defaultValue: 0, terms: [] },
    rules: [],
  } as unknown as FuzzySystem;
  const run = (i: Readonly<Record<string, number>>) => {
    const v = fn(i as Record<string, number>);
    return { output: v ?? 0, fired: v !== null, memberships: {}, mostActiveTerm: "" };
  };
  return { system, evaluate: run, crisp: (i) => run(i).output } as FuzzyEngine;
}

function stubEngines(spec: { chs?: StubFn; ap?: StubFn; rs?: StubFn } = {}): SimEngines {
  return {
    clustering: stubEngine(
      [{ id: "En", range: [0, 1] }, { id: "PDR", range: [0, 1] }, { id: "TD", range: [0, 50] }],
      spec.chs ?? ((i) => i.En * 100),
    ),
    aggregation: stubEngine(
      [{ id: "EE", range: [0, 45] }, { id: "Dis", range: [0, 214] }, { id: "Dat", range: [0, 240] }],
      spec.ap ?? (() => null),
    ),
    routing: stubEngine(
      [{ id: "RE", range: [0, 1] }, { id: "Dist", range: [0, 100] }, { id: "LQ", range: [0, 1] }],
      spec.rs ?? ((i) => 100 - i.Dist),
    ),
  };
}

/** Three nodes on the diagonal, head in the far corner: multi-hop by design. */
function chainScenario(): Scenario {
  return scenarioOf(
    [
      { id: 1, x: 95, y: 95, re: 1, dat: 20 },
      { id: 2, x: 65, y: 65, re: 0.2, dat: 20 },
      { id: 3, x: 35, y: 35, re: 0.2, dat: 20 },
    ],
    { x: 5, y: 5 },
  );
}

describe("channel model", () => {
  it("degrades monotonically with distance", () => {
    let prevLq = Infinity;
    let prevPdr = Infinity;
    for (const d of [1, 5, 10, 25, 50, 100, 141]) {
      const rssi = linkRssi(d, defaultChannel);
      const lq = lqFromRssi(rssi, defaultChannel);
      const pdr = pdrFromRssi(rssi, defaultChannel);
      expect(lq).toBeLessThanOrEqual(prevLq);
      expect(pdr).toBeLessThanOrEqual(prevPdr);
      expect(lq).toBeGreaterThanOrEqual(0);
      expect(lq).toBeLessThanOrEqual(1);
      expect(pdr).toBeGreaterThan(0);
      expect(pdr).toBeLessThan(1);
      prevLq = lq;
      prevPdr = pdr;
    }
  });

  it("spans the whole LQ scale across the field", () => {
    const near = lqFromRssi(linkRssi(5, defaultChannel), defaultChannel);
    const far = lqFromRssi(linkRssi(140, defaultChannel), defaultChannel);
    expect(near).toBeGreaterThan(0.7);
    expect(far).toBeLessThan(0.25);
  });

  it("delay grows with retransmissions and traffic, capped at the domain", () => {
    const quiet = delayMs(1, 0, defaultChannel);
    const busy = delayMs(1, 1, defaultChannel);
    const lossy = delayMs(0.3, 1, defaultChannel);
    expect(busy).toBeGreaterThan(quiet);
    expect(lossy).toBeGreaterThan(busy);
    expect(delayMs(0.02, 1, defaultChannel)).toBe(defaultChannel.delayMaxMs);
  });

  it("link noise is deterministic and symmetric in the endpoints", () => {
    expect(linkNoise(42, 0, 3)).toBe(linkNoise(42, 3, 0));
    expect(linkNoise(42, 1, 2)).toBe(linkNoise(42, 1, 2));
    expect(linkNoise(42, 1, 2)).not.toBe(linkNoise(43, 1, 2));
  });

  it("expended energy grows with traffic and distance", () => {
    const diag = Math.SQRT2 * FIELD_SIZE;
    expect(expendedEnergy(240, diag, diag)).toBeGreaterThan(expendedEnergy(240, 10, diag));
    expect(expendedEnergy(240, 50, diag)).toBeGreaterThan(expendedEnergy(60, 50, diag));
    expect(expendedEnergy(240, diag, diag)).toBeLessThanOrEqual(45);
  });
});

describe("scenario generation", () => {
  it("is reproducible from the seed and keeps nodes on the field", () => {
    const a = generateScenario(10, 123);
    const b = generateScenario(10, 123);
    expect(a).toEqual(b);
    expect(a.nodes).toHaveLength(10);
    for (const n of a.nodes) {
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.x).toBeLessThanOrEqual(FIELD_SIZE);
      expect(n.y).toBeGreaterThanOrEqual(0);
      expect(n.y).toBeLessThanOrEqual(FIELD_SIZE);
      expect(n.re).toBeGreaterThan(0);
      expect(n.re).toBeLessThanOrEqual(1);
    }
    expect(generateScenario(10, 124)).not.toEqual(a);
  });

  it("updates a node's energy and traffic without touching the rest", () => {
    const s = generateScenario(3, 1);
    const edited = updateNode(s, 2, { re: 0.05, dat: 200 });
    expect(edited.nodes.find((n) => n.id === 2)).toMatchObject({ re: 0.05, dat: 200 });
    const untouched = edited.nodes.find((n) => n.id === 2)!;
    const original = s.nodes.find((n) => n.id === 2)!;
    expect(untouched.x).toBe(original.x);
    expect(untouched.y).toBe(original.y);
    expect(edited.nodes.find((n) => n.id === 1)).toEqual(s.nodes.find((n) => n.id === 1));
  });

  it("parses a stored scenario back equal to the generated one", () => {
    const s = generateScenario(5, 42);
    expect(parseScenario(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });

  it("rejects structurally broken stored scenarios", () => {
    const s = generateScenario(3, 1);
    expect(parseScenario(null)).toBeNull();
    expect(parseScenario({ ...s, field: 200 })).toBeNull();
    expect(parseScenario({ ...s, nodes: [] })).toBeNull();
    expect(parseScenario({ ...s, base: { x: 1, y: "a" } })).toBeNull();
    const dup = { ...s, nodes: [s.nodes[0], { ...s.nodes[1], id: s.nodes[0].id }, s.nodes[2]] };
    expect(parseScenario(dup)).toBeNull();
    const fractional = { ...s, nodes: [{ ...s.nodes[0], id: 1.5 }, s.nodes[1], s.nodes[2]] };
    expect(parseScenario(fractional)).toBeNull();
  });

  it("sorts nodes by id and clamps drifted values back into range", () => {
    const s = generateScenario(3, 1);
    const messy = {
      ...s,
      nodes: [
        { id: 3, x: 500, y: -4, re: 7, dat: 1e9 },
        { ...s.nodes[0], id: 1 },
        { ...s.nodes[1], id: 2, dat: 33.7 },
      ],
    };
    const parsed = parseScenario(messy)!;
    expect(parsed.nodes.map((n) => n.id)).toEqual([1, 2, 3]);
    expect(parsed.nodes[2]).toMatchObject({ x: FIELD_SIZE, y: 0, re: 1, dat: 240 });
    expect(parsed.nodes[1].dat).toBe(34);
  });

  it("moves clamp to the field and leave other nodes alone", () => {
    const s = generateScenario(3, 1);
    const moved = moveNode(s, 2, -10, 250);
    expect(moved.nodes.find((n) => n.id === 2)).toMatchObject({ x: 0, y: FIELD_SIZE });
    expect(moved.nodes.find((n) => n.id === 1)).toEqual(s.nodes.find((n) => n.id === 1));
    expect(moveBase(s, 500, -1).base).toEqual({ x: FIELD_SIZE, y: 0 });
  });
});

describe("orchestrator", () => {
  it("elects the strongest candidate as head and keeps roles disjoint", () => {
    // Node 1 is the obvious head: full battery right next to the station.
    const s = scenarioOf([
      { id: 1, x: 52, y: 52, re: 0.95, dat: 60 },
      { id: 2, x: 20, y: 20, re: 0.4, dat: 120 },
      { id: 3, x: 80, y: 75, re: 0.5, dat: 90 },
      { id: 4, x: 30, y: 70, re: 0.6, dat: 150 },
    ]);
    const r = runSimulation(s, engines());
    expect(r.headId).toBe(1);
    expect(r.aggregatorId).not.toBe(r.headId);
    const head = r.nodes.find((n) => n.node.id === 1)!;
    expect(head.role).toBe("head");
    expect(head.ap).toBeNull();
    for (const n of r.nodes) {
      if (n.node.id === r.headId) continue;
      expect(n.distToHead).toBeCloseTo(distance(n.node, s.nodes[0]));
    }
  });

  it("builds a multi-hop route with strictly decreasing distance to the base", () => {
    // The routing stub prefers the nearest closer-to-base candidate, so the
    // chain must pass through both intermediate nodes before the base.
    const s = chainScenario();
    const r = runSimulation(s, stubEngines());
    expect(r.headId).toBe(1);
    expect(r.route.map((h) => h.to)).toEqual([2, 3, null]);
    expect(r.route[0].from).toBe(1);
    const byId = new Map(s.nodes.map((n) => [n.id, n]));
    let at = byId.get(1)!;
    for (const hop of r.route) {
      expect(hop.from).toBe(at.id);
      expect(hop.rs).not.toBeNull();
      if (hop.to === null) break;
      const next = byId.get(hop.to)!;
      expect(distance(next, s.base)).toBeLessThan(distance(at, s.base));
      at = next;
    }
  });

  it("keeps intermediate route nodes in their cluster role", () => {
    // The thesis defines no relay role: a node the route passes through is
    // still an ordinary sensor — only the edge is drawn.
    const r = runSimulation(chainScenario(), stubEngines());
    const hopIds = r.route.filter((h) => h.to !== null).map((h) => h.to!);
    expect(hopIds).toEqual([2, 3]);
    for (const id of hopIds) {
      expect(r.nodes.find((n) => n.node.id === id)!.role).toBe("member");
    }
  });

  it("breaks an exact aggregation-priority tie by residual energy", () => {
    // The field from the user's session where this showed up: nodes 2 and 4
    // both collapse to the same rule singleton (AP 80), node 2 nearly dead.
    const s = scenarioOf([
      { id: 1, x: 58.1, y: 40.5, re: 0.81, dat: 115 },
      { id: 2, x: 72.7, y: 89.0, re: 0.01, dat: 39 },
      { id: 3, x: 70.6, y: 60.5, re: 0.73, dat: 80 },
      { id: 4, x: 7.3, y: 34.1, re: 0.4, dat: 77 },
    ]);
    const r = runSimulation(s, engines());
    const ap = (id: number) => r.nodes.find((n) => n.node.id === id)!.ap;
    expect(r.headId).toBe(1);
    expect(ap(2)).toBe(ap(4));
    expect(r.aggregatorId).toBe(4);
  });

  it("never routes through the aggregator", () => {
    // Node 2 is both the best relay (nearest to the head, closer to the base)
    // and the aggregator; the route must go around it via node 3.
    const s = chainScenario();
    const r = runSimulation(s, stubEngines({ ap: (i) => (i.Dat === 20 && i.Dis < 50 ? 80 : null) }));
    expect(r.headId).toBe(1);
    expect(r.aggregatorId).toBe(2);
    expect(distance(s.nodes[1], s.base)).toBeLessThan(distance(s.nodes[0], s.base));
    expect(r.route.map((h) => h.to)).toEqual([3, null]);
  });

  it("elects nothing and routes nowhere when clustering stays silent", () => {
    const r = runSimulation(chainScenario(), stubEngines({ chs: () => null }));
    expect(r.headId).toBeNull();
    expect(r.aggregatorId).toBeNull();
    expect(r.route).toEqual([]);
    for (const n of r.nodes) {
      expect(n.role).toBe("member");
      expect(n.chs).toBeNull();
      expect(n.ap).toBeNull();
      expect(n.distToHead).toBeNull();
    }
  });

  it("runs the round without an aggregator when no aggregation rule fires", () => {
    const r = runSimulation(chainScenario(), stubEngines({ ap: () => null }));
    expect(r.headId).toBe(1);
    expect(r.aggregatorId).toBeNull();
    for (const n of r.nodes) expect(n.ap).toBeNull();
    expect(r.route[r.route.length - 1].to).toBeNull();
  });

  it("falls back to a direct scoreless hop when routing never fires", () => {
    const r = runSimulation(chainScenario(), stubEngines({ rs: () => null }));
    expect(r.route).toEqual([{ from: 1, to: null, rs: null }]);
  });

  it("breaks a remaining tie (equal AP and RE) by the lower id", () => {
    const r = runSimulation(
      scenarioOf(
        [
          { id: 1, x: 90, y: 90, re: 0.9, dat: 20 },
          { id: 2, x: 60, y: 60, re: 0.5, dat: 20 },
          { id: 3, x: 30, y: 30, re: 0.5, dat: 20 },
        ],
        { x: 5, y: 5 },
      ),
      stubEngines({ ap: () => 80 }),
    );
    expect(r.headId).toBe(1);
    expect(r.aggregatorId).toBe(2);
  });

  it("clamps controller inputs to their declared domains", () => {
    // Head-to-base distance is ~127 m, above routing's Dist range; the far
    // lossy node's raw delay is far above TD's 50 ms ceiling.
    const seenDist: number[] = [];
    const seenTd: number[] = [];
    const s = scenarioOf(
      [{ id: 1, x: 95, y: 95, re: 1, dat: 240 }],
      { x: 5, y: 5 },
    );
    runSimulation(
      s,
      stubEngines({
        chs: (i) => {
          seenTd.push(i.TD);
          return 50;
        },
        rs: (i) => {
          seenDist.push(i.Dist);
          return 50;
        },
      }),
    );
    expect(distance(s.nodes[0], s.base)).toBeGreaterThan(100);
    expect(Math.max(...seenDist)).toBe(100);
    expect(Math.max(...seenTd)).toBeLessThanOrEqual(50);
  });

  it("survives a degenerate scenario without nodes", () => {
    const r = runSimulation(scenarioOf([]), engines());
    expect(r.headId).toBeNull();
    expect(r.aggregatorId).toBeNull();
    expect(r.route).toEqual([]);
    expect(r.nodes).toEqual([]);
  });

  it("is deterministic for the same scenario", () => {
    const s = generateScenario(8, 99);
    const e = engines();
    expect(runSimulation(s, e)).toEqual(runSimulation(s, e));
  });
});
