import type { Edge } from "@xyflow/react";

/**
 * Patches edge data from incoming workspace edges while preserving React Flow
 * edge identity and selection state (avoids full edge remount on mode toggle).
 */
export function mergeFlowEdges<EdgeData extends Record<string, unknown>>(
  current: Edge<EdgeData>[],
  incoming: Edge<EdgeData>[],
): Edge<EdgeData>[] {
  const incomingById = new Map(incoming.map((edge) => [edge.id, edge]));

  const merged = current
    .filter((edge) => incomingById.has(edge.id))
    .map((edge) => {
      const next = incomingById.get(edge.id)!;
      return {
        ...edge,
        source: next.source,
        target: next.target,
        type: next.type,
        markerEnd: next.markerEnd,
        data: next.data,
      };
    });

  const newEdges = incoming.filter(
    (edge) => !current.some((existing) => existing.id === edge.id),
  );

  return [...merged, ...newEdges];
}
