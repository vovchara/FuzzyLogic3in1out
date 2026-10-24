import { describe, expect, it } from "vitest";
import { createEngine } from "../src/fuzzy/engine";
import { aggregationSystem } from "../src/fuzzy/systems/aggregation";
import { commCtrlSystem } from "../src/fuzzy/systems/commCtrl";
import { routingSystem } from "../src/fuzzy/systems/routing";
import { defaultChannel, delayMs, linkRssi, lqFromRssi, pdrFromRssi } from "../src/simulation/channel";
import { demoExperiment } from "../src/simulation/demo";
import { buildExperiment } from "../src/simulation/experiment";
import { parseLayout, type Layout } from "../src/simulation/layout";
import { modelLinks } from "../src/simulation/links";
import { runSimulation, type SimEngines } from "../src/simulation/orchestrator";
import { distance, generateScenario } from "../src/simulation/scenario";
import {
  NEIGHBOR_HEADER,
  RTT_HEADER,
  TELEMETRY_HEADER,
  parseTelemetry,
} from "../src/simulation/telemetry";

function engines(): SimEngines {
  return {
    clustering: createEngine(commCtrlSystem),
    aggregation: createEngine(aggregationSystem),
    routing: createEngine(routingSystem),
  };
}

const DAT_FULL = 240;
const DAT_DEFAULT = 120;

/** A v2 capture: node 2 reports hearing node 1 in three reports. */
const V2 = `${TELEMETRY_HEADER}
${NEIGHBOR_HEADER}
${RTT_HEADER}
1,10,8.0,-60,2000,900000
2,20,7.0,-70,4000,900010
nb,2,20,1,5,6,10,-300,18010
1,11,8.0,-61,2200,900200
2,21,7.0,-70,4200,900210
nb,2,21,1,6,6,11,-362,21854
2,23,7.0,-70,4600,900610
nb,2,23,1,9,6,15,-542,32654
rtt,1,1,4000
rtt,2,1,9000
rtt,1,2,6000
rtt,1,4,5000
`;

describe("telemetry parser, protocol v2", () => {
  it("keeps the main rows exactly as v1 parses them", () => {
    const t = parseTelemetry(V2);
    expect(t.errors).toEqual([]);
    expect(t.neighborReports).toBe(true);
    expect(t.nodes.map((n) => [n.nodeId, n.packets])).toEqual([
      [1, 2],
      [2, 3],
    ]);
    expect(t.nodes[0].rssiMean).toBeCloseTo(-60.5);
  });

  it("derives a neighbor link from the change between the first and last report", () => {
    const link = parseTelemetry(V2).links.find((l) => l.from === 1 && l.to === 2)!;
    // Reports at 5/10 and 9/15: 4 heard of 5 sent; RSSI −60 each, 4 times.
    expect(link.heard).toBe(4);
    expect(link.pdr).toBeCloseTo(4 / 5);
    expect(link.rssiMean).toBeCloseTo((-542 + 300) / 4);
    expect(link.noiseSigmaDb).not.toBeNull();
  });

  it("measures PDR 0 for a neighbor on the air the reporter never mentions", () => {
    // Node 1 sent two reports, both without node 2: it never heard it.
    const link = parseTelemetry(V2).links.find((l) => l.from === 2 && l.to === 1)!;
    expect(link).toEqual({ from: 2, to: 1, pdr: 0, rssiMean: null, noiseSigmaDb: null, heard: 0 });
  });

  it("leaves a link unmeasured on a single report, and v1 captures without links", () => {
    const single = parseTelemetry(
      `${NEIGHBOR_HEADER}\n1,1,8,-60,0,0\n2,1,8,-60,0,0\nnb,2,1,1,1,1,1,-60,3600\n2,2,8,-60,0,0`,
    );
    expect(single.links.find((l) => l.from === 1 && l.to === 2)).toBeUndefined();
    // Node 1 has a single packet at the station: its silence spans nothing.
    expect(single.links.find((l) => l.from === 2 && l.to === 1)).toBeUndefined();

    const v1 = parseTelemetry("1,1,8,-60,0,0\n1,2,8,-60,0,0\n2,1,8,-60,0,0\n2,2,8,-60,0,0");
    expect(v1.neighborReports).toBe(false);
    expect(v1.links).toEqual([]);
    expect(v1.rtt).toEqual([]);
  });

  it("sums over segments when the reporter reboots", () => {
    const t = parseTelemetry(`${NEIGHBOR_HEADER}
nb,2,50,1,10,1,10,-600,36000
nb,2,60,1,18,1,20,-1080,64800
nb,2,1,1,0,25,25,0,0
nb,2,1,1,1,25,25,-60,3600
nb,2,9,1,8,25,34,-480,28800`);
    const link = t.links[0];
    // Before: 8 of 10. After the reboot the counters restart: 8 of 9 (the
    // report pair 1/25 → 8/34). The reboot itself is not a loss.
    expect(link.heard).toBe(16);
    expect(link.pdr).toBeCloseTo(16 / 19);
    expect(link.rssiMean).toBeCloseTo(-60);
    expect(link.noiseSigmaDb).toBeCloseTo(0);
  });

  it("sums over segments when the neighbor reboots", () => {
    const t = parseTelemetry(`${NEIGHBOR_HEADER}
nb,2,50,1,10,1,40,-600,36000
nb,2,60,1,20,1,50,-1200,72000
nb,2,61,1,21,1,2,-1260,75600
nb,2,70,1,29,1,10,-1740,104400`);
    // 10 of 10, then 8 of 8 after the neighbor's seq restarted.
    expect(t.links[0].pdr).toBe(1);
    expect(t.links[0].heard).toBe(18);
  });

  it("is not fooled by replayed lines from the CP2102 glitch", () => {
    const clean = parseTelemetry(V2);
    const replayed = V2.split("\n");
    // The bridge repeats a chunk of already printed lines mid-stream.
    replayed.splice(9, 0, ...replayed.slice(3, 9));
    const t = parseTelemetry(replayed.join("\n"));
    expect(t.errors).toEqual([]);
    expect(t.links).toEqual(clean.links);
    expect(t.rtt).toEqual(clean.rtt);
  });

  it("times the echo ping: median RTT, losses by ping-number holes", () => {
    const t = parseTelemetry(V2);
    const node1 = t.rtt.find((r) => r.nodeId === 1)!;
    expect(node1.samples).toBe(3);
    expect(node1.lost).toBe(1);
    expect(node1.medianRttUs).toBe(5000);
    expect(node1.tdMs).toBeCloseTo(2.5);

    // The station rebooted: ping numbers restart, a new segment, no loss.
    const reboot = parseTelemetry("rtt,1,1,100\nrtt,1,2,100\nrtt,1,1,300\nrtt,1,2,300\nrtt,1,2,300");
    expect(reboot.rtt[0].samples).toBe(4);
    expect(reboot.rtt[0].lost).toBe(0);
  });

  it("names broken tagged rows by line", () => {
    const t = parseTelemetry("nb,2,1,1\nrtt,1,x,100\nrtt,0,1,100\nnb,2,1,1,1,1,1,-60.5,3600");
    expect(t.errors).toEqual([
      { line: 1, reason: "columns" },
      { line: 2, reason: "value" },
      { line: 3, reason: "value" },
      { line: 4, reason: "value" },
    ]);
  });

  it("rejects a report whose rssi_sq_sum was cut short mid-number", () => {
    // Two packets at −60: Σx = −120, Σx² = 7200; the capture stopped at "72".
    const t = parseTelemetry("nb,2,5,1,2,1,2,-120,7200\nnb,2,6,1,2,1,2,-120,72");
    expect(t.errors).toEqual([{ line: 2, reason: "value" }]);
  });
});

const LAYOUT = {
  name: "Паркінг, розстановка А",
  date: "2026-10-24",
  field: 50,
  base: { x: 0, y: 0 },
  orientation: "лицем до БС",
  nodes: [
    { id: 2, x: 25, y: 30 },
    { id: 1, x: 10, y: 5, dat: 10 },
  ],
  notes: "",
};

describe("layout file", () => {
  it("parses a layout, sorts the nodes and leaves an absent dat unset", () => {
    const p = parseLayout(JSON.stringify(LAYOUT));
    expect(p.errors).toEqual([]);
    expect(p.layout!.field).toBe(50);
    expect(p.layout!.orientation).toBe("лицем до БС");
    expect(p.layout!.nodes).toEqual([
      { id: 1, x: 10, y: 5, dat: 10 },
      { id: 2, x: 25, y: 30, dat: null },
    ]);
  });

  it("defaults the field to 100 and the free texts to empty", () => {
    const p = parseLayout(JSON.stringify({ base: { x: 0, y: 0 }, nodes: [{ id: 1, x: 90, y: 90 }] }));
    expect(p.layout!.field).toBe(100);
    expect(p.layout!.name).toBe("");
  });

  it("names every problem by field instead of stopping at the first", () => {
    const p = parseLayout(
      JSON.stringify({
        field: 50,
        name: 5,
        base: { x: 0 },
        nodes: [
          { id: 1, x: 60, y: 5 },
          { id: 1, x: 10, y: 5 },
          { id: 2.5, x: 1, y: 1, dat: "x" },
          { id: 3, x: 1, y: 1, dat: 999 },
        ],
      }),
      { datMax: 240 },
    );
    expect(p.layout).toBeNull();
    expect(p.errors).toEqual([
      { path: "name", reason: "type" },
      { path: "base.y", reason: "required" },
      { path: "nodes[0].x", reason: "range", nodeId: 1 },
      { path: "nodes[1].id", reason: "duplicate", nodeId: 1 },
      { path: "nodes[2].id", reason: "type" },
      { path: "nodes[2].dat", reason: "type" },
      { path: "nodes[3].dat", reason: "range", nodeId: 3 },
    ]);
  });

  it("rejects what is not a layout at all", () => {
    expect(parseLayout("{").errors).toEqual([{ path: "", reason: "json" }]);
    expect(parseLayout("[]").errors).toEqual([{ path: "", reason: "json" }]);
    expect(parseLayout(JSON.stringify({ base: { x: 0, y: 0 }, nodes: [] })).errors).toEqual([
      { path: "nodes", reason: "empty" },
    ]);
  });
});

describe("link sources", () => {
  it("the model source is the channel model, never measured", () => {
    const s = generateScenario(4, 3);
    const links = modelLinks(s, defaultChannel);
    const l = links.link(s.nodes[0], "base");
    expect(l.measured).toBe(false);
    expect(l.dist).toBeCloseTo(distance(s.nodes[0], s.base));
    expect(links.baseDelay(s.nodes[0], l, 0.5)).toEqual({
      value: delayMs(l.pdr, 0.5, defaultChannel),
      measured: false,
    });
  });

  it("the measured source reads links in the receiver's direction", () => {
    const layout = parseLayout(JSON.stringify(LAYOUT)).layout as Layout;
    const t = parseTelemetry(V2);
    const exp = buildExperiment(layout, t, DAT_DEFAULT, defaultChannel);
    const [n1, n2] = exp.scenario.nodes;
    // 1 → 2: node 2 heard node 1, a measured 0.8.
    const hop = exp.links.link(n1, n2);
    expect(hop.measured).toBe(true);
    expect(hop.pdr).toBeCloseTo(0.8);
    expect(hop.lq).toBeCloseTo(lqFromRssi(-60.5, defaultChannel));
    expect(hop.dist).toBeCloseTo(distance(n1, n2));
    // 2 → 1: node 1 never heard node 2, a measured zero with no RSSI.
    expect(exp.links.link(n2, n1)).toMatchObject({ pdr: 0, lq: 0, measured: true });

    const base = exp.links.link(n1, "base");
    expect(base).toMatchObject({ pdr: 1, measured: true });
    expect(exp.links.baseDelay(n1, base, 0.1)).toEqual({ value: 2.5, measured: true });
  });

  it("falls back to the unshadowed model where nothing was measured", () => {
    const layout = parseLayout(JSON.stringify(LAYOUT)).layout as Layout;
    // A v1 capture: no neighbor reports, no pings.
    const t = parseTelemetry("1,1,8,-60,0,0\n1,2,8,-60,0,0\n2,1,8,-70,0,0\n2,2,8,-70,0,0");
    const exp = buildExperiment(layout, t, DAT_DEFAULT, defaultChannel);
    const [n1, n2] = exp.scenario.nodes;
    const hop = exp.links.link(n1, n2);
    const rssi = linkRssi(distance(n1, n2), defaultChannel);
    expect(hop).toEqual({
      dist: distance(n1, n2),
      lq: lqFromRssi(rssi, defaultChannel),
      pdr: pdrFromRssi(rssi, defaultChannel),
      measured: false,
    });
    const base = exp.links.link(n2, "base");
    expect(exp.links.baseDelay(n2, base, 0.5)).toEqual({
      value: delayMs(base.pdr, 0.5, defaultChannel),
      measured: false,
    });
  });
});

describe("experiment", () => {
  it("joins layout and capture: placed and heard nodes only, the rest reported", () => {
    const layout = parseLayout(
      JSON.stringify({ ...LAYOUT, nodes: [...LAYOUT.nodes, { id: 3, x: 1, y: 1 }] }),
    ).layout as Layout;
    const t = parseTelemetry(`${V2}9,1,8,-60,0,0\n`);
    const exp = buildExperiment(layout, t, DAT_DEFAULT, defaultChannel);
    expect(exp.scenario.nodes.map((n) => n.id)).toEqual([1, 2]);
    expect(exp.scenario.field).toBe(50);
    expect(exp.missingInCapture).toEqual([3]);
    expect(exp.missingInLayout).toEqual([9]);
    expect([...exp.datFromLayout]).toEqual([1]);
    expect(exp.scenario.nodes.map((n) => n.dat)).toEqual([10, DAT_DEFAULT]);
    expect(exp.scenario.nodes[0].re).toBe(t.nodes[0].re);
  });

  it("the demo pair parses cleanly, agrees with itself and runs a full round", () => {
    const demo = demoExperiment(DAT_FULL, DAT_DEFAULT);
    expect(demo).toEqual(demoExperiment(DAT_FULL, DAT_DEFAULT));
    const layout = parseLayout(demo.layoutJson, { datMax: DAT_FULL });
    expect(layout.errors).toEqual([]);
    const t = parseTelemetry(demo.csv);
    expect(t.errors).toEqual([]);

    const exp = buildExperiment(layout.layout!, t, DAT_DEFAULT, defaultChannel);
    expect(exp.missingInCapture).toEqual([]);
    expect(exp.missingInLayout).toEqual([]);
    // Every directed node pair is measured, and every node is pinged.
    const n = exp.scenario.nodes.length;
    expect(t.links).toHaveLength(n * (n - 1));
    expect(t.rtt.map((r) => r.nodeId)).toEqual(exp.scenario.nodes.map((x) => x.id));
    // The reboot halfway did not read as a burst of losses.
    for (const l of t.links) expect(l.pdr).toBeGreaterThan(0.2);

    const r = runSimulation(exp.scenario, engines(), defaultChannel, exp.links);
    expect(r.headId).not.toBeNull();
    // The head sends straight to the station: a demo relaying through a
    // plain sensor would invite questions the sample is not there to answer.
    expect(r.route).toEqual([{ from: r.headId, to: null, rs: expect.any(Number) }]);
    expect(r.nodes.every((x) => x.measured.link && x.measured.td)).toBe(true);
    expect(r.routeLinks.every((l) => l.measured)).toBe(true);
  });
});

describe("telemetry parser, reboots on the main rows", () => {
  it("a node reboot starts a new segment: no loss, no merged numbers", () => {
    const t = parseTelemetry("1,1,8,-60,1,0\n1,2,8,-60,2,1\n1,3,8,-60,3,2\n1,1,8,-60,1,3\n1,3,8,-60,3,4");
    // 3 of 3, then 2 of 3 after the reboot.
    expect(t.nodes[0].packets).toBe(5);
    expect(t.nodes[0].pdr).toBeCloseTo(5 / 6);
  });
});
