import type {
  MapNodeLayout,
  MapViewMode,
  NodeImpactStats,
  NodePositionOverrides,
} from "@/features/map/SynergyMapCanvas";
import type { MapNodeRow, ProjectWorkspace, ViewLayoutRow } from "@/lib/mvp1Types";

export function readableCustomerJourneyLayouts(nodes: MapNodeRow[]): MapNodeLayout[] {
  const categoryCounts = new Map<string, number>();
  return nodes
    .filter((node) => node.adoptionStatus !== "rejected")
    .map((node) => {
      const count = categoryCounts.get(node.nodeType) ?? 0;
      categoryCounts.set(node.nodeType, count + 1);
      const current = parseNodeLayout(node.positionJson);
      const y = 88 + count * 132;
      const x =
        node.nodeType === "business"
          ? 80
          : node.nodeType === "channel"
            ? 350
            : node.nodeType === "touchpoint"
              ? 625
              : node.nodeType === "service"
                ? 900
                : node.nodeType === "finance"
                  ? 900
                  : 80;
      const yOffset =
        node.nodeType === "finance" ? 150 : node.nodeType === "data_source" ? 270 : 0;
      return {
        nodeId: node.id,
        x,
        y: y + yOffset,
        width: current.width,
        height: current.height,
      };
    });
}

export function applyLocalMapLayouts(
  workspace: ProjectWorkspace,
  projectId: string,
  viewMode: MapViewMode,
  layouts: MapNodeLayout[],
): ProjectWorkspace {
  const now = new Date().toISOString();
  if (viewMode === "customer_journey") {
    return {
      ...workspace,
      nodes: workspace.nodes.map((node) => {
        const layout = layouts.find((candidate) => candidate.nodeId === node.id);
        if (!layout) return node;
        return {
          ...node,
          positionJson: mergeNodePositionJson(node.positionJson, layout),
          updatedAt: now,
        };
      }),
    };
  }

  const currentLayout =
    workspace.viewLayouts.find((layout) => layout.viewId === viewMode) ?? null;
  const nextLayout: ViewLayoutRow = {
    id: currentLayout?.id ?? `local-layout-${viewMode}`,
    projectId,
    viewId: viewMode,
    layoutJson: mergeViewLayoutJson(
      currentLayout?.layoutJson ?? null,
      viewMode,
      layouts,
    ),
    createdAt: currentLayout?.createdAt ?? now,
    updatedAt: now,
  };

  return {
    ...workspace,
    viewLayouts: [
      ...workspace.viewLayouts.filter((layout) => layout.viewId !== viewMode),
      nextLayout,
    ],
  };
}

export function buildNodeImpactStats(workspace: ProjectWorkspace): NodeImpactStats {
  const stats: NodeImpactStats = {};
  for (const suggestion of workspace.suggestions) {
    if (suggestion.adoptionStatus === "rejected") continue;
    for (const nodeId of parseRelatedNodeIds(suggestion.relatedNodeIdsJson)) {
      const current = stats[nodeId];
      stats[nodeId] = {
        score: Math.max(current?.score ?? 0, suggestion.impactScore),
        revenueImpact: highestLevel(
          current?.revenueImpact ?? "unknown",
          suggestion.expectedRevenueImpact,
        ),
        profitImpact: highestLevel(
          current?.profitImpact ?? "unknown",
          suggestion.expectedProfitImpact,
        ),
        costLevel: lowestOperationalLevel(
          current?.costLevel ?? "unknown",
          suggestion.costLevel,
        ),
        effortLevel: lowestOperationalLevel(
          current?.effortLevel ?? "unknown",
          suggestion.effortLevel,
        ),
        confidenceStatus: strongestConfidence(
          current?.confidenceStatus ?? "needs_review",
          suggestion.confidenceStatus,
        ),
        sourceCount: (current?.sourceCount ?? 0) + 1,
      };
    }
  }
  return stats;
}

export function buildImpactPositionOverrides(
  workspace: ProjectWorkspace,
  impactStats: NodeImpactStats,
): NodePositionOverrides {
  const saved = parseViewLayoutPositions(
    workspace.viewLayouts.find((layout) => layout.viewId === "business_impact") ?? null,
  );
  const result: NodePositionOverrides = {};
  const laneCounts = new Map<string, number>();

  for (const node of workspace.nodes) {
    if (saved[node.id]) {
      result[node.id] = saved[node.id];
      continue;
    }
    const stats = impactStats[node.id];
    const impact = levelRank(stats?.revenueImpact ?? node.influenceLevel ?? "medium");
    const effort = levelRank(stats?.effortLevel ?? "medium");
    const lane = `${impact}-${effort}`;
    const index = laneCounts.get(lane) ?? 0;
    laneCounts.set(lane, index + 1);
    result[node.id] = {
      x: 330 + effort * 245,
      y: 80 + (3 - Math.max(1, impact)) * 135 + index * 86,
    };
  }

  return result;
}

function layoutToJson(layout: MapNodeLayout) {
  const value: Record<string, string | number> = {
    nodeId: layout.nodeId,
    x: layout.x,
    y: layout.y,
  };
  if (typeof layout.width === "number") value.width = layout.width;
  if (typeof layout.height === "number") value.height = layout.height;
  return value;
}

function parseNodeLayout(positionJson: string) {
  try {
    const parsed = JSON.parse(positionJson) as {
      x?: number;
      y?: number;
      width?: number;
      height?: number;
    };
    return {
      x: typeof parsed.x === "number" ? parsed.x : 0,
      y: typeof parsed.y === "number" ? parsed.y : 0,
      width: typeof parsed.width === "number" ? parsed.width : undefined,
      height: typeof parsed.height === "number" ? parsed.height : undefined,
    };
  } catch {
    return { x: 0, y: 0 };
  }
}

function mergeNodePositionJson(positionJson: string, layout: MapNodeLayout) {
  let current: Record<string, unknown>;
  try {
    current = JSON.parse(positionJson) as Record<string, unknown>;
  } catch {
    current = {};
  }
  return JSON.stringify({
    ...current,
    ...layoutToJson(layout),
  });
}

function mergeViewLayoutJson(
  currentLayoutJson: string | null,
  viewId: MapViewMode,
  layouts: MapNodeLayout[],
) {
  const layoutMap = new Map<string, MapNodeLayout>();
  if (currentLayoutJson) {
    try {
      const parsed = JSON.parse(currentLayoutJson) as {
        positions?: Array<{
          nodeId?: string;
          x?: number;
          y?: number;
          width?: number;
          height?: number;
        }>;
      };
      for (const position of parsed.positions ?? []) {
        if (
          typeof position.nodeId === "string" &&
          typeof position.x === "number" &&
          typeof position.y === "number"
        ) {
          layoutMap.set(position.nodeId, {
            nodeId: position.nodeId,
            x: position.x,
            y: position.y,
            width: position.width,
            height: position.height,
          });
        }
      }
    } catch {
      layoutMap.clear();
    }
  }

  for (const layout of layouts) {
    layoutMap.set(layout.nodeId, layout);
  }

  return JSON.stringify({
    viewId,
    positions: Array.from(layoutMap.values())
      .sort((left, right) => left.nodeId.localeCompare(right.nodeId))
      .map(layoutToJson),
  });
}

function parseViewLayoutPositions(layout: ViewLayoutRow | null): NodePositionOverrides {
  if (!layout) return {};
  try {
    const parsed = JSON.parse(layout.layoutJson) as {
      positions?: Array<{
        nodeId?: string;
        x?: number;
        y?: number;
        width?: number;
        height?: number;
      }>;
    };
    return Object.fromEntries(
      (parsed.positions ?? [])
        .filter(
          (position) =>
            typeof position.nodeId === "string" &&
            typeof position.x === "number" &&
            typeof position.y === "number",
        )
        .map((position) => [
          position.nodeId as string,
          {
            x: position.x as number,
            y: position.y as number,
            width: position.width,
            height: position.height,
          },
        ]),
    );
  } catch {
    return {};
  }
}

export function parseRelatedNodeIds(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export function levelRank(value: string): number {
  if (value === "high" || value === "3") return 3;
  if (value === "medium" || value === "2") return 2;
  if (value === "low" || value === "1") return 1;
  return 0;
}

function highestLevel(current: string, next: string) {
  return levelRank(next) > levelRank(current) ? next : current;
}

function lowestOperationalLevel(current: string, next: string) {
  if (current === "unknown") return next;
  if (next === "unknown") return current;
  return levelRank(next) < levelRank(current) ? next : current;
}

function strongestConfidence(current: string, next: string) {
  const ranks: Record<string, number> = { needs_review: 0, estimated: 1, confirmed: 2 };
  return (ranks[next] ?? 0) > (ranks[current] ?? 0) ? next : current;
}
