import { getBezierPath, Position } from "@xyflow/react";

export type EdgeLabelPlacement = {
  x: number;
  y: number;
  anchorX?: number;
  anchorY?: number;
  hidden?: boolean;
};

export type LayoutFlowNode = {
  id: string;
  position: { x: number; y: number };
  width?: number;
  height?: number;
  measured?: { width?: number; height?: number };
  style?: { width?: number | string; height?: number | string };
};

export type LayoutFlowEdge = {
  id: string;
  source: string;
  target: string;
  data?: {
    label?: string;
    edgeType?: string;
    strength?: string;
  };
};

export type EdgeLabelLayoutOptions = {
  zoom?: number;
  selectedEdgeId?: string | null;
};

type Rect = { x: number; y: number; width: number; height: number };

type PlacedLabel = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type LabelCandidate = {
  t: number;
  offset: number;
  x: number;
  y: number;
  anchorX: number;
  anchorY: number;
};

type EdgeLayoutInput = {
  id: string;
  label: string;
  edgeType: string;
  strength: string;
  pathD: string;
  defaultX: number;
  defaultY: number;
  hasWarningIcon: boolean;
};

const LABEL_PADDING_X = 14;
const LABEL_ICON_WIDTH = 15;
const LABEL_HEIGHT = 24;
const CHAR_WIDTH_EST = 12;
const LABEL_COLLISION_PADDING = 8;
const NODE_MARGIN = 8;
const LEADER_THRESHOLD = 20;
const COLLISION_PENALTY = 1_000_000;

const CANDIDATE_T_VALUES = [0.5, 0.45, 0.55, 0.4, 0.6];
const NORMAL_OFFSETS = [0, 10, -10, 16, -16];

let pathMeasureElement: SVGPathElement | null = null;

function getPathMeasureElement() {
  if (typeof document === "undefined") return null;
  if (!pathMeasureElement) {
    pathMeasureElement = document.createElementNS("http://www.w3.org/2000/svg", "path");
  }
  return pathMeasureElement;
}

function numericStyleValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function getNodeDimensions(node: LayoutFlowNode) {
  const width =
    node.width ?? node.measured?.width ?? numericStyleValue(node.style?.width) ?? 202;
  const height =
    node.height ??
    node.measured?.height ??
    numericStyleValue(node.style?.height) ??
    104;
  return { width, height };
}

export function estimateLabelBox(label: string, hasWarningIcon: boolean) {
  void hasWarningIcon;
  const textWidth = Math.max(label.length, 2) * CHAR_WIDTH_EST;
  const width = Math.max(52, LABEL_PADDING_X + LABEL_ICON_WIDTH + textWidth);
  return { width, height: LABEL_HEIGHT };
}

function edgePriority(edgeType: string, strength: string) {
  if (edgeType === "bottleneck") return 0;
  if (strength === "strong") return 1;
  if (edgeType === "strong") return 1;
  if (edgeType === "normal") return 2;
  return 3;
}

export function buildEdgeBezierGeometry(
  sourceNode: LayoutFlowNode,
  targetNode: LayoutFlowNode,
) {
  const source = getNodeDimensions(sourceNode);
  const target = getNodeDimensions(targetNode);

  const sourceX = sourceNode.position.x + source.width;
  const sourceY = sourceNode.position.y + source.height / 2;
  const targetX = targetNode.position.x;
  const targetY = targetNode.position.y + target.height / 2;

  const [pathD, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition: Position.Right,
    targetX,
    targetY,
    targetPosition: Position.Left,
  });

  return { pathD, labelX, labelY, sourceX, sourceY, targetX, targetY };
}

export function samplePointOnPath(pathD: string, t: number) {
  const pathEl = getPathMeasureElement();
  if (!pathEl) {
    return { x: 0, y: 0 };
  }

  pathEl.setAttribute("d", pathD);
  const length = pathEl.getTotalLength();
  if (length <= 0) {
    return { x: 0, y: 0 };
  }

  const clamped = Math.max(0, Math.min(1, t));
  const point = pathEl.getPointAtLength(clamped * length);
  return { x: point.x, y: point.y };
}

function normalAtPath(pathD: string, t: number) {
  const delta = 0.008;
  const p1 = samplePointOnPath(pathD, Math.max(0, t - delta));
  const p2 = samplePointOnPath(pathD, Math.min(1, t + delta));
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const length = Math.hypot(dx, dy) || 1;
  return { nx: -dy / length, ny: dx / length };
}

function labelRectInFlow(
  candidate: LabelCandidate,
  labelBox: { width: number; height: number },
  zoom: number,
  padding = 0,
) {
  const safeZoom = Math.max(zoom, 0.1);
  const width = (labelBox.width + padding * 2) / safeZoom;
  const height = (labelBox.height + padding * 2) / safeZoom;
  return {
    x: candidate.x - width / 2,
    y: candidate.y - height / 2,
    width,
    height,
  };
}

function rectOverlapArea(a: Rect, b: Rect) {
  const overlapWidth = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const overlapHeight = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  if (overlapWidth <= 0 || overlapHeight <= 0) return 0;
  return overlapWidth * overlapHeight;
}

function labelOverlapArea(
  candidate: LabelCandidate,
  labelBox: { width: number; height: number },
  placed: PlacedLabel[],
  zoom: number,
) {
  const candidateRect = labelRectInFlow(
    candidate,
    labelBox,
    zoom,
    LABEL_COLLISION_PADDING,
  );
  return placed.reduce(
    (total, other) => total + rectOverlapArea(candidateRect, other),
    0,
  );
}

function nodeOverlapArea(
  candidate: LabelCandidate,
  labelBox: { width: number; height: number },
  nodeObstacles: Rect[],
  zoom: number,
) {
  const candidateRect = labelRectInFlow(candidate, labelBox, zoom);
  return nodeObstacles.reduce(
    (total, rect) => total + rectOverlapArea(candidateRect, rect),
    0,
  );
}

function candidateCollisionArea(
  candidate: LabelCandidate,
  labelBox: { width: number; height: number },
  placed: PlacedLabel[],
  nodeObstacles: Rect[],
  zoom: number,
) {
  return (
    labelOverlapArea(candidate, labelBox, placed, zoom) +
    nodeOverlapArea(candidate, labelBox, nodeObstacles, zoom)
  );
}

function buildNodeObstacles(nodes: LayoutFlowNode[]): Rect[] {
  return nodes.map((node) => {
    const { width, height } = getNodeDimensions(node);
    return {
      x: node.position.x - NODE_MARGIN,
      y: node.position.y - NODE_MARGIN,
      width: width + NODE_MARGIN * 2,
      height: height + NODE_MARGIN * 2,
    };
  });
}

function generateCandidates(pathD: string): LabelCandidate[] {
  const candidates: LabelCandidate[] = [];

  for (const t of CANDIDATE_T_VALUES) {
    const anchor = samplePointOnPath(pathD, t);
    const { nx, ny } = normalAtPath(pathD, t);

    for (const offset of NORMAL_OFFSETS) {
      candidates.push({
        t,
        offset,
        anchorX: anchor.x,
        anchorY: anchor.y,
        x: anchor.x + nx * offset,
        y: anchor.y + ny * offset,
      });
    }
  }

  return candidates;
}

function candidateCost(
  candidate: LabelCandidate,
  labelBox: { width: number; height: number },
  placed: PlacedLabel[],
  nodeObstacles: Rect[],
  zoom: number,
  edgeId: string,
  selectedEdgeId: string | null | undefined,
) {
  const collisionArea = candidateCollisionArea(
    candidate,
    labelBox,
    placed,
    nodeObstacles,
    zoom,
  );
  let cost = collisionArea * COLLISION_PENALTY;

  cost += Math.abs(candidate.t - 0.5) * 40;
  cost += Math.abs(candidate.offset) * 2;

  if (Math.abs(candidate.offset) > LEADER_THRESHOLD) {
    cost += 8;
  }

  if (edgeId === selectedEdgeId) {
    cost -= (1 - Math.abs(candidate.t - 0.5) * 2) * 80;
    if (candidate.offset === 0) {
      cost -= 50;
    }
  }

  return cost;
}

function toPlacement(candidate: LabelCandidate, hidden = false): EdgeLabelPlacement {
  const distance = Math.hypot(
    candidate.x - candidate.anchorX,
    candidate.y - candidate.anchorY,
  );
  const useLeader = distance > LEADER_THRESHOLD;

  return {
    x: candidate.x,
    y: candidate.y,
    anchorX: useLeader ? candidate.anchorX : undefined,
    anchorY: useLeader ? candidate.anchorY : undefined,
    hidden,
  };
}

function pickCandidate(
  edge: EdgeLayoutInput,
  labelBox: { width: number; height: number },
  placed: PlacedLabel[],
  nodeObstacles: Rect[],
  zoom: number,
  selectedEdgeId: string | null | undefined,
) {
  const candidates = generateCandidates(edge.pathD);
  const isSelected = edge.id === selectedEdgeId;
  const shouldForceDisplay =
    isSelected ||
    edge.edgeType === "bottleneck" ||
    edge.edgeType === "strong" ||
    edge.strength === "strong";

  let best: { candidate: LabelCandidate; cost: number; collisionArea: number } | null =
    null;
  let bestColliding: { candidate: LabelCandidate; collisionArea: number } | null = null;

  for (const candidate of candidates) {
    const cost = candidateCost(
      candidate,
      labelBox,
      placed,
      nodeObstacles,
      zoom,
      edge.id,
      selectedEdgeId,
    );
    const collisionArea = candidateCollisionArea(
      candidate,
      labelBox,
      placed,
      nodeObstacles,
      zoom,
    );

    if (!best || cost < best.cost) {
      best = { candidate, cost, collisionArea };
    }

    if (!bestColliding || collisionArea < bestColliding.collisionArea) {
      bestColliding = { candidate, collisionArea };
    }
  }

  if (!best) {
    return toPlacement(
      {
        t: 0.5,
        offset: 0,
        x: edge.defaultX,
        y: edge.defaultY,
        anchorX: edge.defaultX,
        anchorY: edge.defaultY,
      },
      !isSelected,
    );
  }

  const hasCollision = best.collisionArea > 0;

  if (!hasCollision) {
    return toPlacement(best.candidate);
  }

  if (bestColliding) {
    return toPlacement(bestColliding.candidate, !shouldForceDisplay);
  }

  return toPlacement(best.candidate, !shouldForceDisplay);
}

export function computeEdgeLabelLayout(
  nodes: LayoutFlowNode[],
  edges: LayoutFlowEdge[],
  options: EdgeLabelLayoutOptions = {},
): Record<string, EdgeLabelPlacement> {
  const zoom = Math.max(options.zoom ?? 1, 0.1);
  const selectedEdgeId = options.selectedEdgeId ?? null;
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const nodeObstacles = buildNodeObstacles(nodes);

  const edgeInputs: EdgeLayoutInput[] = [];

  for (const edge of edges) {
    const sourceNode = nodeById.get(edge.source);
    const targetNode = nodeById.get(edge.target);
    if (!sourceNode || !targetNode) continue;

    const { pathD, labelX, labelY } = buildEdgeBezierGeometry(sourceNode, targetNode);
    const edgeType = edge.data?.edgeType ?? "normal";
    const strength = edge.data?.strength ?? "normal";
    edgeInputs.push({
      id: edge.id,
      label: edge.data?.label ?? "導線",
      edgeType,
      strength,
      pathD,
      defaultX: labelX,
      defaultY: labelY,
      hasWarningIcon: edgeType === "bottleneck",
    });
  }

  edgeInputs.sort((a, b) => {
    const priorityDiff =
      edgePriority(a.edgeType, a.strength) - edgePriority(b.edgeType, b.strength);
    if (priorityDiff !== 0) return priorityDiff;
    return a.id.localeCompare(b.id);
  });

  const placements: Record<string, EdgeLabelPlacement> = {};
  const placed: PlacedLabel[] = [];

  for (const edge of edgeInputs) {
    const labelBox = estimateLabelBox(edge.label, edge.hasWarningIcon);
    const placement = pickCandidate(
      edge,
      labelBox,
      placed,
      nodeObstacles,
      zoom,
      selectedEdgeId,
    );
    placements[edge.id] = placement;

    if (!placement.hidden) {
      const placedRect = labelRectInFlow(
        {
          t: 0.5,
          offset: 0,
          x: placement.x,
          y: placement.y,
          anchorX: placement.anchorX ?? placement.x,
          anchorY: placement.anchorY ?? placement.y,
        },
        labelBox,
        zoom,
        LABEL_COLLISION_PADDING,
      );
      placed.push({
        x: placedRect.x,
        y: placedRect.y,
        width: placedRect.width,
        height: placedRect.height,
      });
    }
  }

  return placements;
}
