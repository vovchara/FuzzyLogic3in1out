import { describe, expect, test } from "vitest";
import { zoomWindow } from "../src/components/simulation/fieldPanel";

const pts = (...xy: [number, number][]) => xy.map(([x, y]) => ({ x, y }));

describe("zoomWindow", () => {
  test("frames a dense layout on round metres, with a margin past the field edge", () => {
    // Experiment 2: base in the corner, nodes within 1 × 2 m.
    expect(zoomWindow(pts([0, 0], [1, 2], [1, 1], [0, 1], [0, 2]), 20)).toEqual({ x0: -1, y0: -0.5, size: 3 });
    // Experiment 1: a cluster in the middle of the field.
    expect(zoomWindow(pts([10, 10], [11, 12], [11, 11], [9.5, 16], [9, 14]), 20)).toEqual({ x0: 6, y0: 8, size: 10 });
  });

  test("keeps every point inside the window", () => {
    const layout = pts([0, 0], [3.7, 1.2], [2.2, 5.9]);
    const w = zoomWindow(layout, 100);
    for (const p of layout) {
      expect(p.x).toBeGreaterThanOrEqual(w.x0);
      expect(p.x).toBeLessThanOrEqual(w.x0 + w.size);
      expect(p.y).toBeGreaterThanOrEqual(w.y0);
      expect(p.y).toBeLessThanOrEqual(w.y0 + w.size);
    }
  });

  test("a layout spread over most of the field shows the whole field", () => {
    expect(zoomWindow(pts([5, 5], [90, 80]), 100)).toEqual({ x0: 0, y0: 0, size: 100 });
    expect(zoomWindow([], 100)).toEqual({ x0: 0, y0: 0, size: 100 });
  });
});
