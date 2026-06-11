import { describe, expect, it } from "vitest";

import { mergeFlowNodes } from "@/features/map/mergeFlowNodes";

describe("mergeFlowNodes", () => {
  it("preserves measured dimensions and selected state", () => {
    const merged = mergeFlowNodes(
      [
        {
          id: "node-1",
          position: { x: 1, y: 2 },
          data: {},
          measured: { width: 120, height: 80 },
          selected: true,
        },
      ],
      [{ id: "node-1", position: { x: 10, y: 20 }, data: { label: "next" } }],
    );

    expect(merged[0]).toMatchObject({
      id: "node-1",
      position: { x: 10, y: 20 },
      measured: { width: 120, height: 80 },
      selected: true,
      data: { label: "next" },
    });
  });
});
