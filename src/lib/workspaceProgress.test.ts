import { describe, expect, it } from "vitest";

import { demoWorkspace, emptyWorkspace } from "@/lib/demoWorkspace";
import {
  buildWorkspaceReflectionSummary,
  shouldRegenerateMap,
  sortByDateDesc,
} from "@/lib/workspaceProgress";

describe("workspaceProgress", () => {
  it("sorts newest timestamps first", () => {
    expect(
      ["2026-06-09T00:00:00Z", "2026-06-11T00:00:00Z"].sort(sortByDateDesc),
    ).toEqual(["2026-06-11T00:00:00Z", "2026-06-09T00:00:00Z"]);
  });

  it("does not request map regeneration for an empty workspace", () => {
    expect(shouldRegenerateMap(emptyWorkspace)).toBe(false);
  });

  it("summarizes demo workspace source reflection", () => {
    const summary = buildWorkspaceReflectionSummary(demoWorkspace);

    expect(summary.sourceCount).toBe(demoWorkspace.sourceFiles.length);
    expect(summary.rows.length).toBe(demoWorkspace.sourceFiles.length);
    expect(summary.mappedSourceCount).toBe(0);
    expect(summary.pendingExtractionCount).toBe(2);
  });
});
