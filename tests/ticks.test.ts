import { describe, expect, test } from "vitest";
import { niceTicks } from "../src/components/chart/plot";

describe("niceTicks", () => {
  test("round steps for every domain the controllers use", () => {
    expect(niceTicks([0, 1])).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
    expect(niceTicks([0, 100])).toEqual([0, 20, 40, 60, 80, 100]);
    expect(niceTicks([0, 50])).toEqual([0, 10, 20, 30, 40, 50]);
    expect(niceTicks([0, 45])).toEqual([0, 10, 20, 30, 40]);
    expect(niceTicks([0, 214])).toEqual([0, 50, 100, 150, 200]);
    expect(niceTicks([0, 240])).toEqual([0, 50, 100, 150, 200]);
  });
});
