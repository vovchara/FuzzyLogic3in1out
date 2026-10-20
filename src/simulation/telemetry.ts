import { gaussianNoise, mulberry32 } from "../utils/random";
import { defaultChannel, linkNoise, linkRssi, pdrFromRssi, type ChannelParams } from "./channel";
import { distance } from "./scenario";
import type { Scenario } from "./types";

/**
 * Testbed telemetry: the CSV the base station prints over serial, one line per
 * received packet. Only position-independent quantities are taken from it —
 * residual energy from the voltage series, the shadowing σ from the RSSI
 * spread — while delivery and delay stay with the channel model: the node and
 * station clocks are not synchronised, so a t_rx − t_tx difference is not a
 * delay, and the virtual topology owes nothing to where the boards lie.
 */

/**
 * The single source of truth shared with the firmware. t_tx/t_rx are validated
 * but not consumed yet; they stay in the format for the echo-ping step.
 */
export const TELEMETRY_HEADER = "node_id,seq,voltage,rssi,t_tx_ms,t_rx_ms";

const COLUMNS = TELEMETRY_HEADER.split(",").length;

/**
 * A 2S Li-ion pack: 8.4 V full, 6.0 V empty. RE is linear in between — one
 * formula to defend — and saturation outside the window is semantically right,
 * the same way out-of-universe distances saturate their memberships.
 */
export const VOLTAGE_EMPTY = 6.0;
export const VOLTAGE_FULL = 8.4;

/** One node's measurement series, aggregated from its CSV rows. */
export interface TelemetrySeries {
  readonly nodeId: number;
  /** Packets received, counted by unique sequence number. */
  readonly packets: number;
  /** Residual energy: median voltage mapped onto [0, 1]. */
  readonly re: number;
  /** Sample deviation of the series' RSSI; null while one packet tells nothing. */
  readonly noiseSigmaDb: number | null;
  /** Unique packets over the sequence-number span. */
  readonly pdr: number;
}

export type TelemetryRowReason = "columns" | "value";

export interface TelemetryRowError {
  /** 1-based line number of the file, as an editor would show it. */
  readonly line: number;
  readonly reason: TelemetryRowReason;
}

export interface Telemetry {
  readonly nodes: readonly TelemetrySeries[];
  readonly errors: readonly TelemetryRowError[];
}

interface Packet {
  readonly seq: number;
  readonly voltage: number;
  readonly rssi: number;
}

/**
 * Parses the serial capture. Broken rows are reported by line instead of being
 * silently repaired; blank lines and repeated header lines (the station
 * reprints one after every reset) are skipped. Nodes come out sorted by id,
 * like scenario nodes.
 */
export function parseTelemetry(text: string): Telemetry {
  const errors: TelemetryRowError[] = [];
  const byNode = new Map<number, Packet[]>();
  const lines = text.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === "" || line.replace(/\s+/g, "").toLowerCase() === TELEMETRY_HEADER) continue;
    const fields = line.split(",").map((f) => f.trim());
    if (fields.length !== COLUMNS) {
      errors.push({ line: i + 1, reason: "columns" });
      continue;
    }
    // Number("") is 0, so an empty field has to become NaN by hand.
    const [nodeId, seq, voltage, rssi, tTx, tRx] = fields.map((f) => (f === "" ? NaN : Number(f)));
    if (
      ![nodeId, seq, voltage, rssi, tTx, tRx].every(Number.isFinite) ||
      !Number.isInteger(nodeId) || nodeId <= 0 ||
      !Number.isInteger(seq) || seq < 0
    ) {
      errors.push({ line: i + 1, reason: "value" });
      continue;
    }
    const packets = byNode.get(nodeId);
    if (packets) packets.push({ seq, voltage, rssi });
    else byNode.set(nodeId, [{ seq, voltage, rssi }]);
  }

  const nodes = [...byNode.entries()]
    .map(([nodeId, packets]) => aggregate(nodeId, packets))
    .sort((a, b) => a.nodeId - b.nodeId);
  return { nodes, errors };
}

function aggregate(nodeId: number, packets: readonly Packet[]): TelemetrySeries {
  // A duplicated sequence number (an ESP-NOW retry arriving twice) is still
  // one packet, so delivery is counted over unique numbers.
  const seqs = [...new Set(packets.map((p) => p.seq))];
  const span = Math.max(...seqs) - Math.min(...seqs) + 1;
  const re = Math.max(
    0,
    Math.min(1, (median(packets.map((p) => p.voltage)) - VOLTAGE_EMPTY) / (VOLTAGE_FULL - VOLTAGE_EMPTY)),
  );
  const rssi = packets.map((p) => p.rssi);
  return {
    nodeId,
    packets: seqs.length,
    re,
    noiseSigmaDb: rssi.length < 2 ? null : sampleStd(rssi),
    pdr: seqs.length / span,
  };
}

/**
 * One σ for the whole channel model: the per-node spreads are medianed, so a
 * single misbehaving board cannot drag the noise of every link. Null until
 * some node has at least two packets.
 */
export function pooledNoiseSigma(telemetry: Telemetry): number | null {
  const sigmas = telemetry.nodes
    .map((n) => n.noiseSigmaDb)
    .filter((s): s is number => s !== null);
  return sigmas.length ? median(sigmas) : null;
}

export interface TelemetryOverlay {
  readonly scenario: Scenario;
  /** Field nodes whose energy came from the measurements. */
  readonly liveIds: ReadonlySet<number>;
  /** CSV nodes with no matching field node, for the user to see. */
  readonly unknownIds: readonly number[];
}

/**
 * Overlays the measurements onto the scenario: a matched node takes the
 * measured residual energy, everything else stays generated — the mixed mode
 * of a three-board demo on a bigger field. The input scenario is untouched,
 * so clearing the telemetry is just not applying it.
 */
export function applyTelemetry(scenario: Scenario, telemetry: Telemetry): TelemetryOverlay {
  const byId = new Map(telemetry.nodes.map((n) => [n.nodeId, n]));
  const liveIds = new Set<number>();
  const nodes = scenario.nodes.map((n) => {
    const measured = byId.get(n.id);
    if (!measured) return n;
    liveIds.add(n.id);
    return { ...n, re: measured.re };
  });
  const fieldIds = new Set(scenario.nodes.map((n) => n.id));
  const unknownIds = telemetry.nodes.map((n) => n.nodeId).filter((id) => !fieldIds.has(id));
  return { scenario: { ...scenario, nodes }, liveIds, unknownIds };
}

/** Boards on the demo stand; the rest of the field stays generated. */
const DEMO_NODES = 3;
const DEMO_PACKETS = 20;
/** The node firmware sends every ~200 ms. */
const DEMO_PERIOD_MS = 200;
/** The swapped packs the demo reports: one drained, one freshly charged. */
const DEMO_DRAINED_V = 6.3;
const DEMO_FRESH_V = 8.35;
/** A desk full of WiFi is noisier than the model's default σ. */
const DEMO_SIGMA_SCALE = 1.6;

export interface DemoTelemetry {
  /** Says what the capture will do to the field before anyone opens it. */
  readonly fileName: string;
  readonly csv: string;
}

/**
 * A synthetic serial capture to demonstrate the import before the firmware
 * exists: the first boards of the field report RSSI drawn from the same
 * channel model the simulation runs on, so the file matches the field it was
 * downloaded from — but the measurements must visibly change the round, not
 * just add badges. So the capture tells a story: while assembling the stand
 * the packs got swapped — the strongest of the three boards reports a drained
 * battery, the weakest a fresh one — and the desk's RSSI spread is wider than
 * the model's default. Deterministic in the scenario seed.
 */
export function demoTelemetry(
  scenario: Scenario,
  channel: ChannelParams = defaultChannel,
): DemoTelemetry {
  const rand = mulberry32((scenario.seed ^ 0x7e1e) >>> 0);
  const lines = [TELEMETRY_HEADER];
  const boards = scenario.nodes.slice(0, DEMO_NODES);
  const byRe = [...boards].sort((a, b) => a.re - b.re);
  const drainedId = byRe.length > 1 ? byRe[byRe.length - 1].id : null;
  const freshId = byRe.length > 1 ? byRe[0].id : null;
  for (const node of boards) {
    // The node's own link to the station, shadowed the way the simulation
    // shadows it (0 is the station's id in the noise keys).
    const rssiMean = linkRssi(
      distance(node, scenario.base),
      channel,
      linkNoise(scenario.seed, node.id, 0) * channel.noiseSigmaDb,
    );
    const pdr = pdrFromRssi(rssiMean, channel);
    const voltage =
      node.id === drainedId
        ? DEMO_DRAINED_V
        : node.id === freshId
          ? DEMO_FRESH_V
          : VOLTAGE_EMPTY + node.re * (VOLTAGE_FULL - VOLTAGE_EMPTY);
    const sigma = channel.noiseSigmaDb * DEMO_SIGMA_SCALE;
    // The clocks deliberately disagree: the station powered up long before
    // the node, and neither knows the other's zero.
    const txBase = Math.floor(1000 + rand() * 5000);
    const rxBase = Math.floor(600000 + rand() * 300000);
    for (let seq = 1; seq <= DEMO_PACKETS; seq++) {
      // The first and last packets always arrive, so the span covers the whole
      // series and even a lossy link leaves enough rows for a deviation.
      if (seq !== 1 && seq !== DEMO_PACKETS && rand() > pdr) continue;
      const v = (voltage + gaussianNoise(rand) * 0.02).toFixed(2);
      const rssi = Math.round(rssiMean + gaussianNoise(rand) * sigma);
      const tTx = txBase + (seq - 1) * DEMO_PERIOD_MS + Math.floor(rand() * 3);
      const tRx = rxBase + (seq - 1) * DEMO_PERIOD_MS + Math.floor(rand() * 4);
      lines.push(`${node.id},${seq},${v},${rssi},${tTx},${tRx}`);
    }
  }
  const fileName =
    drainedId !== null
      ? `testbed-demo-drained-node${drainedId}-fresh-node${freshId}.csv`
      : "testbed-demo.csv";
  return { fileName, csv: lines.join("\n") + "\n" };
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function sampleStd(values: readonly number[]): number {
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}
