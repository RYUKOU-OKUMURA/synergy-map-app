import {
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
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
import { useEffect, useMemo } from "react";

import { categoryLabels, confidenceLabels } from "@/lib/mvp1Labels";
import type { MapEdgeRow, MapNodeRow, SelectedMapElement } from "@/lib/mvp1Types";

import "@xyflow/react/dist/style.css";

export type MapViewMode = "customer_journey" | "business_impact";

export type NodePositionOverrides = Record<string, { x: number; y: number }>;

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
  label: string;
  nodeType: string;
  description: string | null;
  confidenceStatus: string | null;
  impactScore: number;
  informationRichness: number;
  sourceCount: number;
  businessImpact: NodeImpactStats[string] | null;
  viewMode: MapViewMode;
};

type SynergyEdgeData = {
  label: string;
  edgeType: string;
  strength: string;
  confidenceStatus: string | null;
  viewMode: MapViewMode;
};

type FlowNode = Node<SynergyNodeData, "synergy">;
type FlowEdge = Edge<SynergyEdgeData, "synergy">;

type SynergyMapCanvasProps = {
  edges: MapEdgeRow[];
  impactStats?: NodeImpactStats;
  nodes: MapNodeRow[];
  onPositionsChange: (
    positions: Array<{ nodeId: string; x: number; y: number }>,
  ) => void;
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

function parsePosition(positionJson: string) {
  try {
    const parsed = JSON.parse(positionJson) as { x?: number; y?: number };
    return {
      x: typeof parsed.x === "number" ? parsed.x : 0,
      y: typeof parsed.y === "number" ? parsed.y : 0,
    };
  } catch {
    return { x: 0, y: 0 };
  }
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
): FlowNode[] {
  return nodes
    .filter((node) => node.adoptionStatus !== "rejected")
    .map((node) => ({
      id: node.id,
      type: "synergy",
      position: positionOverrides[node.id] ?? parsePosition(node.positionJson),
      data: {
        label: node.label,
        nodeType: node.nodeType,
        description: node.description,
        confidenceStatus: node.confidenceStatus,
        impactScore: Number(node.influenceLevel ?? 2),
        informationRichness: Number(node.informationRichness ?? 50),
        sourceCount: node.extractedItemId ? 1 : 0,
        businessImpact: impactStats[node.id] ?? null,
        viewMode,
      },
    }));
}

function toFlowEdges(edges: MapEdgeRow[], viewMode: MapViewMode): FlowEdge[] {
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
        viewMode,
      },
    }));
}

function SynergyNode({ data, selected }: NodeProps<FlowNode>) {
  const Icon = nodeIcons[data.nodeType as keyof typeof nodeIcons] ?? Workflow;
  const category = categoryLabels[data.nodeType] ?? "項目";
  const confidence = confidenceLabels[data.confidenceStatus ?? ""] ?? "推定";

  return (
    <div
      className={`map-node map-node-${data.nodeType} ${
        selected ? "map-node-selected" : ""
      } map-node-impact-${data.impactScore} map-node-view-${data.viewMode} ${
        data.businessImpact ? "map-node-has-business-impact" : ""
      }`}
    >
      <Handle className="map-handle" position={Position.Left} type="target" />
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
      <Handle className="map-handle" position={Position.Right} type="source" />
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

  return (
    <>
      {halo ? <path className="map-edge-halo" d={edgePath} fill="none" /> : null}
      <BaseEdge
        id={props.id}
        markerEnd={props.markerEnd}
        path={edgePath}
        className={`map-edge map-edge-${edgeType} map-edge-strength-${strength} map-edge-view-${viewMode}`}
      />
      <EdgeLabelRenderer>
        <div
          className={`map-edge-label ${showWarning ? "map-edge-label-warning" : ""}`}
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
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
  impactStats,
  nodes,
  onPositionsChange,
  onSelect,
  positionOverrides,
  selected,
  viewMode = "customer_journey",
}: SynergyMapCanvasProps) {
  const resolvedImpactStats = impactStats ?? EMPTY_IMPACT_STATS;
  const resolvedPositionOverrides = positionOverrides ?? EMPTY_POSITION_OVERRIDES;
  const initialNodes = useMemo(
    () => toFlowNodes(nodes, viewMode, resolvedPositionOverrides, resolvedImpactStats),
    [nodes, resolvedImpactStats, resolvedPositionOverrides, viewMode],
  );
  const initialEdges = useMemo(() => toFlowEdges(edges, viewMode), [edges, viewMode]);
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
      className="map-canvas"
      edges={flowEdges}
      edgeTypes={edgeTypes}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      maxZoom={1.45}
      minZoom={0.35}
      nodeTypes={nodeTypes}
      nodes={flowNodes}
      nodesConnectable={false}
      onEdgesChange={onEdgesChange}
      onNodeDragStop={(_, node) => {
        onPositionsChange([
          { nodeId: node.id, x: node.position.x, y: node.position.y },
        ]);
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
