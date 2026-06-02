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
  Eye,
  Megaphone,
  Package,
  Pencil,
  Store,
  Workflow,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  createContext,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useContext,
} from "react";

import type {
  EdgeLabelPlacement,
  LayoutFlowNode,
} from "@/features/map/edgeLabelLayout";
import { useEdgeLabelLayout } from "@/features/map/useEdgeLabelLayout";
import { FlowParticleRegistryProvider } from "@/features/map/flowParticleRegistry";
import { useFlowParticleRegistry } from "@/features/map/flowParticleRegistryContext";
import { MapLayoutCoordinator } from "@/features/map/MapLayoutCoordinator";
import { mergeFlowEdges } from "@/features/map/mergeFlowEdges";
import { mergeFlowNodes } from "@/features/map/mergeFlowNodes";
import {
  isGlobalFlowAnimationEnabled,
  resolveFlowAnimationConfig,
  type FlowAnimationParams,
} from "@/features/map/flowAnimationConfig";
import { usePrefersReducedMotion } from "@/features/map/usePrefersReducedMotion";
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
  isCenterNode: boolean;
  label: string;
  nodeType: string;
  description: string | null;
  confidenceStatus: string | null;
  impactScore: number;
  informationRichness: number;
  sourceCount: number;
  businessImpact: NodeImpactStats[string] | null;
  onLayoutChange: (layout: MapNodeLayout) => void;
  showInfluence: boolean;
  viewMode: MapViewMode;
};

type SynergyEdgeData = {
  label: string;
  edgeType: string;
  strength: string;
  confidenceStatus: string | null;
  evidence: string | null;
  flowType: string | null;
  flowAnimation: FlowAnimationParams | null;
  isCenterConnected: boolean;
  showInfluence: boolean;
  labelPlacement?: EdgeLabelPlacement | null;
  onCloseEdgePreview: () => void;
  onOpenEdgePreview: (edgeId: string) => void;
  onSelectEdge: (edgeId: string) => void;
  previewOpen: boolean;
  sourceNodeLabel: string;
  targetNodeLabel: string;
  viewMode: MapViewMode;
  viewportZoom: number;
};

type FlowNode = Node<SynergyNodeData, "synergy">;
type FlowEdge = Edge<SynergyEdgeData, "synergy">;

const SelectedEdgeContext = createContext<string | null>(null);

type SynergyMapCanvasProps = {
  edges: MapEdgeRow[];
  editable: boolean;
  flowAnimationSuppressed?: boolean;
  flowAnimationUserEnabled?: boolean;
  impactStats?: NodeImpactStats;
  centerNodeId?: string | null;
  layoutLocked?: boolean;
  nodes: MapNodeRow[];
  onConnectNodes: (sourceNodeId: string, targetNodeId: string) => void;
  onPositionsChange: (positions: MapNodeLayout[]) => void;
  onSelect: (selection: SelectedMapElement) => void;
  positionOverrides?: NodePositionOverrides;
  selected: SelectedMapElement;
  showInfluence?: boolean;
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
const EDGE_REASON_MAX_LENGTH = 72;

const flowTypeLabels: Record<string, string> = {
  awareness: "認知",
  inquiry: "問い合わせ",
  proposal: "提案",
  purchase: "購入",
  retention: "関係維持",
  referral: "紹介",
  data_reference: "データ連携",
};

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

function influenceLevelToScore(value: string | null | undefined) {
  if (value === "high") return 3;
  if (value === "medium") return 2;
  if (value === "low") return 1;
  const parsed = Number(value ?? 2);
  if (!Number.isFinite(parsed)) return 2;
  return Math.max(1, Math.min(3, parsed));
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

function shortenEndpointLabel(label: string) {
  const dividers = [label.indexOf("/"), label.indexOf(":")].filter(
    (index) => index > 0,
  );
  const dividerIndex = dividers.length > 0 ? Math.min(...dividers) : -1;
  const shortened = dividerIndex > 0 ? label.slice(0, dividerIndex) : label;
  return shortened.trim() || label;
}

function summarizeEvidence(evidence: string | null | undefined) {
  const fallback = "この導線の根拠は未設定です。";
  const normalized = evidence?.trim().replace(/\s+/g, " ");
  if (!normalized) return fallback;

  const sentenceEnd = normalized.search(/[。！？!?]/);
  const firstSentence =
    sentenceEnd >= 0 ? normalized.slice(0, sentenceEnd + 1) : normalized;

  if (firstSentence.length <= EDGE_REASON_MAX_LENGTH) return firstSentence;
  return `${firstSentence.slice(0, EDGE_REASON_MAX_LENGTH - 1)}…`;
}

function snapshotLayoutNodes(nodes: FlowNode[]): LayoutFlowNode[] {
  return nodes.map((node) => ({
    id: node.id,
    position: { x: node.position.x, y: node.position.y },
    width: node.width,
    height: node.height,
    measured: node.measured,
    style: node.style,
  }));
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
  centerNodeId: string | null,
  showInfluence: boolean,
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
          isCenterNode: node.id === centerNodeId,
          label: node.label,
          nodeType: node.nodeType,
          description: node.description,
          confidenceStatus: node.confidenceStatus,
          impactScore: influenceLevelToScore(node.influenceLevel),
          informationRichness: Number(node.informationRichness ?? 50),
          sourceCount: node.extractedItemId ? 1 : 0,
          businessImpact: impactStats[node.id] ?? null,
          onLayoutChange,
          showInfluence,
          viewMode,
        },
      };
    });
}

function toFlowEdges(
  edges: MapEdgeRow[],
  nodes: MapNodeRow[],
  viewMode: MapViewMode,
  onSelectEdge: (edgeId: string) => void,
  onOpenEdgePreview: (edgeId: string) => void,
  onCloseEdgePreview: () => void,
  edgePreviewId: string | null,
  globalFlowAnimationEnabled: boolean,
  centerNodeId: string | null,
  showInfluence: boolean,
): FlowEdge[] {
  const nodeLabelById = new Map(nodes.map((node) => [node.id, node.label]));

  return edges
    .filter((edge) => edge.adoptionStatus !== "rejected")
    .map((edge) => {
      const strength = edge.strength ?? "normal";
      const edgeType = edge.edgeType;
      return {
        id: edge.id,
        source: edge.sourceNodeId,
        target: edge.targetNodeId,
        type: "synergy",
        markerEnd: { type: MarkerType.ArrowClosed },
        data: {
          label: edge.label ?? "導線",
          edgeType,
          strength,
          confidenceStatus: edge.confidenceStatus,
          evidence: edge.evidence,
          flowType: edge.flowType,
          flowAnimation: globalFlowAnimationEnabled
            ? resolveFlowAnimationConfig(strength, edgeType)
            : null,
          isCenterConnected:
            Boolean(centerNodeId) &&
            (edge.sourceNodeId === centerNodeId || edge.targetNodeId === centerNodeId),
          showInfluence,
          onCloseEdgePreview,
          onOpenEdgePreview,
          onSelectEdge,
          previewOpen: edgePreviewId === edge.id,
          sourceNodeLabel: nodeLabelById.get(edge.sourceNodeId) ?? "接続元",
          targetNodeLabel: nodeLabelById.get(edge.targetNodeId) ?? "接続先",
          viewMode,
          viewportZoom: 1,
        },
      };
    });
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
      } ${data.isCenterNode ? "map-node-center" : ""} ${
        data.isCenterNode && selected ? "map-node-center-selected" : ""
      } ${data.editable ? "map-node-editable" : "map-node-readonly map-node-arrangeable"} ${
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
      {data.isCenterNode ? (
        <div className="map-node-center-badge">
          <span>中心</span>
        </div>
      ) : null}
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
          {data.showInfluence ? (
            <div className="influence-dots" aria-label="影響度">
              {Array.from({ length: 5 }, (_, index) => (
                <span
                  className={
                    index < Math.max(1, Math.min(5, data.impactScore + 2))
                      ? "active"
                      : ""
                  }
                  key={index}
                />
              ))}
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
  const [edgePath, defaultLabelX, defaultLabelY] = getBezierPath(props);
  const placement = props.data?.labelPlacement;
  const labelX = placement?.x ?? defaultLabelX;
  const labelY = placement?.y ?? defaultLabelY;
  const leaderAnchorX = placement?.anchorX;
  const leaderAnchorY = placement?.anchorY;
  const hasLeader =
    leaderAnchorX !== undefined &&
    leaderAnchorY !== undefined &&
    Math.hypot(labelX - leaderAnchorX, labelY - leaderAnchorY) > 0.5;
  const edgeType = props.data?.edgeType ?? "normal";
  const strength = props.data?.strength ?? "normal";
  const viewMode = props.data?.viewMode ?? "customer_journey";
  const flowAnimation = props.data?.flowAnimation ?? null;
  const showWarning = edgeType === "bottleneck";
  const halo = strength === "strong";
  const centerConnected =
    props.data?.showInfluence && props.data?.isCenterConnected && strength === "strong";
  const selectedClass = props.selected ? "map-edge-selected" : "";
  const animatedTrackClass = flowAnimation ? "map-edge-flow-animated" : "";
  const pathRef = useRef<SVGPathElement>(null);
  const circleRefs = useRef<(SVGCircleElement | null)[]>([]);
  const selectedEdgeId = useContext(SelectedEdgeContext);
  const isSelected = selectedEdgeId === props.id;
  const isSelectedRef = useRef(isSelected);
  useEffect(() => {
    isSelectedRef.current = isSelected;
  }, [isSelected]);
  const hideLabel = placement?.hidden === true && !props.selected && !isSelected;
  const particleRegistry = useFlowParticleRegistry();

  useEffect(() => {
    if (!props.data?.previewOpen) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        props.data?.onCloseEdgePreview();
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [props.data]);

  useLayoutEffect(() => {
    if (!flowAnimation || !particleRegistry) return;

    const path = pathRef.current;
    if (!path) return;

    const circles = circleRefs.current.filter(
      (circle): circle is SVGCircleElement => circle !== null,
    );
    if (circles.length === 0) return;

    particleRegistry.register(props.id, {
      path,
      circles,
      animation: flowAnimation,
      getSelected: () => isSelectedRef.current,
    });

    return () => particleRegistry.unregister(props.id);
  }, [edgePath, flowAnimation, particleRegistry, props.id]);

  return (
    <>
      {halo ? (
        <path
          className={`map-edge-halo ${centerConnected ? "map-edge-halo-center" : ""}`}
          d={edgePath}
          fill="none"
        />
      ) : null}
      <BaseEdge
        id={props.id}
        markerEnd={props.markerEnd}
        path={edgePath}
        className={`map-edge map-edge-${edgeType} map-edge-strength-${strength} map-edge-view-${viewMode} ${
          props.data?.showInfluence && props.data?.isCenterConnected
            ? "map-edge-center-connected"
            : props.data?.showInfluence
              ? "map-edge-influence-muted"
              : ""
        } ${animatedTrackClass} ${selectedClass}`}
      />
      {flowAnimation ? (
        <>
          <path
            ref={pathRef}
            d={edgePath}
            fill="none"
            stroke="none"
            pointerEvents="none"
            aria-hidden="true"
          />
          {Array.from({ length: flowAnimation.particleCount }, (_, index) => (
            <circle
              key={index}
              ref={(element) => {
                circleRefs.current[index] = element;
              }}
              className="map-edge-particle"
              r={flowAnimation.particleRadius}
              fill={flowAnimation.particleColor}
              pointerEvents="none"
              aria-hidden="true"
            />
          ))}
        </>
      ) : null}
      {hasLeader ? (
        <line
          className={`map-edge-label-leader ${selectedClass}`}
          pointerEvents="none"
          x1={leaderAnchorX}
          x2={labelX}
          y1={leaderAnchorY}
          y2={labelY}
          aria-hidden="true"
        />
      ) : null}
      {hideLabel ? null : (
        <EdgeLabelRenderer>
          <div
            className={`map-edge-label nodrag nopan ${showWarning ? "map-edge-label-warning" : ""} ${
              props.selected ? "map-edge-label-selected" : ""
            }`}
            onClick={(event) => {
              event.stopPropagation();
              props.data?.onOpenEdgePreview(props.id);
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              event.stopPropagation();
              props.data?.onOpenEdgePreview(props.id);
            }}
            role="button"
            style={{
              left: 0,
              position: "absolute",
              top: 0,
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
          {props.data?.previewOpen ? (
            <EdgeReasonPopover
              confidenceStatus={props.data.confidenceStatus}
              evidence={props.data.evidence}
              flowType={props.data.flowType}
              label={props.data.label}
              onClose={props.data.onCloseEdgePreview}
              onFocusDetails={() => {
                props.data?.onSelectEdge(props.id);
                props.data?.onCloseEdgePreview();
              }}
              sourceNodeLabel={props.data.sourceNodeLabel}
              anchorX={labelX}
              anchorY={labelY}
              targetNodeLabel={props.data.targetNodeLabel}
              viewportZoom={props.data.viewportZoom}
            />
          ) : null}
        </EdgeLabelRenderer>
      )}
    </>
  );
}

function EdgeReasonPopover({
  anchorX,
  anchorY,
  confidenceStatus,
  evidence,
  flowType,
  label,
  onClose,
  onFocusDetails,
  sourceNodeLabel,
  targetNodeLabel,
  viewportZoom,
}: {
  anchorX: number;
  anchorY: number;
  confidenceStatus: string | null;
  evidence: string | null;
  flowType: string | null;
  label: string;
  onClose: () => void;
  onFocusDetails: () => void;
  sourceNodeLabel: string;
  targetNodeLabel: string;
  viewportZoom: number;
}) {
  const flowLabel = flowTypeLabels[flowType ?? ""] ?? flowType ?? "流れ未設定";
  const confidenceLabel = confidenceLabels[confidenceStatus ?? ""] ?? "推定";
  const shortSource = shortenEndpointLabel(sourceNodeLabel);
  const shortTarget = shortenEndpointLabel(targetNodeLabel);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
  } | null>(null);

  const popoverStyle: CSSProperties = {
    left: 0,
    position: "absolute",
    top: 0,
    transform: `translate(-50%, 18px) translate(${anchorX + dragOffset.x}px, ${
      anchorY + dragOffset.y
    }px)`,
  };

  function isInteractiveTarget(target: EventTarget | null) {
    return (
      target instanceof Element &&
      Boolean(target.closest("button, a, input, textarea, select"))
    );
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || isInteractiveTarget(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
    setDragging(true);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const zoom = Math.max(viewportZoom, 0.1);
    const deltaX = (event.clientX - drag.x) / zoom;
    const deltaY = (event.clientY - drag.y) / zoom;
    dragRef.current = {
      ...drag,
      x: event.clientX,
      y: event.clientY,
    };
    setDragOffset((current) => ({
      x: current.x + deltaX,
      y: current.y + deltaY,
    }));
  }

  function handlePointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    dragRef.current = null;
    setDragging(false);
  }

  return (
    <div
      aria-label="導線の理由"
      className={`map-edge-popover nodrag nopan ${
        dragging ? "map-edge-popover-dragging" : ""
      }`}
      onClick={(event) => event.stopPropagation()}
      onLostPointerCapture={handlePointerEnd}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      role="dialog"
      style={popoverStyle}
    >
      <button
        aria-label="導線の理由を閉じる"
        className="map-edge-popover-close"
        onClick={onClose}
        type="button"
      >
        <X size={14} aria-hidden="true" />
      </button>
      <div className="map-edge-popover-kicker">
        <Workflow size={14} aria-hidden="true" />
        導線の理由
      </div>
      <div className="map-edge-popover-title">{label}</div>
      <div className="map-edge-popover-route">
        <span>{shortSource}</span>
        <ArrowRight size={14} aria-hidden="true" />
        <span>{shortTarget}</span>
      </div>
      <div className="map-edge-popover-chips">
        <span>{flowLabel}</span>
        <span>{confidenceLabel}</span>
      </div>
      <p>{summarizeEvidence(evidence)}</p>
      <div className="map-edge-popover-actions">
        <button className="ghost-button" onClick={onFocusDetails} type="button">
          <Eye size={14} aria-hidden="true" />
          詳しく見る
        </button>
        <button className="primary-button" onClick={onFocusDetails} type="button">
          <Pencil size={14} aria-hidden="true" />
          編集
        </button>
      </div>
    </div>
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
const POSITION_SAVE_DEBOUNCE_MS = 400;
const DRAG_POSITION_GUARD_MS = 1000;

export function SynergyMapCanvas({
  edges,
  editable,
  flowAnimationSuppressed = false,
  flowAnimationUserEnabled = true,
  impactStats,
  centerNodeId = null,
  layoutLocked = false,
  nodes,
  onConnectNodes,
  onPositionsChange,
  onSelect,
  positionOverrides,
  selected,
  showInfluence = true,
  viewMode = "customer_journey",
}: SynergyMapCanvasProps) {
  const mapInteractionsEnabled = editable && !layoutLocked;
  const resolvedImpactStats = impactStats ?? EMPTY_IMPACT_STATS;
  const resolvedPositionOverrides = positionOverrides ?? EMPTY_POSITION_OVERRIDES;
  const prefersReducedMotion = usePrefersReducedMotion();
  const globalFlowAnimationEnabled = isGlobalFlowAnimationEnabled({
    editable,
    prefersReducedMotion,
    userEnabled: flowAnimationUserEnabled,
    captureSuppressed: flowAnimationSuppressed,
  });
  const [edgePreviewId, setEdgePreviewId] = useState<string | null>(null);
  const handleNodeLayoutChange = useCallback(
    (layout: MapNodeLayout) => onPositionsChange([layout]),
    [onPositionsChange],
  );
  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!mapInteractionsEnabled || !connection.source || !connection.target) return;
      onConnectNodes(connection.source, connection.target);
    },
    [mapInteractionsEnabled, onConnectNodes],
  );
  const isSelectedElement = useCallback(
    (kind: "node" | "edge", id: string) =>
      selected?.kind === kind && selected.id === id,
    [selected],
  );
  const handleSelectEdge = useCallback(
    (edgeId: string) => {
      if (isSelectedElement("edge", edgeId)) return;
      onSelect({ kind: "edge", id: edgeId });
    },
    [isSelectedElement, onSelect],
  );
  const handleOpenEdgePreview = useCallback((edgeId: string) => {
    setEdgePreviewId((current) => (current === edgeId ? current : edgeId));
  }, []);
  const handleCloseEdgePreview = useCallback(() => {
    setEdgePreviewId(null);
  }, []);
  const handleSelectNode = useCallback(
    (nodeId: string) => {
      setEdgePreviewId(null);
      if (isSelectedElement("node", nodeId)) return;
      onSelect({ kind: "node", id: nodeId });
    },
    [isSelectedElement, onSelect],
  );
  const handleClearSelection = useCallback(() => {
    setEdgePreviewId(null);
    if (!selected) return;
    onSelect(null);
  }, [onSelect, selected]);
  const initialNodes = useMemo(
    () =>
      toFlowNodes(
        nodes,
        viewMode,
        resolvedPositionOverrides,
        resolvedImpactStats,
        mapInteractionsEnabled,
        centerNodeId,
        showInfluence,
        handleNodeLayoutChange,
      ),
    [
      handleNodeLayoutChange,
      mapInteractionsEnabled,
      nodes,
      resolvedImpactStats,
      resolvedPositionOverrides,
      centerNodeId,
      viewMode,
      showInfluence,
    ],
  );
  const initialEdges = useMemo(
    () =>
      toFlowEdges(
        edges,
        nodes,
        viewMode,
        handleSelectEdge,
        handleOpenEdgePreview,
        handleCloseEdgePreview,
        edgePreviewId,
        globalFlowAnimationEnabled,
        centerNodeId,
        showInfluence,
      ),
    [
      edges,
      edgePreviewId,
      globalFlowAnimationEnabled,
      handleCloseEdgePreview,
      handleOpenEdgePreview,
      handleSelectEdge,
      nodes,
      centerNodeId,
      showInfluence,
      viewMode,
    ],
  );
  const [flowNodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [flowEdges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [viewportZoom, setViewportZoom] = useState(1);
  const [isNodeDragging, setIsNodeDragging] = useState(false);
  const [frozenLayoutNodes, setFrozenLayoutNodes] = useState<LayoutFlowNode[] | null>(
    null,
  );
  const suppressSelectionChangeRef = useRef(false);
  const suppressSelectionChangeTimerRef = useRef<number | null>(null);
  const flowNodesRef = useRef(flowNodes);
  useEffect(() => {
    flowNodesRef.current = flowNodes;
  }, [flowNodes]);
  const lastDragAtRef = useRef(0);
  const lastDraggedNodeIdsRef = useRef<Set<string>>(new Set());
  const positionSaveTimerRef = useRef<number | null>(null);
  const pendingLayoutsRef = useRef<Map<string, MapNodeLayout>>(new Map());
  const layoutRevision = useMemo(
    () =>
      [
        mapInteractionsEnabled ? "edit" : "arrange",
        viewMode,
        initialNodes.length,
        initialEdges.length,
        globalFlowAnimationEnabled ? "flow" : "static",
      ].join(":"),
    [
      mapInteractionsEnabled,
      globalFlowAnimationEnabled,
      initialEdges.length,
      initialNodes.length,
      viewMode,
    ],
  );
  const coordinatorNodeIds = useMemo(
    () => initialNodes.map((node) => node.id),
    [initialNodes],
  );
  const selectedEdgeId = selected?.kind === "edge" ? selected.id : null;
  const layoutNodes =
    isNodeDragging && frozenLayoutNodes ? frozenLayoutNodes : flowNodes;
  const labelPlacements = useEdgeLabelLayout(layoutNodes, flowEdges, {
    zoom: viewportZoom,
    selectedEdgeId,
  });
  const particleAnimationEnabled = globalFlowAnimationEnabled && !isNodeDragging;
  const displayEdges = useMemo((): FlowEdge[] => {
    return flowEdges.map((edge) => {
      const data = edge.data as SynergyEdgeData;
      return {
        ...edge,
        data: {
          ...data,
          labelPlacement: labelPlacements[edge.id] ?? null,
          viewportZoom,
        },
      };
    });
  }, [flowEdges, labelPlacements, viewportZoom]);

  const flushPositionSave = useCallback(() => {
    const layouts = [...pendingLayoutsRef.current.values()];
    pendingLayoutsRef.current.clear();
    if (layouts.length > 0) {
      onPositionsChange(layouts);
    }
  }, [onPositionsChange]);

  const schedulePositionSave = useCallback(
    (layout: MapNodeLayout) => {
      pendingLayoutsRef.current.set(layout.nodeId, layout);
      if (positionSaveTimerRef.current !== null) {
        window.clearTimeout(positionSaveTimerRef.current);
      }
      positionSaveTimerRef.current = window.setTimeout(() => {
        positionSaveTimerRef.current = null;
        flushPositionSave();
      }, POSITION_SAVE_DEBOUNCE_MS);
    },
    [flushPositionSave],
  );

  useEffect(() => {
    return () => {
      if (positionSaveTimerRef.current !== null) {
        window.clearTimeout(positionSaveTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const withinDragGuard = Date.now() - lastDragAtRef.current < DRAG_POSITION_GUARD_MS;
    const preservePositionNodeIds = withinDragGuard
      ? lastDraggedNodeIdsRef.current
      : undefined;
    setNodes(
      (current) =>
        mergeFlowNodes(current, initialNodes, {
          preservePositionNodeIds,
        }) as FlowNode[],
    );
  }, [initialNodes, setNodes]);

  useEffect(() => {
    setEdges((current) => {
      if (current.length === 0) return initialEdges;

      const incomingIds = new Set(initialEdges.map((edge) => edge.id));
      const currentIds = new Set(current.map((edge) => edge.id));
      const sameEdgeSet =
        incomingIds.size === currentIds.size &&
        [...incomingIds].every((id) => currentIds.has(id));

      if (sameEdgeSet) {
        return mergeFlowEdges(current, initialEdges) as FlowEdge[];
      }
      return initialEdges;
    });
  }, [initialEdges, setEdges]);

  const zoomDebounceRef = useRef<number | null>(null);
  const handleViewportMove = useCallback((_: unknown, viewport: { zoom: number }) => {
    if (zoomDebounceRef.current !== null) {
      window.clearTimeout(zoomDebounceRef.current);
    }
    zoomDebounceRef.current = window.setTimeout(() => {
      setViewportZoom(viewport.zoom);
      zoomDebounceRef.current = null;
    }, 120);
  }, []);

  useEffect(() => {
    return () => {
      if (zoomDebounceRef.current !== null) {
        window.clearTimeout(zoomDebounceRef.current);
      }
    };
  }, []);

  useEffect(() => {
    suppressSelectionChangeRef.current = true;
    if (suppressSelectionChangeTimerRef.current !== null) {
      window.clearTimeout(suppressSelectionChangeTimerRef.current);
    }
    suppressSelectionChangeTimerRef.current = window.setTimeout(() => {
      suppressSelectionChangeRef.current = false;
      suppressSelectionChangeTimerRef.current = null;
    }, 80);

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

  useEffect(() => {
    return () => {
      if (suppressSelectionChangeTimerRef.current !== null) {
        window.clearTimeout(suppressSelectionChangeTimerRef.current);
      }
    };
  }, []);

  const handleNodeDragStart = useCallback(() => {
    if (layoutLocked) return;
    setEdgePreviewId(null);
    setFrozenLayoutNodes(snapshotLayoutNodes(flowNodesRef.current));
    setIsNodeDragging(true);
  }, [layoutLocked]);

  const handleNodeDragStop = useCallback(
    (_: unknown, node: FlowNode) => {
      if (layoutLocked) return;
      lastDragAtRef.current = Date.now();
      lastDraggedNodeIdsRef.current = new Set([node.id]);
      schedulePositionSave(layoutFromFlowNode(node));
      setIsNodeDragging(false);
      setFrozenLayoutNodes(null);
    },
    [layoutLocked, schedulePositionSave],
  );

  return (
    <FlowParticleRegistryProvider animationEnabled={particleAnimationEnabled}>
      <SelectedEdgeContext.Provider
        value={selected?.kind === "edge" ? selected.id : null}
      >
        <ReactFlow
          className={`map-canvas ${mapInteractionsEnabled ? "map-canvas-editable" : "map-canvas-readonly"}`}
          edges={displayEdges}
          edgeTypes={edgeTypes}
          maxZoom={1.45}
          minZoom={0.35}
          nodeTypes={nodeTypes}
          nodes={flowNodes}
          nodesConnectable={mapInteractionsEnabled}
          nodesDraggable={!layoutLocked}
          nodeDragThreshold={4}
          onInit={(instance) => setViewportZoom(instance.getZoom())}
          onMove={handleViewportMove}
          onMoveEnd={(_, viewport) => setViewportZoom(viewport.zoom)}
          onConnect={handleConnect}
          onEdgeClick={(_, edge) => {
            setEdgePreviewId(null);
            handleSelectEdge(edge.id);
          }}
          onEdgesChange={onEdgesChange}
          onNodeClick={(_, node) => handleSelectNode(node.id)}
          onNodeDragStart={handleNodeDragStart}
          onNodeDragStop={handleNodeDragStop}
          onNodesChange={onNodesChange}
          onPaneClick={handleClearSelection}
          onSelectionChange={({ edges: selectedEdges, nodes: selectedNodes }) => {
            if (suppressSelectionChangeRef.current) return;
            const selectedNode = selectedNodes[0];
            const selectedEdge = selectedEdges[0];
            if (!selected && (selectedNode || selectedEdge)) return;
            if (selectedNode) {
              handleSelectNode(selectedNode.id);
            } else if (selectedEdge) {
              handleSelectEdge(selectedEdge.id);
            }
          }}
          panOnScroll
          proOptions={{ hideAttribution: true }}
          selectNodesOnDrag={false}
        >
          <MapLayoutCoordinator
            arrangeMode={!editable}
            layoutRevision={layoutRevision}
            nodeIds={coordinatorNodeIds}
          />
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
      </SelectedEdgeContext.Provider>
    </FlowParticleRegistryProvider>
  );
}
