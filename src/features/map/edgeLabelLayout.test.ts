import { describe, expect, it } from "vitest";

import {
  buildEdgeBezierGeometry,
  estimateLabelBox,
  getNodeDimensions,
} from "@/features/map/edgeLabelLayout";

describe("edgeLabelLayout", () => {
  it("resolves node dimensions with measured values before defaults", () => {
    expect(
      getNodeDimensions({
        id: "node-1",
        position: { x: 0, y: 0 },
        measured: { width: 240, height: 120 },
      }),
    ).toEqual({ width: 240, height: 120 });
  });

  it("estimates a minimum label box", () => {
    expect(estimateLabelBox("", false)).toEqual({ width: 53, height: 24 });
  });

  it("builds bezier geometry between nodes", () => {
    const geometry = buildEdgeBezierGeometry(
      { id: "source", position: { x: 0, y: 0 }, width: 100, height: 80 },
      { id: "target", position: { x: 300, y: 100 }, width: 100, height: 80 },
    );

    expect(geometry.pathD).toContain("C");
    expect(geometry.sourceX).toBe(100);
    expect(geometry.targetX).toBe(300);
  });
});
