import { describe, expect, it } from "vitest";

import { mergeFlowEdges } from "@/features/map/mergeFlowEdges";

describe("mergeFlowEdges", () => {
  it("keeps existing edge identity while patching workspace fields", () => {
    const merged = mergeFlowEdges(
      [
        {
          id: "edge-1",
          source: "old-source",
          target: "old-target",
          selected: true,
          data: { label: "old" },
        },
      ],
      [
        {
          id: "edge-1",
          source: "source",
          target: "target",
          type: "custom",
          data: { label: "new" },
        },
      ],
    );

    expect(merged[0]).toMatchObject({
      id: "edge-1",
      source: "source",
      target: "target",
      selected: true,
      data: { label: "new" },
    });
  });
});
