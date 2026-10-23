import { describe, expect, it } from "vitest";
import { createEngine } from "../src/fuzzy/engine";
import { aggregationSystem } from "../src/fuzzy/systems/aggregation";
import { commCtrlSystem } from "../src/fuzzy/systems/commCtrl";
import { routingSystem } from "../src/fuzzy/systems/routing";
import { defaultChannel } from "../src/simulation/channel";
import { runSimulation } from "../src/simulation/orchestrator";
import { generateScenario } from "../src/simulation/scenario";
import {
  TELEMETRY_HEADER,
  VOLTAGE_EMPTY,
  VOLTAGE_FULL,
  applyTelemetry,
  demoTelemetry,
  parseTelemetry,
  pooledNoiseSigma,
} from "../src/simulation/telemetry";

/** A clean two-node capture: node 1 fresh and stable, node 2 drained and noisy. */
const CAPTURE = `${TELEMETRY_HEADER}
2,10,6.6,-71,2000,900210
1,1,8.0,-60,200,900001
1,2,8.1,-62,400,900202
1,3,7.9,-58,600,900404
2,11,6.5,-78,2200,900412
2,13,6.7,-64,2600,900815
`;

describe("telemetry parser", () => {
  it("groups rows by node and sorts the series by id", () => {
    const t = parseTelemetry(CAPTURE);
    expect(t.errors).toEqual([]);
    expect(t.nodes.map((n) => n.nodeId)).toEqual([1, 2]);
    expect(t.nodes.map((n) => n.packets)).toEqual([3, 3]);
  });

  it("maps the median voltage linearly onto RE and saturates outside the window", () => {
    const t = parseTelemetry(CAPTURE);
    const re = (id: number) => t.nodes.find((n) => n.nodeId === id)!.re;
    expect(re(1)).toBeCloseTo((8.0 - VOLTAGE_EMPTY) / (VOLTAGE_FULL - VOLTAGE_EMPTY));
    expect(re(2)).toBeCloseTo((6.6 - VOLTAGE_EMPTY) / (VOLTAGE_FULL - VOLTAGE_EMPTY));

    const edges = parseTelemetry("1,1,9.9,-60,0,0\n2,1,4.0,-60,0,0");
    expect(edges.nodes.find((n) => n.nodeId === 1)!.re).toBe(1);
    expect(edges.nodes.find((n) => n.nodeId === 2)!.re).toBe(0);
  });

  it("the median shrugs off a single bad voltage reading", () => {
    // One 0.1 V glitch (a brown-out row) among healthy 8 V readings.
    const t = parseTelemetry("1,1,8.0,-60,0,0\n1,2,0.1,-60,0,0\n1,3,8.1,-60,0,0");
    expect(t.nodes[0].re).toBeCloseTo((8.0 - VOLTAGE_EMPTY) / (VOLTAGE_FULL - VOLTAGE_EMPTY));
  });

  it("estimates the RSSI spread per series and gives up on a single packet", () => {
    const t = parseTelemetry(CAPTURE);
    // Sample deviation of [-60, -62, -58] is exactly 2.
    expect(t.nodes.find((n) => n.nodeId === 1)!.noiseSigmaDb).toBeCloseTo(2);
    const single = parseTelemetry("1,1,8.0,-60,0,0");
    expect(single.nodes[0].noiseSigmaDb).toBeNull();
  });

  it("derives PDR from the sequence-number span and ignores duplicates", () => {
    const t = parseTelemetry(CAPTURE);
    // Node 2 received 10, 11 and 13 of the 10..13 span: one packet lost.
    expect(t.nodes.find((n) => n.nodeId === 2)!.pdr).toBeCloseTo(3 / 4);
    expect(t.nodes.find((n) => n.nodeId === 1)!.pdr).toBe(1);

    const dup = parseTelemetry("1,5,8.0,-60,0,0\n1,5,8.0,-61,0,0\n1,6,8.0,-62,0,0");
    expect(dup.nodes[0].packets).toBe(2);
    expect(dup.nodes[0].pdr).toBe(1);
  });

  it("names broken rows by 1-based line instead of repairing them", () => {
    const text = `${TELEMETRY_HEADER}
1,1,8.0,-60,200,900001
1,2,8.0,-60
1,x,8.0,-60,600,900404
1.5,4,8.0,-60,800,900605
1,,8.0,-60,1000,900806
1,5,8.1,-61,1200,901007`;
    const t = parseTelemetry(text);
    expect(t.errors).toEqual([
      { line: 3, reason: "columns" },
      { line: 4, reason: "value" },
      { line: 5, reason: "value" },
      { line: 6, reason: "value" },
    ]);
    // The healthy rows around the broken ones still make it into the series.
    expect(t.nodes).toHaveLength(1);
    expect(t.nodes[0].packets).toBe(2);
  });

  it("tolerates CRLF, blank lines and the header reprinted after a reset", () => {
    const text = `${TELEMETRY_HEADER}\r\n1,1,8.0,-60,200,900001\r\n\r\n${TELEMETRY_HEADER}\r\n1,2,8.0,-61,400,900202\r\n`;
    const t = parseTelemetry(text);
    expect(t.errors).toEqual([]);
    expect(t.nodes[0].packets).toBe(2);
  });
});

describe("telemetry overlay", () => {
  it("replaces the energy of matched nodes only and leaves the scenario intact", () => {
    const s = generateScenario(3, 1);
    const t = parseTelemetry("1,1,8.4,-60,0,0\n2,1,6.0,-70,0,0\n9,1,7.2,-65,0,0");
    const overlay = applyTelemetry(s, t);
    expect([...overlay.liveIds].sort()).toEqual([1, 2]);
    expect(overlay.unknownIds).toEqual([9]);
    const node = (id: number) => overlay.scenario.nodes.find((n) => n.id === id)!;
    expect(node(1).re).toBe(1);
    expect(node(2).re).toBe(0);
    expect(node(1).x).toBe(s.nodes[0].x);
    expect(node(1).dat).toBe(s.nodes[0].dat);
    expect(node(3)).toEqual(s.nodes[2]);
    // The base scenario is untouched: clearing the telemetry is not applying it.
    expect(s.nodes.find((n) => n.id === 1)!.re).not.toBe(1);
  });

  it("round-trips the demo capture: parses cleanly onto the field it came from", () => {
    const s = generateScenario(8, 42);
    const demo = demoTelemetry(s);
    expect(demo).toEqual(demoTelemetry(s));

    const t = parseTelemetry(demo.csv);
    expect(t.errors).toEqual([]);
    expect(t.nodes.map((n) => n.nodeId)).toEqual([1, 2, 3]);
    const overlay = applyTelemetry(s, t);
    expect(overlay.unknownIds).toEqual([]);
    expect(overlay.liveIds.size).toBe(3);

    // The pack swap: the strongest board reports the drained battery, the
    // weakest the fresh one, the third lands back on its scenario energy.
    const byRe = [...s.nodes.slice(0, 3)].sort((a, b) => a.re - b.re);
    // The file says what it will do before anyone opens it.
    expect(demo.fileName).toBe(
      `testbed-demo-drained-node${byRe[2].id}-fresh-node${byRe[0].id}.csv`,
    );
    for (const series of t.nodes) {
      const expected =
        series.nodeId === byRe[2].id
          ? 0.125
          : series.nodeId === byRe[0].id
            ? 0.98
            : s.nodes.find((n) => n.id === series.nodeId)!.re;
      expect(series.re).toBeCloseTo(expected, 1);
      expect(series.pdr).toBeGreaterThan(0);
      expect(series.pdr).toBeLessThanOrEqual(1);
      expect(series.noiseSigmaDb).not.toBeNull();
    }
    // The demo desk is noisier than the model's default σ.
    expect(pooledNoiseSigma(t)!).toBeGreaterThan(defaultChannel.noiseSigmaDb);
  });

  it("the demo swap visibly changes the elected round, not just the badges", () => {
    const engines = {
      clustering: createEngine(commCtrlSystem),
      aggregation: createEngine(aggregationSystem),
      routing: createEngine(routingSystem),
    };
    const s = generateScenario(8, 42);
    const before = runSimulation(s, engines);
    const t = parseTelemetry(demoTelemetry(s).csv);
    const after = runSimulation(applyTelemetry(s, t).scenario, engines, {
      ...defaultChannel,
      noiseSigmaDb: pooledNoiseSigma(t)!,
    });
    expect(after.headId).not.toBe(before.headId);
  });

  it("pools the channel σ as the median of per-node spreads", () => {
    // Spreads: node 1 → 2 dB, node 2 → ~9.9 dB (the misbehaving board),
    // node 3 → ~0.8 dB; the median keeps the outlier from dragging the model.
    const t = parseTelemetry(
      "1,1,8,-60,0,0\n1,2,8,-62,0,0\n1,3,8,-58,0,0\n" +
        "2,1,8,-60,0,0\n2,2,8,-74,0,0\n" +
        "3,1,8,-60,0,0\n3,2,8,-61,0,0\n3,3,8,-62,0,0\n3,4,8,-61,0,0",
    );
    expect(pooledNoiseSigma(t)).toBeCloseTo(2);
    expect(pooledNoiseSigma(parseTelemetry("1,1,8.0,-60,0,0"))).toBeNull();
    expect(pooledNoiseSigma(parseTelemetry(""))).toBeNull();
  });
});
