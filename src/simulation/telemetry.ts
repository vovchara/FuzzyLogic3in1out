/**
 * Testbed telemetry: the CSV the base station prints over serial. Protocol v1
 * has one line per received packet; v2 adds, after each of them, one `nb` line
 * per neighbor the node reports hearing, and an `rtt` line per answered echo
 * ping. The node and station clocks are not synchronised, so a t_rx − t_tx
 * difference is not a delay: the delay comes from the echo ping instead.
 */

/**
 * The single source of truth shared with the firmware. t_tx/t_rx are validated
 * but not consumed: the clocks they come from are not synchronised.
 */
export const TELEMETRY_HEADER = "node_id,seq,voltage,rssi,t_tx_ms,t_rx_ms";
export const NEIGHBOR_HEADER =
  "nb,reporter_id,reporter_seq,neighbor_id,heard,first_seq,last_seq,rssi_sum,rssi_sq_sum";
export const RTT_HEADER = "rtt,node_id,ping_seq,rtt_us";

const COLUMNS = TELEMETRY_HEADER.split(",").length;
const NEIGHBOR_COLUMNS = NEIGHBOR_HEADER.split(",").length;
const RTT_COLUMNS = RTT_HEADER.split(",").length;
const HEADERS = new Set([TELEMETRY_HEADER, NEIGHBOR_HEADER, RTT_HEADER]);

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
  /** Mean RSSI of the node's link to the station. */
  readonly rssiMean: number;
}

/**
 * How well `to` hears `from`, from `to`'s cumulative neighbor reports: the
 * reporter is `to`, the neighbor `from`. Links not measured are absent.
 */
export interface NeighborLink {
  readonly from: number;
  readonly to: number;
  /** Packets heard over packets the neighbor sent between the reports. */
  readonly pdr: number;
  /** Null when nothing was heard: a measured PDR of 0 has no RSSI. */
  readonly rssiMean: number | null;
  readonly noiseSigmaDb: number | null;
  /** Packets heard within the capture. */
  readonly heard: number;
}

/** Echo pings answered by one node. */
export interface RttSeries {
  readonly nodeId: number;
  /** Answered pings, counted by unique ping number. */
  readonly samples: number;
  /** Pings missing from the ping-number span. */
  readonly lost: number;
  readonly medianRttUs: number;
  /** Transmission delay: half the median round trip, in milliseconds. */
  readonly tdMs: number;
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
  /** Measured node-to-node links, sorted by from, then to. */
  readonly links: readonly NeighborLink[];
  /** Sorted by node id. */
  readonly rtt: readonly RttSeries[];
  /**
   * The capture comes from v2 firmware, which reports neighbors: only then
   * does a missing report mean "never heard" rather than "not asked".
   */
  readonly neighborReports: boolean;
}

interface Packet {
  readonly seq: number;
  readonly voltage: number;
  readonly rssi: number;
}

interface NeighborRow {
  readonly reporter: number;
  readonly reporterSeq: number;
  readonly neighbor: number;
  readonly heard: number;
  readonly lastSeq: number;
  readonly rssiSum: number;
  readonly rssiSqSum: number;
}

interface PongRow {
  readonly nodeId: number;
  readonly pingSeq: number;
  readonly rttUs: number;
}

/**
 * Parses the serial capture. Broken rows are reported by line instead of being
 * silently repaired; blank lines and repeated header lines (the station
 * reprints them after every reset) are skipped. Everything before the first
 * header is skipped too: the station prints it on boot, so what precedes it is
 * the bootloader banner and the CP2102's replay of a previous session, never
 * data. Nodes come out sorted by id, like scenario nodes.
 */
export function parseTelemetry(text: string): Telemetry {
  const errors: TelemetryRowError[] = [];
  const byNode = new Map<number, Packet[]>();
  const neighborRows: NeighborRow[] = [];
  const pongRows: PongRow[] = [];
  // The CP2102 glitch replays chunks of already printed lines. A replayed
  // line is byte-identical to the original — a main row carries the station's
  // arrival time, a report cumulative counters, a pong its ping number — so
  // exact duplicates are dropped before they can look like a counter going
  // back, i.e. a reboot.
  const seen = new Set<string>();
  let neighborReports = false;
  const lines = text.split("\n");
  const compactOf = (line: string) => line.trim().replace(/\s+/g, "").toLowerCase();
  // A capture without any header (cut out by hand) is parsed from the top.
  const firstHeader = Math.max(0, lines.findIndex((l) => HEADERS.has(compactOf(l))));

  for (let i = firstHeader; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === "") continue;
    const compact = compactOf(line);
    if (HEADERS.has(compact)) {
      if (compact === NEIGHBOR_HEADER) neighborReports = true;
      continue;
    }
    const fields = line.split(",").map((f) => f.trim());
    const tag = fields[0].toLowerCase();
    if (tag === "nb" || tag === "rtt") {
      const expected = tag === "nb" ? NEIGHBOR_COLUMNS : RTT_COLUMNS;
      if (fields.length !== expected) {
        errors.push({ line: i + 1, reason: "columns" });
        continue;
      }
      const values = fields.slice(1).map(toNumber);
      const row = tag === "nb" ? neighborRow(values) : pongRow(values);
      if (!row) {
        errors.push({ line: i + 1, reason: "value" });
        continue;
      }
      if (seen.has(compact)) continue;
      seen.add(compact);
      if (tag === "nb") {
        neighborReports = true;
        neighborRows.push(row as NeighborRow);
      } else {
        pongRows.push(row as PongRow);
      }
      continue;
    }
    if (fields.length !== COLUMNS) {
      errors.push({ line: i + 1, reason: "columns" });
      continue;
    }
    const [nodeId, seq, voltage, rssi, tTx, tRx] = fields.map(toNumber);
    if (
      ![nodeId, seq, voltage, rssi, tTx, tRx].every(Number.isFinite) ||
      !isId(nodeId) || !isCount(seq)
    ) {
      errors.push({ line: i + 1, reason: "value" });
      continue;
    }
    if (seen.has(compact)) continue;
    seen.add(compact);
    const packets = byNode.get(nodeId);
    if (packets) packets.push({ seq, voltage, rssi });
    else byNode.set(nodeId, [{ seq, voltage, rssi }]);
  }

  const nodes = [...byNode.entries()]
    .map(([nodeId, packets]) => aggregate(nodeId, packets))
    .sort((a, b) => a.nodeId - b.nodeId);
  return {
    nodes,
    errors,
    links: neighborLinks(neighborRows, nodes, neighborReports),
    rtt: rttSeries(pongRows),
    neighborReports,
  };
}

/** Number("") is 0, so an empty field has to become NaN by hand. */
function toNumber(field: string): number {
  return field === "" ? NaN : Number(field);
}

function isId(v: number): boolean {
  return Number.isInteger(v) && v > 0;
}

function isCount(v: number): boolean {
  return Number.isInteger(v) && v >= 0;
}

function neighborRow(v: readonly number[]): NeighborRow | null {
  const [reporter, reporterSeq, neighbor, heard, firstSeq, lastSeq, rssiSum, rssiSqSum] = v;
  if (!isId(reporter) || !isId(neighbor) || !Number.isInteger(rssiSum)) return null;
  if (![reporterSeq, heard, firstSeq, lastSeq, rssiSqSum].every(isCount)) return null;
  // The sums of one series cannot give a negative variance (n·Σx² ≥ (Σx)²).
  // A line cut short mid-number keeps its column count, so this is what
  // catches a truncated rssi_sq_sum.
  if (heard * rssiSqSum < rssiSum * rssiSum) return null;
  return { reporter, reporterSeq, neighbor, heard, lastSeq, rssiSum, rssiSqSum };
}

function pongRow(v: readonly number[]): PongRow | null {
  const [nodeId, pingSeq, rttUs] = v;
  if (!isId(nodeId) || !isCount(pingSeq) || !Number.isFinite(rttUs) || rttUs < 0) return null;
  return { nodeId, pingSeq, rttUs };
}

/**
 * Reports are cumulative since the reporter's boot, so a link is the change
 * between the first and the last report — a report lost on the air in between
 * costs nothing. A reboot resets the picture: the reporter's seq and counters
 * restart, or the neighbor's seq does. Either ends a segment, and the changes
 * are summed over the segments, so a reboot is not counted as a loss.
 *
 * A link the reporter never mentions although the neighbor was on the air
 * (the station heard it) is a measured PDR of 0: the reporter heard none of
 * its packets. A single report, or reports that span no neighbor packets,
 * tell nothing, and the link stays unmeasured.
 */
function neighborLinks(
  rows: readonly NeighborRow[],
  nodes: readonly TelemetrySeries[],
  neighborReports: boolean,
): NeighborLink[] {
  const byLink = new Map<string, NeighborRow[]>();
  for (const row of rows) {
    const key = `${row.neighbor}>${row.reporter}`;
    const list = byLink.get(key);
    if (list) list.push(row);
    else byLink.set(key, [row]);
  }

  const links: NeighborLink[] = [];
  for (const list of byLink.values()) {
    let heard = 0;
    let sent = 0;
    let rssiSum = 0;
    let rssiSqSum = 0;
    let first = list[0];
    let prev = list[0];
    const close = (a: NeighborRow, b: NeighborRow) => {
      heard += b.heard - a.heard;
      sent += b.lastSeq - a.lastSeq;
      rssiSum += b.rssiSum - a.rssiSum;
      rssiSqSum += b.rssiSqSum - a.rssiSqSum;
    };
    for (const row of list.slice(1)) {
      if (row.reporterSeq < prev.reporterSeq || row.lastSeq < prev.lastSeq || row.heard < prev.heard) {
        close(first, prev);
        first = row;
      }
      prev = row;
    }
    close(first, prev);
    if (sent <= 0) continue;

    const mean = heard > 0 ? rssiSum / heard : null;
    const variance = heard > 1 ? (rssiSqSum - (rssiSum * rssiSum) / heard) / (heard - 1) : null;
    links.push({
      from: list[0].neighbor,
      to: list[0].reporter,
      pdr: Math.min(1, heard / sent),
      rssiMean: mean,
      noiseSigmaDb: variance === null ? null : Math.sqrt(Math.max(0, variance)),
      heard,
    });
  }

  if (neighborReports) {
    // A reporter needs two packets at the station for its silence to span
    // some time; a neighbor needs to have been on the air at all.
    const mentioned = new Set(byLink.keys());
    for (const reporter of nodes) {
      if (reporter.packets < 2) continue;
      for (const neighbor of nodes) {
        if (neighbor.nodeId === reporter.nodeId) continue;
        if (mentioned.has(`${neighbor.nodeId}>${reporter.nodeId}`)) continue;
        links.push({
          from: neighbor.nodeId,
          to: reporter.nodeId,
          pdr: 0,
          rssiMean: null,
          noiseSigmaDb: null,
          heard: 0,
        });
      }
    }
  }
  return links.sort((a, b) => a.from - b.from || a.to - b.to);
}

/**
 * The station numbers pings per node and restarts the numbers when it
 * reboots, so a number going back starts a new segment; a repeated number is
 * the same pong. Losses are the holes in each segment's span: a ping lost on
 * the air just has no line.
 */
function rttSeries(rows: readonly PongRow[]): RttSeries[] {
  const byNode = new Map<number, PongRow[]>();
  for (const row of rows) {
    const list = byNode.get(row.nodeId);
    if (list) list.push(row);
    else byNode.set(row.nodeId, [row]);
  }

  const series: RttSeries[] = [];
  for (const [nodeId, list] of byNode) {
    const rtts: number[] = [];
    let lost = 0;
    let segment = new Set<number>();
    let lo = Infinity;
    let hi = -Infinity;
    const close = () => {
      if (segment.size) lost += hi - lo + 1 - segment.size;
    };
    let prev = -1;
    for (const row of list) {
      if (row.pingSeq < prev) {
        close();
        segment = new Set();
        lo = Infinity;
        hi = -Infinity;
      }
      prev = row.pingSeq;
      if (segment.has(row.pingSeq)) continue;
      segment.add(row.pingSeq);
      lo = Math.min(lo, row.pingSeq);
      hi = Math.max(hi, row.pingSeq);
      rtts.push(row.rttUs);
    }
    close();
    const medianRttUs = median(rtts);
    series.push({ nodeId, samples: rtts.length, lost, medianRttUs, tdMs: medianRttUs / 2 / 1000 });
  }
  return series.sort((a, b) => a.nodeId - b.nodeId);
}

function aggregate(nodeId: number, packets: readonly Packet[]): TelemetrySeries {
  // A duplicated sequence number (an ESP-NOW retry arriving twice) is still
  // one packet, so delivery is counted over unique numbers. A number going
  // back means the node rebooted and restarted its counter: a new segment,
  // so the reboot is neither a loss nor a merge of two runs' numbers.
  let unique = 0;
  let span = 0;
  let segment = new Set<number>();
  let prev = -1;
  const close = () => {
    if (!segment.size) return;
    unique += segment.size;
    span += Math.max(...segment) - Math.min(...segment) + 1;
  };
  for (const p of packets) {
    if (p.seq < prev) {
      close();
      segment = new Set();
    }
    prev = p.seq;
    segment.add(p.seq);
  }
  close();
  const re = Math.max(
    0,
    Math.min(1, (median(packets.map((p) => p.voltage)) - VOLTAGE_EMPTY) / (VOLTAGE_FULL - VOLTAGE_EMPTY)),
  );
  const rssi = packets.map((p) => p.rssi);
  return {
    nodeId,
    packets: unique,
    re,
    noiseSigmaDb: rssi.length < 2 ? null : sampleStd(rssi),
    pdr: unique / span,
    rssiMean: rssi.reduce((s, v) => s + v, 0) / rssi.length,
  };
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
