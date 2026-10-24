import { gaussianNoise, mulberry32 } from "../utils/random";
import { defaultChannel, delayMs, linkNoise, linkRssi, pdrFromRssi, type ChannelParams } from "./channel";
import type { Layout } from "./layout";
import { distance } from "./scenario";
import { NEIGHBOR_HEADER, RTT_HEADER, TELEMETRY_HEADER } from "./telemetry";
import type { Point } from "./types";

/**
 * A synthetic experiment for a demo without the stand: a layout and a v2
 * capture that agree with each other. The capture is played out packet by
 * packet over the channel model on the layout's coordinates — the nodes hear
 * each other and the station with the model's delivery, report cumulative
 * neighbor tables, answer the station's round-robin pings — and one node
 * reboots halfway, as boards do on a parking lot. Deterministic.
 */
export interface DemoExperiment {
  readonly layoutFileName: string;
  readonly layoutJson: string;
  readonly captureFileName: string;
  readonly csv: string;
}

const DEMO_LAYOUT: Layout = {
  name: "Demo",
  date: "2026-10-24",
  field: 100,
  base: { x: 8, y: 8 },
  orientation: "",
  notes: "",
  nodes: [
    { id: 1, x: 74, y: 16, dat: 40 },
    { id: 2, x: 55, y: 48, dat: 120 },
    { id: 3, x: 86, y: 88, dat: 60 },
    { id: 4, x: 18, y: 74, dat: null },
    { id: 5, x: 30, y: 22, dat: 200 },
  ],
};

/** Pack voltage per node: one fresh, one drained, the rest in between. */
const DEMO_VOLTAGE: Readonly<Record<number, number>> = { 1: 7.1, 2: 8.3, 3: 7.6, 4: 6.5, 5: 7.9 };
const DEMO_SECONDS = 30;
const SEND_PERIOD_MS = 200;
const PING_PERIOD_MS = 250;
/** The node that reboots, and when. */
const REBOOT_ID = 4;
const REBOOT_AT_MS = 15000;
/** Antennas face the station, so the two directions of a link differ a bit. */
const ASYMMETRY_DB = 1.5;
const SEED = 0x5eed;

export function demoExperiment(
  datFull: number,
  datDefault: number,
  channel: ChannelParams = defaultChannel,
): DemoExperiment {
  const rand = mulberry32(SEED);
  const layout = DEMO_LAYOUT;
  const ids = layout.nodes.map((n) => n.id);
  const pos = new Map<number, Point>(layout.nodes.map((n) => [n.id, n]));
  const dat = new Map(layout.nodes.map((n) => [n.id, n.dat ?? datDefault]));
  const sigma = channel.noiseSigmaDb;

  // Mean RSSI of every directed link; 0 is the station.
  const meanRssi = (from: number, to: number): number => {
    const a = pos.get(from)!;
    const b = to === 0 ? layout.base : pos.get(to)!;
    const shadow = linkNoise(SEED, from, to) * sigma;
    const tilt = to === 0 ? 0 : (from < to ? 1 : -1) * ASYMMETRY_DB * linkNoise(SEED + 1, from, to);
    return linkRssi(distance(a, b), channel, shadow + tilt);
  };

  interface Heard {
    heard: number;
    firstSeq: number;
    lastSeq: number;
    rssiSum: number;
    rssiSqSum: number;
  }
  const state = new Map(
    ids.map((id) => [id, { seq: 0, boot: Math.floor(rand() * 4000), table: new Map<number, Heard>() }]),
  );
  const rebooted = new Set<number>();

  type Event = { t: number; kind: "send"; id: number } | { t: number; kind: "ping" };
  const events: Event[] = [];
  for (const id of ids) {
    const phase = Math.floor(rand() * SEND_PERIOD_MS);
    for (let t = phase; t < DEMO_SECONDS * 1000; t += SEND_PERIOD_MS) {
      events.push({ t: t + Math.floor(rand() * 3), kind: "send", id });
    }
  }
  for (let t = 0; t < DEMO_SECONDS * 1000; t += PING_PERIOD_MS) events.push({ t, kind: "ping" });
  events.sort((a, b) => a.t - b.t);

  const stationBoot = 600000 + Math.floor(rand() * 300000);
  const lines = [TELEMETRY_HEADER, NEIGHBOR_HEADER, RTT_HEADER];
  const known: number[] = [];
  const pingSeq = new Map<number, number>();
  let nextPing = 0;

  for (const ev of events) {
    if (ev.kind === "ping") {
      if (!known.length) continue;
      const id = known[nextPing];
      nextPing = (nextPing + 1) % known.length;
      const n = (pingSeq.get(id) ?? 0) + 1;
      pingSeq.set(id, n);
      const pdr = pdrFromRssi(meanRssi(id, 0), channel);
      // A unicast round trip retries at the MAC level: a lost pong is rare,
      // and the retries show up as delay — the model's delay, here.
      if (rand() > 1 - (1 - pdr) ** 3) continue;
      const oneWayMs = delayMs(pdr, dat.get(id)! / datFull, channel);
      const rttUs = Math.round(2 * oneWayMs * 1000 * (0.85 + 0.3 * rand()));
      lines.push(`rtt,${id},${n},${rttUs}`);
      continue;
    }

    const node = state.get(ev.id)!;
    if (ev.id === REBOOT_ID && ev.t >= REBOOT_AT_MS && !rebooted.has(ev.id)) {
      rebooted.add(ev.id);
      node.seq = 0;
      node.boot = ev.t;
      node.table = new Map();
    }
    node.seq++;

    for (const other of ids) {
      if (other === ev.id) continue;
      const rssiMean = meanRssi(ev.id, other);
      if (rand() > pdrFromRssi(rssiMean, channel)) continue;
      const rssi = Math.round(rssiMean + gaussianNoise(rand) * sigma);
      const table = state.get(other)!.table;
      const h = table.get(ev.id) ?? { heard: 0, firstSeq: node.seq, lastSeq: 0, rssiSum: 0, rssiSqSum: 0 };
      h.heard++;
      h.lastSeq = node.seq;
      h.rssiSum += rssi;
      h.rssiSqSum += rssi * rssi;
      table.set(ev.id, h);
    }

    const baseRssi = meanRssi(ev.id, 0);
    if (rand() > pdrFromRssi(baseRssi, channel)) continue;
    if (!known.includes(ev.id)) known.push(ev.id);
    const v = (DEMO_VOLTAGE[ev.id] + gaussianNoise(rand) * 0.02).toFixed(2);
    const rssi = Math.round(baseRssi + gaussianNoise(rand) * sigma);
    const tTx = ev.t - node.boot + 1000;
    lines.push(`${ev.id},${node.seq},${v},${rssi},${tTx},${stationBoot + ev.t + Math.floor(rand() * 4)}`);
    for (const [nb, h] of node.table) {
      lines.push(
        `nb,${ev.id},${node.seq},${nb},${h.heard},${h.firstSeq},${h.lastSeq},${h.rssiSum},${h.rssiSqSum}`,
      );
    }
  }

  return {
    layoutFileName: "demo-layout.json",
    // An absent dat is how a hand-written layout says "default".
    layoutJson:
      JSON.stringify(
        { ...layout, nodes: layout.nodes.map((n) => (n.dat === null ? { id: n.id, x: n.x, y: n.y } : n)) },
        null,
        2,
      ) + "\n",
    captureFileName: "demo-capture.csv",
    csv: lines.join("\n") + "\n",
  };
}
