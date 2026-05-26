import type { Node } from "@xyflow/react";

export type MergeFlowNodesOptions = {
  /** Skip overwriting position for these node ids (recent drag). */
  preservePositionNodeIds?: ReadonlySet<string>;
};

/**
 * Merges workspace-driven node updates into React Flow state without dropping
 * internal measurement fields (measured, width, height) or interaction state.
 */
export function mergeFlowNodes<NodeData extends Record<string, unknown>>(
  current: Node<NodeData>[],
  incoming: Node<NodeData>[],
  options?: MergeFlowNodesOptions,
): Node<NodeData>[] {
  const preserveIds = options?.preservePositionNodeIds;
  const currentById = new Map(current.map((node) => [node.id, node]));

  return incoming.map((next) => {
    const prev = currentById.get(next.id);
    if (!prev) return next;

    const preservePosition = preserveIds?.has(next.id) ?? false;

    return {
      ...next,
      position: preservePosition ? prev.position : next.position,
      measured: prev.measured ?? next.measured,
      width: prev.width ?? next.width,
      height: prev.height ?? next.height,
      selected: prev.selected,
      dragging: prev.dragging,
    };
  });
}
