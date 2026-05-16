import {
  Background,
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
  getBezierPath,
} from "@xyflow/react";
import { ArrowRight, Building2, CircleDollarSign, Store, Users } from "lucide-react";

import "@xyflow/react/dist/style.css";

type JourneyNodeData = {
  label: string;
  subtitle: string;
  tone: "customer" | "channel" | "company" | "revenue";
};

type FlowNode = Node<JourneyNodeData, "journey">;
type FlowEdge = Edge<{ label: string }, "labeled">;

const toneIcon = {
  customer: Users,
  channel: Store,
  company: Building2,
  revenue: CircleDollarSign,
};

const nodes: FlowNode[] = [
  {
    id: "customer",
    type: "journey",
    position: { x: 24, y: 118 },
    data: {
      label: "既存顧客",
      subtitle: "健康志向ファミリー層",
      tone: "customer",
    },
  },
  {
    id: "store",
    type: "journey",
    position: { x: 300, y: 40 },
    data: {
      label: "店舗接点",
      subtitle: "試食 / POP / LINE",
      tone: "channel",
    },
  },
  {
    id: "ec",
    type: "journey",
    position: { x: 300, y: 198 },
    data: {
      label: "EC接点",
      subtitle: "定期便 / レシピ記事",
      tone: "channel",
    },
  },
  {
    id: "product",
    type: "journey",
    position: { x: 596, y: 118 },
    data: {
      label: "商品連携",
      subtitle: "冷凍ミール + 地域食材",
      tone: "company",
    },
  },
  {
    id: "sales",
    type: "journey",
    position: { x: 888, y: 118 },
    data: {
      label: "売上効果",
      subtitle: "客単価 + 継続率",
      tone: "revenue",
    },
  },
];

const edges: FlowEdge[] = [
  {
    id: "customer-store",
    source: "customer",
    target: "store",
    type: "labeled",
    markerEnd: { type: MarkerType.ArrowClosed },
    data: { label: "来店頻度" },
  },
  {
    id: "customer-ec",
    source: "customer",
    target: "ec",
    type: "labeled",
    markerEnd: { type: MarkerType.ArrowClosed },
    data: { label: "購買履歴" },
  },
  {
    id: "store-product",
    source: "store",
    target: "product",
    type: "labeled",
    markerEnd: { type: MarkerType.ArrowClosed },
    data: { label: "体験訴求" },
  },
  {
    id: "ec-product",
    source: "ec",
    target: "product",
    type: "labeled",
    markerEnd: { type: MarkerType.ArrowClosed },
    data: { label: "継続導線" },
  },
  {
    id: "product-sales",
    source: "product",
    target: "sales",
    type: "labeled",
    markerEnd: { type: MarkerType.ArrowClosed },
    data: { label: "クロスセル" },
  },
];

function JourneyNode({ data }: NodeProps<FlowNode>) {
  const Icon = toneIcon[data.tone];

  return (
    <div className={`flow-node flow-node-${data.tone}`}>
      <Handle className="flow-handle" position={Position.Left} type="target" />
      <div className="flow-node-icon">
        <Icon size={18} aria-hidden="true" />
      </div>
      <div>
        <div className="flow-node-title">{data.label}</div>
        <div className="flow-node-subtitle">{data.subtitle}</div>
      </div>
      <Handle className="flow-handle" position={Position.Right} type="source" />
    </div>
  );
}

function LabeledEdge(props: EdgeProps<FlowEdge>) {
  const [edgePath, labelX, labelY] = getBezierPath(props);

  return (
    <>
      <BaseEdge
        id={props.id}
        markerEnd={props.markerEnd}
        path={edgePath}
        style={{ stroke: "#4f675a", strokeWidth: 2 }}
      />
      <EdgeLabelRenderer>
        <div
          className="flow-edge-label"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
        >
          <ArrowRight size={12} aria-hidden="true" />
          {props.data?.label}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

const nodeTypes = {
  journey: JourneyNode,
};

const edgeTypes = {
  labeled: LabeledEdge,
};

export function SynergyMapFlow() {
  return (
    <div className="flow-export-surface">
      <div className="flow-export-header">
        <div>
          <div className="flow-export-kicker">Sample Foods</div>
          <div className="flow-export-title">顧客接点シナジーマップ</div>
        </div>
        <div className="flow-export-meta">Phase 0 export sample</div>
      </div>
      <ReactFlow
        className="flow-canvas"
        defaultEdges={edges}
        defaultNodes={nodes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.16 }}
        maxZoom={1.4}
        minZoom={0.5}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        panOnDrag={false}
        preventScrolling={false}
        zoomOnDoubleClick={false}
        zoomOnPinch={false}
        zoomOnScroll={false}
      >
        <Background color="#dce4d9" gap={24} size={1} />
      </ReactFlow>
    </div>
  );
}
