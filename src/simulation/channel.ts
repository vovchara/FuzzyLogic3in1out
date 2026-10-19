import { gaussianNoise, mulberry32 } from "../utils/random";

/**
 * The channel model: every position-dependent quantity the controllers consume
 * is derived from one chain — virtual distance → RSSI → delivery → delay — so
 * a node moved on the field degrades consistently across all of them.
 *
 * RSSI follows the log-distance path-loss model; the defaults are tuned so a
 * 100 × 100 m field spans the whole interesting range of each controller
 * input. Once the testbed produces real series, `rssiAt1m`, `pathLossExponent`
 * and `noiseSigmaDb` are the three numbers to re-fit from measurements.
 */
export interface ChannelParams {
  /** dBm at the 1 m reference distance. */
  readonly rssiAt1m: number;
  readonly pathLossExponent: number;
  /** Shadowing σ in dB, applied per link; fit from the testbed RSSI spread. */
  readonly noiseSigmaDb: number;
  /** RSSI mapped onto LQ = 1 (and onto LQ = 0). */
  readonly rssiCeil: number;
  readonly rssiFloor: number;
  /** Centre and steepness of the logistic PDR(RSSI) roll-off. */
  readonly pdrMidRssi: number;
  readonly pdrSlope: number;
  /** Delay = base + queue·(traffic share) + retry·(expected retransmissions). */
  readonly delayBaseMs: number;
  readonly delayQueueMs: number;
  readonly delayRetryMs: number;
  readonly delayMaxMs: number;
}

export const defaultChannel: ChannelParams = {
  rssiAt1m: -30,
  pathLossExponent: 2.6,
  noiseSigmaDb: 2.5,
  rssiCeil: -40,
  rssiFloor: -95,
  pdrMidRssi: -84,
  pdrSlope: 0.35,
  delayBaseMs: 2,
  delayQueueMs: 18,
  delayRetryMs: 6,
  delayMaxMs: 50,
};

export function linkRssi(dist: number, p: ChannelParams, noiseDb = 0): number {
  return p.rssiAt1m - 10 * p.pathLossExponent * Math.log10(Math.max(dist, 1)) + noiseDb;
}

export function lqFromRssi(rssi: number, p: ChannelParams): number {
  const lq = (rssi - p.rssiFloor) / (p.rssiCeil - p.rssiFloor);
  return Math.max(0, Math.min(1, lq));
}

export function pdrFromRssi(rssi: number, p: ChannelParams): number {
  return 1 / (1 + Math.exp(-p.pdrSlope * (rssi - p.pdrMidRssi)));
}

/**
 * Transmission delay as the controller's TD input sees it: a fixed cost, a
 * queueing share proportional to the node's traffic, and the expected
 * retransmissions 1/PDR − 1 of an ARQ link.
 */
export function delayMs(pdr: number, datShare: number, p: ChannelParams): number {
  const retries = 1 / Math.max(pdr, 0.02) - 1;
  const td = p.delayBaseMs + p.delayQueueMs * datShare + p.delayRetryMs * retries;
  return Math.min(p.delayMaxMs, td);
}

/**
 * Expended energy on the aggregation controller's EE domain, after the
 * first-order radio model: a per-packet electronics cost plus an amplifier
 * cost growing with the square of the distance to the cluster head.
 */
export function expendedEnergy(dat: number, distToHead: number, fieldDiag: number): number {
  const d = Math.min(distToHead, fieldDiag) / fieldDiag;
  return dat * (0.06 + 0.12 * d * d);
}

/**
 * Deterministic shadowing of one link, in multiples of σ. Keyed by the
 * scenario seed and both endpoint ids (0 = the base station), symmetric in the
 * endpoints: dragging a node re-rolls nothing, and the same seed replays the
 * same field.
 */
export function linkNoise(seed: number, a: number, b: number): number {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const rand = mulberry32((Math.imul(seed, 2654435761) ^ Math.imul(lo + 1, 40503) ^ hi) >>> 0);
  return gaussianNoise(rand);
}
