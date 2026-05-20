import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import {
  Archive,
  BarChart3,
  Clock3,
  Database,
  Download,
  ExternalLink,
  FileText,
  FolderKanban,
  FolderOpen,
  Gauge,
  Globe2,
  History,
  Home,
  Info,
  Layers3,
  Link as LinkIcon,
  ListChecks,
  Map as MapIcon,
  MessageSquareText,
  MousePointer2,
  PencilRuler,
  Plus,
  Save,
  Settings,
  Sparkles,
  Target,
  Trash2,
  TriangleAlert,
  TrendingUp,
  Upload,
  X,
} from "lucide-react";
import type * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import "./App.css";
import {
  SynergyMapCanvas,
  type MapViewMode,
  type MapNodeLayout,
  type NodeImpactStats,
  type NodePositionOverrides,
} from "@/features/map/SynergyMapCanvas";
import { demoProject, demoWorkspace, emptyWorkspace } from "@/lib/demoWorkspace";
import {
  adoptionOptions,
  categoryOptions,
  confidenceOptions,
  costLevelOptions,
  impactLevelOptions,
  labelFor,
  priorityOptions,
  timeToImpactOptions,
} from "@/lib/mvp1Labels";
import type {
  AiRunRow,
  CodexUiEvent,
  CodexRuntimeInfo,
  CodexSmokeResult,
  DeviceCodeLoginResult,
  ExportResult,
  ExtractedItemRow,
  MapEdgeRow,
  MapNodeRow,
  MvpRunResult,
  Project,
  ProjectWorkspace,
  SelectedMapElement,
  SourceFileRow,
  SuggestionRow,
  ViewLayoutRow,
} from "@/lib/mvp1Types";
import {
  mapPurposeLabel,
  mapPurposeOptions,
  type MapPurposeId,
} from "@/lib/onboardingOptions";

type ViewId =
  | "home"
  | "projects"
  | "sources"
  | "extract"
  | "map"
  | "suggestions"
  | "export"
  | "history"
  | "settings";

type ProjectFormValues = {
  name: string;
  clientName: string;
  industry: string;
  description: string;
  memo: string;
};

type OnboardingDraft = {
  companyName: string;
  purposeId: MapPurposeId | "";
  industry: string;
  memo: string;
  websiteUrls: string[];
  snsUrls: string[];
  productInfo: string;
};

type CodexConnectionAction = "refresh" | "smoke" | "login";

type InformationSourceKind = "manual_note" | "website_url" | "sns_url" | "product_info";

type InformationSourceDraft = {
  sourceKind: InformationSourceKind;
  title: string;
  body: string;
  url: string;
};

const CODEX_EVENT_NAME = "codex-app-server-event";

type SourceReflectionState =
  | "needs_extraction"
  | "extracted"
  | "no_cards"
  | "needs_map"
  | "mapped"
  | "not_ready";

type SourceReflectionRow = {
  source: SourceFileRow;
  title: string;
  detail: string | null;
  extractedItemCount: number;
  mappedItemCount: number;
  extractionState: SourceReflectionState;
  mapState: SourceReflectionState;
};

type WorkspaceReflectionSummary = {
  rows: SourceReflectionRow[];
  sourceCount: number;
  pendingExtractionCount: number;
  extractedSourceCount: number;
  noCardSourceCount: number;
  pendingMapCount: number;
  mappedSourceCount: number;
  mapRefreshNeeded: boolean;
};

function emptyDeviceCodeResult(): DeviceCodeLoginResult {
  return {
    ok: false,
    loginId: null,
    verificationUrl: null,
    userCode: null,
    completionSuccess: null,
    cancelStatus: null,
    events: [],
    stderr: [],
    errors: [],
    warnings: [],
  };
}

const globalNavItems: Array<{ id: ViewId; label: string; icon: typeof FolderKanban }> =
  [
    { id: "home", label: "ホーム", icon: Home },
    { id: "projects", label: "案件一覧", icon: FolderKanban },
  ];

const projectNavItems: Array<{ id: ViewId; label: string; icon: typeof FolderKanban }> =
  [
    { id: "map", label: "マップ", icon: MapIcon },
    { id: "sources", label: "情報ソース", icon: Upload },
    { id: "extract", label: "抽出カード", icon: ListChecks },
    { id: "suggestions", label: "施策", icon: MessageSquareText },
    { id: "export", label: "出力", icon: Download },
    { id: "history", label: "履歴", icon: History },
  ];

const informationSourceOptions: Array<{
  id: InformationSourceKind;
  label: string;
  icon: typeof FileText;
}> = [
  { id: "manual_note", label: "自由メモ", icon: MessageSquareText },
  { id: "website_url", label: "ホームページURL", icon: Globe2 },
  { id: "sns_url", label: "SNS URL", icon: LinkIcon },
  { id: "product_info", label: "商品情報", icon: Archive },
];

function sourceTypeLabel(fileType: string) {
  return (
    informationSourceOptions.find((option) => option.id === fileType)?.label ??
    (fileType === "onboarding_brief"
      ? "初回入力"
      : fileType === "markdown"
        ? "Markdown"
        : fileType.toUpperCase())
  );
}

function shortText(value: string, limit = 92) {
  const trimmed = value.trim();
  if (trimmed.length <= limit) return trimmed;
  return `${trimmed.slice(0, limit)}...`;
}

function compactStringList(values: string[]) {
  return values.map((value) => value.trim()).filter(Boolean);
}

function hasOnboardingBrief(workspace: ProjectWorkspace) {
  return workspace.sourceFiles.some((source) => source.fileType === "onboarding_brief");
}

function hasUnconfirmedGeneratedItems(workspace: ProjectWorkspace) {
  return workspace.extractedItems.some(
    (item) =>
      item.confidenceStatus === "estimated" || item.confidenceStatus === "needs_review",
  );
}

function hasTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function formatTime(value: string | null | undefined) {
  if (!value) return "-";
  try {
    return new Intl.DateTimeFormat("ja-JP", {
      hour: "2-digit",
      minute: "2-digit",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function isFallbackRun(run: AiRunRow | null | undefined) {
  return run?.model === "mvp-local-draft" || run?.status === "fallback_completed";
}

function aiRunSourceLabel(run: AiRunRow | null | undefined) {
  if (!run) return "AI未実行";
  return isFallbackRun(run) ? "ローカルドラフト" : "Codex生成";
}

function aiRunStatusLabel(run: AiRunRow | null | undefined) {
  if (!run) return "未実行";
  if (run.status === "completed") return "完了";
  if (run.status === "fallback_completed") return "補完完了";
  if (run.status === "response_validated") return "検証済み";
  if (run.status === "fallback_response_validated") return "補完検証済み";
  return run.status;
}

function parseMetadataJson(metadataJson: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(metadataJson) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function metadataString(metadataJson: string, key: string) {
  const value = parseMetadataJson(metadataJson)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function timestampMillis(value: string | null | undefined) {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

function latestRunCreatedAt(workspace: ProjectWorkspace, runType: string) {
  return (
    workspace.aiRuns.find((run) => run.runType === runType)?.completedAt ??
    workspace.aiRuns.find((run) => run.runType === runType)?.createdAt ??
    null
  );
}

function hasAcceptedItemWithoutMapNode(workspace: ProjectWorkspace) {
  const mappedItemIds = new Set(
    workspace.nodes
      .map((node) => node.extractedItemId)
      .filter((id): id is string => Boolean(id)),
  );

  return workspace.extractedItems.some(
    (item) => item.adoptionStatus !== "rejected" && !mappedItemIds.has(item.id),
  );
}

function hasItemEditedAfterMapGeneration(workspace: ProjectWorkspace) {
  const latestMapRunAt = latestRunCreatedAt(workspace, "generate_map");
  if (!latestMapRunAt) return false;

  const latestMapTime = Date.parse(latestMapRunAt);
  if (!Number.isFinite(latestMapTime)) return false;

  return workspace.extractedItems.some((item) => {
    const itemUpdatedTime = Date.parse(item.updatedAt);
    return Number.isFinite(itemUpdatedTime) && itemUpdatedTime > latestMapTime;
  });
}

function shouldRegenerateMap(workspace: ProjectWorkspace) {
  return (
    workspace.nodes.length > 0 &&
    (hasAcceptedItemWithoutMapNode(workspace) ||
      hasItemEditedAfterMapGeneration(workspace))
  );
}

function sourceDisplayTitle(source: SourceFileRow) {
  return (
    metadataString(source.metadataJson, "title") ??
    metadataString(source.metadataJson, "url") ??
    source.fileName
  );
}

function sourceDisplayDetail(source: SourceFileRow) {
  const url = metadataString(source.metadataJson, "url");
  if (url) return url;
  if (source.fileType === "onboarding_brief") return "初回マップ作成で入力した情報";
  return null;
}

function buildWorkspaceReflectionSummary(
  workspace: ProjectWorkspace,
): WorkspaceReflectionSummary {
  const latestExtractTime = timestampMillis(
    latestRunCreatedAt(workspace, "extract_items"),
  );
  const latestMapTime = timestampMillis(latestRunCreatedAt(workspace, "generate_map"));
  const chunksBySource = new Map<string, typeof workspace.sourceChunks>();

  for (const chunk of workspace.sourceChunks) {
    const current = chunksBySource.get(chunk.sourceFileId) ?? [];
    current.push(chunk);
    chunksBySource.set(chunk.sourceFileId, current);
  }

  const mappedItemIds = new Set(
    workspace.nodes
      .filter((node) => node.adoptionStatus !== "rejected")
      .map((node) => node.extractedItemId)
      .filter((id): id is string => Boolean(id)),
  );

  const rows = workspace.sourceFiles.map((source) => {
    const sourceChunks = chunksBySource.get(source.id) ?? [];
    const sourceChunkIds = new Set(sourceChunks.map((chunk) => chunk.id));
    const linkedItems = workspace.extractedItems.filter(
      (item) =>
        item.adoptionStatus !== "rejected" &&
        item.sources.some(
          (itemSource) =>
            itemSource.sourceFileId === source.id ||
            (itemSource.sourceChunkId
              ? sourceChunkIds.has(itemSource.sourceChunkId)
              : false),
        ),
    );
    const acceptedLinkedItems = linkedItems.filter(
      (item) => item.adoptionStatus === "accepted",
    );
    const mappedItemCount = acceptedLinkedItems.filter((item) =>
      mappedItemIds.has(item.id),
    ).length;
    const sourceTimes = [
      timestampMillis(source.createdAt),
      timestampMillis(source.updatedAt),
      ...sourceChunks.map((chunk) => timestampMillis(chunk.createdAt)),
    ].filter((time): time is number => typeof time === "number");
    const latestSourceTime = sourceTimes.length > 0 ? Math.max(...sourceTimes) : null;
    const hasReadableChunks =
      (sourceChunks.length > 0 || source.chunkCount > 0) && source.status !== "error";
    const addedAfterExtraction =
      latestSourceTime !== null &&
      latestExtractTime !== null &&
      latestSourceTime > latestExtractTime;
    const addedAfterMap =
      latestSourceTime !== null &&
      latestMapTime !== null &&
      latestSourceTime > latestMapTime;
    const itemEditedAfterMap =
      latestMapTime !== null &&
      acceptedLinkedItems.some((item) => {
        const itemTime = timestampMillis(item.updatedAt);
        return itemTime !== null && itemTime > latestMapTime;
      });

    let extractionState: SourceReflectionState;
    if (!hasReadableChunks) {
      extractionState = "not_ready";
    } else if (!latestExtractTime || addedAfterExtraction) {
      extractionState = "needs_extraction";
    } else if (linkedItems.length === 0) {
      extractionState = "no_cards";
    } else {
      extractionState = "extracted";
    }

    let mapState: SourceReflectionState;
    if (extractionState === "not_ready") {
      mapState = "not_ready";
    } else if (extractionState === "needs_extraction") {
      mapState = "needs_extraction";
    } else if (acceptedLinkedItems.length === 0) {
      mapState = "no_cards";
    } else if (
      workspace.nodes.length === 0 ||
      !latestMapTime ||
      addedAfterMap ||
      itemEditedAfterMap ||
      mappedItemCount < acceptedLinkedItems.length
    ) {
      mapState = "needs_map";
    } else {
      mapState = "mapped";
    }

    return {
      source,
      title: sourceDisplayTitle(source),
      detail: sourceDisplayDetail(source),
      extractedItemCount: linkedItems.length,
      mappedItemCount,
      extractionState,
      mapState,
    };
  });

  const pendingExtractionCount = rows.filter(
    (row) => row.extractionState === "needs_extraction",
  ).length;
  const pendingMapCount = rows.filter((row) => row.mapState === "needs_map").length;

  return {
    rows,
    sourceCount: rows.length,
    pendingExtractionCount,
    extractedSourceCount: rows.filter((row) => row.extractionState === "extracted")
      .length,
    noCardSourceCount: rows.filter((row) => row.extractionState === "no_cards").length,
    pendingMapCount,
    mappedSourceCount: rows.filter((row) => row.mapState === "mapped").length,
    mapRefreshNeeded: pendingMapCount > 0 || shouldRegenerateMap(workspace),
  };
}

function reflectionStateLabel(state: SourceReflectionState, phase: "extract" | "map") {
  if (state === "needs_extraction") return "抽出未反映";
  if (state === "extracted") return "抽出済み";
  if (state === "no_cards")
    return phase === "extract" ? "カードなし" : "マップ対象なし";
  if (state === "needs_map") return "マップ未反映";
  if (state === "mapped") return "マップ反映済み";
  return "読み取り待ち";
}

function reflectionSummaryText(summary: WorkspaceReflectionSummary) {
  if (summary.sourceCount === 0) {
    return "情報ソースはまだありません。";
  }
  if (summary.pendingExtractionCount > 0) {
    return `追加・更新された情報ソース ${summary.pendingExtractionCount}件が、まだ抽出カードに反映されていません。`;
  }
  if (summary.pendingMapCount > 0 || summary.mapRefreshNeeded) {
    const countText =
      summary.pendingMapCount > 0 ? ` ${summary.pendingMapCount}件分` : "";
    return `抽出カードの内容${countText}が、まだマップに反映されていません。`;
  }
  return "登録済みの情報ソースは現在のマップに反映されています。";
}

function needsReflectionAttention(summary: WorkspaceReflectionSummary) {
  return (
    summary.pendingExtractionCount > 0 ||
    summary.pendingMapCount > 0 ||
    summary.mapRefreshNeeded
  );
}

function getPrimaryActionLabel(workspace: ProjectWorkspace) {
  if (workspace.sourceChunks.length === 0 && workspace.extractedItems.length === 0) {
    return "情報を追加";
  }
  if (workspace.extractedItems.length === 0) {
    return "AIで材料整理";
  }
  if (workspace.nodes.length === 0) {
    return "マップ生成";
  }
  if (shouldRegenerateMap(workspace)) {
    return "マップ再生成";
  }
  if (workspace.suggestions.length === 0 && workspace.aiComments.length === 0) {
    return "施策と確認質問";
  }
  return "マップに相談";
}

function layoutToJson(layout: MapNodeLayout) {
  const value: Record<string, string | number> = {
    nodeId: layout.nodeId,
    x: layout.x,
    y: layout.y,
  };
  if (typeof layout.width === "number") value.width = layout.width;
  if (typeof layout.height === "number") value.height = layout.height;
  return value;
}

function parseNodeLayout(positionJson: string) {
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

function readableCustomerJourneyLayouts(nodes: MapNodeRow[]): MapNodeLayout[] {
  const categoryCounts = new Map<string, number>();
  return nodes
    .filter((node) => node.adoptionStatus !== "rejected")
    .map((node) => {
      const count = categoryCounts.get(node.nodeType) ?? 0;
      categoryCounts.set(node.nodeType, count + 1);
      const current = parseNodeLayout(node.positionJson);
      const y = 88 + count * 132;
      const x =
        node.nodeType === "business"
          ? 80
          : node.nodeType === "channel"
            ? 350
            : node.nodeType === "touchpoint"
              ? 625
              : node.nodeType === "service"
                ? 900
                : node.nodeType === "finance"
                  ? 900
                  : 80;
      const yOffset =
        node.nodeType === "finance" ? 150 : node.nodeType === "data_source" ? 270 : 0;
      return {
        nodeId: node.id,
        x,
        y: y + yOffset,
        width: current.width,
        height: current.height,
      };
    });
}

function mergeNodePositionJson(positionJson: string, layout: MapNodeLayout) {
  let current: Record<string, unknown>;
  try {
    current = JSON.parse(positionJson) as Record<string, unknown>;
  } catch {
    current = {};
  }
  return JSON.stringify({
    ...current,
    ...layoutToJson(layout),
  });
}

function mergeViewLayoutJson(
  currentLayoutJson: string | null,
  viewId: MapViewMode,
  layouts: MapNodeLayout[],
) {
  const layoutMap = new Map<string, MapNodeLayout>();
  if (currentLayoutJson) {
    try {
      const parsed = JSON.parse(currentLayoutJson) as {
        positions?: Array<{
          nodeId?: string;
          x?: number;
          y?: number;
          width?: number;
          height?: number;
        }>;
      };
      for (const position of parsed.positions ?? []) {
        if (
          typeof position.nodeId === "string" &&
          typeof position.x === "number" &&
          typeof position.y === "number"
        ) {
          layoutMap.set(position.nodeId, {
            nodeId: position.nodeId,
            x: position.x,
            y: position.y,
            width: position.width,
            height: position.height,
          });
        }
      }
    } catch {
      layoutMap.clear();
    }
  }

  for (const layout of layouts) {
    layoutMap.set(layout.nodeId, layout);
  }

  return JSON.stringify({
    viewId,
    positions: Array.from(layoutMap.values())
      .sort((left, right) => left.nodeId.localeCompare(right.nodeId))
      .map(layoutToJson),
  });
}

function applyLocalMapLayouts(
  workspace: ProjectWorkspace,
  projectId: string,
  viewMode: MapViewMode,
  layouts: MapNodeLayout[],
): ProjectWorkspace {
  const now = new Date().toISOString();
  if (viewMode === "customer_journey") {
    return {
      ...workspace,
      nodes: workspace.nodes.map((node) => {
        const layout = layouts.find((candidate) => candidate.nodeId === node.id);
        if (!layout) return node;
        return {
          ...node,
          positionJson: mergeNodePositionJson(node.positionJson, layout),
          updatedAt: now,
        };
      }),
    };
  }

  const currentLayout =
    workspace.viewLayouts.find((layout) => layout.viewId === viewMode) ?? null;
  const nextLayout: ViewLayoutRow = {
    id: currentLayout?.id ?? `local-layout-${viewMode}`,
    projectId,
    viewId: viewMode,
    layoutJson: mergeViewLayoutJson(
      currentLayout?.layoutJson ?? null,
      viewMode,
      layouts,
    ),
    createdAt: currentLayout?.createdAt ?? now,
    updatedAt: now,
  };

  return {
    ...workspace,
    viewLayouts: [
      ...workspace.viewLayouts.filter((layout) => layout.viewId !== viewMode),
      nextLayout,
    ],
  };
}

function App() {
  const isTauriRuntime = hasTauriRuntime();
  const [view, setView] = useState<ViewId>("home");
  const [projects, setProjects] = useState<Project[]>(
    isTauriRuntime ? [] : [demoProject],
  );
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<ProjectWorkspace>(emptyWorkspace);
  const [mapViewMode, setMapViewMode] = useState<MapViewMode>("customer_journey");
  const [selectedMapElement, setSelectedMapElement] =
    useState<SelectedMapElement>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedSuggestionId, setSelectedSuggestionId] = useState<string | null>(null);
  const [isTrayOpen, setIsTrayOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isMapEditMode, setIsMapEditMode] = useState(false);
  const [layoutSaveStatus, setLayoutSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [layoutSaveScope, setLayoutSaveScope] = useState<string | null>(null);
  const [mapInsightBusy, setMapInsightBusy] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [codexRuntimeInfo, setCodexRuntimeInfo] = useState<CodexRuntimeInfo | null>(
    null,
  );
  const [codexSmokeResult, setCodexSmokeResult] = useState<CodexSmokeResult | null>(
    null,
  );
  const [deviceCodeResult, setDeviceCodeResult] =
    useState<DeviceCodeLoginResult | null>(null);
  const [codexBusy, setCodexBusy] = useState<CodexConnectionAction | null>(null);
  const [approvedChunkSignature, setApprovedChunkSignature] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [excludedChunkIds, setExcludedChunkIds] = useState<string[]>([]);

  const activeProject = useMemo(
    () =>
      selectedProjectId
        ? (projects.find((project) => project.id === selectedProjectId) ?? null)
        : null,
    [projects, selectedProjectId],
  );
  const activeProjectId = activeProject?.id ?? null;

  const readableChunkIds = useMemo(
    () => workspace.sourceChunks.map((chunk) => chunk.id),
    [workspace.sourceChunks],
  );

  const selectedChunkIds = useMemo(() => {
    const excludedSet = new Set(excludedChunkIds);
    return readableChunkIds.filter((id) => !excludedSet.has(id));
  }, [excludedChunkIds, readableChunkIds]);
  const selectedChunkSignature = selectedChunkIds.join("|");
  const isAiSendApproved =
    selectedChunkIds.length > 0 && approvedChunkSignature === selectedChunkSignature;

  const selectedItem = useMemo(
    () => workspace.extractedItems.find((item) => item.id === selectedItemId) ?? null,
    [selectedItemId, workspace.extractedItems],
  );

  const selectedNode = useMemo(
    () =>
      selectedMapElement?.kind === "node"
        ? (workspace.nodes.find((node) => node.id === selectedMapElement.id) ?? null)
        : null,
    [selectedMapElement, workspace.nodes],
  );

  const selectedEdge = useMemo(
    () =>
      selectedMapElement?.kind === "edge"
        ? (workspace.edges.find((edge) => edge.id === selectedMapElement.id) ?? null)
        : null,
    [selectedMapElement, workspace.edges],
  );

  const selectedSuggestion = useMemo(
    () =>
      workspace.suggestions.find(
        (suggestion) => suggestion.id === selectedSuggestionId,
      ) ?? null,
    [selectedSuggestionId, workspace.suggestions],
  );

  const saveStatus = workspace.versions[0]
    ? `保存済み ${formatTime(workspace.versions[0].createdAt)}`
    : "保存済み";
  const latestAiRun = workspace.aiRuns[0] ?? null;
  const reflectionSummary = useMemo(
    () => buildWorkspaceReflectionSummary(workspace),
    [workspace],
  );
  const currentLayoutScope = `${activeProjectId ?? "none"}:${mapViewMode}`;
  const visibleLayoutSaveStatus =
    layoutSaveScope === currentLayoutScope ? layoutSaveStatus : "idle";
  const primaryActionLabel = getPrimaryActionLabel(workspace);

  useEffect(() => {
    if (!notice) return;
    const timeoutId = window.setTimeout(() => setNotice(null), 3200);
    return () => window.clearTimeout(timeoutId);
  }, [notice]);

  useEffect(() => {
    if (!isTauriRuntime) return;
    let disposed = false;
    let cleanup: (() => void) | null = null;

    void listen<CodexUiEvent>(CODEX_EVENT_NAME, (event) => {
      const payload = event.payload;
      if (payload.kind !== "device-code") return;

      setDeviceCodeResult((current) => {
        const base = current ?? emptyDeviceCodeResult();
        const warnings =
          payload.detail && payload.cancelStatus
            ? [...base.warnings, payload.detail]
            : base.warnings;

        return {
          ...base,
          ok: payload.completionSuccess === true ? true : base.ok,
          verificationUrl: payload.verificationUrl ?? base.verificationUrl,
          userCode: payload.userCode ?? base.userCode,
          completionSuccess: payload.completionSuccess ?? base.completionSuccess,
          cancelStatus: payload.cancelStatus ?? base.cancelStatus,
          events: [...base.events, payload],
          warnings,
        };
      });

      if (payload.completionSuccess === true) {
        setNotice("ChatGPT認証が完了しました。接続テストでCodex生成を確認できます。");
      } else if (payload.cancelStatus) {
        setNotice("認証待機を終了しました。必要なら認証コードを再取得してください。");
      }
    }).then((unlisten) => {
      if (disposed) {
        unlisten();
      } else {
        cleanup = unlisten;
      }
    });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [isTauriRuntime]);

  useEffect(() => {
    void handleRefreshCodexRuntime();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTauriRuntime]);

  async function runAction<T>(
    action: () => Promise<T>,
    success?: (result: T) => void | Promise<void>,
  ) {
    setIsBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await action();
      await success?.(result);
    } catch (caughtError) {
      setError(String(caughtError));
    } finally {
      setIsBusy(false);
    }
  }

  function resetProjectScopedSelection() {
    setSelectedItemId(null);
    setSelectedMapElement(null);
    setSelectedSuggestionId(null);
    setExcludedChunkIds([]);
    setApprovedChunkSignature(null);
    setIsDrawerOpen(false);
    setIsMapEditMode(false);
  }

  function handleStartNewMap() {
    setSelectedProjectId(null);
    setWorkspace(emptyWorkspace);
    resetProjectScopedSelection();
    setView("map");
  }

  function handleSelectProject(projectId: string, nextView: ViewId = "map") {
    setSelectedProjectId(projectId);
    setWorkspace(emptyWorkspace);
    resetProjectScopedSelection();
    if (!isTauriRuntime && projectId === demoProject.id) {
      setWorkspace(demoWorkspace);
    }
    setView(nextView);
  }

  function handleClearProjectSelection(nextView: ViewId = "home") {
    setSelectedProjectId(null);
    setWorkspace(emptyWorkspace);
    resetProjectScopedSelection();
    setView(nextView);
  }

  async function handleUpdateProject(projectId: string, values: ProjectFormValues) {
    await runAction(
      async () => {
        const nextWorkspace = await invoke<ProjectWorkspace>("update_project", {
          projectId,
          name: values.name,
          clientName: values.clientName,
          industry: values.industry,
          description: values.description,
          memo: values.memo,
        });
        const nextProjects = await invoke<Project[]>("list_projects");
        return { nextProjects, nextWorkspace };
      },
      ({ nextProjects, nextWorkspace }) => {
        setProjects(nextProjects);
        setWorkspace(nextWorkspace);
        setSelectedProjectId(projectId);
        setSelectedSuggestionId(null);
        setApprovedChunkSignature(null);
        setNotice("案件情報を保存しました。");
      },
    );
  }

  async function handleDeleteProject(projectId: string) {
    if (
      !window.confirm(
        "この案件、DBレコード、元資料、source chunks、AI実行ファイル、exportsを削除します。続行しますか？",
      )
    ) {
      return;
    }
    await runAction(
      async () => {
        await invoke("delete_project", { projectId });
        const nextProjects = await invoke<Project[]>("list_projects");
        return { nextProjects };
      },
      ({ nextProjects }) => {
        setProjects(nextProjects);
        handleClearProjectSelection("projects");
        setView("projects");
        setNotice("案件と関連データを削除しました。");
      },
    );
  }

  async function handleAiUpdate() {
    if (!activeProjectId) return;
    if (workspace.extractedItems.length === 0) {
      if (workspace.sourceChunks.length === 0) {
        setView("map");
        setNotice("まずマップ作成画面で目的と情報を入力してください。");
        return;
      }
      if (!isAiSendApproved) {
        setView("extract");
        setNotice("AI抽出前に送信範囲を確認してください。");
        return;
      }
      await runAction(
        () =>
          invoke<MvpRunResult>("run_extract_items", {
            projectId: activeProjectId,
            sourceChunkIds: selectedChunkIds,
          }),
        (result) => {
          setWorkspace(result.workspace);
          setNotice(result.message);
          setSelectedMapElement(null);
          setSelectedSuggestionId(null);
          setIsDrawerOpen(false);
          setView("extract");
        },
      );
      return;
    }
    if (workspace.nodes.length === 0 || shouldRegenerateMap(workspace)) {
      await runAction(
        () =>
          invoke<MvpRunResult>("generate_map_from_items", {
            projectId: activeProjectId,
          }),
        (result) => {
          setWorkspace(result.workspace);
          setNotice(result.message);
          setSelectedMapElement(null);
          setSelectedSuggestionId(null);
          setIsDrawerOpen(false);
          setView("map");
        },
      );
      return;
    }
    if (workspace.suggestions.length > 0 || workspace.aiComments.length > 0) {
      setView("map");
      await handleAskWholeMap("explain");
      return;
    }
    await runAction(
      () =>
        invoke<MvpRunResult>("generate_suggestions_from_map", {
          projectId: activeProjectId,
        }),
      (result) => {
        setWorkspace(result.workspace);
        setNotice(result.message);
        setIsDrawerOpen(true);
      },
    );
  }

  async function handleExtract() {
    if (!activeProjectId) return;
    await runAction(
      () =>
        invoke<MvpRunResult>("run_extract_items", {
          projectId: activeProjectId,
          sourceChunkIds: selectedChunkIds,
        }),
      (result) => {
        setWorkspace(result.workspace);
        setNotice(result.message);
        setSelectedItemId(result.workspace.extractedItems[0]?.id ?? null);
        setSelectedMapElement(null);
        setSelectedSuggestionId(null);
        setIsDrawerOpen(false);
      },
    );
  }

  async function handleRegenerateMap() {
    if (!activeProjectId) return;
    await runAction(
      () =>
        invoke<MvpRunResult>("generate_map_from_items", {
          projectId: activeProjectId,
        }),
      (result) => {
        setWorkspace(result.workspace);
        setNotice(result.message);
        setSelectedMapElement(null);
        setSelectedSuggestionId(null);
        setIsDrawerOpen(false);
        setView("map");
      },
    );
  }

  async function handleCreateManualItem() {
    if (!activeProjectId) return;
    await runAction(
      () =>
        invoke<ProjectWorkspace>("create_extracted_item", {
          projectId: activeProjectId,
          name: "手動カード",
          itemType: "business",
          description: "会議中に追加した確認対象です。",
        }),
      (nextWorkspace) => {
        setWorkspace(nextWorkspace);
        setSelectedItemId(nextWorkspace.extractedItems[0]?.id ?? null);
        setNotice("手動カードを追加しました。");
      },
    );
  }

  async function handleGenerateSuggestions() {
    if (!activeProjectId) return;
    await runAction(
      () =>
        invoke<MvpRunResult>("generate_suggestions_from_map", {
          projectId: activeProjectId,
        }),
      (result) => {
        setWorkspace(result.workspace);
        setNotice(result.message);
        setIsDrawerOpen(true);
      },
    );
  }

  async function handleExport(command: "export_markdown" | "export_csv_bundle") {
    if (!activeProjectId) return;
    await runAction(
      () => invoke<ExportResult>(command, { projectId: activeProjectId }),
      (result) => {
        setWorkspace(result.workspace);
        setNotice(`出力しました: ${result.exportJob.outputPath ?? "-"}`);
      },
    );
  }

  async function handleRefreshCodexRuntime() {
    if (!isTauriRuntime) {
      setCodexRuntimeInfo({
        commandStrategy: "ブラウザ確認用デモ",
        resolvedPath: null,
        realPath: null,
        version: null,
        targetTriple: null,
        sidecarCandidateName: null,
        frontendShellPermissions: "なし",
        distributionDecision: "Tauri実行時にCodex接続を確認します。",
        warnings: ["Tauri実行時のみCodex CLIを確認できます。"],
      });
      return;
    }
    setCodexBusy("refresh");
    setError(null);
    try {
      const result = await invoke<CodexRuntimeInfo>("get_codex_runtime_info");
      setCodexRuntimeInfo(result);
    } catch (caughtError) {
      setError(String(caughtError));
    } finally {
      setCodexBusy(null);
    }
  }

  async function handleRunCodexSmokeTest() {
    if (!isTauriRuntime) return;
    setCodexBusy("smoke");
    setError(null);
    try {
      const result = await invoke<CodexSmokeResult>("run_codex_smoke_test");
      setCodexSmokeResult(result);
      setNotice(
        result.ok ? "Codex接続を確認しました。" : "Codex接続確認に失敗しました。",
      );
    } catch (caughtError) {
      setError(String(caughtError));
    } finally {
      setCodexBusy(null);
    }
  }

  async function handleRunCodexLoginCheck() {
    if (!isTauriRuntime) return;
    setCodexBusy("login");
    setError(null);
    try {
      const result = await invoke<DeviceCodeLoginResult>("run_codex_device_code_check");
      setDeviceCodeResult(result);
      setNotice(
        result.verificationUrl
          ? "ChatGPT認証用のURLとコードを取得しました。"
          : "ChatGPT認証情報を取得できませんでした。",
      );
    } catch (caughtError) {
      setError(String(caughtError));
    } finally {
      setCodexBusy(null);
    }
  }

  async function handleOpenExternalUrl(url: string) {
    if (!url) return;
    if (!isTauriRuntime) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    try {
      await invoke("open_external_url", { url });
    } catch (caughtError) {
      setError(String(caughtError));
    }
  }

  async function handleCreateOnboardingMap(draft: OnboardingDraft) {
    const purposeLabel = mapPurposeLabel(draft.purposeId);
    if (!draft.companyName.trim() || !purposeLabel) {
      setNotice("企業名 / 案件名と目的を入力してください。");
      return;
    }

    setIsBusy(true);
    setError(null);
    setNotice(null);
    try {
      let projectId = activeProjectId;
      let nextProjects: Project[];

      if (!projectId || !activeProject) {
        const created = await invoke<Project>("create_project", {
          name: draft.companyName.trim(),
          clientName: draft.companyName.trim(),
          industry: draft.industry.trim(),
          description: purposeLabel,
          memo: draft.memo.trim(),
        });
        projectId = created.id;
        nextProjects = await invoke<Project[]>("list_projects");
      } else {
        await invoke<ProjectWorkspace>("update_project", {
          projectId,
          name: draft.companyName.trim(),
          clientName: activeProject.clientName?.trim() || draft.companyName.trim(),
          industry: draft.industry.trim() || activeProject.industry || "",
          description: purposeLabel,
          memo: draft.memo.trim() || activeProject.memo || "",
        });
        nextProjects = await invoke<Project[]>("list_projects");
      }

      const sourceWorkspace = await invoke<ProjectWorkspace>(
        "create_onboarding_brief_source",
        {
          projectId,
          companyName: draft.companyName.trim(),
          purposeId: draft.purposeId,
          purposeLabel,
          industry: draft.industry.trim(),
          memo: draft.memo.trim(),
          websiteUrls: compactStringList(draft.websiteUrls),
          snsUrls: compactStringList(draft.snsUrls),
          productInfo: draft.productInfo.trim(),
        },
      );

      setProjects(nextProjects);
      setSelectedProjectId(projectId);
      setWorkspace(sourceWorkspace);
      setApprovedChunkSignature(null);
      setExcludedChunkIds([]);
      setSelectedItemId(null);
      setSelectedMapElement(null);
      setSelectedSuggestionId(null);
      setView("map");

      const sourceChunkIds = sourceWorkspace.sourceChunks.map((chunk) => chunk.id);
      const extractResult = await invoke<MvpRunResult>("run_extract_items", {
        projectId,
        sourceChunkIds,
      });
      setWorkspace(extractResult.workspace);

      const mapResult = await invoke<MvpRunResult>("generate_map_from_items", {
        projectId,
      });
      setWorkspace(mapResult.workspace);

      const suggestionsResult = await invoke<MvpRunResult>(
        "generate_suggestions_from_map",
        { projectId },
      );

      setWorkspace(
        suggestionsResult.workspace.nodes.length > 0
          ? suggestionsResult.workspace
          : mapResult.workspace.nodes.length > 0
            ? mapResult.workspace
            : extractResult.workspace,
      );
      setIsDrawerOpen(true);
      setNotice(
        `${
          suggestionsResult.message || mapResult.message || extractResult.message
        } 初回生成は未確認ドラフトです。抽出カードの確度を確認してください。`,
      );
    } catch (caughtError) {
      setError(String(caughtError));
    } finally {
      setIsBusy(false);
    }
  }

  const handleSavePositions = useCallback(
    async function handleSavePositions(
      viewMode: MapViewMode,
      positions: MapNodeLayout[],
    ) {
      if (!activeProjectId) return;
      const saveScope = `${activeProjectId}:${viewMode}`;
      setLayoutSaveScope(saveScope);
      setLayoutSaveStatus("saving");
      try {
        const nextWorkspace = isTauriRuntime
          ? viewMode === "customer_journey"
            ? await invoke<ProjectWorkspace>("save_map_layout", {
                projectId: activeProjectId,
                positions,
              })
            : await invoke<ProjectWorkspace>("save_view_layout", {
                projectId: activeProjectId,
                viewId: viewMode,
                positions,
              })
          : applyLocalMapLayouts(workspace, activeProjectId, viewMode, positions);
        setWorkspace(nextWorkspace);
        setLayoutSaveStatus("saved");
      } catch (caughtError) {
        setLayoutSaveStatus("error");
        setError(String(caughtError));
      }
    },
    [activeProjectId, workspace, isTauriRuntime],
  );

  async function handleArrangeMap() {
    if (!activeProjectId || workspace.nodes.length === 0) return;
    const positions =
      mapViewMode === "business_impact"
        ? Object.entries(
            buildImpactPositionOverrides(workspace, buildNodeImpactStats(workspace)),
          ).map(([nodeId, layout]) => ({
            nodeId,
            x: layout.x,
            y: layout.y,
            width: layout.width,
            height: layout.height,
          }))
        : readableCustomerJourneyLayouts(workspace.nodes);
    await handleSavePositions(mapViewMode, positions);
    setNotice("マップを見やすい配置に整えました。");
  }

  async function handleCreateMapEdge(sourceNodeId: string, targetNodeId: string) {
    if (!activeProjectId) return;
    setError(null);
    try {
      const nextWorkspace = isTauriRuntime
        ? await invoke<ProjectWorkspace>("create_map_edge", {
            projectId: activeProjectId,
            sourceNodeId,
            targetNodeId,
          })
        : (() => {
            const now = new Date().toISOString();
            const edgeId =
              globalThis.crypto?.randomUUID?.() ?? `local-edge-${Date.now()}`;
            const edge: MapEdgeRow = {
              id: edgeId,
              projectId: activeProjectId,
              sourceNodeId,
              targetNodeId,
              edgeType: "normal",
              flowType: "inquiry",
              strength: "normal",
              direction: "forward",
              confidenceStatus: "estimated",
              evidence: "ユーザーがマップ編集モードで追加した導線です。",
              note: null,
              label: "導線",
              adoptionStatus: "accepted",
              priority: null,
              createdAt: now,
              updatedAt: now,
            };
            return { ...workspace, edges: [...workspace.edges, edge] };
          })();
      setWorkspace(nextWorkspace);
      setSelectedMapElement(null);
      setNotice("導線を追加しました。");
    } catch (caughtError) {
      setError(String(caughtError));
    }
  }

  async function handlePickSourceFiles() {
    if (!activeProjectId || !isTauriRuntime) return;
    await runAction(
      async () => {
        const imported = await invoke<unknown[]>("import_source_files_from_dialog", {
          projectId: activeProjectId,
        });
        if (imported.length === 0) {
          return null;
        }
        const nextWorkspace = await invoke<ProjectWorkspace>("get_project_workspace", {
          projectId: activeProjectId,
        });
        return { nextWorkspace, count: imported.length };
      },
      (result) => {
        if (!result) return;
        setWorkspace(result.nextWorkspace);
        setApprovedChunkSignature(null);
        setNotice(`${result.count}件の資料を投入しました。`);
      },
    );
  }

  async function handleCreateInformationSource(draft: InformationSourceDraft) {
    if (!activeProjectId || !isTauriRuntime) return;
    await runAction(
      () =>
        invoke<ProjectWorkspace>("create_text_information_source", {
          projectId: activeProjectId,
          sourceKind: draft.sourceKind,
          title: draft.title.trim(),
          body: draft.body.trim(),
          url: draft.url.trim(),
        }),
      (nextWorkspace) => {
        setWorkspace(nextWorkspace);
        setApprovedChunkSignature(null);
        setNotice(`${sourceTypeLabel(draft.sourceKind)}を情報ソースに追加しました。`);
      },
    );
  }

  async function handlePickOnboardingFiles(draft: OnboardingDraft) {
    if (!isTauriRuntime) return;
    if (activeProjectId) {
      await handlePickSourceFiles();
      return;
    }
    if (!draft.companyName.trim()) {
      setNotice("ファイル追加前に企業名 / 案件名を入力してください。");
      return;
    }

    await runAction(
      async () => {
        const purposeLabel = mapPurposeLabel(draft.purposeId);
        const project = await invoke<Project>("create_project", {
          name: draft.companyName.trim(),
          clientName: draft.companyName.trim(),
          industry: draft.industry.trim(),
          description: purposeLabel,
          memo: draft.memo.trim(),
        });
        const imported = await invoke<unknown[]>("import_source_files_from_dialog", {
          projectId: project.id,
        });
        const nextProjects = await invoke<Project[]>("list_projects");
        const nextWorkspace = await invoke<ProjectWorkspace>("get_project_workspace", {
          projectId: project.id,
        });
        return { importedCount: imported.length, nextProjects, nextWorkspace, project };
      },
      ({ importedCount, nextProjects, nextWorkspace, project }) => {
        setProjects(nextProjects);
        setSelectedProjectId(project.id);
        setWorkspace(nextWorkspace);
        setApprovedChunkSignature(null);
        setExcludedChunkIds([]);
        setView("map");
        if (importedCount > 0) {
          setNotice(`${importedCount}件の情報ソースを追加しました。`);
        }
      },
    );
  }

  async function handleAskWholeMap(questionType = "explain") {
    if (!activeProjectId) return;
    setMapInsightBusy(true);
    setError(null);
    try {
      if (!isTauriRuntime) {
        const now = new Date().toISOString();
        setWorkspace({
          ...workspace,
          aiComments: [
            {
              id: `local-map-insight-${Date.now()}`,
              projectId: activeProjectId,
              aiRunId: null,
              commentType: "map_insight",
              title: "壁打ち: マップ全体",
              body: "マップ全体について、資料要約とノード/導線の関係から確認するための下書きです。強い導線、詰まり、次に聞くことを確認してください。",
              confidenceStatus: "estimated",
              createdAt: now,
            },
            ...workspace.aiComments,
          ],
        });
        setIsDrawerOpen(true);
        return;
      }
      const result = await invoke<MvpRunResult>("ask_map_insight", {
        projectId: activeProjectId,
        targetKind: "map",
        targetId: null,
        questionType,
      });
      setWorkspace(result.workspace);
      setNotice(result.message);
      setIsDrawerOpen(true);
    } catch (caughtError) {
      setError(String(caughtError));
    } finally {
      setMapInsightBusy(false);
    }
  }

  useEffect(() => {
    if (!isTauriRuntime) return;
    let cancelled = false;

    async function loadInitialProjects() {
      const rows = await invoke<Project[]>("list_projects");
      if (cancelled) return;
      setProjects(rows);
      setSelectedProjectId((current) =>
        current && rows.some((project) => project.id === current) ? current : null,
      );
    }

    void loadInitialProjects();

    return () => {
      cancelled = true;
    };
  }, [isTauriRuntime]);

  useEffect(() => {
    if (!isTauriRuntime || !activeProjectId) return;
    let cancelled = false;

    async function loadActiveWorkspace() {
      const nextWorkspace = await invoke<ProjectWorkspace>("get_project_workspace", {
        projectId: activeProjectId,
      });
      if (!cancelled) {
        setWorkspace(nextWorkspace);
      }
    }

    void loadActiveWorkspace();

    return () => {
      cancelled = true;
    };
  }, [activeProjectId, isTauriRuntime]);

  useEffect(() => {
    if (!isTauriRuntime) return;
    let disposed = false;
    let cleanup: (() => void) | null = null;

    void getCurrentWebview()
      .onDragDropEvent((event) => {
        const droppedPaths = "paths" in event.payload ? event.payload.paths : [];
        if (
          event.payload.type === "drop" &&
          activeProjectId &&
          droppedPaths.length > 0
        ) {
          void runAction(
            async () => {
              let importError: string | null = null;
              try {
                await invoke("import_source_files", {
                  projectId: activeProjectId,
                  paths: droppedPaths,
                });
              } catch (caughtError) {
                importError = String(caughtError);
              }
              return invoke<ProjectWorkspace>("get_project_workspace", {
                projectId: activeProjectId,
              }).then((nextWorkspace) => ({ importError, nextWorkspace }));
            },
            ({ importError, nextWorkspace }) => {
              setWorkspace(nextWorkspace);
              setApprovedChunkSignature(null);
              if (importError) {
                setError(importError);
              } else {
                setNotice(`${droppedPaths.length}件の資料を投入しました。`);
              }
            },
          );
        }
      })
      .then((unlisten) => {
        if (disposed) {
          unlisten();
        } else {
          cleanup = unlisten;
        }
      });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [activeProjectId, isTauriRuntime]);

  return (
    <main className="app-root">
      <AppSidebar
        activeProject={activeProject}
        onOpenProjects={() => setView("projects")}
        onSelectView={(nextView) => {
          if (nextView === "home") {
            handleClearProjectSelection("home");
          } else {
            setView(nextView);
          }
        }}
        onStartNewMap={handleStartNewMap}
        view={view}
      />

      <section className="app-shell">
        <WorkspaceTopBar
          activeProject={activeProject}
          isBusy={isBusy}
          latestAiRun={latestAiRun}
          onAiUpdate={handleAiUpdate}
          onOpenHistory={() => setView("history")}
          onRefreshCodexRuntime={handleRefreshCodexRuntime}
          primaryActionLabel={primaryActionLabel}
          saveStatus={saveStatus}
          view={view}
          workspace={workspace}
        />

        {error ? <div className="toast toast-error">{error}</div> : null}
        {notice ? <div className="toast">{notice}</div> : null}

        <div className="workspace">
          {view === "home" ? (
            <HomeView
              activeProject={activeProject}
              onOpenProjects={() => setView("projects")}
              onSelectProject={(projectId) => handleSelectProject(projectId, "map")}
              onStartNewMap={handleStartNewMap}
              projects={projects}
              workspace={workspace}
            />
          ) : null}
          {view === "map" ? (
            <MapWorkspace
              activeProject={activeProject}
              canPickFiles={isTauriRuntime}
              codexBusy={codexBusy}
              codexRuntimeInfo={codexRuntimeInfo}
              codexSmokeResult={codexSmokeResult}
              deviceCodeResult={deviceCodeResult}
              drawerOpen={isDrawerOpen}
              editMode={isMapEditMode}
              generationBusy={isBusy}
              layoutSaveStatus={visibleLayoutSaveStatus}
              latestAiRun={latestAiRun}
              mapInsightBusy={mapInsightBusy}
              mapViewMode={mapViewMode}
              onArrangeMap={handleArrangeMap}
              onAskWholeMap={handleAskWholeMap}
              onCreateMapEdge={handleCreateMapEdge}
              onCreateOnboardingMap={handleCreateOnboardingMap}
              onDrawerOpenChange={setIsDrawerOpen}
              onEditModeChange={setIsMapEditMode}
              onGenerateMap={handleRegenerateMap}
              onGenerateSuggestions={handleGenerateSuggestions}
              onOpenExtractReview={() => {
                setSelectedItemId(workspace.extractedItems[0]?.id ?? null);
                setIsDrawerOpen(false);
                setView("extract");
              }}
              reflectionSummary={reflectionSummary}
              onPickFiles={handlePickOnboardingFiles}
              onOpenExternalUrl={handleOpenExternalUrl}
              onRefreshCodexRuntime={handleRefreshCodexRuntime}
              onRunCodexLoginCheck={handleRunCodexLoginCheck}
              onRunCodexSmokeTest={handleRunCodexSmokeTest}
              onMapViewModeChange={(nextMode) => {
                setMapViewMode(nextMode);
                setSelectedMapElement(null);
                setSelectedItemId(null);
                setSelectedSuggestionId(null);
              }}
              onSavePositions={handleSavePositions}
              onSelectItem={(itemId) => {
                setSelectedItemId(itemId);
                setSelectedMapElement(null);
                setSelectedSuggestionId(null);
              }}
              onSelectMapElement={(selection) => {
                setSelectedMapElement(selection);
                if (selection) {
                  setSelectedItemId(null);
                  setSelectedSuggestionId(null);
                }
              }}
              onSelectSuggestion={(suggestionId) => {
                setSelectedSuggestionId(suggestionId);
                setSelectedItemId(null);
                setSelectedMapElement(null);
              }}
              selectedMapElement={selectedMapElement}
              selectedSuggestionId={selectedSuggestionId}
              trayOpen={isTrayOpen}
              onTrayOpenChange={setIsTrayOpen}
              workspace={workspace}
            />
          ) : null}
          {view === "projects" ? (
            <ProjectsView
              activeProject={activeProject}
              activeProjectId={activeProject?.id ?? null}
              onCreateProject={handleStartNewMap}
              onDeleteProject={handleDeleteProject}
              onSelectProject={(projectId) => {
                handleSelectProject(projectId, "map");
              }}
              onUpdateProject={handleUpdateProject}
              projects={projects}
            />
          ) : null}
          {view === "sources" && activeProject ? (
            <SourcesView
              canPickFiles={Boolean(activeProjectId && isTauriRuntime)}
              canSaveTextSource={Boolean(activeProjectId && isTauriRuntime)}
              generationBusy={isBusy}
              onGenerateMap={handleRegenerateMap}
              onCreateInformationSource={handleCreateInformationSource}
              onOpenExtractReview={() => {
                setSelectedItemId(workspace.extractedItems[0]?.id ?? null);
                setView("extract");
              }}
              onPickFiles={handlePickSourceFiles}
              reflectionSummary={reflectionSummary}
            />
          ) : null}
          {view === "extract" && activeProject ? (
            <ExtractView
              aiSendApproved={isAiSendApproved}
              onCreateManualItem={handleCreateManualItem}
              onAiSendApprovedChange={(approved) =>
                setApprovedChunkSignature(approved ? selectedChunkSignature : null)
              }
              onExtract={handleExtract}
              onSelectAllChunks={(selected) => {
                setExcludedChunkIds(selected ? [] : readableChunkIds);
                setApprovedChunkSignature(null);
              }}
              onToggleChunk={(chunkId) => {
                setExcludedChunkIds((current) =>
                  current.includes(chunkId)
                    ? current.filter((id) => id !== chunkId)
                    : [...current, chunkId],
                );
                setApprovedChunkSignature(null);
              }}
              onSelectItem={(itemId) => {
                setSelectedItemId(itemId);
                setSelectedSuggestionId(null);
                setSelectedMapElement(null);
              }}
              selectedItemId={selectedItemId}
              selectedChunkIds={selectedChunkIds}
              workspace={workspace}
            />
          ) : null}
          {view === "suggestions" && activeProject ? (
            <SuggestionsView
              onGenerate={handleGenerateSuggestions}
              onSelectSuggestion={(suggestionId) => {
                setSelectedSuggestionId(suggestionId);
                setSelectedItemId(null);
                setSelectedMapElement(null);
              }}
              selectedSuggestionId={selectedSuggestionId}
              workspace={workspace}
            />
          ) : null}
          {view === "export" && activeProject ? (
            <ExportView onExport={handleExport} workspace={workspace} />
          ) : null}
          {view === "history" && activeProject ? (
            <HistoryView workspace={workspace} />
          ) : null}
          {view === "settings" ? (
            <SettingsView
              codexBusy={codexBusy}
              codexRuntimeInfo={codexRuntimeInfo}
              codexSmokeResult={codexSmokeResult}
              deviceCodeResult={deviceCodeResult}
              onOpenExternalUrl={handleOpenExternalUrl}
              onRefreshCodexRuntime={handleRefreshCodexRuntime}
              onRunCodexLoginCheck={handleRunCodexLoginCheck}
              onRunCodexSmokeTest={handleRunCodexSmokeTest}
            />
          ) : null}
        </div>

        {activeProject ? (
          <InspectorPanel
            edge={selectedEdge}
            isTauriRuntime={isTauriRuntime}
            item={selectedItem}
            node={selectedNode}
            onWorkspaceChange={setWorkspace}
            projectId={activeProject.id}
            suggestion={selectedSuggestion}
            workspace={workspace}
          />
        ) : null}
      </section>
    </main>
  );
}

function StatusChip({ children }: { children: React.ReactNode }) {
  return <span className="status-chip">{children}</span>;
}

function AppSidebar({
  activeProject,
  onOpenProjects,
  onSelectView,
  onStartNewMap,
  view,
}: {
  activeProject: Project | null;
  onOpenProjects: () => void;
  onSelectView: (view: ViewId) => void;
  onStartNewMap: () => void;
  view: ViewId;
}) {
  return (
    <aside className="side-rail" aria-label="主要ナビゲーション">
      <div className="sidebar-brand">
        <div className="brand-mark">
          <Layers3 size={19} aria-hidden="true" />
        </div>
        <div>
          <strong>Synergy Map</strong>
          <span>売上マップ作成</span>
        </div>
      </div>

      <button className="sidebar-create-button" onClick={onStartNewMap} type="button">
        <Plus size={16} aria-hidden="true" />
        新しいマップを作る
      </button>

      <section className="project-switcher">
        <span className="sidebar-section-label">現在の案件</span>
        <div className="project-switcher-card">
          <strong>{activeProject?.name ?? "案件が選択されていません"}</strong>
          <small>
            {activeProject?.clientName ?? "案件を選ぶか、新しく作成してください"}
          </small>
          <button className="ghost-button" onClick={onOpenProjects} type="button">
            <FolderOpen size={14} aria-hidden="true" />
            案件を切り替え
          </button>
        </div>
      </section>

      <nav className="sidebar-nav" aria-label="全体メニュー">
        <span className="sidebar-section-label">全体メニュー</span>
        {globalNavItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              className={`sidebar-nav-item ${
                view === item.id ? "sidebar-nav-item-active" : ""
              }`}
              key={item.id}
              onClick={() => onSelectView(item.id)}
              type="button"
            >
              <Icon size={16} aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {activeProject ? (
        <nav className="sidebar-nav project-nav" aria-label="案件内メニュー">
          <span className="sidebar-section-label">案件内メニュー</span>
          {projectNavItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={`sidebar-nav-item ${
                  view === item.id ? "sidebar-nav-item-active" : ""
                } ${item.id === "map" ? "sidebar-nav-item-primary" : ""}`}
                key={item.id}
                onClick={() => onSelectView(item.id)}
                type="button"
              >
                <Icon size={16} aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      ) : (
        <div className="project-nav-disabled">
          <span className="sidebar-section-label">案件を選択後に利用</span>
          <span>マップ、情報ソース、抽出カード、施策、出力、履歴</span>
        </div>
      )}

      <button
        className={`sidebar-nav-item sidebar-settings ${
          view === "settings" ? "sidebar-nav-item-active" : ""
        }`}
        onClick={() => onSelectView("settings")}
        type="button"
      >
        <Settings size={16} aria-hidden="true" />
        <span>設定</span>
      </button>
    </aside>
  );
}

function WorkspaceTopBar({
  activeProject,
  isBusy,
  latestAiRun,
  onAiUpdate,
  onOpenHistory,
  onRefreshCodexRuntime,
  primaryActionLabel,
  saveStatus,
  view,
  workspace,
}: {
  activeProject: Project | null;
  isBusy: boolean;
  latestAiRun: AiRunRow | null;
  onAiUpdate: () => void;
  onOpenHistory: () => void;
  onRefreshCodexRuntime: () => void;
  primaryActionLabel: string;
  saveStatus: string;
  view: ViewId;
  workspace: ProjectWorkspace;
}) {
  const title = activeProject
    ? `案件 / ${activeProject.name}`
    : view === "map"
      ? "新しいマップ"
      : view === "projects"
        ? "案件一覧"
        : view === "settings"
          ? "設定"
          : "ホーム";
  const meta = activeProject
    ? (activeProject.clientName ?? "クライアント未設定")
    : view === "map"
      ? "企業名と目的を入力してマップ作成を開始"
      : "案件を選ぶか、新しいマップを作成してください";

  return (
    <header className="top-bar">
      <div className="project-heading">
        <div className="project-title">{title}</div>
        <div className="project-meta">{meta}</div>
      </div>
      {activeProject ? (
        <div className="top-status">
          <span className="save-status">
            <Save size={13} aria-hidden="true" />
            {saveStatus}
          </span>
          <StatusChip>{workspace.extractedItems.length}カード</StatusChip>
          <StatusChip>{workspace.nodes.length}ノード</StatusChip>
          <StatusChip>{workspace.edges.length}導線</StatusChip>
          <span
            className={`ai-source-chip ${
              isFallbackRun(latestAiRun) ? "ai-source-chip-fallback" : ""
            }`}
            title={latestAiRun?.error ?? aiRunStatusLabel(latestAiRun)}
          >
            {aiRunSourceLabel(latestAiRun)}
          </span>
          <button className="ghost-button" onClick={onOpenHistory} type="button">
            <Clock3 size={15} aria-hidden="true" />
            履歴
          </button>
          <button
            className="primary-button"
            disabled={isBusy}
            onClick={onAiUpdate}
            type="button"
          >
            <Sparkles size={15} aria-hidden="true" />
            {isBusy ? "処理中" : primaryActionLabel}
          </button>
        </div>
      ) : (
        <div className="top-status">
          <StatusChip>Codex接続 未確認</StatusChip>
          <button
            className="ghost-button"
            onClick={onRefreshCodexRuntime}
            type="button"
          >
            <Settings size={15} aria-hidden="true" />
            接続を確認
          </button>
        </div>
      )}
    </header>
  );
}

function projectHasMap(
  project: Project,
  activeProject: Project | null,
  workspace: ProjectWorkspace,
) {
  return activeProject?.id === project.id && workspace.nodes.length > 0;
}

function projectHasUncertainty(
  project: Project,
  activeProject: Project | null,
  workspace: ProjectWorkspace,
) {
  return (
    activeProject?.id === project.id &&
    (workspace.extractedItems.some((item) => item.confidenceStatus !== "confirmed") ||
      workspace.nodes.some((node) => node.confidenceStatus !== "confirmed"))
  );
}

function HomeView({
  activeProject,
  onOpenProjects,
  onSelectProject,
  onStartNewMap,
  projects,
  workspace,
}: {
  activeProject: Project | null;
  onOpenProjects: () => void;
  onSelectProject: (projectId: string) => void;
  onStartNewMap: () => void;
  projects: Project[];
  workspace: ProjectWorkspace;
}) {
  const recentProjects = [...projects]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 5);

  return (
    <section className="home-view">
      <div className="home-start-panel">
        <div>
          <span className="eyebrow">ホーム</span>
          <h1>案件を選ぶか、新しいマップを作成してください</h1>
          <p>
            企業名、目的、情報ソースを入れると、AIが商品・集客・売上の流れを1枚のマップに整理します。
          </p>
          <div className="home-actions">
            <button className="primary-button" onClick={onStartNewMap} type="button">
              <Plus size={16} aria-hidden="true" />
              新しいマップを作る
            </button>
            <button className="ghost-button" onClick={onOpenProjects} type="button">
              <FolderOpen size={16} aria-hidden="true" />
              既存案件を開く
            </button>
          </div>
          <div className="home-checklist" aria-label="新規マップ作成に必要な情報">
            <span>企業名</span>
            <span>目的</span>
            <span>情報ソース</span>
          </div>
        </div>
      </div>

      <section className="recent-projects-panel">
        <div className="panel-heading-inline">
          <div>
            <h2>最近の案件</h2>
            <p>続きから開く案件を選んでください。</p>
          </div>
          <button className="ghost-button" onClick={onOpenProjects} type="button">
            案件一覧
          </button>
        </div>
        <div className="recent-project-list">
          {recentProjects.map((project) => (
            <button
              className="recent-project-row"
              key={project.id}
              onClick={() => onSelectProject(project.id)}
              type="button"
            >
              <span>
                <strong>{project.name}</strong>
                <small>{project.clientName ?? project.industry ?? "詳細未設定"}</small>
              </span>
              <span>{formatTime(project.updatedAt)}</span>
              <span className="recent-project-tags">
                {projectHasMap(project, activeProject, workspace) ? (
                  <StatusChip>マップあり</StatusChip>
                ) : null}
                {projectHasUncertainty(project, activeProject, workspace) ? (
                  <StatusChip>推定あり</StatusChip>
                ) : null}
              </span>
              <span className="open-label">開く</span>
            </button>
          ))}
          {recentProjects.length === 0 ? (
            <div className="empty-panel">まだ案件がありません。</div>
          ) : null}
        </div>
      </section>

      <section className="home-guidance-band">
        <div>
          <strong>情報を入れる</strong>
          <span>ファイル、メモ、URL、SNS、商品情報を材料にします。</span>
        </div>
        <div>
          <strong>マップを見る</strong>
          <span>商品・集客・顧客接点・売上の流れを整理します。</span>
        </div>
        <div>
          <strong>施策を考える</strong>
          <span>詰まり、確認質問、次に試す一手へつなげます。</span>
        </div>
      </section>
    </section>
  );
}

function MapWorkspace({
  activeProject,
  canPickFiles,
  codexBusy,
  codexRuntimeInfo,
  codexSmokeResult,
  deviceCodeResult,
  drawerOpen,
  editMode,
  generationBusy,
  layoutSaveStatus,
  latestAiRun,
  mapInsightBusy,
  mapViewMode,
  onArrangeMap,
  onAskWholeMap,
  onCreateMapEdge,
  onCreateOnboardingMap,
  onDrawerOpenChange,
  onEditModeChange,
  onGenerateSuggestions,
  onGenerateMap,
  onOpenExtractReview,
  onOpenExternalUrl,
  onPickFiles,
  onRefreshCodexRuntime,
  onRunCodexLoginCheck,
  onRunCodexSmokeTest,
  onMapViewModeChange,
  reflectionSummary,
  onSavePositions,
  onSelectItem,
  onSelectMapElement,
  onSelectSuggestion,
  selectedMapElement,
  selectedSuggestionId,
  trayOpen,
  onTrayOpenChange,
  workspace,
}: {
  activeProject: Project | null;
  canPickFiles: boolean;
  codexBusy: CodexConnectionAction | null;
  codexRuntimeInfo: CodexRuntimeInfo | null;
  codexSmokeResult: CodexSmokeResult | null;
  deviceCodeResult: DeviceCodeLoginResult | null;
  drawerOpen: boolean;
  editMode: boolean;
  generationBusy: boolean;
  layoutSaveStatus: "idle" | "saving" | "saved" | "error";
  latestAiRun: AiRunRow | null;
  mapInsightBusy: boolean;
  mapViewMode: MapViewMode;
  onArrangeMap: () => void;
  onAskWholeMap: (questionType?: string) => void;
  onCreateMapEdge: (sourceNodeId: string, targetNodeId: string) => void;
  onCreateOnboardingMap: (draft: OnboardingDraft) => void;
  onDrawerOpenChange: (open: boolean) => void;
  onEditModeChange: (enabled: boolean) => void;
  onGenerateSuggestions: () => void;
  onGenerateMap: () => void;
  onOpenExtractReview: () => void;
  onOpenExternalUrl: (url: string) => void;
  onPickFiles: (draft: OnboardingDraft) => void;
  onRefreshCodexRuntime: () => void;
  onRunCodexLoginCheck: () => void;
  onRunCodexSmokeTest: () => void;
  onMapViewModeChange: (mode: MapViewMode) => void;
  reflectionSummary: WorkspaceReflectionSummary;
  onSavePositions: (viewMode: MapViewMode, positions: MapNodeLayout[]) => void;
  onSelectItem: (itemId: string) => void;
  onSelectMapElement: (selection: SelectedMapElement) => void;
  onSelectSuggestion: (suggestionId: string) => void;
  selectedMapElement: SelectedMapElement;
  selectedSuggestionId: string | null;
  trayOpen: boolean;
  onTrayOpenChange: (open: boolean) => void;
  workspace: ProjectWorkspace;
}) {
  const impactStats = useMemo(() => buildNodeImpactStats(workspace), [workspace]);
  const impactPositions = useMemo(
    () => buildImpactPositionOverrides(workspace, impactStats),
    [impactStats, workspace],
  );
  const hasGeneratedMap = workspace.nodes.length > 0;
  const canGenerateFromItems = !hasGeneratedMap && workspace.extractedItems.length > 0;
  const shouldReviewDraft =
    hasOnboardingBrief(workspace) && hasUnconfirmedGeneratedItems(workspace);
  const mapRegenerationLabel =
    reflectionSummary.pendingExtractionCount > 0
      ? "追加ソースあり"
      : reflectionSummary.mapRefreshNeeded
        ? "未反映を再生成"
        : "再生成";
  const reflectionAttention = needsReflectionAttention(reflectionSummary);
  const handleCanvasPositionsChange = useCallback(
    (positions: MapNodeLayout[]) => onSavePositions(mapViewMode, positions),
    [mapViewMode, onSavePositions],
  );

  return (
    <div className="map-workbench">
      {hasGeneratedMap ? (
        <>
          <div className="map-view-switch" role="tablist" aria-label="マップ表示">
            <button
              className={mapViewMode === "customer_journey" ? "active" : ""}
              onClick={() => onMapViewModeChange("customer_journey")}
              type="button"
            >
              <MapIcon size={14} aria-hidden="true" />
              顧客導線
            </button>
            <button
              className={mapViewMode === "business_impact" ? "active" : ""}
              onClick={() => onMapViewModeChange("business_impact")}
              type="button"
            >
              <BarChart3 size={14} aria-hidden="true" />
              事業インパクト
            </button>
          </div>

          <div className="map-workbench-top-stack">
            <div className="map-edit-toolbar" aria-label="マップ編集モード">
              <button
                className={!editMode ? "active" : ""}
                onClick={() => onEditModeChange(false)}
                title="閲覧"
                type="button"
              >
                <MousePointer2 size={14} aria-hidden="true" />
                閲覧
              </button>
              <button
                className={editMode ? "active" : ""}
                onClick={() => onEditModeChange(true)}
                title="編集"
                type="button"
              >
                <PencilRuler size={14} aria-hidden="true" />
                編集
              </button>
              <button onClick={onArrangeMap} title="見やすく整列" type="button">
                <MapIcon size={14} aria-hidden="true" />
                整える
              </button>
              <button
                disabled={generationBusy}
                onClick={onGenerateMap}
                title="抽出カードからマップを再生成"
                type="button"
              >
                <Sparkles size={14} aria-hidden="true" />
                {mapRegenerationLabel}
              </button>
              <button
                disabled={mapInsightBusy}
                onClick={() => onAskWholeMap("explain")}
                title="マップ全体をCodexに聞く"
                type="button"
              >
                <MessageSquareText size={14} aria-hidden="true" />
                聞く
              </button>
              <span
                className={`layout-save-status layout-save-status-${layoutSaveStatus}`}
              >
                {layoutSaveStatus === "saving"
                  ? "保存中"
                  : layoutSaveStatus === "error"
                    ? "保存失敗"
                    : layoutSaveStatus === "idle"
                      ? "未変更"
                      : "保存済み"}
              </span>
              <span
                className={`map-ai-status ${
                  isFallbackRun(latestAiRun) ? "map-ai-status-fallback" : ""
                }`}
                title={latestAiRun?.error ?? aiRunStatusLabel(latestAiRun)}
              >
                {aiRunSourceLabel(latestAiRun)}
              </span>
              {editMode ? (
                <span className="map-edit-hint">
                  ノードをドラッグ。選択後、角で大きさを調整。
                </span>
              ) : null}
            </div>

            {reflectionSummary.sourceCount > 0 ? (
              <MapReflectionBanner
                generationBusy={generationBusy}
                onGenerateMap={onGenerateMap}
                onOpenExtractReview={onOpenExtractReview}
                summary={reflectionSummary}
              />
            ) : null}
          </div>
        </>
      ) : null}

      {hasGeneratedMap && mapViewMode === "customer_journey" ? (
        <button
          className={`tray-tab ${trayOpen ? "tray-tab-open" : ""} ${
            !trayOpen && reflectionAttention ? "tray-tab-warning" : ""
          }`}
          aria-expanded={trayOpen}
          aria-label={
            trayOpen
              ? "マップ材料を閉じる"
              : reflectionAttention
                ? "マップ材料を開く（未反映あり）"
                : "マップ材料を開く"
          }
          onClick={() => onTrayOpenChange(!trayOpen)}
          type="button"
        >
          材料候補 {workspace.extractedItems.length}
        </button>
      ) : null}

      {hasGeneratedMap && mapViewMode === "customer_journey" ? (
        <aside
          className={`extraction-tray ${
            trayOpen ? "extraction-tray-open" : "extraction-tray-closed"
          }`}
          aria-hidden={!trayOpen}
        >
          <div className="panel-heading">
            <div>
              <span>マップ材料</span>
              <small>AIが情報ソースから見つけた候補</small>
            </div>
            <button
              aria-label="マップ材料を閉じる"
              className="panel-close-button"
              onClick={() => onTrayOpenChange(false)}
              type="button"
            >
              <X size={15} aria-hidden="true" />
            </button>
          </div>
          <div className="tray-list">
            {workspace.extractedItems.map((item) => (
              <button
                className="extract-card"
                key={item.id}
                onClick={() => onSelectItem(item.id)}
                type="button"
              >
                <div className="card-row">
                  <span className={`category-dot category-${item.itemType}`} />
                  <strong>{item.name}</strong>
                </div>
                <div className="card-meta">
                  {labelFor(categoryOptions, item.itemType)}
                  <span>{labelFor(confidenceOptions, item.confidenceStatus)}</span>
                </div>
              </button>
            ))}
            {workspace.extractedItems.length === 0 ? (
              <div className="empty-panel">資料投入後にAI抽出を実行してください。</div>
            ) : null}
          </div>
        </aside>
      ) : null}

      {mapViewMode === "business_impact" && hasGeneratedMap ? (
        <>
          <button
            className={`tray-tab impact-panel-tab ${
              trayOpen ? "impact-panel-tab-open" : ""
            }`}
            aria-expanded={trayOpen}
            aria-label={trayOpen ? "事業インパクトを閉じる" : "事業インパクトを開く"}
            onClick={() => onTrayOpenChange(!trayOpen)}
            type="button"
          >
            事業インパクト {workspace.suggestions.length}
          </button>
          <BusinessImpactPanel
            open={trayOpen}
            onGenerate={onGenerateSuggestions}
            onSelectSuggestion={onSelectSuggestion}
            selectedSuggestionId={selectedSuggestionId}
            workspace={workspace}
          />
        </>
      ) : null}

      <section className="map-stage">
        {workspace.nodes.length > 0 ? (
          <SynergyMapCanvas
            editable={editMode}
            edges={workspace.edges}
            impactStats={impactStats}
            nodes={workspace.nodes}
            onConnectNodes={onCreateMapEdge}
            onPositionsChange={handleCanvasPositionsChange}
            onSelect={onSelectMapElement}
            positionOverrides={
              mapViewMode === "business_impact" ? impactPositions : undefined
            }
            selected={selectedMapElement}
            viewMode={mapViewMode}
          />
        ) : canGenerateFromItems ? (
          <MapRebuildPanel
            activeProject={activeProject}
            generationBusy={generationBusy}
            onGenerateMap={onGenerateMap}
            onOpenExtractReview={onOpenExtractReview}
            workspace={workspace}
          />
        ) : (
          <MapCreationFlow
            activeProject={activeProject}
            canPickFiles={canPickFiles}
            codexBusy={codexBusy}
            codexRuntimeInfo={codexRuntimeInfo}
            codexSmokeResult={codexSmokeResult}
            deviceCodeResult={deviceCodeResult}
            generationBusy={generationBusy}
            key={activeProject?.id ?? "new-map"}
            onCreateMap={onCreateOnboardingMap}
            onOpenExternalUrl={onOpenExternalUrl}
            onPickFiles={onPickFiles}
            onRefreshCodexRuntime={onRefreshCodexRuntime}
            onRunCodexLoginCheck={onRunCodexLoginCheck}
            onRunCodexSmokeTest={onRunCodexSmokeTest}
            workspace={workspace}
          />
        )}
      </section>

      {hasGeneratedMap ? (
        <div className={`bottom-drawer ${drawerOpen ? "bottom-drawer-open" : ""}`}>
          <button
            className="drawer-summary"
            onClick={() => onDrawerOpenChange(!drawerOpen)}
            type="button"
          >
            <span>AIコメント・確認質問</span>
            <StatusChip>
              強い導線{" "}
              {workspace.edges.filter((edge) => edge.strength === "strong").length}
            </StatusChip>
            <StatusChip>
              詰まり{" "}
              {
                workspace.aiComments.filter(
                  (comment) => comment.commentType === "bottleneck",
                ).length
              }
            </StatusChip>
            <StatusChip>
              未接続候補{" "}
              {
                workspace.aiComments.filter(
                  (comment) => comment.commentType === "unconnected",
                ).length
              }
            </StatusChip>
          </button>
          {drawerOpen ? (
            <div className="drawer-content">
              {workspace.nodes.length > 0 ? (
                <MapInsightActions
                  busy={mapInsightBusy}
                  error={null}
                  onAsk={onAskWholeMap}
                  targetLabel="マップ全体"
                />
              ) : null}
              {shouldReviewDraft ? (
                <div className="draft-review-banner">
                  <TriangleAlert size={15} aria-hidden="true" />
                  <div>
                    <strong>初回生成ドラフトです</strong>
                    <span>
                      推定や要確認を含みます。施策判断の前に抽出カードの確度を確認してください。
                    </span>
                  </div>
                  <button
                    className="ghost-button"
                    onClick={onOpenExtractReview}
                    type="button"
                  >
                    抽出カードを確認
                  </button>
                </div>
              ) : null}
              <button
                className="ghost-button"
                onClick={onGenerateSuggestions}
                type="button"
              >
                <Sparkles size={15} aria-hidden="true" />
                {mapViewMode === "business_impact"
                  ? "インパクト評価生成"
                  : "AIコメント生成"}
              </button>
              {workspace.aiComments.map((comment) => (
                <div className="comment-line" key={comment.id}>
                  <strong>{comment.title}</strong>
                  <span>{comment.body}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function MapReflectionBanner({
  generationBusy,
  onGenerateMap,
  onOpenExtractReview,
  summary,
}: {
  generationBusy: boolean;
  onGenerateMap: () => void;
  onOpenExtractReview: () => void;
  summary: WorkspaceReflectionSummary;
}) {
  const needsExtraction = summary.pendingExtractionCount > 0;
  const needsMapRefresh = summary.pendingMapCount > 0 || summary.mapRefreshNeeded;

  if (!needsExtraction && !needsMapRefresh) {
    return (
      <div className="map-reflection-banner map-reflection-banner-ok">
        <Info size={15} aria-hidden="true" />
        <span>{reflectionSummaryText(summary)}</span>
        <StatusChip>
          {summary.mappedSourceCount}/{summary.sourceCount}反映済み
        </StatusChip>
      </div>
    );
  }

  return (
    <div className="map-reflection-banner map-reflection-banner-warning">
      <TriangleAlert size={15} aria-hidden="true" />
      <span>{reflectionSummaryText(summary)}</span>
      {needsExtraction ? (
        <button className="ghost-button" onClick={onOpenExtractReview} type="button">
          <ListChecks size={15} aria-hidden="true" />
          抽出カードを更新
        </button>
      ) : (
        <button
          className="primary-button"
          disabled={generationBusy}
          onClick={onGenerateMap}
          type="button"
        >
          <Sparkles size={15} aria-hidden="true" />
          {generationBusy ? "再生成中" : "追加内容で再生成"}
        </button>
      )}
    </div>
  );
}

function MapRebuildPanel({
  activeProject,
  generationBusy,
  onGenerateMap,
  onOpenExtractReview,
  workspace,
}: {
  activeProject: Project | null;
  generationBusy: boolean;
  onGenerateMap: () => void;
  onOpenExtractReview: () => void;
  workspace: ProjectWorkspace;
}) {
  return (
    <div className="map-rebuild-panel">
      <section className="map-rebuild-card">
        <div className="section-title">
          <MapIcon size={16} aria-hidden="true" />
          <span>マップ未生成</span>
        </div>
        <h1>{activeProject?.name ?? "この案件"} のマップを生成できます</h1>
        <p>
          抽出カードは保存済みですが、表示するマップがまだありません。カード内容から顧客導線マップを生成してください。
        </p>
        <div className="map-rebuild-stats">
          <StatusChip>{workspace.extractedItems.length}カード</StatusChip>
          <StatusChip>{workspace.sourceFiles.length}情報ソース</StatusChip>
          <StatusChip>{aiRunSourceLabel(workspace.aiRuns[0] ?? null)}</StatusChip>
        </div>
        <div className="map-rebuild-actions">
          <button
            className="primary-button"
            disabled={generationBusy}
            onClick={onGenerateMap}
            type="button"
          >
            <Sparkles size={15} aria-hidden="true" />
            {generationBusy ? "生成中" : "抽出カードからマップを生成"}
          </button>
          <button className="ghost-button" onClick={onOpenExtractReview} type="button">
            <ListChecks size={15} aria-hidden="true" />
            抽出カードを確認
          </button>
        </div>
      </section>
    </div>
  );
}

function MapCreationFlow({
  activeProject,
  canPickFiles,
  codexBusy,
  codexRuntimeInfo,
  codexSmokeResult,
  deviceCodeResult,
  generationBusy,
  onCreateMap,
  onOpenExternalUrl,
  onPickFiles,
  onRefreshCodexRuntime,
  onRunCodexLoginCheck,
  onRunCodexSmokeTest,
  workspace,
}: {
  activeProject: Project | null;
  canPickFiles: boolean;
  codexBusy: CodexConnectionAction | null;
  codexRuntimeInfo: CodexRuntimeInfo | null;
  codexSmokeResult: CodexSmokeResult | null;
  deviceCodeResult: DeviceCodeLoginResult | null;
  generationBusy: boolean;
  onCreateMap: (draft: OnboardingDraft) => void;
  onOpenExternalUrl: (url: string) => void;
  onPickFiles: (draft: OnboardingDraft) => void;
  onRefreshCodexRuntime: () => void;
  onRunCodexLoginCheck: () => void;
  onRunCodexSmokeTest: () => void;
  workspace: ProjectWorkspace;
}) {
  const [draft, setDraft] = useState<OnboardingDraft>({
    companyName: activeProject?.name ?? "",
    purposeId: "",
    industry: activeProject?.industry ?? "",
    memo: activeProject?.memo ?? "",
    websiteUrls: [""],
    snsUrls: [""],
    productInfo: "",
  });
  const [sendApproved, setSendApproved] = useState(false);

  const purposeLabel = mapPurposeLabel(draft.purposeId);
  const sourceCount = workspace.sourceFiles.length;
  const websiteUrls = compactStringList(draft.websiteUrls);
  const snsUrls = compactStringList(draft.snsUrls);
  const additionalInputs =
    [draft.memo, draft.productInfo].filter((value) => value.trim().length > 0).length +
    websiteUrls.length +
    snsUrls.length;
  const informationScore = sourceCount + additionalInputs;
  const informationLevel =
    informationScore >= 4 ? "高" : informationScore >= 2 ? "中" : "低";
  const hypothesisMode = informationScore === 0;
  const canGenerate = draft.companyName.trim().length > 0 && Boolean(purposeLabel);
  const targetSourceCount = sourceCount + 1;
  const sendScopeItems = [
    `初回入力: ${draft.companyName.trim() || "企業名未入力"} / ${
      purposeLabel || "目的未選択"
    }`,
    draft.industry.trim() ? `業種: ${draft.industry.trim()}` : "",
    draft.memo.trim() ? `メモ: ${shortText(draft.memo)}` : "",
    ...websiteUrls.map((url) => `ホームページURL: ${url}`),
    ...snsUrls.map((url) => `SNS URL: ${url}`),
    draft.productInfo.trim() ? `商品情報: ${shortText(draft.productInfo)}` : "",
    ...workspace.sourceFiles
      .slice(0, 6)
      .map(
        (source) =>
          `${sourceTypeLabel(source.fileType)}: ${source.fileName} (${source.chunkCount} chunks)`,
      ),
  ].filter(Boolean);

  function updateDraft<K extends keyof OnboardingDraft>(
    key: K,
    value: OnboardingDraft[K],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function updateUrlList(key: "websiteUrls" | "snsUrls", values: string[]) {
    setDraft((current) => ({ ...current, [key]: values }));
    setSendApproved(false);
  }

  return (
    <div className="map-creation-flow">
      <section className="creation-main">
        <div className="creation-header">
          <div>
            <span className="eyebrow">新しいマップを作る</span>
            <h1>必要情報を入れると、AIがシナジーマップを生成します</h1>
            <p>
              目的、企業情報、マップの材料を入れてください。情報が少ない場合も仮説マップとして開始できます。
            </p>
          </div>
          <div className="creation-progress" aria-label="初回マップ作成ステップ">
            {["目的", "接続", "材料", "生成"].map((label, index) => (
              <span key={label} className={index === 0 ? "active" : ""}>
                {label}
              </span>
            ))}
          </div>
        </div>

        <div className="creation-grid">
          <section className="creation-section">
            <div className="section-title">
              <Target size={15} aria-hidden="true" />
              <span>目的</span>
            </div>
            <div className="purpose-grid">
              {mapPurposeOptions.map((option) => (
                <button
                  className={`purpose-option ${
                    draft.purposeId === option.id ? "purpose-option-active" : ""
                  }`}
                  key={option.id}
                  onClick={() => updateDraft("purposeId", option.id)}
                  type="button"
                >
                  <strong>{option.label}</strong>
                  <span>{option.description}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="creation-section">
            <div className="section-title">
              <FolderKanban size={15} aria-hidden="true" />
              <span>基本情報</span>
            </div>
            <FormGrid>
              <Field label="企業名 / 案件名">
                <input
                  onChange={(event) => updateDraft("companyName", event.target.value)}
                  placeholder="例: 山田製作所 DX支援"
                  value={draft.companyName}
                />
              </Field>
              <Field label="業種">
                <input
                  onChange={(event) => updateDraft("industry", event.target.value)}
                  placeholder="例: 製造業、店舗ビジネス、士業"
                  value={draft.industry}
                />
              </Field>
            </FormGrid>
            <Field label="今わかっていること / 困っていること">
              <textarea
                onChange={(event) => updateDraft("memo", event.target.value)}
                placeholder="例: Web問い合わせはあるが、商談化や継続提案への導線が見えていない。"
                value={draft.memo}
              />
            </Field>
          </section>

          <section className="creation-section">
            <div className="section-title">
              <Database size={15} aria-hidden="true" />
              <span>マップの材料</span>
            </div>
            <div className="source-input-grid">
              <UrlListField
                addLabel="ホームページURLを追加"
                label="ホームページURL"
                onChange={(values) => updateUrlList("websiteUrls", values)}
                placeholder="https://example.com"
                values={draft.websiteUrls}
              />
              <UrlListField
                addLabel="SNS URLを追加"
                label="SNSアカウントURL"
                onChange={(values) => updateUrlList("snsUrls", values)}
                placeholder="Instagram、X、YouTubeなど"
                values={draft.snsUrls}
              />
            </div>
            <Field label="商品 / サービス情報">
              <textarea
                onChange={(event) => updateDraft("productInfo", event.target.value)}
                placeholder="主力商品、提供サービス、客単価、継続商品など"
                value={draft.productInfo}
              />
            </Field>
            <div className="source-actions">
              <button
                className="ghost-button"
                disabled={!canPickFiles}
                onClick={() => onPickFiles(draft)}
                type="button"
              >
                <Upload size={15} aria-hidden="true" />
                ファイルを追加
              </button>
              <span>{sourceCount}件の情報ソースを登録済み</span>
            </div>
          </section>
        </div>
      </section>

      <aside className="creation-side">
        <CodexConnectionCard
          busy={codexBusy}
          runtimeInfo={codexRuntimeInfo}
          smokeResult={codexSmokeResult}
          deviceCodeResult={deviceCodeResult}
          onLoginCheck={onRunCodexLoginCheck}
          onOpenExternalUrl={onOpenExternalUrl}
          onRefresh={onRefreshCodexRuntime}
          onSmokeTest={onRunCodexSmokeTest}
        />

        <div className="generation-card">
          <div className="section-title">
            <Gauge size={15} aria-hidden="true" />
            <span>生成準備</span>
          </div>
          <div className="readiness-meter">
            <span>情報量</span>
            <strong>{informationLevel}</strong>
          </div>
          <div className="readiness-meter">
            <span>確度</span>
            <strong>{hypothesisMode ? "仮説多め" : "根拠あり"}</strong>
          </div>
          <div className="send-scope-preview">
            <strong>AIへ送る要約</strong>
            <ul>
              {sendScopeItems.slice(0, 8).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            {sendScopeItems.length > 8 ? (
              <small>ほか{sendScopeItems.length - 8}件の情報ソース</small>
            ) : null}
          </div>
          <label className="onboarding-send-confirm">
            <input
              checked={sendApproved}
              onChange={(event) => setSendApproved(event.target.checked)}
              type="checkbox"
            />
            <span>
              AIへ送る範囲を確認しました。対象は初回入力と登録済み情報ソース
              {targetSourceCount}件です。
            </span>
          </label>
          {hypothesisMode ? (
            <div className="hypothesis-warning">
              <TriangleAlert size={15} aria-hidden="true" />
              <span>
                入力情報が少ないため推測を含みます。資料、URL、メモを追加すると精度が上がります。
              </span>
            </div>
          ) : null}
          <button
            className="primary-button creation-generate-button"
            disabled={!canGenerate || !sendApproved || generationBusy}
            onClick={() => onCreateMap(draft)}
            type="button"
          >
            <Sparkles size={15} aria-hidden="true" />
            {generationBusy
              ? "生成中"
              : hypothesisMode
                ? "仮説マップを生成する"
                : "シナジーマップを生成する"}
          </button>
          {!canGenerate ? (
            <small>企業名 / 案件名と目的を入力すると生成できます。</small>
          ) : !sendApproved ? (
            <small>送信範囲を確認すると生成できます。</small>
          ) : (
            <small>AIが材料整理、マップ生成、施策と確認質問の作成まで進めます。</small>
          )}
        </div>
      </aside>
    </div>
  );
}

function UrlListField({
  addLabel,
  label,
  onChange,
  placeholder,
  values,
}: {
  addLabel: string;
  label: string;
  onChange: (values: string[]) => void;
  placeholder: string;
  values: string[];
}) {
  const visibleValues = values.length > 0 ? values : [""];

  function updateValue(index: number, value: string) {
    onChange(
      visibleValues.map((current, currentIndex) =>
        currentIndex === index ? value : current,
      ),
    );
  }

  function addValue() {
    onChange([...visibleValues, ""]);
  }

  function removeValue(index: number) {
    const nextValues = visibleValues.filter(
      (_, currentIndex) => currentIndex !== index,
    );
    onChange(nextValues.length > 0 ? nextValues : [""]);
  }

  return (
    <div className="url-list-field">
      <div className="url-list-header">
        <span>{label}</span>
      </div>
      <div className="url-list-rows">
        {visibleValues.map((value, index) => (
          <div className="url-list-row" key={`${label}-${index}`}>
            <input
              aria-label={`${label} ${index + 1}`}
              onChange={(event) => updateValue(index, event.target.value)}
              placeholder={placeholder}
              value={value}
            />
            <button
              aria-label={`${label} ${index + 1}を削除`}
              className="url-remove-button"
              disabled={visibleValues.length === 1 && !value.trim()}
              onClick={() => removeValue(index)}
              title="削除"
              type="button"
            >
              <Trash2 size={14} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
      <button className="inline-add-button" onClick={addValue} type="button">
        <Plus size={14} aria-hidden="true" />
        {addLabel}
      </button>
    </div>
  );
}

function CodexConnectionCard({
  busy,
  deviceCodeResult,
  onLoginCheck,
  onOpenExternalUrl,
  onRefresh,
  onSmokeTest,
  runtimeInfo,
  smokeResult,
}: {
  busy: CodexConnectionAction | null;
  deviceCodeResult: DeviceCodeLoginResult | null;
  onLoginCheck: () => void;
  onOpenExternalUrl: (url: string) => void;
  onRefresh: () => void;
  onSmokeTest: () => void;
  runtimeInfo: CodexRuntimeInfo | null;
  smokeResult: CodexSmokeResult | null;
}) {
  const cliDetected = Boolean(runtimeInfo?.resolvedPath);
  const deviceCodeCompleted = deviceCodeResult?.completionSuccess === true;
  const loginCodeIssued = Boolean(
    deviceCodeResult?.verificationUrl &&
    !deviceCodeCompleted &&
    !deviceCodeResult?.cancelStatus,
  );
  const authenticated = (smokeResult?.authenticated ?? false) || deviceCodeCompleted;
  const hasSmokeResult = Boolean(smokeResult);
  const hasAuthSignal = hasSmokeResult || deviceCodeResult !== null;
  const authState = authenticated
    ? deviceCodeCompleted && !smokeResult?.authenticated
      ? "認証完了"
      : "接続済み"
    : loginCodeIssued
      ? "認証待ち"
      : hasAuthSignal
        ? "未接続"
        : "未確認";
  const authTone = authenticated ? "good" : hasAuthSignal ? "warn" : "neutral";

  return (
    <section className="codex-card">
      <div className="section-title">
        <Settings size={15} aria-hidden="true" />
        <span>Codex接続</span>
      </div>
      <div className="connection-status-grid">
        <ConnectionStatus
          label="Codex CLI"
          state={cliDetected ? "検出済み" : "未検出"}
          tone={cliDetected ? "good" : "warn"}
        />
        <ConnectionStatus label="ChatGPT認証" state={authState} tone={authTone} />
      </div>
      <div className="codex-detail-list">
        <span>Version: {runtimeInfo?.version ?? "-"}</span>
        <span>Mode: {authenticated ? "Codex生成" : "ローカルドラフト可"}</span>
      </div>
      {runtimeInfo?.warnings.length ? (
        <div className="codex-warning">
          <Info size={14} aria-hidden="true" />
          <span>{runtimeInfo.warnings[0]}</span>
        </div>
      ) : null}
      {deviceCodeResult?.verificationUrl ? (
        <div className="device-code-box">
          <span>認証URL</span>
          <button
            className="inline-link-button"
            onClick={() => onOpenExternalUrl(deviceCodeResult.verificationUrl ?? "")}
            type="button"
          >
            {deviceCodeResult.verificationUrl}
            <ExternalLink size={12} aria-hidden="true" />
          </button>
          <strong>{deviceCodeResult.userCode ?? ""}</strong>
        </div>
      ) : null}
      {deviceCodeResult ? (
        <div
          className={`codex-warning ${deviceCodeCompleted ? "codex-warning-good" : ""}`}
        >
          <Info size={14} aria-hidden="true" />
          <span>
            {deviceCodeCompleted
              ? "ChatGPT認証が完了しました。接続テストでCodex生成を確認できます。"
              : loginCodeIssued
                ? "認証URLを開き、表示されたコードを入力してください。完了後は接続テストで確認できます。"
                : (deviceCodeResult.errors[0] ??
                  deviceCodeResult.warnings[0] ??
                  "ChatGPT認証は未完了です。URLとコードを確認してください。")}
          </span>
        </div>
      ) : null}
      <div className="connection-actions">
        <button
          className="ghost-button"
          disabled={busy !== null}
          onClick={onRefresh}
          type="button"
        >
          <Settings size={14} aria-hidden="true" />
          {busy === "refresh" ? "確認中" : "状態確認"}
        </button>
        <button
          className="ghost-button"
          disabled={busy !== null || !cliDetected}
          onClick={onSmokeTest}
          type="button"
        >
          <Sparkles size={14} aria-hidden="true" />
          {busy === "smoke" ? "接続中" : "接続テスト"}
        </button>
        <button
          className="ghost-button"
          disabled={busy !== null || !cliDetected}
          onClick={onLoginCheck}
          type="button"
        >
          <ExternalLink size={14} aria-hidden="true" />
          {busy === "login" ? "取得中" : "認証コード取得"}
        </button>
      </div>
    </section>
  );
}

function ConnectionStatus({
  label,
  state,
  tone,
}: {
  label: string;
  state: string;
  tone: "good" | "neutral" | "warn";
}) {
  return (
    <div className={`connection-status connection-status-${tone}`}>
      <span>{label}</span>
      <strong>{state}</strong>
    </div>
  );
}

function BusinessImpactPanel({
  open,
  onGenerate,
  onSelectSuggestion,
  selectedSuggestionId,
  workspace,
}: {
  open: boolean;
  onGenerate: () => void;
  onSelectSuggestion: (suggestionId: string) => void;
  selectedSuggestionId: string | null;
  workspace: ProjectWorkspace;
}) {
  const suggestions = useMemo(
    () =>
      workspace.suggestions
        .filter((suggestion) => suggestion.adoptionStatus !== "rejected")
        .sort((left, right) => right.impactScore - left.impactScore),
    [workspace.suggestions],
  );
  const quickWins = suggestions.filter(
    (suggestion) =>
      levelRank(suggestion.expectedRevenueImpact) >= 2 &&
      levelRank(suggestion.effortLevel) <= 1,
  );
  const highImpact = suggestions.filter(
    (suggestion) => levelRank(suggestion.expectedRevenueImpact) >= 2,
  );
  const highConfidence = suggestions.filter(
    (suggestion) => suggestion.confidenceStatus === "confirmed",
  );

  return (
    <aside
      className={`impact-panel ${open ? "impact-panel-open" : "impact-panel-closed"}`}
      aria-hidden={!open}
    >
      <div className="panel-heading">
        <span>事業インパクト</span>
        <small>{suggestions.length}施策</small>
      </div>
      <div className="impact-summary">
        <div>
          <TrendingUp size={16} aria-hidden="true" />
          <strong>{highImpact.length}</strong>
          <span>売上影響大</span>
        </div>
        <div>
          <Gauge size={16} aria-hidden="true" />
          <strong>{quickWins.length}</strong>
          <span>効果大・工数小</span>
        </div>
        <div>
          <Target size={16} aria-hidden="true" />
          <strong>{highConfidence.length}</strong>
          <span>根拠強め</span>
        </div>
      </div>
      <div className="impact-panel-actions">
        <button className="primary-button" onClick={onGenerate} type="button">
          <Sparkles size={15} aria-hidden="true" />
          評価生成
        </button>
      </div>
      <div className="impact-matrix">
        {[
          ["quick", "効果大・工数小", quickWins],
          [
            "invest",
            "効果大・工数大",
            suggestions.filter(
              (suggestion) =>
                levelRank(suggestion.expectedRevenueImpact) >= 2 &&
                levelRank(suggestion.effortLevel) >= 2,
            ),
          ],
          [
            "small",
            "効果小・工数小",
            suggestions.filter(
              (suggestion) =>
                levelRank(suggestion.expectedRevenueImpact) <= 1 &&
                levelRank(suggestion.effortLevel) <= 1,
            ),
          ],
          [
            "defer",
            "効果小・工数大",
            suggestions.filter(
              (suggestion) =>
                levelRank(suggestion.expectedRevenueImpact) <= 1 &&
                levelRank(suggestion.effortLevel) >= 2,
            ),
          ],
        ].map(([id, label, items]) => (
          <div className={`impact-quadrant impact-quadrant-${id}`} key={String(id)}>
            <strong>{label as string}</strong>
            {(items as SuggestionRow[]).slice(0, 3).map((suggestion) => (
              <button
                className={`impact-pill ${
                  selectedSuggestionId === suggestion.id ? "impact-pill-active" : ""
                }`}
                key={suggestion.id}
                onClick={() => onSelectSuggestion(suggestion.id)}
                type="button"
              >
                {suggestion.title}
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="impact-list">
        {suggestions.map((suggestion) => (
          <button
            className={`impact-row ${
              selectedSuggestionId === suggestion.id ? "impact-row-active" : ""
            }`}
            key={suggestion.id}
            onClick={() => onSelectSuggestion(suggestion.id)}
            type="button"
          >
            <div className="impact-row-head">
              <strong>{suggestion.title}</strong>
              <span>{suggestion.impactScore}</span>
            </div>
            <div className="impact-metrics">
              <span>
                売上 {labelFor(impactLevelOptions, suggestion.expectedRevenueImpact)}
              </span>
              <span>
                利益 {labelFor(impactLevelOptions, suggestion.expectedProfitImpact)}
              </span>
              <span>費用 {labelFor(costLevelOptions, suggestion.costLevel)}</span>
              <span>工数 {labelFor(costLevelOptions, suggestion.effortLevel)}</span>
            </div>
            <small>{suggestion.evidence ?? suggestion.rationale ?? "根拠未設定"}</small>
          </button>
        ))}
        {suggestions.length === 0 ? (
          <div className="empty-panel">
            マップ生成後に事業インパクト評価を生成します。
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function buildNodeImpactStats(workspace: ProjectWorkspace): NodeImpactStats {
  const stats: NodeImpactStats = {};
  for (const suggestion of workspace.suggestions) {
    if (suggestion.adoptionStatus === "rejected") continue;
    for (const nodeId of parseRelatedNodeIds(suggestion.relatedNodeIdsJson)) {
      const current = stats[nodeId];
      stats[nodeId] = {
        score: Math.max(current?.score ?? 0, suggestion.impactScore),
        revenueImpact: highestLevel(
          current?.revenueImpact ?? "unknown",
          suggestion.expectedRevenueImpact,
        ),
        profitImpact: highestLevel(
          current?.profitImpact ?? "unknown",
          suggestion.expectedProfitImpact,
        ),
        costLevel: lowestOperationalLevel(
          current?.costLevel ?? "unknown",
          suggestion.costLevel,
        ),
        effortLevel: lowestOperationalLevel(
          current?.effortLevel ?? "unknown",
          suggestion.effortLevel,
        ),
        confidenceStatus: strongestConfidence(
          current?.confidenceStatus ?? "needs_review",
          suggestion.confidenceStatus,
        ),
        sourceCount: (current?.sourceCount ?? 0) + 1,
      };
    }
  }
  return stats;
}

function buildImpactPositionOverrides(
  workspace: ProjectWorkspace,
  impactStats: NodeImpactStats,
): NodePositionOverrides {
  const saved = parseViewLayoutPositions(
    workspace.viewLayouts.find((layout) => layout.viewId === "business_impact") ?? null,
  );
  const result: NodePositionOverrides = {};
  const laneCounts = new Map<string, number>();

  for (const node of workspace.nodes) {
    if (saved[node.id]) {
      result[node.id] = saved[node.id];
      continue;
    }
    const stats = impactStats[node.id];
    const impact = levelRank(stats?.revenueImpact ?? node.influenceLevel ?? "medium");
    const effort = levelRank(stats?.effortLevel ?? "medium");
    const lane = `${impact}-${effort}`;
    const index = laneCounts.get(lane) ?? 0;
    laneCounts.set(lane, index + 1);
    result[node.id] = {
      x: 330 + effort * 245,
      y: 80 + (3 - Math.max(1, impact)) * 135 + index * 86,
    };
  }

  return result;
}

function parseViewLayoutPositions(layout: ViewLayoutRow | null): NodePositionOverrides {
  if (!layout) return {};
  try {
    const parsed = JSON.parse(layout.layoutJson) as {
      positions?: Array<{
        nodeId?: string;
        x?: number;
        y?: number;
        width?: number;
        height?: number;
      }>;
    };
    return Object.fromEntries(
      (parsed.positions ?? [])
        .filter(
          (position) =>
            typeof position.nodeId === "string" &&
            typeof position.x === "number" &&
            typeof position.y === "number",
        )
        .map((position) => [
          position.nodeId as string,
          {
            x: position.x as number,
            y: position.y as number,
            width: position.width,
            height: position.height,
          },
        ]),
    );
  } catch {
    return {};
  }
}

function parseRelatedNodeIds(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function levelRank(value: string): number {
  if (value === "high" || value === "3") return 3;
  if (value === "medium" || value === "2") return 2;
  if (value === "low" || value === "1") return 1;
  return 0;
}

function highestLevel(current: string, next: string) {
  return levelRank(next) > levelRank(current) ? next : current;
}

function lowestOperationalLevel(current: string, next: string) {
  if (current === "unknown") return next;
  if (next === "unknown") return current;
  return levelRank(next) < levelRank(current) ? next : current;
}

function strongestConfidence(current: string, next: string) {
  const ranks: Record<string, number> = { needs_review: 0, estimated: 1, confirmed: 2 };
  return (ranks[next] ?? 0) > (ranks[current] ?? 0) ? next : current;
}

function ProjectsView({
  activeProject,
  activeProjectId,
  onCreateProject,
  onDeleteProject,
  onSelectProject,
  onUpdateProject,
  projects,
}: {
  activeProject: Project | null;
  activeProjectId: string | null;
  onCreateProject: () => void;
  onDeleteProject: (projectId: string) => void;
  onSelectProject: (projectId: string) => void;
  onUpdateProject: (projectId: string, values: ProjectFormValues) => void;
  projects: Project[];
}) {
  function submitProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeProject) return;
    const form = new FormData(event.currentTarget);
    onUpdateProject(activeProject.id, {
      name: String(form.get("name") ?? ""),
      clientName: String(form.get("clientName") ?? ""),
      industry: String(form.get("industry") ?? ""),
      description: String(form.get("description") ?? ""),
      memo: String(form.get("memo") ?? ""),
    });
  }

  return (
    <section className="page-panel">
      <div className="page-header">
        <div>
          <h1>案件一覧</h1>
          <p>新規案件を作成し、既存案件を再開します。</p>
        </div>
        <button className="primary-button" onClick={onCreateProject} type="button">
          <Plus size={15} aria-hidden="true" />
          新しいマップを作る
        </button>
      </div>
      {activeProject ? (
        <form
          className="project-editor"
          key={activeProject.id}
          onSubmit={submitProject}
        >
          <FormGrid>
            <Field label="案件名">
              <input defaultValue={activeProject.name} name="name" />
            </Field>
            <Field label="クライアント名">
              <input defaultValue={activeProject.clientName ?? ""} name="clientName" />
            </Field>
          </FormGrid>
          <FormGrid>
            <Field label="業種">
              <input defaultValue={activeProject.industry ?? ""} name="industry" />
            </Field>
            <Field label="説明">
              <input
                defaultValue={activeProject.description ?? ""}
                name="description"
              />
            </Field>
          </FormGrid>
          <Field label="メモ">
            <textarea defaultValue={activeProject.memo ?? ""} name="memo" />
          </Field>
          <div className="button-row">
            <button className="primary-button" type="submit">
              <Save size={15} aria-hidden="true" />
              案件を保存
            </button>
            <button
              className="danger-button"
              onClick={() => onDeleteProject(activeProject.id)}
              type="button"
            >
              <Trash2 size={15} aria-hidden="true" />
              案件を削除
            </button>
          </div>
        </form>
      ) : null}
      <div className="data-table">
        {projects.map((project) => (
          <button
            className={`table-row ${project.id === activeProjectId ? "table-row-active" : ""}`}
            key={project.id}
            onClick={() => onSelectProject(project.id)}
            type="button"
          >
            <span>{project.name}</span>
            <span>{project.clientName ?? "未設定"}</span>
            <span>{project.industry ?? "業種未設定"}</span>
            <span>{formatTime(project.updatedAt)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function SettingsView({
  codexBusy,
  codexRuntimeInfo,
  codexSmokeResult,
  deviceCodeResult,
  onRefreshCodexRuntime,
  onRunCodexLoginCheck,
  onRunCodexSmokeTest,
  onOpenExternalUrl,
}: {
  codexBusy: CodexConnectionAction | null;
  codexRuntimeInfo: CodexRuntimeInfo | null;
  codexSmokeResult: CodexSmokeResult | null;
  deviceCodeResult: DeviceCodeLoginResult | null;
  onRefreshCodexRuntime: () => void;
  onRunCodexLoginCheck: () => void;
  onRunCodexSmokeTest: () => void;
  onOpenExternalUrl: (url: string) => void;
}) {
  return (
    <section className="page-panel settings-panel">
      <div className="page-header">
        <div>
          <h1>設定</h1>
          <p>Codex接続、ChatGPT認証、ローカルドラフトへの切り替わりを確認します。</p>
        </div>
      </div>
      <div className="settings-grid">
        <CodexConnectionCard
          busy={codexBusy}
          runtimeInfo={codexRuntimeInfo}
          smokeResult={codexSmokeResult}
          deviceCodeResult={deviceCodeResult}
          onLoginCheck={onRunCodexLoginCheck}
          onOpenExternalUrl={onOpenExternalUrl}
          onRefresh={onRefreshCodexRuntime}
          onSmokeTest={onRunCodexSmokeTest}
        />
        <div className="settings-detail-card">
          <div className="section-title">
            <Info size={15} aria-hidden="true" />
            <span>接続情報</span>
          </div>
          <dl>
            <dt>Codex CLI path</dt>
            <dd>{codexRuntimeInfo?.resolvedPath ?? "-"}</dd>
            <dt>real path</dt>
            <dd>{codexRuntimeInfo?.realPath ?? "-"}</dd>
            <dt>target</dt>
            <dd>{codexRuntimeInfo?.targetTriple ?? "-"}</dd>
            <dt>sidecar candidate</dt>
            <dd>{codexRuntimeInfo?.sidecarCandidateName ?? "-"}</dd>
            <dt>distribution</dt>
            <dd>{codexRuntimeInfo?.distributionDecision ?? "-"}</dd>
          </dl>
        </div>
      </div>
    </section>
  );
}

function SourcesView({
  canPickFiles,
  canSaveTextSource,
  generationBusy,
  onGenerateMap,
  onCreateInformationSource,
  onOpenExtractReview,
  onPickFiles,
  reflectionSummary,
}: {
  canPickFiles: boolean;
  canSaveTextSource: boolean;
  generationBusy: boolean;
  onGenerateMap: () => void;
  onCreateInformationSource: (draft: InformationSourceDraft) => void;
  onOpenExtractReview: () => void;
  onPickFiles: () => void;
  reflectionSummary: WorkspaceReflectionSummary;
}) {
  const [draft, setDraft] = useState<InformationSourceDraft>({
    sourceKind: "manual_note",
    title: "",
    body: "",
    url: "",
  });
  const selectedOption =
    informationSourceOptions.find((option) => option.id === draft.sourceKind) ??
    informationSourceOptions[0];
  const needsUrl = draft.sourceKind === "website_url" || draft.sourceKind === "sns_url";
  const canSave =
    canSaveTextSource &&
    (needsUrl ? draft.url.trim().length > 0 : draft.body.trim().length > 0);

  function updateDraft<K extends keyof InformationSourceDraft>(
    key: K,
    value: InformationSourceDraft[K],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function submitInformationSource(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave) return;
    onCreateInformationSource(draft);
    setDraft({
      sourceKind: draft.sourceKind,
      title: "",
      body: "",
      url: "",
    });
  }

  return (
    <section className="page-panel">
      <div className="page-header">
        <div>
          <h1>情報ソース</h1>
          <p>ファイル、メモ、URL、SNS、商品情報をマップの材料として追加します。</p>
        </div>
      </div>
      <SourceReflectionOverview
        generationBusy={generationBusy}
        onGenerateMap={onGenerateMap}
        onOpenExtractReview={onOpenExtractReview}
        summary={reflectionSummary}
      />
      <form className="source-add-panel" onSubmit={submitInformationSource}>
        <div className="source-add-heading">
          <strong>情報ソースを追加</strong>
          <span>
            URLやSNSは本文を自動取得せず、入力したURLと補足メモを材料として扱います。
          </span>
        </div>
        <div className="source-kind-tabs" role="tablist" aria-label="情報ソース種別">
          {informationSourceOptions.map((option) => {
            const SourceIcon = option.icon;
            return (
              <button
                className={draft.sourceKind === option.id ? "active" : ""}
                key={option.id}
                onClick={() => updateDraft("sourceKind", option.id)}
                type="button"
              >
                <SourceIcon size={14} aria-hidden="true" />
                {option.label}
              </button>
            );
          })}
        </div>
        <FormGrid>
          <Field label="タイトル">
            <input
              onChange={(event) => updateDraft("title", event.target.value)}
              placeholder={selectedOption.label}
              value={draft.title}
            />
          </Field>
          {needsUrl ? (
            <Field label="URL">
              <input
                onChange={(event) => updateDraft("url", event.target.value)}
                placeholder={
                  draft.sourceKind === "sns_url"
                    ? "https://instagram.com/example"
                    : "https://example.com"
                }
                value={draft.url}
              />
            </Field>
          ) : null}
        </FormGrid>
        <Field label={needsUrl ? "補足メモ" : "内容"}>
          <textarea
            onChange={(event) => updateDraft("body", event.target.value)}
            placeholder={
              needsUrl
                ? "このURLから確認したいこと、見てほしい商品や導線など"
                : "事業、商品、集客、顧客接点、売上導線について分かっていること"
            }
            value={draft.body}
          />
        </Field>
        <div className="source-add-actions">
          <button className="primary-button" disabled={!canSave} type="submit">
            <Plus size={15} aria-hidden="true" />
            情報ソースに追加
          </button>
          <small>
            URLやSNSは本文を自動取得せず、入力内容をローカルの材料として保存します。
          </small>
        </div>
      </form>
      <button
        className="drop-zone"
        disabled={!canPickFiles}
        onClick={onPickFiles}
        type="button"
      >
        <Upload size={24} aria-hidden="true" />
        <strong>ここにファイルをドロップ / クリックして選択</strong>
        <span>PDF / CSV / Excel / Markdown / Textを追加できます。</span>
      </button>
      <SourceReflectionList summary={reflectionSummary} />
    </section>
  );
}

function SourceReflectionOverview({
  generationBusy,
  onGenerateMap,
  onOpenExtractReview,
  summary,
}: {
  generationBusy: boolean;
  onGenerateMap: () => void;
  onOpenExtractReview: () => void;
  summary: WorkspaceReflectionSummary;
}) {
  const needsExtraction = summary.pendingExtractionCount > 0;
  const needsMapRefresh = summary.pendingMapCount > 0 || summary.mapRefreshNeeded;

  return (
    <section
      className={`source-overview ${
        needsExtraction || needsMapRefresh ? "source-overview-warning" : ""
      }`}
    >
      <div>
        <span className="section-kicker">反映状況</span>
        <strong>{reflectionSummaryText(summary)}</strong>
      </div>
      <div className="source-overview-stats">
        <StatusChip>{summary.sourceCount}ソース</StatusChip>
        <StatusChip>{summary.extractedSourceCount}抽出済み</StatusChip>
        <StatusChip>{summary.mappedSourceCount}マップ反映済み</StatusChip>
      </div>
      <div className="source-overview-actions">
        {needsExtraction ? (
          <button
            className="primary-button"
            onClick={onOpenExtractReview}
            type="button"
          >
            <ListChecks size={15} aria-hidden="true" />
            抽出カードを更新
          </button>
        ) : needsMapRefresh ? (
          <button
            className="primary-button"
            disabled={generationBusy}
            onClick={onGenerateMap}
            type="button"
          >
            <Sparkles size={15} aria-hidden="true" />
            {generationBusy ? "再生成中" : "追加内容でマップ再生成"}
          </button>
        ) : null}
      </div>
    </section>
  );
}

function SourceReflectionList({ summary }: { summary: WorkspaceReflectionSummary }) {
  if (summary.rows.length === 0) {
    return (
      <div className="source-empty-state">
        <Database size={18} aria-hidden="true" />
        <strong>まだ情報ソースがありません</strong>
        <span>ファイル、メモ、URL、SNS、商品情報を追加するとここに表示されます。</span>
      </div>
    );
  }

  return (
    <section className="source-inventory">
      <div className="source-inventory-header">
        <strong>登録済みソース</strong>
        <span>抽出カードとマップへの反映状態</span>
      </div>
      <div className="source-grid">
        {summary.rows.map((row) => (
          <SourceReflectionCard key={row.source.id} row={row} />
        ))}
      </div>
    </section>
  );
}

function SourceReflectionCard({ row }: { row: SourceReflectionRow }) {
  const SourceIcon =
    informationSourceOptions.find((option) => option.id === row.source.fileType)
      ?.icon ?? FileText;

  return (
    <article className={`source-row source-row-${row.mapState}`}>
      <SourceIcon size={16} aria-hidden="true" />
      <div className="source-row-main">
        <div className="source-row-title">
          <strong>{row.title}</strong>
          <span>{sourceTypeLabel(row.source.fileType)}</span>
        </div>
        {row.detail ? <small>{row.detail}</small> : null}
        <small>
          追加 {formatTime(row.source.createdAt)} / 読み取り {row.source.chunkCount}
          chunks
        </small>
      </div>
      <div className="source-row-progress">
        <span className={`reflection-pill reflection-pill-${row.extractionState}`}>
          {reflectionStateLabel(row.extractionState, "extract")}
        </span>
        <span className={`reflection-pill reflection-pill-${row.mapState}`}>
          {reflectionStateLabel(row.mapState, "map")}
        </span>
      </div>
      <div className="source-row-counts">
        <span>{row.extractedItemCount}カード</span>
        <span>{row.mappedItemCount}ノード</span>
      </div>
    </article>
  );
}

function ExtractView({
  aiSendApproved,
  onCreateManualItem,
  onAiSendApprovedChange,
  onExtract,
  onSelectAllChunks,
  onSelectItem,
  onToggleChunk,
  selectedItemId,
  selectedChunkIds,
  workspace,
}: {
  aiSendApproved: boolean;
  onCreateManualItem: () => void;
  onAiSendApprovedChange: (value: boolean) => void;
  onExtract: () => void;
  onSelectAllChunks: (selected: boolean) => void;
  onSelectItem: (itemId: string) => void;
  onToggleChunk: (chunkId: string) => void;
  selectedItemId: string | null;
  selectedChunkIds: string[];
  workspace: ProjectWorkspace;
}) {
  const selectedChunkSet = new Set(selectedChunkIds);
  const excludedChunks = workspace.sourceChunks.filter(
    (chunk) => !selectedChunkSet.has(chunk.id),
  );
  const allChunksSelected =
    workspace.sourceChunks.length > 0 &&
    selectedChunkIds.length === workspace.sourceChunks.length;

  return (
    <section className="page-panel">
      <div className="page-header">
        <div>
          <h1>抽出カード</h1>
          <p>AI抽出結果を確認し、採用 / 保留 / 却下を整理します。</p>
        </div>
        <div className="button-row">
          <button
            className="primary-button"
            disabled={!aiSendApproved || selectedChunkIds.length === 0}
            onClick={onExtract}
            type="button"
          >
            <Sparkles size={15} aria-hidden="true" />
            AI抽出
          </button>
          <button className="ghost-button" onClick={onCreateManualItem} type="button">
            <Plus size={15} aria-hidden="true" />
            手動カード追加
          </button>
        </div>
      </div>
      <div className="ai-send-confirm">
        <div>
          <strong>AI送信前確認</strong>
          <span>
            既定モードは「ローカル要約だけ送る」です。対象は読み取り済みsource chunks
            {selectedChunkIds.length}/{workspace.sourceChunks.length}
            件、抽出不可ファイルは送信対象外です。
          </span>
        </div>
        <label>
          <input
            checked={aiSendApproved}
            onChange={(event) => onAiSendApprovedChange(event.target.checked)}
            type="checkbox"
          />
          送信範囲を確認しました
        </label>
      </div>
      <div className="chunk-selector">
        <div className="chunk-selector-header">
          <strong>送信対象source chunks</strong>
          <div className="button-row">
            <button
              className="ghost-button"
              onClick={() => onSelectAllChunks(!allChunksSelected)}
              type="button"
            >
              {allChunksSelected ? "全解除" : "全選択"}
            </button>
          </div>
        </div>
        <div className="chunk-list">
          {workspace.sourceChunks.map((chunk) => (
            <label className="chunk-row" key={chunk.id}>
              <input
                checked={selectedChunkSet.has(chunk.id)}
                onChange={() => onToggleChunk(chunk.id)}
                type="checkbox"
              />
              <span>
                <strong>
                  {chunk.fileName} #{chunk.chunkIndex + 1}
                </strong>
                <small>{chunk.contentPreview || "プレビューなし"}</small>
              </span>
            </label>
          ))}
          {workspace.sourceChunks.length === 0 ? (
            <div className="empty-panel">先に資料を投入してください。</div>
          ) : null}
        </div>
        {excludedChunks.length > 0 ? (
          <div className="excluded-chunks">
            送信しない資料:{" "}
            {excludedChunks
              .slice(0, 4)
              .map((chunk) => `${chunk.fileName} #${chunk.chunkIndex + 1}`)
              .join("、")}
            {excludedChunks.length > 4 ? ` ほか${excludedChunks.length - 4}件` : ""}
          </div>
        ) : null}
      </div>
      <div className="cards-grid">
        {workspace.extractedItems.map((item) => (
          <button
            className={`review-card ${selectedItemId === item.id ? "review-card-selected" : ""}`}
            key={item.id}
            onClick={() => onSelectItem(item.id)}
            type="button"
          >
            <div className="card-row">
              <span className={`category-dot category-${item.itemType}`} />
              <strong>{item.name}</strong>
            </div>
            <p>{item.description ?? "説明未設定"}</p>
            <div className="card-meta">
              <span>{labelFor(categoryOptions, item.itemType)}</span>
              <span>{labelFor(confidenceOptions, item.confidenceStatus)}</span>
              <span>{labelFor(adoptionOptions, item.adoptionStatus)}</span>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

function SuggestionsView({
  onGenerate,
  onSelectSuggestion,
  selectedSuggestionId,
  workspace,
}: {
  onGenerate: () => void;
  onSelectSuggestion: (suggestionId: string) => void;
  selectedSuggestionId: string | null;
  workspace: ProjectWorkspace;
}) {
  const suggestions = useMemo(
    () =>
      [...workspace.suggestions].sort(
        (left, right) =>
          right.impactScore - left.impactScore ||
          priorityRank(left.priority) - priorityRank(right.priority),
      ),
    [workspace.suggestions],
  );

  return (
    <section className="page-panel">
      <div className="page-header">
        <div>
          <h1>事業インパクト施策</h1>
          <p>売上・利益・費用・工数への効き方を根拠付きで確認します。</p>
        </div>
        <button className="primary-button" onClick={onGenerate} type="button">
          <Sparkles size={15} aria-hidden="true" />
          評価生成
        </button>
      </div>
      <div className="cards-grid">
        {suggestions.map((suggestion) => (
          <button
            className={`review-card impact-review-card ${
              selectedSuggestionId === suggestion.id ? "review-card-selected" : ""
            }`}
            key={suggestion.id}
            onClick={() => onSelectSuggestion(suggestion.id)}
            type="button"
          >
            <div className="card-row">
              <strong>{suggestion.title}</strong>
              <span className="status-chip">
                {labelFor(priorityOptions, suggestion.priority)}
              </span>
            </div>
            <p>{suggestion.description}</p>
            <div className="impact-metrics">
              <span>
                売上 {labelFor(impactLevelOptions, suggestion.expectedRevenueImpact)}
              </span>
              <span>
                利益 {labelFor(impactLevelOptions, suggestion.expectedProfitImpact)}
              </span>
              <span>費用 {labelFor(costLevelOptions, suggestion.costLevel)}</span>
              <span>工数 {labelFor(costLevelOptions, suggestion.effortLevel)}</span>
              <span>時期 {labelFor(timeToImpactOptions, suggestion.timeToImpact)}</span>
            </div>
            <small>{suggestion.evidence ?? suggestion.rationale}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

function priorityRank(value: string) {
  if (value === "high") return 0;
  if (value === "medium") return 1;
  return 2;
}

function ExportView({
  onExport,
  workspace,
}: {
  onExport: (command: "export_markdown" | "export_csv_bundle") => void;
  workspace: ProjectWorkspace;
}) {
  return (
    <section className="page-panel">
      <div className="page-header">
        <div>
          <h1>出力</h1>
          <p>MarkdownとCSVを案件フォルダのexportsへ保存します。</p>
        </div>
        <div className="button-row">
          <button
            className="primary-button"
            onClick={() => onExport("export_markdown")}
            type="button"
          >
            <Download size={15} aria-hidden="true" />
            Markdown出力
          </button>
          <button
            className="ghost-button"
            onClick={() => onExport("export_csv_bundle")}
            type="button"
          >
            <Database size={15} aria-hidden="true" />
            CSV出力
          </button>
        </div>
      </div>
      <div className="data-table">
        {workspace.exportJobs.map((job) => (
          <div className="table-row" key={job.id}>
            <span>{job.exportType}</span>
            <span>{job.status}</span>
            <span>{job.outputPath}</span>
            <span>{formatTime(job.completedAt)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function HistoryView({ workspace }: { workspace: ProjectWorkspace }) {
  return (
    <section className="page-panel">
      <div className="page-header">
        <div>
          <h1>AI履歴</h1>
          <p>どの実行がどのschemaと出力に対応するかを確認します。</p>
        </div>
      </div>
      <div className="data-table history-table">
        {workspace.aiRuns.map((run) => (
          <div
            className={`table-row ${isFallbackRun(run) ? "table-row-warning" : ""}`}
            key={run.id}
          >
            <span>{run.runType}</span>
            <span>{run.schemaName}</span>
            <span>{aiRunSourceLabel(run)}</span>
            <span>{aiRunStatusLabel(run)}</span>
            <span>{formatTime(run.completedAt)}</span>
          </div>
        ))}
      </div>
      <div className="snapshot-strip">
        {workspace.versions.map((version) => (
          <span className="status-chip" key={version.id}>
            <Archive size={12} aria-hidden="true" />
            {version.versionType} {formatTime(version.createdAt)}
          </span>
        ))}
      </div>
    </section>
  );
}

function InspectorPanel({
  edge,
  isTauriRuntime,
  item,
  node,
  onWorkspaceChange,
  projectId,
  suggestion,
  workspace,
}: {
  edge: MapEdgeRow | null;
  isTauriRuntime: boolean;
  item: ExtractedItemRow | null;
  node: MapNodeRow | null;
  onWorkspaceChange: (workspace: ProjectWorkspace) => void;
  projectId: string | null;
  suggestion: SuggestionRow | null;
  workspace: ProjectWorkspace;
}) {
  const [askBusy, setAskBusy] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const insightTargetKind = node ? "node" : edge ? "edge" : "map";
  const insightTargetId = node?.id ?? edge?.id ?? null;

  async function askMapInsight(questionType: string) {
    if (!projectId) return;
    setAskBusy(true);
    setAskError(null);
    try {
      if (!isTauriRuntime) {
        const now = new Date().toISOString();
        const targetLabel = node
          ? `ノード「${node.label}」`
          : edge
            ? "選択中の導線"
            : "マップ全体";
        onWorkspaceChange({
          ...workspace,
          aiComments: [
            {
              id: `local-insight-${Date.now()}`,
              projectId,
              aiRunId: null,
              commentType: "map_insight",
              title: "壁打ち: ローカルドラフト",
              body: `${targetLabel}について、資料要約とマップ構造から確認するための下書きです。実際の商談では、重要度、担当、成果指標を確認してください。`,
              confidenceStatus: "estimated",
              createdAt: now,
            },
            ...workspace.aiComments,
          ],
        });
        return;
      }
      const result = await invoke<MvpRunResult>("ask_map_insight", {
        projectId,
        targetKind: insightTargetKind,
        targetId: insightTargetId,
        questionType,
      });
      onWorkspaceChange(result.workspace);
    } catch (caughtError) {
      setAskError(String(caughtError));
    } finally {
      setAskBusy(false);
    }
  }

  if (!item && !node && !edge && !suggestion) {
    return null;
  }

  async function submitItem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!item || !projectId || !isTauriRuntime) return;
    const form = new FormData(event.currentTarget);
    const nextWorkspace = await invoke<ProjectWorkspace>("update_extracted_item", {
      projectId,
      itemId: item.id,
      name: String(form.get("name") ?? ""),
      itemType: String(form.get("itemType") ?? "business"),
      description: String(form.get("description") ?? ""),
      confidenceStatus: String(form.get("confidenceStatus") ?? "estimated"),
      impactScore: Number(form.get("impactScore") ?? 2),
      subjectiveImportance: Number(form.get("subjectiveImportance") ?? 2),
      adoptionStatus: String(form.get("adoptionStatus") ?? "accepted"),
      memo: String(form.get("memo") ?? ""),
    });
    onWorkspaceChange(nextWorkspace);
  }

  async function submitNode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!node || !projectId || !isTauriRuntime) return;
    const form = new FormData(event.currentTarget);
    const nextWorkspace = await invoke<ProjectWorkspace>("update_map_node", {
      projectId,
      nodeId: node.id,
      label: String(form.get("label") ?? ""),
      nodeType: String(form.get("nodeType") ?? "business"),
      description: String(form.get("description") ?? ""),
      confidenceStatus: String(form.get("confidenceStatus") ?? "estimated"),
      influenceLevel: String(form.get("influenceLevel") ?? "2"),
      informationRichness: String(form.get("informationRichness") ?? "50"),
      adoptionStatus: String(form.get("adoptionStatus") ?? "accepted"),
      memo: String(form.get("memo") ?? ""),
    });
    onWorkspaceChange(nextWorkspace);
  }

  async function submitEdge(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!edge || !projectId || !isTauriRuntime) return;
    const form = new FormData(event.currentTarget);
    const nextWorkspace = await invoke<ProjectWorkspace>("update_map_edge", {
      projectId,
      edgeId: edge.id,
      label: String(form.get("label") ?? ""),
      flowType: String(form.get("flowType") ?? "inquiry"),
      strength: String(form.get("strength") ?? "normal"),
      confidenceStatus: String(form.get("confidenceStatus") ?? "estimated"),
      edgeType: String(form.get("edgeType") ?? "normal"),
      adoptionStatus: String(form.get("adoptionStatus") ?? "accepted"),
      note: String(form.get("note") ?? ""),
    });
    onWorkspaceChange(nextWorkspace);
  }

  async function hideEdge() {
    if (!edge || !projectId) return;
    if (!isTauriRuntime) {
      onWorkspaceChange({
        ...workspace,
        edges: workspace.edges.map((candidate) =>
          candidate.id === edge.id
            ? {
                ...candidate,
                adoptionStatus: "rejected",
                updatedAt: new Date().toISOString(),
              }
            : candidate,
        ),
      });
      return;
    }
    const nextWorkspace = await invoke<ProjectWorkspace>("update_map_edge", {
      projectId,
      edgeId: edge.id,
      label: edge.label ?? "",
      flowType: edge.flowType ?? "inquiry",
      strength: edge.strength ?? "normal",
      confidenceStatus: edge.confidenceStatus ?? "estimated",
      edgeType: edge.edgeType,
      adoptionStatus: "rejected",
      note: edge.note ?? "",
    });
    onWorkspaceChange(nextWorkspace);
  }

  async function submitSuggestion(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!suggestion || !projectId || !isTauriRuntime) return;
    const form = new FormData(event.currentTarget);
    const nextWorkspace = await invoke<ProjectWorkspace>("update_suggestion", {
      projectId,
      suggestionId: suggestion.id,
      title: String(form.get("title") ?? ""),
      description: String(form.get("description") ?? ""),
      priority: String(form.get("priority") ?? "medium"),
      adoptionStatus: String(form.get("adoptionStatus") ?? "pending"),
      rationale: String(form.get("rationale") ?? ""),
      expectedRevenueImpact: String(form.get("expectedRevenueImpact") ?? "medium"),
      expectedProfitImpact: String(form.get("expectedProfitImpact") ?? "medium"),
      costLevel: String(form.get("costLevel") ?? "medium"),
      effortLevel: String(form.get("effortLevel") ?? "medium"),
      timeToImpact: String(form.get("timeToImpact") ?? "mid"),
      confidenceStatus: String(form.get("confidenceStatus") ?? "estimated"),
      impactScore: Number(form.get("impactScore") ?? 50),
      evidence: String(form.get("evidence") ?? ""),
      memo: String(form.get("memo") ?? ""),
    });
    onWorkspaceChange(nextWorkspace);
  }

  return (
    <aside className="inspector">
      <div className="panel-heading">
        <span>
          {item ? "抽出カード" : node ? "ノード" : edge ? "導線" : "事業インパクト"}
        </span>
        <small>編集</small>
      </div>
      {!item && !suggestion ? (
        <MapInsightActions
          busy={askBusy}
          error={askError}
          onAsk={askMapInsight}
          targetLabel={node ? node.label : edge ? "選択中の導線" : "マップ全体"}
        />
      ) : null}
      {item ? <ItemForm item={item} onSubmit={submitItem} /> : null}
      {node ? <NodeForm node={node} onSubmit={submitNode} /> : null}
      {edge ? <EdgeForm edge={edge} onHide={hideEdge} onSubmit={submitEdge} /> : null}
      {suggestion ? (
        <SuggestionForm
          suggestion={suggestion}
          workspace={workspace}
          onSubmit={submitSuggestion}
        />
      ) : null}
    </aside>
  );
}

function MapInsightActions({
  busy,
  error,
  onAsk,
  targetLabel,
}: {
  busy: boolean;
  error: string | null;
  onAsk: (questionType: string) => void;
  targetLabel: string;
}) {
  return (
    <div className="map-insight-actions">
      <div className="map-insight-header">
        <MessageSquareText size={14} aria-hidden="true" />
        <span>Codexに聞く</span>
        <small>{targetLabel}</small>
      </div>
      <div className="map-insight-buttons">
        <button disabled={busy} onClick={() => onAsk("explain")} type="button">
          これは何？
        </button>
        <button disabled={busy} onClick={() => onAsk("importance")} type="button">
          なぜ重要？
        </button>
        <button disabled={busy} onClick={() => onAsk("bottleneck")} type="button">
          詰まりは？
        </button>
        <button disabled={busy} onClick={() => onAsk("next_questions")} type="button">
          次に聞くこと
        </button>
        <button disabled={busy} onClick={() => onAsk("revenue_action")} type="button">
          売上への一手
        </button>
      </div>
      {busy ? <small className="map-insight-status">Codex確認中...</small> : null}
      {error ? <small className="map-insight-error">{error}</small> : null}
    </div>
  );
}

function SuggestionForm({
  onSubmit,
  suggestion,
  workspace,
}: {
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  suggestion: SuggestionRow;
  workspace: ProjectWorkspace;
}) {
  return (
    <form className="inspector-form" key={suggestion.id} onSubmit={onSubmit}>
      <Field label="施策名">
        <input defaultValue={suggestion.title} name="title" />
      </Field>
      <Field label="やること">
        <textarea defaultValue={suggestion.description} name="description" />
      </Field>
      <FormGrid>
        <Field label="優先度">
          <select defaultValue={suggestion.priority} name="priority">
            {priorityOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="状態">
          <select defaultValue={suggestion.adoptionStatus} name="adoptionStatus">
            {adoptionOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      </FormGrid>
      <FormGrid>
        <Field label="売上影響">
          <select
            defaultValue={suggestion.expectedRevenueImpact}
            name="expectedRevenueImpact"
          >
            {impactLevelOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="利益影響">
          <select
            defaultValue={suggestion.expectedProfitImpact}
            name="expectedProfitImpact"
          >
            {impactLevelOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      </FormGrid>
      <FormGrid>
        <Field label="費用">
          <select defaultValue={suggestion.costLevel} name="costLevel">
            {costLevelOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="工数">
          <select defaultValue={suggestion.effortLevel} name="effortLevel">
            {costLevelOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      </FormGrid>
      <FormGrid>
        <Field label="時期">
          <select defaultValue={suggestion.timeToImpact} name="timeToImpact">
            {timeToImpactOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="確度">
          <select defaultValue={suggestion.confidenceStatus} name="confidenceStatus">
            {confidenceOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      </FormGrid>
      <Field label="インパクトスコア">
        <input
          defaultValue={suggestion.impactScore}
          max={100}
          min={0}
          name="impactScore"
          type="number"
        />
      </Field>
      <Field label="判断理由">
        <textarea defaultValue={suggestion.rationale ?? ""} name="rationale" />
      </Field>
      <Field label="根拠">
        <textarea defaultValue={suggestion.evidence ?? ""} name="evidence" />
      </Field>
      <Field label="メモ">
        <textarea defaultValue={suggestion.memo ?? ""} name="memo" />
      </Field>
      <SuggestionSources suggestion={suggestion} workspace={workspace} />
      <button className="primary-button" type="submit">
        保存
      </button>
    </form>
  );
}

function SuggestionSources({
  suggestion,
  workspace,
}: {
  suggestion: SuggestionRow;
  workspace: ProjectWorkspace;
}) {
  const relatedNodeIds = parseRelatedNodeIds(suggestion.relatedNodeIdsJson);
  const relatedNodes = workspace.nodes.filter((node) =>
    relatedNodeIds.includes(node.id),
  );
  const relatedItems = workspace.extractedItems.filter((item) =>
    relatedNodes.some((node) => node.extractedItemId === item.id),
  );
  const sources = relatedItems.flatMap((item) => item.sources);

  return (
    <div className="source-list">
      <span>根拠ノード・source</span>
      {relatedNodes.length === 0 ? <small>関連ノード未設定</small> : null}
      {relatedNodes.map((node) => (
        <small key={node.id}>{node.label}</small>
      ))}
      {sources.map((source) => (
        <small key={source.id}>
          {source.sourceFileName ?? "source"}
          {source.pageNumber ? ` p.${source.pageNumber}` : ""}
          {source.rowStart ? ` row ${source.rowStart}` : ""}
        </small>
      ))}
    </div>
  );
}

function ItemForm({
  item,
  onSubmit,
}: {
  item: ExtractedItemRow;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form className="inspector-form" key={item.id} onSubmit={onSubmit}>
      <Field label="名前">
        <input defaultValue={item.name} name="name" />
      </Field>
      <Field label="分類">
        <select defaultValue={item.itemType} name="itemType">
          {categoryOptions.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="説明">
        <textarea defaultValue={item.description ?? ""} name="description" />
      </Field>
      <FormGrid>
        <Field label="確度">
          <select defaultValue={item.confidenceStatus} name="confidenceStatus">
            {confidenceOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="影響力">
          <input
            defaultValue={item.impactScore}
            max={3}
            min={1}
            name="impactScore"
            type="number"
          />
        </Field>
      </FormGrid>
      <FormGrid>
        <Field label="主観重要度">
          <input
            defaultValue={item.subjectiveImportance}
            max={3}
            min={1}
            name="subjectiveImportance"
            type="number"
          />
        </Field>
        <Field label="状態">
          <select defaultValue={item.adoptionStatus} name="adoptionStatus">
            {adoptionOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      </FormGrid>
      <Field label="メモ">
        <textarea defaultValue={item.memo ?? ""} name="memo" />
      </Field>
      <SourceList item={item} />
      <button className="primary-button" type="submit">
        保存
      </button>
    </form>
  );
}

function NodeForm({
  node,
  onSubmit,
}: {
  node: MapNodeRow;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form className="inspector-form" key={node.id} onSubmit={onSubmit}>
      <Field label="名前">
        <input defaultValue={node.label} name="label" />
      </Field>
      <Field label="分類">
        <select defaultValue={node.nodeType} name="nodeType">
          {categoryOptions.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="説明">
        <textarea defaultValue={node.description ?? ""} name="description" />
      </Field>
      <FormGrid>
        <Field label="確度">
          <select
            defaultValue={node.confidenceStatus ?? "estimated"}
            name="confidenceStatus"
          >
            {confidenceOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="影響力">
          <input
            defaultValue={node.influenceLevel ?? "2"}
            max={3}
            min={1}
            name="influenceLevel"
            type="number"
          />
        </Field>
      </FormGrid>
      <FormGrid>
        <Field label="情報充実度">
          <input
            defaultValue={node.informationRichness ?? "50"}
            max={100}
            min={0}
            name="informationRichness"
            type="number"
          />
        </Field>
        <Field label="状態">
          <select defaultValue={node.adoptionStatus} name="adoptionStatus">
            {adoptionOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      </FormGrid>
      <Field label="メモ">
        <textarea defaultValue={node.memo ?? ""} name="memo" />
      </Field>
      <button className="primary-button" type="submit">
        保存
      </button>
    </form>
  );
}

function EdgeForm({
  edge,
  onHide,
  onSubmit,
}: {
  edge: MapEdgeRow;
  onHide: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form className="inspector-form" key={edge.id} onSubmit={onSubmit}>
      <Field label="ラベル">
        <input defaultValue={edge.label ?? ""} name="label" />
      </Field>
      <FormGrid>
        <Field label="線の状態">
          <select defaultValue={edge.edgeType} name="edgeType">
            <option value="strong">強い導線</option>
            <option value="normal">通常</option>
            <option value="weak">弱い導線</option>
            <option value="bottleneck">詰まり</option>
            <option value="data_reference">データ根拠</option>
          </select>
        </Field>
        <Field label="強さ">
          <select defaultValue={edge.strength ?? "normal"} name="strength">
            <option value="strong">strong</option>
            <option value="normal">normal</option>
            <option value="weak">weak</option>
          </select>
        </Field>
      </FormGrid>
      <FormGrid>
        <Field label="流れ">
          <select defaultValue={edge.flowType ?? "inquiry"} name="flowType">
            <option value="awareness">認知</option>
            <option value="inquiry">問い合わせ</option>
            <option value="proposal">提案</option>
            <option value="purchase">購入</option>
            <option value="retention">継続</option>
            <option value="referral">紹介</option>
            <option value="data_reference">データ連携</option>
          </select>
        </Field>
        <Field label="確度">
          <select
            defaultValue={edge.confidenceStatus ?? "estimated"}
            name="confidenceStatus"
          >
            {confidenceOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      </FormGrid>
      <Field label="状態">
        <select defaultValue={edge.adoptionStatus} name="adoptionStatus">
          {adoptionOptions.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="メモ">
        <textarea defaultValue={edge.note ?? ""} name="note" />
      </Field>
      <div className="form-actions">
        <button className="ghost-button danger-button" onClick={onHide} type="button">
          <Trash2 size={14} aria-hidden="true" />
          非表示
        </button>
        <button className="primary-button" type="submit">
          保存
        </button>
      </div>
    </form>
  );
}

function SourceList({ item }: { item: ExtractedItemRow }) {
  return (
    <div className="source-list">
      <span>出典</span>
      {item.sources.length === 0 ? <small>出典なし</small> : null}
      {item.sources.map((source) => (
        <small key={source.id}>
          {source.sourceFileName ?? "source"}
          {source.pageNumber ? ` p.${source.pageNumber}` : ""}
          {source.rowStart ? ` row ${source.rowStart}` : ""}
        </small>
      ))}
    </div>
  );
}

function Field({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function FormGrid({ children }: { children: React.ReactNode }) {
  return <div className="form-grid">{children}</div>;
}

export default App;
