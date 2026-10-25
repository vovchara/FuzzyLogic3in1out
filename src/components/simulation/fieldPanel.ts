import { t } from "../../i18n";
import { FIELD_SIZE } from "../../simulation/scenario";
import { formatOutput } from "../../utils/format";
import type { NodeRole, Point, Scenario, SimulationResult } from "../../simulation/types";
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

/** Values measured on the testbed: a hue none of the roles use, so the two
 *  codings cannot be read as one. */
export const MEASURED_COLOR = "#3d7ab8";

export interface FieldPanel {
  update(scenario: Scenario, result: SimulationResult, selectedId: number | null): void;
  unmount: Unmount;
}

export interface FieldPanelOpts {
  /**
   * Fired while dragging; `done` marks the drop, which is the moment to
   * persist. Without it the field is read-only: markers select, never move.
   */
  onMove?(target: number | "base", x: number, y: number, done: boolean): void;
  onSelect(id: number | null): void;
  /**
   * Draw only the square around the base station and the nodes instead of
   * the whole field. The scenario keeps its field: this is a view, it changes
   * nothing the controllers compute.
   */
  autoZoom?: boolean;
}

/** A square part of the field, in metres, that the panel draws. */
export interface FieldWindow {
  readonly x0: number;
  readonly y0: number;
  readonly size: number;
}

/** A tap that travelled less than this (field metres) is a selection, not a drag. */
const CLICK_SLOP = 0.8;

/** Margin around the field in the viewBox, so edge markers, node labels and
 *  the axis ticks (the three-digit "100" included) stay whole. */
const PAD = 8;

/**
 * The drawing is always VIEW units wide, whatever the field's size in metres:
 * markers and labels keep their size on screen, and a measured layout of 40 m
 * fills the panel just as the 100 m virtual field does.
 */
const VIEW = FIELD_SIZE;

/** Marker geometry in field units; route lines are trimmed against these. */
const NODE_RADIUS = 3;
/** Half-diagonal of the base station's rotated square. */
const BASE_RADIUS = 3 * Math.SQRT2;

export function mountFieldPanel(container: HTMLElement, opts: FieldPanelOpts): FieldPanel {
  const readOnly = opts.onMove === undefined;
  // Metres to view units; set from the drawn window on every update.
  let win: FieldWindow = { x0: 0, y0: 0, size: FIELD_SIZE };
  let scale = 1;
  let gridKey = "";
  const sx = (x: number) => (x - win.x0) * scale;
  // Scenario coordinates have the origin at the bottom-left corner, as a field
  // plan in the thesis would; SVG's y axis grows downward, so every y is
  // mirrored on its way to and from the screen.
  const sy = (y: number) => VIEW - (y - win.y0) * scale;

  container.innerHTML = `
    <h2 class="card-title" data-i18n="simulation.field"></h2>
    <svg viewBox="${-PAD} ${-PAD} ${VIEW + 2 * PAD} ${VIEW + 2 * PAD}" data-svg role="img"
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
      <g data-grid></g>
      <g data-links></g>
      <g data-route></g>
      <g data-nodes></g>
    </svg>
    <p class="text-xs text-amber-800 mt-2" data-no-head hidden data-i18n="simulation.noHead"></p>
  `;

  const svg = container.querySelector<SVGSVGElement>("[data-svg]")!;
  const gridG = svg.querySelector<SVGGElement>("[data-grid]")!;
  const linksG = svg.querySelector<SVGGElement>("[data-links]")!;
  const routeG = svg.querySelector<SVGGElement>("[data-route]")!;
  const nodesG = svg.querySelector<SVGGElement>("[data-nodes]")!;
  const noHeadEl = container.querySelector<HTMLElement>("[data-no-head]")!;

  function update(scenario: Scenario, result: SimulationResult, selectedId: number | null): void {
    win = opts.autoZoom
      ? zoomWindow([scenario.base, ...scenario.nodes], scenario.field)
      : { x0: 0, y0: 0, size: scenario.field };
    const key = `${win.x0}|${win.y0}|${win.size}`;
    if (key !== gridKey) {
      gridKey = key;
      scale = VIEW / win.size;
      gridG.innerHTML = gridHtml(win);
    }
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
          { x: sx(n.x), y: sy(n.y) },
          { x: sx(hub.x), y: sy(hub.y) },
          NODE_RADIUS,
          NODE_RADIUS + 0.5,
        );
        links += `<line x1="${seg.x1}" y1="${seg.y1}" x2="${seg.x2}" y2="${seg.y2}"
          stroke="#d8dce0" stroke-width="0.35" stroke-dasharray="1.6 1.6"
          marker-end="url(#sim-arrow-flow)"></line>`;
      }
      if (aggregator && head) {
        const seg = trimLine(
          { x: sx(aggregator.x), y: sy(aggregator.y) },
          { x: sx(head.x), y: sy(head.y) },
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
      const from = { x: sx(fromNode.x), y: sy(fromNode.y) };
      const to = { x: sx(toPoint.x), y: sy(toPoint.y) };
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

    let markers = baseMarker(sx(scenario.base.x), sy(scenario.base.y), scenario.base, readOnly);
    for (const r of result.nodes) {
      markers += nodeMarker(
        sx(r.node.x),
        sy(r.node.y),
        r.node,
        readOnly,
        r.role,
        r.node.id === selectedId,
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
    const span = VIEW + 2 * PAD;
    return {
      x: win.x0 + (((e.clientX - r.left) / r.width) * span - PAD) / scale,
      y: win.y0 + (VIEW - (((e.clientY - r.top) / r.height) * span - PAD)) / scale,
    };
  }

  svg.addEventListener("pointerdown", (e) => {
    if (drag || e.button !== 0) return;
    const marker = (e.target as Element).closest("[data-node],[data-base]");
    if (!marker) {
      opts.onSelect(null);
      return;
    }
    if (readOnly) {
      if (marker.hasAttribute("data-node")) opts.onSelect(Number(marker.getAttribute("data-node")));
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
    opts.onMove?.(drag.target, drag.lastX, drag.lastY, false);
  });

  svg.addEventListener("pointerup", (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const d = drag;
    drag = null;
    if (d.moved) {
      const p = toField(e);
      opts.onMove?.(d.target, p.x + d.offsetX, p.y + d.offsetY, true);
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
    if (d.moved) opts.onMove?.(d.target, d.lastX, d.lastY, true);
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

/**
 * The smallest square, on round tick lines, that holds every point with a
 * margin around it. The margin may reach past the field's edge: a measured
 * layout often puts the station at 0, 0, and a window cut at the edge would
 * sit its markers on the axis labels. A layout that already spreads over most
 * of the field gets the whole field, so a near-full zoom never crops it.
 */
export function zoomWindow(points: readonly Point[], field: number): FieldWindow {
  const full = { x0: 0, y0: 0, size: field };
  if (points.length === 0) return full;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const span = Math.max(maxX - minX, maxY - minY);
  const want = span + 2 * Math.max(0.15 * span, 0.02 * field);
  if (want >= 0.8 * field) return full;
  const step = tickStep(want);
  const x0 = Math.floor((minX + maxX - want) / 2 / step) * step;
  const y0 = Math.floor((minY + maxY - want) / 2 / step) * step;
  const x1 = Math.ceil((minX + maxX + want) / 2 / step) * step;
  const y1 = Math.ceil((minY + maxY + want) / 2 / step) * step;
  return { x0, y0, size: Math.max(x1 - x0, y1 - y0) };
}

/** The smallest round tick step that keeps about five labels per axis. */
function tickStep(field: number): number {
  const steps = [0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
  return steps.find((s) => s >= field / 6) ?? steps[steps.length - 1];
}

function gridHtml(win: FieldWindow): string {
  const field = win.size;
  const scale = VIEW / field;
  const step = tickStep(field);
  // Labels count from the window's corner; on the whole field that is 0. Float
  // steps (0.5 m) are rounded so a label never reads 1.5000000000000002.
  const label = (origin: number, i: number) => String(Math.round((origin + i) * 1000) / 1000);
  let lines = "";
  for (let i = step / 2; i < field; i += step / 2) {
    const v = i * scale;
    const stroke = Math.round(i / (step / 2)) % 2 === 0 ? "#e3e6ea" : "#eceef0";
    lines += `<line x1="${v}" y1="0" x2="${v}" y2="${VIEW}" stroke="${stroke}" stroke-width="0.25"></line>`;
    lines += `<line x1="0" y1="${v}" x2="${VIEW}" y2="${v}" stroke="${stroke}" stroke-width="0.25"></line>`;
  }
  // Axis ticks in metres, origin at the bottom-left corner. A shared corner
  // label is written once, by the horizontal axis.
  let ticks = "";
  for (let i = 0; i <= field + 1e-9; i += step) {
    const v = i * scale;
    ticks += `<text x="${v}" y="${VIEW + 4}" text-anchor="middle" font-size="3" fill="#8b959f">${label(win.x0, i)}</text>`;
    if (i > 0 || win.x0 !== win.y0) {
      ticks += `<text x="-1.8" y="${VIEW - v + 1}" text-anchor="end" font-size="3" fill="#8b959f">${label(win.y0, i)}</text>`;
    }
  }
  return `
    <rect x="0" y="0" width="${VIEW}" height="${VIEW}" fill="#f6f7f8"></rect>
    ${lines}
    <rect x="0" y="0" width="${VIEW}" height="${VIEW}" fill="none" stroke="#d8dce0" stroke-width="0.5"></rect>
    ${ticks}`;
}

/**
 * Markers take their position in view units and carry the field coordinates
 * in data-fx/fy, which is where a drag starts from.
 */
function nodeMarker(
  vx: number,
  vy: number,
  node: Point & { readonly id: number },
  readOnly: boolean,
  role: NodeRole,
  selected: boolean,
): string {
  return `
    <g transform="translate(${vx} ${vy})" data-node="${node.id}" data-fx="${node.x}" data-fy="${node.y}"
       class="${readOnly ? "cursor-pointer" : "cursor-grab"}">
      ${selected ? `<circle r="5.4" fill="none" stroke="#35c2ae" stroke-width="0.5" stroke-dasharray="1 1"></circle>` : ""}
      ${role === "head" ? `<circle r="4.4" fill="none" stroke="${ROLE_COLOR.head}" stroke-width="0.6" opacity="0.8"></circle>` : ""}
      <circle r="3" fill="${ROLE_COLOR[role]}" stroke="#ffffff" stroke-width="0.6"></circle>
      <text y="-4.6" text-anchor="middle" font-size="3.6" font-weight="600" fill="#434a52"
            stroke="#ffffff" stroke-width="0.9" paint-order="stroke">${node.id}</text>
    </g>`;
}

function baseMarker(vx: number, vy: number, base: Point, readOnly: boolean): string {
  return `
    <g transform="translate(${vx} ${vy})" data-base data-fx="${base.x}" data-fy="${base.y}"
       class="${readOnly ? "" : "cursor-grab"}">
      <rect x="-3" y="-3" width="6" height="6" transform="rotate(45)"
            fill="${BASE_COLOR}" stroke="#ffffff" stroke-width="0.6"></rect>
      <text y="-5.6" text-anchor="middle" font-size="3.6" font-weight="600" fill="#434a52"
            stroke="#ffffff" stroke-width="0.9" paint-order="stroke">${t("simulation.baseShort")}</text>
    </g>`;
}
