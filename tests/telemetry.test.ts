import { describe, expect, it } from "vitest";
import {
  TELEMETRY_HEADER,
  VOLTAGE_EMPTY,
  VOLTAGE_FULL,
  parseTelemetry,
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

  it("skips the boot banner and replayed noise before the first header", () => {
    const text = `b,3,10340,2,9680\n1,7,8.0,-60,200,900001\nrst:0x1 (POWERON_RESET)\nentry 0x4008059c\n${TELEMETRY_HEADER}\n1,1,8.0,-60,200,900001\n1,x,8.0,-60,400,900202`;
    const t = parseTelemetry(text);
    // Line numbers still count from the top of the file.
    expect(t.errors).toEqual([{ line: 7, reason: "value" }]);
    expect(t.nodes[0].packets).toBe(1);
  });

  it("tolerates CRLF, blank lines and the header reprinted after a reset", () => {
    const text = `${TELEMETRY_HEADER}\r\n1,1,8.0,-60,200,900001\r\n\r\n${TELEMETRY_HEADER}\r\n1,2,8.0,-61,400,900202\r\n`;
    const t = parseTelemetry(text);
    expect(t.errors).toEqual([]);
    expect(t.nodes[0].packets).toBe(2);
  });
});
