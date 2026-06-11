import { describe, expect, it } from "vitest";

import {
  buildNodeImpactStats,
  parseRelatedNodeIds,
  readableCustomerJourneyLayouts,
  resolveCenterNodeId,
} from "@/features/map/mapLayoutModel";
import { demoWorkspace } from "@/lib/demoWorkspace";

describe("mapLayoutModel", () => {
  it("parses related node ids defensively", () => {
    expect(parseRelatedNodeIds('["node-1","node-2"]')).toEqual(["node-1", "node-2"]);
    expect(parseRelatedNodeIds("not-json")).toEqual([]);
  });

  it("resolves a visible business node as the center when no center is saved", () => {
    expect(resolveCenterNodeId(demoWorkspace)).toBe("node-business");
  });

  it("builds readable layouts only for visible nodes", () => {
    const layouts = readableCustomerJourneyLayouts(
      demoWorkspace.nodes,
      demoWorkspace.centerNodeId,
    );

    expect(layouts.map((layout) => layout.nodeId)).not.toContain(
      demoWorkspace.nodes.find((node) => node.adoptionStatus === "rejected")?.id,
    );
  });

  it("builds impact stats for suggestion-related nodes", () => {
    const stats = buildNodeImpactStats(demoWorkspace);

    expect(Object.keys(stats).length).toBeGreaterThan(0);
  });
});
