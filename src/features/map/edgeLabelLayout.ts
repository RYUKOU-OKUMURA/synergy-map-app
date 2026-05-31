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
  };
};

export type EdgeLabelLayoutOptions = {
  zoom?: number;
  selectedEdgeId?: string | null;
};

type Rect = { x: number; y: number; width: number; height: number };

type PlacedLabel = {
  cx: number;
  cy: number;
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
/** EdgeLabelRenderer 上で flow X が画面 X より強く圧縮される分を補正する */
const EDGE_LABEL_HORIZONTAL_SCALE = 0.18;
const LEADER_THRESHOLD = 20;
const COLLISION_PENALTY = 1_000_000;

const CANDIDATE_T_VALUES = [0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65];
const NORMAL_OFFSETS = [0, 12, -12, 24, -24, 36, -36, 48, -48];

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

function edgePriority(edgeType: string) {
  if (edgeType === "bottleneck") return 0;
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

function screenLabelOverlapArea(
  candidate: LabelCandidate,
  labelBox: { width: number; height: number },
  placed: PlacedLabel[],
  zoom: number,
) {
  let overlap = 0;

  for (const other of placed) {
    const screenDx =
      Math.abs(candidate.x - other.cx) * zoom * EDGE_LABEL_HORIZONTAL_SCALE;
    const screenDy = Math.abs(candidate.y - other.cy) * zoom;
    const minDx = (labelBox.width + other.width) / 2 + LABEL_COLLISION_PADDING;
    const minDy = (labelBox.height + other.height) / 2 + LABEL_COLLISION_PADDING;

    if (screenDx < minDx && screenDy < minDy) {
      overlap += (minDx - screenDx) * (minDy - screenDy);
    }
  }

  return overlap;
}

function labelCenterInsideRect(centerX: number, centerY: number, rect: Rect) {
  return (
    centerX >= rect.x &&
    centerX <= rect.x + rect.width &&
    centerY >= rect.y &&
    centerY <= rect.y + rect.height
  );
}

function nodeCollisionPenalty(centerX: number, centerY: number, nodeObstacles: Rect[]) {
  const hitsNode = nodeObstacles.some((rect) =>
    labelCenterInsideRect(centerX, centerY, rect),
  );
  return hitsNode ? COLLISION_PENALTY : 0;
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
  let cost =
    screenLabelOverlapArea(candidate, labelBox, placed, zoom) * COLLISION_PENALTY;
  cost += nodeCollisionPenalty(candidate.x, candidate.y, nodeObstacles);

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

  let best: { candidate: LabelCandidate; cost: number } | null = null;
  let bestColliding: { candidate: LabelCandidate; overlap: number } | null = null;

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
    const overlap =
      screenLabelOverlapArea(candidate, labelBox, placed, zoom) +
      (nodeCollisionPenalty(candidate.x, candidate.y, nodeObstacles) > 0 ? 1 : 0);

    if (!best || cost < best.cost) {
      best = { candidate, cost };
    }

    if (!bestColliding || overlap < bestColliding.overlap) {
      bestColliding = { candidate, overlap };
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

  const hasCollision = best.cost >= COLLISION_PENALTY;

  if (!hasCollision) {
    return toPlacement(best.candidate);
  }

  if (bestColliding && (isSelected || bestColliding.overlap > 0)) {
    return toPlacement(
      bestColliding.candidate,
      !isSelected && bestColliding.overlap > 0,
    );
  }

  return toPlacement(best.candidate, !isSelected);
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
    edgeInputs.push({
      id: edge.id,
      label: edge.data?.label ?? "導線",
      edgeType,
      pathD,
      defaultX: labelX,
      defaultY: labelY,
      hasWarningIcon: edgeType === "bottleneck",
    });
  }

  edgeInputs.sort((a, b) => {
    const priorityDiff = edgePriority(a.edgeType) - edgePriority(b.edgeType);
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
      placed.push({
        cx: placement.x,
        cy: placement.y,
        width: labelBox.width,
        height: labelBox.height,
      });
    }
  }

  return placements;
}
