import { useMemo } from "react";

import {
  computeEdgeLabelLayout,
  type EdgeLabelPlacement,
  type LayoutFlowEdge,
  type LayoutFlowNode,
} from "@/features/map/edgeLabelLayout";

type UseEdgeLabelLayoutOptions = {
  zoom?: number;
  selectedEdgeId?: string | null;
};

export function useEdgeLabelLayout(
  nodes: LayoutFlowNode[],
  edges: LayoutFlowEdge[],
  options: UseEdgeLabelLayoutOptions = {},
): Record<string, EdgeLabelPlacement> {
  const { zoom = 1, selectedEdgeId = null } = options;

  return useMemo(
    () =>
      computeEdgeLabelLayout(nodes, edges, {
        zoom,
        selectedEdgeId,
      }),
    [nodes, edges, zoom, selectedEdgeId],
  );
}
