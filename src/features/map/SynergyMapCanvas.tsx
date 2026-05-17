import {
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  MiniMap,
  NodeResizer,
  Position,
  ReactFlow,
  type Connection,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
  getBezierPath,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import {
  AlertTriangle,
  ArrowRight,
  Database,
  Megaphone,
  Package,
  Store,
  Workflow,
} from "lucide-react";
import { useCallback, useEffect, useMemo } from "react";

import { categoryLabels, confidenceLabels } from "@/lib/mvp1Labels";
import type { MapEdgeRow, MapNodeRow, SelectedMapElement } from "@/lib/mvp1Types";

import "@xyflow/react/dist/style.css";

export type MapViewMode = "customer_journey" | "business_impact";

export type MapNodeLayout = {
  nodeId: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
};

export type NodePositionOverrides = Record<
  string,
  { x: number; y: number; width?: number; height?: number }
>;

export type NodeImpactStats = Record<
  string,
  {
    score: number;
    revenueImpact: string;
    profitImpact: string;
    costLevel: string;
    effortLevel: string;
    confidenceStatus: string;
    sourceCount: number;
  }
>;

type SynergyNodeData = {
  editable: boolean;
  label: string;
  nodeType: string;
  description: string | null;
  confidenceStatus: string | null;
  impactScore: number;
  informationRichness: number;
  sourceCount: number;
  businessImpact: NodeImpactStats[string] | null;
  onLayoutChange: (layout: MapNodeLayout) => void;
  viewMode: MapViewMode;
};

type SynergyEdgeData = {
  label: string;
  edgeType: string;
  strength: string;
  confidenceStatus: string | null;
  onSelectEdge: (edgeId: string) => void;
  viewMode: MapViewMode;
};

type FlowNode = Node<SynergyNodeData, "synergy">;
type FlowEdge = Edge<SynergyEdgeData, "synergy">;

type SynergyMapCanvasProps = {
  edges: MapEdgeRow[];
  editable: boolean;
  impactStats?: NodeImpactStats;
  nodes: MapNodeRow[];
  onConnectNodes: (sourceNodeId: string, targetNodeId: string) => void;
  onPositionsChange: (positions: MapNodeLayout[]) => void;
  onSelect: (selection: SelectedMapElement) => void;
  positionOverrides?: NodePositionOverrides;
  selected: SelectedMapElement;
  viewMode?: MapViewMode;
};

const nodeIcons = {
  business: Store,
  service: Package,
  channel: Megaphone,
  touchpoint: Workflow,
  finance: Database,
  data_source: Database,
};

const DEFAULT_NODE_WIDTH = 202;
const DEFAULT_IMPACT_NODE_WIDTH = 224;
const DEFAULT_NODE_HEIGHT = 104;
const DEFAULT_IMPACT_NODE_HEIGHT = 126;
const MIN_NODE_WIDTH = 170;
const MIN_NODE_HEIGHT = 92;
const MAX_NODE_WIDTH = 380;
const MAX_NODE_HEIGHT = 260;

function parsePosition(positionJson: string) {
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

function defaultNodeWidth(viewMode: MapViewMode) {
  return viewMode === "business_impact"
    ? DEFAULT_IMPACT_NODE_WIDTH
    : DEFAULT_NODE_WIDTH;
}

function defaultNodeHeight(viewMode: MapViewMode) {
  return viewMode === "business_impact"
    ? DEFAULT_IMPACT_NODE_HEIGHT
    : DEFAULT_NODE_HEIGHT;
}

function numericStyleValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function layoutFromFlowNode(node: FlowNode): MapNodeLayout {
  return {
    nodeId: node.id,
    x: node.position.x,
    y: node.position.y,
    width: node.width ?? node.measured?.width ?? numericStyleValue(node.style?.width),
    height:
      node.height ?? node.measured?.height ?? numericStyleValue(node.style?.height),
  };
}

const levelLabels: Record<string, string> = {
  high: "大",
  medium: "中",
  low: "小",
  unknown: "不明",
};

function toFlowNodes(
  nodes: MapNodeRow[],
  viewMode: MapViewMode,
  positionOverrides: NodePositionOverrides,
  impactStats: NodeImpactStats,
  editable: boolean,
  onLayoutChange: (layout: MapNodeLayout) => void,
): FlowNode[] {
  return nodes
    .filter((node) => node.adoptionStatus !== "rejected")
    .map((node) => {
      const layout = positionOverrides[node.id] ?? parsePosition(node.positionJson);
      return {
        id: node.id,
        type: "synergy",
        position: { x: layout.x, y: layout.y },
        width: layout.width ?? defaultNodeWidth(viewMode),
        height: layout.height ?? defaultNodeHeight(viewMode),
        dragHandle: editable ? ".map-node-drag-handle" : undefined,
        style: {
          width: layout.width ?? defaultNodeWidth(viewMode),
          height: layout.height ?? defaultNodeHeight(viewMode),
        },
        data: {
          editable,
          label: node.label,
          nodeType: node.nodeType,
          description: node.description,
          confidenceStatus: node.confidenceStatus,
          impactScore: Number(node.influenceLevel ?? 2),
          informationRichness: Number(node.informationRichness ?? 50),
          sourceCount: node.extractedItemId ? 1 : 0,
          businessImpact: impactStats[node.id] ?? null,
          onLayoutChange,
          viewMode,
        },
      };
    });
}

function toFlowEdges(
  edges: MapEdgeRow[],
  viewMode: MapViewMode,
  onSelectEdge: (edgeId: string) => void,
): FlowEdge[] {
  return edges
    .filter((edge) => edge.adoptionStatus !== "rejected")
    .map((edge) => ({
      id: edge.id,
      source: edge.sourceNodeId,
      target: edge.targetNodeId,
      type: "synergy",
      markerEnd: { type: MarkerType.ArrowClosed },
      data: {
        label: edge.label ?? "導線",
        edgeType: edge.edgeType,
        strength: edge.strength ?? "normal",
        confidenceStatus: edge.confidenceStatus,
        onSelectEdge,
        viewMode,
      },
    }));
}

function SynergyNode({ data, id, selected }: NodeProps<FlowNode>) {
  const Icon = nodeIcons[data.nodeType as keyof typeof nodeIcons] ?? Workflow;
  const category = categoryLabels[data.nodeType] ?? "項目";
  const confidence = confidenceLabels[data.confidenceStatus ?? ""] ?? "推定";

  return (
    <div
      className={`map-node map-node-${data.nodeType} ${
        selected ? "map-node-selected" : ""
      } map-node-impact-${data.impactScore} map-node-view-${data.viewMode} ${
        data.businessImpact ? "map-node-has-business-impact" : ""
      } ${data.editable ? "map-node-editable" : "map-node-readonly"} ${
        selected && data.editable ? "map-node-resizable" : ""
      } ${data.editable ? "map-node-drag-handle" : ""}`}
    >
      <NodeResizer
        color="#168a83"
        isVisible={selected && data.editable}
        minHeight={MIN_NODE_HEIGHT}
        minWidth={MIN_NODE_WIDTH}
        maxHeight={MAX_NODE_HEIGHT}
        maxWidth={MAX_NODE_WIDTH}
        onResizeEnd={(_, params) => {
          data.onLayoutChange({
            nodeId: id,
            x: params.x,
            y: params.y,
            width: params.width,
            height: params.height,
          });
        }}
      />
      <Handle
        className="map-handle map-handle-target nodrag"
        isConnectable={data.editable}
        position={Position.Left}
        title="ここへ導線を接続"
        type="target"
      />
      <div className="map-node-stripe" />
      <div className="map-node-main">
        <div className="map-node-icon">
          <Icon size={15} aria-hidden="true" />
        </div>
        <div className="map-node-copy">
          <div className="map-node-topline">
            <span>{category}</span>
            <span className={`confidence-badge confidence-${data.confidenceStatus}`}>
              {confidence}
            </span>
          </div>
          <div className="map-node-title">{data.label}</div>
          <div className="map-node-description">{data.description ?? "説明未設定"}</div>
          {data.viewMode === "business_impact" ? (
            <div className="impact-node-metrics">
              <span>
                売上 {levelLabels[data.businessImpact?.revenueImpact ?? "unknown"]}
              </span>
              <span>
                利益 {levelLabels[data.businessImpact?.profitImpact ?? "unknown"]}
              </span>
              <span>
                工数 {levelLabels[data.businessImpact?.effortLevel ?? "unknown"]}
              </span>
            </div>
          ) : null}
          <div className="richness-bar" aria-label="情報充実度">
            <span
              style={{
                width: `${Math.max(8, Math.min(100, data.informationRichness))}%`,
              }}
            />
          </div>
        </div>
      </div>
      <Handle
        className="map-handle map-handle-source nodrag"
        isConnectable={data.editable}
        position={Position.Right}
        title="ここから導線を追加"
        type="source"
      />
    </div>
  );
}

function SynergyEdge(props: EdgeProps<FlowEdge>) {
  const [edgePath, labelX, labelY] = getBezierPath(props);
  const edgeType = props.data?.edgeType ?? "normal";
  const strength = props.data?.strength ?? "normal";
  const viewMode = props.data?.viewMode ?? "customer_journey";
  const showWarning = edgeType === "bottleneck";
  const halo = strength === "strong";
  const selectedClass = props.selected ? "map-edge-selected" : "";

  return (
    <>
      {halo ? <path className="map-edge-halo" d={edgePath} fill="none" /> : null}
      <BaseEdge
        id={props.id}
        markerEnd={props.markerEnd}
        path={edgePath}
        className={`map-edge map-edge-${edgeType} map-edge-strength-${strength} map-edge-view-${viewMode} ${selectedClass}`}
      />
      <EdgeLabelRenderer>
        <div
          className={`map-edge-label nodrag nopan ${showWarning ? "map-edge-label-warning" : ""} ${
            props.selected ? "map-edge-label-selected" : ""
          }`}
          onClick={(event) => {
            event.stopPropagation();
            props.data?.onSelectEdge(props.id);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            event.stopPropagation();
            props.data?.onSelectEdge(props.id);
          }}
          role="button"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
          tabIndex={0}
          title="導線を選択"
        >
          {showWarning ? (
            <AlertTriangle size={11} aria-hidden="true" />
          ) : (
            <ArrowRight size={11} aria-hidden="true" />
          )}
          {props.data?.label ?? "導線"}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

const nodeTypes = {
  synergy: SynergyNode,
};

const edgeTypes = {
  synergy: SynergyEdge,
};

const EMPTY_IMPACT_STATS: NodeImpactStats = {};
const EMPTY_POSITION_OVERRIDES: NodePositionOverrides = {};

export function SynergyMapCanvas({
  edges,
  editable,
  impactStats,
  nodes,
  onConnectNodes,
  onPositionsChange,
  onSelect,
  positionOverrides,
  selected,
  viewMode = "customer_journey",
}: SynergyMapCanvasProps) {
  const resolvedImpactStats = impactStats ?? EMPTY_IMPACT_STATS;
  const resolvedPositionOverrides = positionOverrides ?? EMPTY_POSITION_OVERRIDES;
  const handleNodeLayoutChange = useCallback(
    (layout: MapNodeLayout) => onPositionsChange([layout]),
    [onPositionsChange],
  );
  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!editable || !connection.source || !connection.target) return;
      onConnectNodes(connection.source, connection.target);
    },
    [editable, onConnectNodes],
  );
  const handleSelectEdge = useCallback(
    (edgeId: string) => onSelect({ kind: "edge", id: edgeId }),
    [onSelect],
  );
  const initialNodes = useMemo(
    () =>
      toFlowNodes(
        nodes,
        viewMode,
        resolvedPositionOverrides,
        resolvedImpactStats,
        editable,
        handleNodeLayoutChange,
      ),
    [
      editable,
      handleNodeLayoutChange,
      nodes,
      resolvedImpactStats,
      resolvedPositionOverrides,
      viewMode,
    ],
  );
  const initialEdges = useMemo(
    () => toFlowEdges(edges, viewMode, handleSelectEdge),
    [edges, handleSelectEdge, viewMode],
  );
  const [flowNodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [flowEdges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    setNodes(initialNodes);
  }, [initialNodes, setNodes]);

  useEffect(() => {
    setEdges(initialEdges);
  }, [initialEdges, setEdges]);

  useEffect(() => {
    if (!selected) {
      setNodes((current) => current.map((node) => ({ ...node, selected: false })));
      setEdges((current) => current.map((edge) => ({ ...edge, selected: false })));
      return;
    }

    setNodes((current) =>
      current.map((node) => ({
        ...node,
        selected: selected.kind === "node" && selected.id === node.id,
      })),
    );
    setEdges((current) =>
      current.map((edge) => ({
        ...edge,
        selected: selected.kind === "edge" && selected.id === edge.id,
      })),
    );
  }, [selected, setEdges, setNodes]);

  return (
    <ReactFlow
      className={`map-canvas ${editable ? "map-canvas-editable" : "map-canvas-readonly"}`}
      edges={flowEdges}
      edgeTypes={edgeTypes}
      fitView={!editable}
      fitViewOptions={{ padding: 0.2 }}
      maxZoom={1.45}
      minZoom={0.35}
      nodeTypes={nodeTypes}
      nodes={flowNodes}
      nodesConnectable={editable}
      nodesDraggable={editable}
      nodeDragThreshold={0}
      onConnect={handleConnect}
      onEdgeClick={(_, edge) => onSelect({ kind: "edge", id: edge.id })}
      onEdgesChange={onEdgesChange}
      onNodeClick={(_, node) => onSelect({ kind: "node", id: node.id })}
      onNodeDragStop={(_, node) => {
        if (editable) {
          onPositionsChange([layoutFromFlowNode(node)]);
        }
      }}
      onNodesChange={onNodesChange}
      onPaneClick={() => onSelect(null)}
      onSelectionChange={({ edges: selectedEdges, nodes: selectedNodes }) => {
        const selectedNode = selectedNodes[0];
        const selectedEdge = selectedEdges[0];
        if (selectedNode) {
          onSelect({ kind: "node", id: selectedNode.id });
        } else if (selectedEdge) {
          onSelect({ kind: "edge", id: selectedEdge.id });
        }
      }}
      panOnScroll
      proOptions={{ hideAttribution: true }}
      selectNodesOnDrag={false}
    >
      <Controls className="map-controls" position="bottom-left" />
      <MiniMap
        className="map-minimap"
        nodeColor={(node) => {
          const type = (node.data as SynergyNodeData).nodeType;
          if (type === "service") return "#168A83";
          if (type === "channel") return "#4F5DAA";
          if (type === "touchpoint") return "#D97706";
          return "#64748B";
        }}
        pannable
        position="bottom-right"
        zoomable
      />
    </ReactFlow>
  );
}
