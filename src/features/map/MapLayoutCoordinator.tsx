import {
  useNodesInitialized,
  useReactFlow,
  useUpdateNodeInternals,
} from "@xyflow/react";
import { useEffect, useRef } from "react";

const FIT_VIEW_PADDING = 0.2;

type MapLayoutCoordinatorProps = {
  /** When false (arrange / readonly), run initial fitView once after layout sync. */
  arrangeMode: boolean;
  nodeIds: string[];
  /** Bumps when nodes/edges/mode change and internals should refresh. */
  layoutRevision: string;
};

/**
 * Runs React Flow layout sync after nodes are measured: updateNodeInternals for
 * all handles, then optional one-time fitView in arrange mode.
 */
export function MapLayoutCoordinator({
  arrangeMode,
  nodeIds,
  layoutRevision,
}: MapLayoutCoordinatorProps) {
  const nodesInitialized = useNodesInitialized();
  const updateNodeInternals = useUpdateNodeInternals();
  const { fitView } = useReactFlow();
  const fitViewDoneRef = useRef(false);
  const lastRevisionRef = useRef(layoutRevision);

  useEffect(() => {
    if (!nodesInitialized || nodeIds.length === 0) return;

    const revisionChanged = lastRevisionRef.current !== layoutRevision;
    lastRevisionRef.current = layoutRevision;

    let frameId = 0;

    const runSync = () => {
      for (const nodeId of nodeIds) {
        updateNodeInternals(nodeId);
      }

      if (import.meta.env.DEV) {
        console.debug("[MapLayoutCoordinator] layout sync", {
          arrangeMode,
          layoutRevision,
          nodeCount: nodeIds.length,
          revisionChanged,
        });
      }

      if (arrangeMode && !fitViewDoneRef.current) {
        fitViewDoneRef.current = true;
        fitView({ padding: FIT_VIEW_PADDING });
      }
    };

    frameId = requestAnimationFrame(() => {
      frameId = requestAnimationFrame(runSync);
    });

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [
    arrangeMode,
    fitView,
    layoutRevision,
    nodeIds,
    nodesInitialized,
    updateNodeInternals,
  ]);

  return null;
}
