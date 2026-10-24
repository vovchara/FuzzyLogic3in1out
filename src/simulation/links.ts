import { delayMs, linkNoise, linkRssi, lqFromRssi, pdrFromRssi, type ChannelParams } from "./channel";
import { distance } from "./scenario";
import type { Telemetry } from "./telemetry";
import type { Scenario, SimNode } from "./types";

/**
 * Where the controllers' link inputs come from. The chain of controllers is
 * the same for the virtual field and for a testbed experiment; only this
 * source differs: the channel model on one side, the measurements (with the
 * model filling in what was not measured) on the other.
 */
export interface Link {
  /** Always from coordinates: the field's or the measured layout's. */
  readonly dist: number;
  readonly lq: number;
  readonly pdr: number;
  /** lq and pdr come from the testbed, not from the model. */
  readonly measured: boolean;
}

export interface Measure {
  readonly value: number;
  readonly measured: boolean;
}

export interface LinkSource {
  /** The link data travels on from `from` to `to`, i.e. how well `to` hears `from`. */
  link(from: SimNode, to: SimNode | "base"): Link;
  /**
   * TD of the node's own link to the station, in ms; `datShare` is the node's
   * traffic relative to the top of the Dat domain, for the delay model.
   */
  baseDelay(node: SimNode, baseLink: Link, datShare: number): Measure;
}

/** The base station's id in link-noise keys; node ids are 1-based. */
const BASE_ID = 0;

/** Everything from the virtual topology through the channel model. */
export function modelLinks(scenario: Scenario, channel: ChannelParams): LinkSource {
  return {
    link(from, to) {
      const target = to === "base" ? scenario.base : to;
      const dist = distance(from, target);
      const noise = linkNoise(scenario.seed, from.id, to === "base" ? BASE_ID : to.id);
      const rssi = linkRssi(dist, channel, noise * channel.noiseSigmaDb);
      return { dist, lq: lqFromRssi(rssi, channel), pdr: pdrFromRssi(rssi, channel), measured: false };
    },
    baseDelay(_node, baseLink, datShare) {
      return { value: delayMs(baseLink.pdr, datShare, channel), measured: false };
    },
  };
}

/**
 * The testbed's measurements on the measured layout. The link to the station
 * is what the station heard; a node-to-node link is the receiver's neighbor
 * report about the sender (on a routing hop current → next the data leaves
 * `current`, so the hop is as good as `next` hears `current`). TD is half
 * the echo ping's median round trip. Whatever was not measured falls back to
 * the channel model without shadowing — the mean the model expects at that
 * distance, not one random draw of it — flagged as not measured.
 */
export function measuredLinks(
  scenario: Scenario,
  telemetry: Telemetry,
  channel: ChannelParams,
): LinkSource {
  const model = modelLinks(scenario, { ...channel, noiseSigmaDb: 0 });
  const baseById = new Map(telemetry.nodes.map((n) => [n.nodeId, n]));
  const rttById = new Map(telemetry.rtt.map((r) => [r.nodeId, r]));
  const neighbor = new Map(telemetry.links.map((l) => [`${l.from}>${l.to}`, l]));

  return {
    link(from, to) {
      const fallback = model.link(from, to);
      const measured =
        to === "base"
          ? baseById.get(from.id) ?? null
          : neighbor.get(`${from.id}>${to.id}`) ?? null;
      if (!measured) return fallback;
      const lq = measured.rssiMean === null ? 0 : lqFromRssi(measured.rssiMean, channel);
      return { dist: fallback.dist, lq, pdr: measured.pdr, measured: true };
    },
    baseDelay(node, baseLink, datShare) {
      const rtt = rttById.get(node.id);
      if (rtt) return { value: rtt.tdMs, measured: true };
      return model.baseDelay(node, baseLink, datShare);
    },
  };
}
