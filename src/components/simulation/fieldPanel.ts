import { t } from "../../i18n";
import { FIELD_SIZE } from "../../simulation/scenario";
import { formatOutput } from "../../utils/format";
import type { NodeRole, Scenario, SimulationResult } from "../../simulation/types";
import type { Unmount } from "../context";

/**
 * Role colours reuse the term palette the charts already speak: the head takes
 * the brand accent (it is the decision everything else hangs off), the other
 * roles take the established term colours.
 */
export const ROLE_COLOR: Record<NodeRole, string> = {
  head: "#0d8578",
  aggregator: "#e17b4f",
  member: "#8b959f",
};

export const BASE_COLOR = "#11544e";

/** Badge of a node whose energy came from an imported testbed series: a hue
 *  none of the roles use, so the two codings cannot be read as one. */
export const LIVE_COLOR = "#3d7ab8";

export interface FieldPanel {
  update(
    scenario: Scenario,
    result: SimulationResult,
    selectedId: number | null,
    liveIds: ReadonlySet<number>,
  ): void;
  unmount: Unmount;
}

export interface FieldPanelOpts {
  /** Fired while dragging; `done` marks the drop, which is the moment to persist. */
  onMove(target: number | "base", x: number, y: number, done: boolean): void;
  onSelect(id: number | null): void;
}

/** A tap that travelled less than this (field metres) is a selection, not a drag. */
const CLICK_SLOP = 0.8;

/** Margin around the field in the viewBox, so edge markers, node labels and
 *  the axis ticks (the three-digit "100" included) stay whole. */
const PAD = 8;

/** Marker geometry in field units; route lines are trimmed against these. */
const NODE_RADIUS = 3;
/** Half-diagonal of the base station's rotated square. */
const BASE_RADIUS = 3 * Math.SQRT2;

/**
 * Scenario coordinates have the origin at the bottom-left corner, as a field
 * plan in the thesis would; SVG's y axis grows downward, so every y is
 * mirrored on its way to and from the screen.
 */
function sy(y: number): number {
  return FIELD_SIZE - y;
}

export function mountFieldPanel(container: HTMLElement, opts: FieldPanelOpts): FieldPanel {
  container.innerHTML = `
    <h2 class="card-title" data-i18n="simulation.field"></h2>
    <svg viewBox="${-PAD} ${-PAD} ${FIELD_SIZE + 2 * PAD} ${FIELD_SIZE + 2 * PAD}" data-svg role="img"
         data-i18n-aria-label="simulation.field"
         class="w-full h-auto aspect-square touch-none select-none mt-3 rounded-md">
      <defs>
        <marker id="sim-arrow" viewBox="0 0 6 6" refX="5" refY="3"
                markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0 0L6 3L0 6z" fill="#16a694"></path>
        </marker>
        <marker id="sim-arrow-flow" viewBox="0 0 6 6" refX="5" refY="3"
                markerWidth="4.5" markerHeight="4.5" orient="auto-start-reverse">
          <path d="M0 0L6 3L0 6z" fill="#b6bdc4"></path>
        </marker>
      </defs>
      <g data-grid>${gridHtml()}</g>
      <g data-links></g>
      <g data-route></g>
      <g data-nodes></g>
    </svg>
    <p class="text-xs text-amber-800 mt-2" data-no-head hidden data-i18n="simulation.noHead"></p>
  `;

  const svg = container.querySelector<SVGSVGElement>("[data-svg]")!;
  const linksG = svg.querySelector<SVGGElement>("[data-links]")!;
  const routeG = svg.querySelector<SVGGElement>("[data-route]")!;
  const nodesG = svg.querySelector<SVGGElement>("[data-nodes]")!;
  const noHeadEl = container.querySelector<HTMLElement>("[data-no-head]")!;

  function update(
    scenario: Scenario,
    result: SimulationResult,
    selectedId: number | null,
    liveIds: ReadonlySet<number>,
  ): void {
    const byId = new Map(scenario.nodes.map((n) => [n.id, n]));
    const head = result.headId !== null ? byId.get(result.headId) : undefined;
    const aggregator = result.aggregatorId !== null ? byId.get(result.aggregatorId) : undefined;

    // Data flow of the cluster: members hand their readings to the aggregator
    // (or straight to the head while none is elected), the aggregator to the head.
    const hub = aggregator ?? head;
    let links = "";
    if (hub) {
      for (const n of scenario.nodes) {
        if (n.id === hub.id || n.id === head?.id) continue;
        const seg = trimLine(
          { x: n.x, y: sy(n.y) },
          { x: hub.x, y: sy(hub.y) },
          NODE_RADIUS,
          NODE_RADIUS + 0.5,
        );
        links += `<line x1="${seg.x1}" y1="${seg.y1}" x2="${seg.x2}" y2="${seg.y2}"
          stroke="#d8dce0" stroke-width="0.35" stroke-dasharray="1.6 1.6"
          marker-end="url(#sim-arrow-flow)"></line>`;
      }
      if (aggregator && head) {
        const seg = trimLine(
          { x: aggregator.x, y: sy(aggregator.y) },
          { x: head.x, y: sy(head.y) },
          NODE_RADIUS,
          NODE_RADIUS + 0.5,
        );
        links += `<line x1="${seg.x1}" y1="${seg.y1}" x2="${seg.x2}" y2="${seg.y2}"
          stroke="#b6bdc4" stroke-width="0.5" stroke-dasharray="1.6 1.6"
          marker-end="url(#sim-arrow-flow)"></line>`;
      }
    }
    linksG.innerHTML = links;

    let route = "";
    for (const hop of result.route) {
      const fromNode = byId.get(hop.from)!;
      const toPoint = hop.to !== null ? byId.get(hop.to)! : scenario.base;
      const from = { x: fromNode.x, y: sy(fromNode.y) };
      const to = { x: toPoint.x, y: sy(toPoint.y) };
      const fallback = hop.rs === null;
      const toR = hop.to !== null ? NODE_RADIUS + 0.6 : BASE_RADIUS + 0.6;
      const seg = trimLine(from, to, NODE_RADIUS, toR);
      route += `<line x1="${seg.x1}" y1="${seg.y1}" x2="${seg.x2}" y2="${seg.y2}"
        stroke="#16a694" stroke-width="0.8" opacity="0.9" marker-end="url(#sim-arrow)"
        ${fallback ? `stroke-dasharray="2 1.5"` : ""}></line>`;
      if (hop.rs !== null) {
        route += `<text x="${(from.x + to.x) / 2}" y="${(from.y + to.y) / 2 - 1.2}"
          text-anchor="middle" font-size="3" font-weight="600" fill="#0f6a61"
          stroke="#ffffff" stroke-width="0.8" paint-order="stroke">${formatOutput(hop.rs)}</text>`;
      }
    }
    routeG.innerHTML = route;

    let markers = baseMarker(scenario.base.x, scenario.base.y);
    for (const r of result.nodes) {
      markers += nodeMarker(
        r.node.x,
        r.node.y,
        r.node.id,
        r.role,
        r.node.id === selectedId,
        liveIds.has(r.node.id),
      );
    }
    nodesG.innerHTML = markers;

    noHeadEl.hidden = result.headId !== null || scenario.nodes.length === 0;
  }

  // One drag at a time, owned by one pointer: a second finger (or a second
  // mouse button) must not hijack or jitter the marker being dragged. The grab
  // offset keeps the marker under the finger where it was grabbed instead of
  // snapping its centre to the pointer.
  interface Drag {
    pointerId: number;
    target: number | "base";
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
    lastX: number;
    lastY: number;
    moved: boolean;
  }
  let drag: Drag | null = null;

  function toField(e: PointerEvent): { x: number; y: number } {
    const r = svg.getBoundingClientRect();
    const span = FIELD_SIZE + 2 * PAD;
    return {
      x: ((e.clientX - r.left) / r.width) * span - PAD,
      y: sy(((e.clientY - r.top) / r.height) * span - PAD),
    };
  }

  svg.addEventListener("pointerdown", (e) => {
    if (drag || e.button !== 0) return;
    const marker = (e.target as Element).closest("[data-node],[data-base]");
    if (!marker) {
      opts.onSelect(null);
      return;
    }
    const p = toField(e);
    const fx = Number(marker.getAttribute("data-fx"));
    const fy = Number(marker.getAttribute("data-fy"));
    drag = {
      pointerId: e.pointerId,
      target: marker.hasAttribute("data-base") ? "base" : Number(marker.getAttribute("data-node")),
      startX: p.x,
      startY: p.y,
      offsetX: fx - p.x,
      offsetY: fy - p.y,
      lastX: fx,
      lastY: fy,
      moved: false,
    };
    svg.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  svg.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const p = toField(e);
    if (!drag.moved && Math.hypot(p.x - drag.startX, p.y - drag.startY) < CLICK_SLOP) return;
    drag.moved = true;
    drag.lastX = p.x + drag.offsetX;
    drag.lastY = p.y + drag.offsetY;
    opts.onMove(drag.target, drag.lastX, drag.lastY, false);
  });

  svg.addEventListener("pointerup", (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const d = drag;
    drag = null;
    if (d.moved) {
      const p = toField(e);
      opts.onMove(d.target, p.x + d.offsetX, p.y + d.offsetY, true);
    } else if (d.target !== "base") {
      opts.onSelect(d.target);
    }
  });

  // A cancelled gesture (system swipe, palm rejection) still drops the marker
  // where it last was, so the drawn position and the stored one cannot diverge.
  svg.addEventListener("pointercancel", (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const d = drag;
    drag = null;
    if (d.moved) opts.onMove(d.target, d.lastX, d.lastY, true);
  });

  return { update, unmount: () => {} };
}

/**
 * Shortens a segment at both ends so it meets the markers' edges instead of
 * their centres: the arrowhead then stands in front of the target marker
 * rather than underneath it. Too-short segments are left untouched.
 */
function trimLine(
  from: { x: number; y: number },
  to: { x: number; y: number },
  fromR: number,
  toR: number,
): { x1: number; y1: number; x2: number; y2: number } {
  const len = Math.hypot(to.x - from.x, to.y - from.y);
  if (len <= fromR + toR + 1) return { x1: from.x, y1: from.y, x2: to.x, y2: to.y };
  const ux = (to.x - from.x) / len;
  const uy = (to.y - from.y) / len;
  return {
    x1: from.x + ux * fromR,
    y1: from.y + uy * fromR,
    x2: to.x - ux * toR,
    y2: to.y - uy * toR,
  };
}

function gridHtml(): string {
  let lines = "";
  for (let i = 10; i < FIELD_SIZE; i += 10) {
    const stroke = i % 20 === 0 ? "#e3e6ea" : "#eceef0";
    lines += `<line x1="${i}" y1="0" x2="${i}" y2="${FIELD_SIZE}" stroke="${stroke}" stroke-width="0.25"></line>`;
    lines += `<line x1="0" y1="${i}" x2="${FIELD_SIZE}" y2="${i}" stroke="${stroke}" stroke-width="0.25"></line>`;
  }
  // Axis ticks every 20 m, origin at the bottom-left corner. The corner zero
  // is written once, by the horizontal axis.
  let ticks = "";
  for (let i = 0; i <= FIELD_SIZE; i += 20) {
    ticks += `<text x="${i}" y="${FIELD_SIZE + 4}" text-anchor="middle" font-size="3" fill="#8b959f">${i}</text>`;
    if (i > 0) {
      ticks += `<text x="-1.8" y="${sy(i) + 1}" text-anchor="end" font-size="3" fill="#8b959f">${i}</text>`;
    }
  }
  return `
    <rect x="0" y="0" width="${FIELD_SIZE}" height="${FIELD_SIZE}" fill="#f6f7f8"></rect>
    ${lines}
    <rect x="0" y="0" width="${FIELD_SIZE}" height="${FIELD_SIZE}" fill="none" stroke="#d8dce0" stroke-width="0.5"></rect>
    ${ticks}`;
}

function nodeMarker(
  x: number,
  y: number,
  id: number,
  role: NodeRole,
  selected: boolean,
  live: boolean,
): string {
  return `
    <g transform="translate(${x} ${sy(y)})" data-node="${id}" data-fx="${x}" data-fy="${y}"
       class="cursor-grab">
      ${selected ? `<circle r="5.4" fill="none" stroke="#35c2ae" stroke-width="0.5" stroke-dasharray="1 1"></circle>` : ""}
      ${role === "head" ? `<circle r="4.4" fill="none" stroke="${ROLE_COLOR.head}" stroke-width="0.6" opacity="0.8"></circle>` : ""}
      <circle r="3" fill="${ROLE_COLOR[role]}" stroke="#ffffff" stroke-width="0.6"></circle>
      ${live ? `<circle cx="2.3" cy="2.3" r="1.2" fill="${LIVE_COLOR}" stroke="#ffffff" stroke-width="0.5"></circle>` : ""}
      <text y="-4.6" text-anchor="middle" font-size="3.6" font-weight="600" fill="#434a52"
            stroke="#ffffff" stroke-width="0.9" paint-order="stroke">${id}</text>
    </g>`;
}

function baseMarker(x: number, y: number): string {
  return `
    <g transform="translate(${x} ${sy(y)})" data-base data-fx="${x}" data-fy="${y}"
       class="cursor-grab">
      <rect x="-3" y="-3" width="6" height="6" transform="rotate(45)"
            fill="${BASE_COLOR}" stroke="#ffffff" stroke-width="0.6"></rect>
      <text y="-5.6" text-anchor="middle" font-size="3.6" font-weight="600" fill="#434a52"
            stroke="#ffffff" stroke-width="0.9" paint-order="stroke">${t("simulation.baseShort")}</text>
    </g>`;
}
