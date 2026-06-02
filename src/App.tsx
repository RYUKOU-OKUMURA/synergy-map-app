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
  Star,
  Target,
  Trash2,
  TriangleAlert,
  TrendingUp,
  Upload,
  Waves,
  X,
} from "lucide-react";
import type * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import "./App.css";
import {
  SynergyMapCanvas,
  type MapViewMode,
  type MapNodeLayout,
} from "@/features/map/SynergyMapCanvas";
import {
  applyLocalMapLayouts,
  buildImpactPositionOverrides,
  buildNodeImpactStats,
  parseRelatedNodeIds,
  readableCustomerJourneyLayouts,
  resolveCenterNodeId,
} from "@/features/map/mapLayoutModel";
import type { ViewId } from "@/lib/appViewTypes";
import { demoProject, demoWorkspace, emptyWorkspace } from "@/lib/demoWorkspace";
import {
  actionStatusOptions,
  adoptionOptions,
  categoryOptions,
  confidenceOptions,
  costLevelOptions,
  impactLevelOptions,
  labelFor,
  noteTypeOptions,
  priorityOptions,
  timeToImpactOptions,
} from "@/lib/mvp1Labels";
import type {
  ActionItemRow,
  AiLensItem,
  AiProviderKind,
  AiRunRow,
  AiSettings,
  MapUiPreferences,
  CodexUiEvent,
  CodexRuntimeInfo,
  CodexSmokeResult,
  CursorSdkSmokeResult,
  CursorSdkStatus,
  DeviceCodeLoginResult,
  DeleteSourceResult,
  ExportResult,
  ExtractedItemRow,
  MapEdgeRow,
  MapNoteRow,
  MapNodeRow,
  MvpRunResult,
  Project,
  ProjectWorkspace,
  SelectedMapElement,
  SourceFileRow,
  SuggestionRow,
} from "@/lib/mvp1Types";
import {
  mapPurposeLabel,
  mapPurposeOptions,
  type MapPurposeId,
} from "@/lib/onboardingOptions";
import {
  activeSuggestions,
  buildTodayNextStep,
  buildWorkspaceReflectionSummary,
  getPrimaryActionLabel,
  hasOpenActionForSuggestion,
  needsReflectionAttention,
  reflectionActionView,
  reflectionStateLabel,
  reflectionSummaryText,
  shouldRegenerateMap,
  sortByDateDesc,
  type SourceReflectionRow,
  type WorkspaceReflectionSummary,
} from "@/lib/workspaceProgress";

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

type OnboardingGenerationStage = "source" | "extract" | "map" | "suggestions";

type ActionItemDraft = {
  title: string;
  body: string;
  priority: ActionItemRow["priority"];
  memo: string;
};

type ActionItemUpdateDraft = ActionItemDraft & {
  status: ActionItemRow["status"];
};

const aiLensCategoryLabels: Record<AiLensItem["category"], string> = {
  sales_flow_defect: "売上導線の欠陥",
  dormant_revenue_asset: "眠っている売上資産",
  profit_blind_spot: "利益化の盲点",
};

const contextPanelTabs: Array<{
  id: MapUiPreferences["contextPanelTab"];
  label: string;
}> = [
  { id: "materials", label: "材料" },
  { id: "checks", label: "確認" },
  { id: "actions", label: "一手" },
  { id: "records", label: "記録" },
];

type MapNoteDraft = {
  title: string;
  body: string;
  noteType: MapNoteRow["noteType"];
};

type CodexConnectionAction = "refresh" | "smoke" | "login";
type CursorConnectionAction = "refresh" | "smoke";

const defaultAiSettings = (): AiSettings => ({
  primaryProvider: "codex",
  fallbackEnabled: true,
  cursorModelId: "composer-2.5",
  defaultExportDir: null,
  mapUiPreferences: {
    bottomDrawerOpen: true,
    bottomDrawerHeight: 260,
    showInfluence: true,
    layoutLocked: false,
    drawerSort: "relevance",
    showOpenQuestionsOnly: false,
    contextPanelOpen: false,
    contextPanelTab: "materials",
    aiLensOpen: false,
  },
});

type InformationSourceKind = "manual_note" | "website_url" | "sns_url" | "product_info";

type InformationSourceDraft = {
  sourceKind: InformationSourceKind;
  title: string;
  body: string;
  url: string;
};

const CODEX_EVENT_NAME = "codex-app-server-event";

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
    { id: "projects", label: "マップ一覧", icon: FolderKanban },
  ];

const projectNavItems: Array<{ id: ViewId; label: string; icon: typeof FolderKanban }> =
  [
    { id: "today", label: "今日", icon: Target },
    { id: "map", label: "マップ", icon: MapIcon },
    { id: "sources", label: "情報ソース", icon: Upload },
    { id: "extract", label: "抽出カード", icon: ListChecks },
    { id: "suggestions", label: "施策", icon: MessageSquareText },
    { id: "records", label: "記録", icon: PencilRuler },
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

function onboardingGenerationStageLabel(stage: OnboardingGenerationStage | null) {
  if (stage === "source") return "材料を整理中";
  if (stage === "extract") return "AI抽出中";
  if (stage === "map") return "売上マップ生成中";
  if (stage === "suggestions") return "次の一手を整理中";
  return null;
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
  if (isFallbackRun(run)) return "ローカルドラフト";
  const model = run.model ?? "";
  if (model.startsWith("cursor-sdk/")) return "Composer生成";
  if (model === "codex-app-server") return "Codex生成";
  return "AI生成";
}

function aiRunStatusLabel(run: AiRunRow | null | undefined) {
  if (!run) return "未実行";
  if (run.status === "completed") return "完了";
  if (run.status === "fallback_completed") return "補完完了";
  if (run.status === "response_validated") return "検証済み";
  if (run.status === "fallback_response_validated") return "補完検証済み";
  return run.status;
}

function isSameSelectedMapElement(
  current: SelectedMapElement,
  next: SelectedMapElement,
) {
  if (current === next) return true;
  if (!current || !next) return false;
  return current.kind === next.kind && current.id === next.id;
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
  const [isMapEditMode, setIsMapEditMode] = useState(false);
  const [flowAnimationUserEnabled, setFlowAnimationUserEnabled] = useState(true);
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
  const [aiSettings, setAiSettings] = useState<AiSettings>(defaultAiSettings);
  const [cursorSdkStatus, setCursorSdkStatus] = useState<CursorSdkStatus | null>(null);
  const [cursorSdkSmokeResult, setCursorSdkSmokeResult] =
    useState<CursorSdkSmokeResult | null>(null);
  const [cursorBusy, setCursorBusy] = useState<CursorConnectionAction | null>(null);
  const [aiSettingsBusy, setAiSettingsBusy] = useState(false);
  const [onboardingGenerationStage, setOnboardingGenerationStage] =
    useState<OnboardingGenerationStage | null>(null);
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
  const handleSelectMapElement = useCallback((selection: SelectedMapElement) => {
    setSelectedMapElement((current) =>
      isSameSelectedMapElement(current, selection) ? current : selection,
    );
    if (selection) {
      setSelectedItemId(null);
      setSelectedSuggestionId(null);
    }
  }, []);

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
    setIsMapEditMode(false);
  }

  function clearInspectorSelection() {
    setSelectedItemId(null);
    setSelectedMapElement(null);
    setSelectedSuggestionId(null);
  }

  function shouldClearInspectorForView(nextView: ViewId) {
    return !["map", "extract", "suggestions"].includes(nextView);
  }

  function handleStartNewMap() {
    setSelectedProjectId(null);
    setWorkspace(emptyWorkspace);
    resetProjectScopedSelection();
    setView("map");
  }

  function handleSelectProject(projectId: string, nextView: ViewId = "today") {
    setSelectedProjectId(projectId);
    setWorkspace(emptyWorkspace);
    resetProjectScopedSelection();
    if (!isTauriRuntime && projectId === demoProject.id) {
      setWorkspace(demoWorkspace);
      setFlowAnimationUserEnabled(true);
    }
    setView(nextView);
  }

  function handleClearProjectSelection(nextView: ViewId = "home") {
    setSelectedProjectId(null);
    setWorkspace(emptyWorkspace);
    resetProjectScopedSelection();
    setView(nextView);
  }

  function handleSelectView(nextView: ViewId) {
    if (nextView === "home") {
      handleClearProjectSelection("home");
      return;
    }
    if (shouldClearInspectorForView(nextView)) {
      clearInspectorSelection();
    }
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
        setNotice("マップ情報を保存しました。");
      },
    );
  }

  async function handleDeleteProject(projectId: string) {
    if (
      !window.confirm(
        "このマップ、DBレコード、元情報ソース、source chunks、AI実行ファイル、exportsを削除します。続行しますか？",
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
        setNotice("マップと関連データを削除しました。");
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
          setView("map");
        },
      );
      return;
    }
    if (workspace.suggestions.length === 0 && workspace.aiComments.length === 0) {
      await runAction(
        () =>
          invoke<MvpRunResult>("generate_suggestions_from_map", {
            projectId: activeProjectId,
          }),
        (result) => {
          setWorkspace(result.workspace);
          setNotice(result.message);
          void handleMapUiPreferencesChange({ aiLensOpen: true });
        },
      );
      return;
    }
    if (workspace.actionItems.some((actionItem) => actionItem.status === "open")) {
      setView("today");
      return;
    }
    setView("map");
    await handleAskWholeMap("explain");
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
        void handleMapUiPreferencesChange({
          aiLensOpen: true,
          contextPanelOpen: true,
          contextPanelTab: "actions",
        });
      },
    );
  }

  async function handleExport(command: "export_markdown" | "export_csv_bundle") {
    if (!activeProjectId) return;
    await runAction(
      () => invoke<ExportResult>(command, { projectId: activeProjectId }),
      (result) => {
        setWorkspace(result.workspace);
        setNotice(
          result.warning
            ? `出力しました: ${result.exportJob.outputPath ?? "-"} / ${result.warning}`
            : `出力しました: ${result.exportJob.outputPath ?? "-"}`,
        );
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

  async function handleSaveAiSettings(nextSettings: AiSettings) {
    if (!isTauriRuntime) return;
    setAiSettingsBusy(true);
    setError(null);
    try {
      const saved = await invoke<AiSettings>("save_ai_settings_command", {
        settings: nextSettings,
      });
      setAiSettings(saved);
      setNotice("AIプロバイダ設定を保存しました。");
    } catch (caughtError) {
      setError(String(caughtError));
    } finally {
      setAiSettingsBusy(false);
    }
  }

  async function handleMapUiPreferencesChange(
    patch: Partial<MapUiPreferences>,
    options: { notify?: boolean } = {},
  ) {
    const nextSettings: AiSettings = {
      ...aiSettings,
      mapUiPreferences: {
        ...aiSettings.mapUiPreferences,
        ...patch,
      },
    };
    setAiSettings(nextSettings);
    if (!isTauriRuntime) return;
    try {
      const saved = await invoke<AiSettings>("save_ai_settings_command", {
        settings: nextSettings,
      });
      setAiSettings(saved);
      if (options.notify) setNotice("マップ表示設定を保存しました。");
    } catch (caughtError) {
      setError(String(caughtError));
    }
  }

  async function handleSelectDefaultExportDir() {
    if (!isTauriRuntime) return;
    setAiSettingsBusy(true);
    setError(null);
    try {
      const saved = await invoke<AiSettings>("select_default_export_dir");
      setAiSettings(saved);
      setNotice(
        saved.defaultExportDir
          ? "既定の出力フォルダを保存しました。"
          : "出力フォルダの選択をキャンセルしました。",
      );
    } catch (caughtError) {
      setError(String(caughtError));
    } finally {
      setAiSettingsBusy(false);
    }
  }

  async function handleRefreshCursorSdkStatus() {
    if (!isTauriRuntime) {
      setCursorSdkStatus({
        apiKeyConfigured: false,
        pnpmAvailable: false,
        tsxAvailable: false,
        repoRoot: null,
        scriptExists: false,
      });
      return;
    }
    setCursorBusy("refresh");
    setError(null);
    try {
      const result = await invoke<CursorSdkStatus>("get_cursor_sdk_status");
      setCursorSdkStatus(result);
    } catch (caughtError) {
      setError(String(caughtError));
    } finally {
      setCursorBusy(null);
    }
  }

  async function handleRunCursorSdkSmokeTest() {
    if (!isTauriRuntime) return;
    setCursorBusy("smoke");
    setError(null);
    try {
      const result = await invoke<CursorSdkSmokeResult>("run_cursor_sdk_smoke_test");
      setCursorSdkSmokeResult(result);
      setNotice(
        result.ok
          ? `Composer接続を確認しました（${result.durationMs}ms）。`
          : "Composer接続確認に失敗しました。",
      );
    } catch (caughtError) {
      setError(String(caughtError));
    } finally {
      setCursorBusy(null);
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

  async function handleOpenExportPath(path: string | null) {
    if (!path) return;
    if (!isTauriRuntime) {
      setNotice("出力先を開く操作はTauri実行時に利用できます。");
      return;
    }
    try {
      await invoke("open_export_path", { path });
    } catch (caughtError) {
      setError(String(caughtError));
    }
  }

  async function handleCreateOnboardingMap(draft: OnboardingDraft) {
    const purposeLabel = mapPurposeLabel(draft.purposeId);
    if (!draft.companyName.trim() || !purposeLabel) {
      setNotice("事業名 / マップ名と目的を入力してください。");
      return;
    }

    setIsBusy(true);
    setError(null);
    setNotice(null);
    setOnboardingGenerationStage("source");
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
      setOnboardingGenerationStage("extract");
      const extractResult = await invoke<MvpRunResult>("run_extract_items", {
        projectId,
        sourceChunkIds,
      });
      setWorkspace(extractResult.workspace);

      setOnboardingGenerationStage("map");
      const mapResult = await invoke<MvpRunResult>("generate_map_from_items", {
        projectId,
      });
      setWorkspace(mapResult.workspace);

      setOnboardingGenerationStage("suggestions");
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
      void handleMapUiPreferencesChange({
        aiLensOpen: true,
        contextPanelOpen: true,
        contextPanelTab: "materials",
      });
      setNotice(
        `${
          suggestionsResult.message || mapResult.message || extractResult.message
        } 初回生成は未確認ドラフトです。抽出カードの確度を確認してください。`,
      );
    } catch (caughtError) {
      setError(String(caughtError));
    } finally {
      setOnboardingGenerationStage(null);
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

  async function handleSetCenterNode(nodeId: string | null) {
    if (!activeProjectId) return;
    setError(null);
    try {
      const nextWorkspace = isTauriRuntime
        ? await invoke<ProjectWorkspace>("set_project_center_node", {
            projectId: activeProjectId,
            nodeId,
          })
        : { ...workspace, centerNodeId: nodeId };
      setWorkspace(nextWorkspace);
      setNotice(
        nodeId ? "売上の核を設定しました。" : "売上の核の手動指定を解除しました。",
      );
    } catch (caughtError) {
      setError(String(caughtError));
    }
  }

  async function handleArrangeMap() {
    if (!activeProjectId || workspace.nodes.length === 0) return;
    const centerNodeId = resolveCenterNodeId(workspace);
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
        : readableCustomerJourneyLayouts(workspace.nodes, centerNodeId);
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
        setNotice(`${result.count}件の情報ソースを追加しました。`);
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

  async function handleDeleteSourceFile(source: SourceFileRow) {
    if (!activeProjectId || !isTauriRuntime) return;
    const relatedItems = workspace.extractedItems.filter((item) =>
      item.sources.some((itemSource) => itemSource.sourceFileId === source.id),
    ).length;
    const relatedNodes = workspace.nodes.filter((node) =>
      workspace.extractedItems.some(
        (item) =>
          item.id === node.extractedItemId &&
          item.sources.some((itemSource) => itemSource.sourceFileId === source.id),
      ),
    ).length;

    if (
      !window.confirm(
        `「${source.fileName}」を削除します。既存の抽出カードやマップは残りますが、${relatedItems}カード / ${relatedNodes}ノードは再抽出・再生成の確認が必要になります。続行しますか？`,
      )
    ) {
      return;
    }

    await runAction(
      () =>
        invoke<DeleteSourceResult>("delete_source_file", {
          projectId: activeProjectId,
          sourceFileId: source.id,
        }),
      (result) => {
        setWorkspace(result.workspace);
        setApprovedChunkSignature(null);
        setExcludedChunkIds([]);
        setNotice(
          result.warnings.length > 0
            ? `情報ソースを削除しました。再抽出/再生成推奨です。${result.warnings.join(" / ")}`
            : "情報ソースを削除しました。既存カードとマップは残るため、再抽出/再生成推奨です。",
        );
      },
    );
  }

  async function handleCreateActionItem(draft: ActionItemDraft) {
    if (!activeProjectId || !isTauriRuntime) return;
    await runAction(
      () =>
        invoke<ProjectWorkspace>("create_action_item", {
          projectId: activeProjectId,
          title: draft.title.trim(),
          body: draft.body.trim(),
          priority: draft.priority,
          memo: draft.memo.trim(),
        }),
      (nextWorkspace) => {
        setWorkspace(nextWorkspace);
        setNotice("確認事項を追加しました。");
      },
    );
  }

  async function handleUpdateActionItem(
    actionItem: ActionItemRow,
    draft: ActionItemUpdateDraft,
  ) {
    if (!activeProjectId || !isTauriRuntime) return;
    await runAction(
      () =>
        invoke<ProjectWorkspace>("update_action_item", {
          projectId: activeProjectId,
          actionItemId: actionItem.id,
          title: draft.title.trim(),
          body: draft.body.trim(),
          status: draft.status,
          priority: draft.priority,
          memo: draft.memo.trim(),
        }),
      (nextWorkspace) => {
        setWorkspace(nextWorkspace);
        setNotice("確認事項を更新しました。");
      },
    );
  }

  async function handleCreateActionItemFromSuggestion(suggestion: SuggestionRow) {
    if (!activeProjectId || !isTauriRuntime) return;
    await runAction(
      () =>
        invoke<ProjectWorkspace>("create_action_item_from_suggestion", {
          projectId: activeProjectId,
          suggestionId: suggestion.id,
        }),
      (nextWorkspace) => {
        setWorkspace(nextWorkspace);
        setNotice("次の一手を確認事項に追加しました。");
      },
    );
  }

  async function handleCreateMapNote(draft: MapNoteDraft) {
    if (!activeProjectId || !isTauriRuntime) return;
    await runAction(
      () =>
        invoke<ProjectWorkspace>("create_map_note", {
          projectId: activeProjectId,
          title: draft.title.trim(),
          body: draft.body.trim(),
          noteType: draft.noteType,
        }),
      (nextWorkspace) => {
        setWorkspace(nextWorkspace);
        setNotice("メモを追加しました。");
      },
    );
  }

  async function handleUpdateMapNote(note: MapNoteRow, draft: MapNoteDraft) {
    if (!activeProjectId || !isTauriRuntime) return;
    await runAction(
      () =>
        invoke<ProjectWorkspace>("update_map_note", {
          projectId: activeProjectId,
          noteId: note.id,
          title: draft.title.trim(),
          body: draft.body.trim(),
          noteType: draft.noteType,
        }),
      (nextWorkspace) => {
        setWorkspace(nextWorkspace);
        setNotice("メモを更新しました。");
      },
    );
  }

  async function handleDeleteMapNote(note: MapNoteRow) {
    if (!activeProjectId || !isTauriRuntime) return;
    if (!window.confirm(`メモ「${note.title}」を削除しますか？`)) return;
    await runAction(
      () =>
        invoke<ProjectWorkspace>("delete_map_note", {
          projectId: activeProjectId,
          noteId: note.id,
        }),
      (nextWorkspace) => {
        setWorkspace(nextWorkspace);
        setNotice("メモを削除しました。");
      },
    );
  }

  async function handleCreateNamedVersion(name: string, memo: string) {
    if (!activeProjectId || !isTauriRuntime) return;
    await runAction(
      () =>
        invoke<ProjectWorkspace>("create_named_version", {
          projectId: activeProjectId,
          name: name.trim(),
          memo: memo.trim(),
        }),
      (nextWorkspace) => {
        setWorkspace(nextWorkspace);
        setNotice("現在の状態を名前付きで保存しました。");
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
      setNotice("ファイル追加前に事業名 / マップ名を入力してください。");
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
              body: "マップ全体について、情報ソース要約とノード/導線の関係から確認するための下書きです。強い導線、詰まり、次に聞くことを確認してください。",
              confidenceStatus: "estimated",
              createdAt: now,
            },
            ...workspace.aiComments,
          ],
        });
        void handleMapUiPreferencesChange({ aiLensOpen: true });
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
      void handleMapUiPreferencesChange({ aiLensOpen: true });
    } catch (caughtError) {
      setError(String(caughtError));
    } finally {
      setMapInsightBusy(false);
    }
  }

  useEffect(() => {
    if (!isTauriRuntime) return;
    let cancelled = false;

    async function loadAiProviderState() {
      try {
        const [settings, status] = await Promise.all([
          invoke<AiSettings>("get_ai_settings"),
          invoke<CursorSdkStatus>("get_cursor_sdk_status"),
        ]);
        if (cancelled) return;
        setAiSettings(settings);
        setCursorSdkStatus(status);
      } catch (caughtError) {
        if (!cancelled) {
          setError(String(caughtError));
        }
      }
    }

    void loadAiProviderState();

    return () => {
      cancelled = true;
    };
  }, [isTauriRuntime]);

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
                setNotice(`${droppedPaths.length}件の情報ソースを追加しました。`);
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
        onOpenProjects={() => handleSelectView("projects")}
        onSelectView={handleSelectView}
        onStartNewMap={handleStartNewMap}
        view={view}
      />

      <section className="app-shell">
        <WorkspaceTopBar
          activeProject={activeProject}
          isBusy={isBusy}
          latestAiRun={latestAiRun}
          onAiUpdate={handleAiUpdate}
          onOpenHistory={() => handleSelectView("history")}
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
              onOpenProjects={() => handleSelectView("projects")}
              onSelectProject={(projectId) => handleSelectProject(projectId, "today")}
              onStartNewMap={handleStartNewMap}
              projects={projects}
              workspace={workspace}
            />
          ) : null}
          {view === "map" ? (
            <MapWorkspace
              activeProject={activeProject}
              aiSettings={aiSettings}
              canPickFiles={isTauriRuntime}
              codexBusy={codexBusy}
              codexRuntimeInfo={codexRuntimeInfo}
              codexSmokeResult={codexSmokeResult}
              cursorBusy={cursorBusy}
              cursorSdkSmokeResult={cursorSdkSmokeResult}
              cursorSdkStatus={cursorSdkStatus}
              deviceCodeResult={deviceCodeResult}
              editMode={isMapEditMode}
              flowAnimationUserEnabled={flowAnimationUserEnabled}
              generationBusy={isBusy}
              generationStage={onboardingGenerationStage}
              layoutSaveStatus={visibleLayoutSaveStatus}
              latestAiRun={latestAiRun}
              mapInsightBusy={mapInsightBusy}
              mapUiPreferences={aiSettings.mapUiPreferences}
              mapViewMode={mapViewMode}
              onArrangeMap={handleArrangeMap}
              onAskWholeMap={handleAskWholeMap}
              onCreateMapEdge={handleCreateMapEdge}
              onCreateOnboardingMap={handleCreateOnboardingMap}
              onEditModeChange={setIsMapEditMode}
              onFlowAnimationUserEnabledChange={setFlowAnimationUserEnabled}
              onGenerateMap={handleRegenerateMap}
              onGenerateSuggestions={handleGenerateSuggestions}
              onMapUiPreferencesChange={handleMapUiPreferencesChange}
              onOpenExtractReview={() => {
                setSelectedItemId(workspace.extractedItems[0]?.id ?? null);
                setView("extract");
              }}
              reflectionSummary={reflectionSummary}
              onPickFiles={handlePickOnboardingFiles}
              onOpenExternalUrl={handleOpenExternalUrl}
              onRefreshCodexRuntime={handleRefreshCodexRuntime}
              onRefreshCursorSdkStatus={handleRefreshCursorSdkStatus}
              onRunCodexLoginCheck={handleRunCodexLoginCheck}
              onRunCodexSmokeTest={handleRunCodexSmokeTest}
              onRunCursorSdkSmokeTest={handleRunCursorSdkSmokeTest}
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
              onSelectMapElement={handleSelectMapElement}
              onSelectSuggestion={(suggestionId) => {
                setSelectedSuggestionId(suggestionId);
                setSelectedItemId(null);
                setSelectedMapElement(null);
              }}
              selectedMapElement={selectedMapElement}
              onUpdateActionItem={handleUpdateActionItem}
              workspace={workspace}
            />
          ) : null}
          {view === "today" && activeProject ? (
            <TodayView
              busy={isBusy}
              canEdit={Boolean(activeProjectId && isTauriRuntime)}
              onCreateActionItemFromSuggestion={handleCreateActionItemFromSuggestion}
              onGenerateSuggestions={handleGenerateSuggestions}
              onNavigate={handleSelectView}
              onUpdateActionItem={handleUpdateActionItem}
              reflectionSummary={reflectionSummary}
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
                handleSelectProject(projectId, "today");
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
              onDeleteSource={handleDeleteSourceFile}
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
          {view === "records" && activeProject ? (
            <RecordsView
              canEdit={Boolean(activeProjectId && isTauriRuntime)}
              onCreateActionItem={handleCreateActionItem}
              onCreateMapNote={handleCreateMapNote}
              onDeleteMapNote={handleDeleteMapNote}
              onUpdateActionItem={handleUpdateActionItem}
              onUpdateMapNote={handleUpdateMapNote}
              workspace={workspace}
            />
          ) : null}
          {view === "export" && activeProject ? (
            <ExportView
              canOpenPath={isTauriRuntime}
              defaultExportDir={aiSettings.defaultExportDir}
              onExport={handleExport}
              onOpenPath={handleOpenExportPath}
              workspace={workspace}
            />
          ) : null}
          {view === "history" && activeProject ? (
            <HistoryView
              canSave={Boolean(activeProjectId && isTauriRuntime)}
              onCreateNamedVersion={handleCreateNamedVersion}
              workspace={workspace}
            />
          ) : null}
          {view === "settings" ? (
            <SettingsView
              aiSettings={aiSettings}
              aiSettingsBusy={aiSettingsBusy}
              codexBusy={codexBusy}
              codexRuntimeInfo={codexRuntimeInfo}
              codexSmokeResult={codexSmokeResult}
              cursorBusy={cursorBusy}
              cursorSdkSmokeResult={cursorSdkSmokeResult}
              cursorSdkStatus={cursorSdkStatus}
              deviceCodeResult={deviceCodeResult}
              onOpenExternalUrl={handleOpenExternalUrl}
              onRefreshCodexRuntime={handleRefreshCodexRuntime}
              onRefreshCursorSdkStatus={handleRefreshCursorSdkStatus}
              onRunCodexLoginCheck={handleRunCodexLoginCheck}
              onRunCodexSmokeTest={handleRunCodexSmokeTest}
              onRunCursorSdkSmokeTest={handleRunCursorSdkSmokeTest}
              onSaveAiSettings={handleSaveAiSettings}
              onSelectDefaultExportDir={handleSelectDefaultExportDir}
            />
          ) : null}
        </div>

        {activeProject &&
        !(
          view === "map" &&
          aiSettings.mapUiPreferences.aiLensOpen &&
          workspace.nodes.length > 0
        ) ? (
          <InspectorPanel
            edge={selectedEdge}
            isTauriRuntime={isTauriRuntime}
            item={selectedItem}
            node={selectedNode}
            onClose={clearInspectorSelection}
            onSetCenterNode={handleSetCenterNode}
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

function buildDraftAiLensItems(workspace: ProjectWorkspace): AiLensItem[] {
  if (workspace.nodes.length === 0) return [];
  const items: AiLensItem[] = [];
  const activeEdges = workspace.edges.filter(
    (edge) => edge.adoptionStatus !== "rejected",
  );
  const activeNodes = workspace.nodes.filter(
    (node) => node.adoptionStatus !== "rejected",
  );
  const weakEdge = activeEdges.find(
    (edge) => edge.edgeType === "bottleneck" || edge.strength === "weak",
  );
  const assetNode =
    activeNodes.find((node) =>
      ["channel", "touchpoint", "service"].includes(node.nodeType),
    ) ?? activeNodes[0];
  const profitEdge =
    activeEdges.find(
      (edge) => edge.flowType === "purchase" || edge.strength !== "strong",
    ) ?? activeEdges[0];

  items.push({
    id: "draft-ai-lens-map",
    category: "sales_flow_defect",
    targetKind: "map",
    targetId: null,
    title: "流れ全体の弱さ",
    body: weakEdge
      ? "現在の材料では、顧客が次の接点へ進む流れに弱い箇所がありそうです。"
      : "現在の材料では、売上までの導線全体にまだ確認余地があります。",
    confidenceStatus: "estimated",
  });

  if (assetNode) {
    items.push({
      id: `draft-ai-lens-node-${assetNode.id}`,
      category: "dormant_revenue_asset",
      targetKind: "node",
      targetId: assetNode.id,
      title: assetNode.label,
      body: `${assetNode.label}は、売上導線へさらに接続できる資産として見直す余地があります。`,
      confidenceStatus: assetNode.confidenceStatus ?? "estimated",
    });
  }

  if (profitEdge) {
    items.push({
      id: `draft-ai-lens-edge-${profitEdge.id}`,
      category: "profit_blind_spot",
      targetKind: "edge",
      targetId: profitEdge.id,
      title: profitEdge.label ?? "利益化の接続",
      body: "反応や接点が、単価・継続・高単価提案へ十分つながっているか確認したい導線です。",
      confidenceStatus: profitEdge.confidenceStatus ?? "estimated",
    });
  }

  return items.slice(0, 3);
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
        <span className="sidebar-section-label">現在のマップ</span>
        <div className="project-switcher-card">
          <strong>{activeProject?.name ?? "マップが選択されていません"}</strong>
          <small>
            {activeProject?.clientName ?? "マップを選ぶか、新しく作成してください"}
          </small>
          <button className="ghost-button" onClick={onOpenProjects} type="button">
            <FolderOpen size={14} aria-hidden="true" />
            マップを切り替え
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
        <nav className="sidebar-nav project-nav" aria-label="マップ内メニュー">
          <span className="sidebar-section-label">マップ内メニュー</span>
          {projectNavItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={`sidebar-nav-item ${
                  view === item.id ? "sidebar-nav-item-active" : ""
                } ${item.id === "today" ? "sidebar-nav-item-primary" : ""}`}
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
          <span className="sidebar-section-label">マップを選択後に利用</span>
          <span>今日、マップ、情報ソース、抽出カード、施策、出力、履歴</span>
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
    ? `マップ / ${activeProject.name}`
    : view === "map"
      ? "新しいマップ"
      : view === "projects"
        ? "マップ一覧"
        : view === "settings"
          ? "設定"
          : "ホーム";
  const meta = activeProject
    ? (activeProject.clientName ?? "事業名未設定")
    : view === "map"
      ? "事業名と目的を入力してマップ作成を開始"
      : "マップを選ぶか、新しいマップを作成してください";

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
          <h1>マップを選ぶか、新しいマップを作成してください</h1>
          <p>
            事業名、目的、情報ソースを入れると、AIが商品・集客・売上の流れを1枚のマップに整理します。
          </p>
          <div className="home-actions">
            <button className="primary-button" onClick={onStartNewMap} type="button">
              <Plus size={16} aria-hidden="true" />
              新しいマップを作る
            </button>
            <button className="ghost-button" onClick={onOpenProjects} type="button">
              <FolderOpen size={16} aria-hidden="true" />
              既存マップを開く
            </button>
          </div>
          <div className="home-checklist" aria-label="新規マップ作成に必要な情報">
            <span>事業名</span>
            <span>目的</span>
            <span>情報ソース</span>
          </div>
        </div>
      </div>

      <section className="recent-projects-panel">
        <div className="panel-heading-inline">
          <div>
            <h2>最近のマップ</h2>
            <p>続きから開くマップを選んでください。</p>
          </div>
          <button className="ghost-button" onClick={onOpenProjects} type="button">
            マップ一覧
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
            <div className="empty-panel">まだマップがありません。</div>
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
  aiSettings,
  canPickFiles,
  codexBusy,
  codexRuntimeInfo,
  codexSmokeResult,
  cursorBusy,
  cursorSdkSmokeResult,
  cursorSdkStatus,
  deviceCodeResult,
  editMode,
  flowAnimationUserEnabled,
  generationBusy,
  generationStage,
  layoutSaveStatus,
  latestAiRun,
  mapInsightBusy,
  mapUiPreferences,
  mapViewMode,
  onArrangeMap,
  onAskWholeMap,
  onCreateMapEdge,
  onCreateOnboardingMap,
  onEditModeChange,
  onFlowAnimationUserEnabledChange,
  onGenerateSuggestions,
  onGenerateMap,
  onMapUiPreferencesChange,
  onOpenExtractReview,
  onOpenExternalUrl,
  onPickFiles,
  onRefreshCodexRuntime,
  onRefreshCursorSdkStatus,
  onRunCodexLoginCheck,
  onRunCodexSmokeTest,
  onRunCursorSdkSmokeTest,
  onMapViewModeChange,
  reflectionSummary,
  onSavePositions,
  onSelectItem,
  onSelectMapElement,
  onSelectSuggestion,
  selectedMapElement,
  onUpdateActionItem,
  workspace,
}: {
  activeProject: Project | null;
  aiSettings: AiSettings;
  canPickFiles: boolean;
  codexBusy: CodexConnectionAction | null;
  codexRuntimeInfo: CodexRuntimeInfo | null;
  codexSmokeResult: CodexSmokeResult | null;
  cursorBusy: CursorConnectionAction | null;
  cursorSdkSmokeResult: CursorSdkSmokeResult | null;
  cursorSdkStatus: CursorSdkStatus | null;
  deviceCodeResult: DeviceCodeLoginResult | null;
  editMode: boolean;
  flowAnimationUserEnabled: boolean;
  generationBusy: boolean;
  generationStage: OnboardingGenerationStage | null;
  layoutSaveStatus: "idle" | "saving" | "saved" | "error";
  latestAiRun: AiRunRow | null;
  mapInsightBusy: boolean;
  mapUiPreferences: MapUiPreferences;
  mapViewMode: MapViewMode;
  onArrangeMap: () => void;
  onAskWholeMap: (questionType?: string) => void;
  onCreateMapEdge: (sourceNodeId: string, targetNodeId: string) => void;
  onCreateOnboardingMap: (draft: OnboardingDraft) => void;
  onEditModeChange: (enabled: boolean) => void;
  onFlowAnimationUserEnabledChange: (enabled: boolean) => void;
  onGenerateSuggestions: () => void;
  onGenerateMap: () => void;
  onMapUiPreferencesChange: (
    patch: Partial<MapUiPreferences>,
    options?: { notify?: boolean },
  ) => void;
  onOpenExtractReview: () => void;
  onOpenExternalUrl: (url: string) => void;
  onPickFiles: (draft: OnboardingDraft) => void;
  onRefreshCodexRuntime: () => void;
  onRefreshCursorSdkStatus: () => void;
  onRunCodexLoginCheck: () => void;
  onRunCodexSmokeTest: () => void;
  onRunCursorSdkSmokeTest: () => void;
  onMapViewModeChange: (mode: MapViewMode) => void;
  reflectionSummary: WorkspaceReflectionSummary;
  onSavePositions: (viewMode: MapViewMode, positions: MapNodeLayout[]) => void;
  onSelectItem: (itemId: string) => void;
  onSelectMapElement: (selection: SelectedMapElement) => void;
  onSelectSuggestion: (suggestionId: string) => void;
  selectedMapElement: SelectedMapElement;
  onUpdateActionItem: (actionItem: ActionItemRow, draft: ActionItemUpdateDraft) => void;
  workspace: ProjectWorkspace;
}) {
  const impactStats = useMemo(() => buildNodeImpactStats(workspace), [workspace]);
  const centerNodeId = useMemo(() => resolveCenterNodeId(workspace), [workspace]);
  const impactPositions = useMemo(
    () => buildImpactPositionOverrides(workspace, impactStats),
    [impactStats, workspace],
  );
  const hasGeneratedMap = workspace.nodes.length > 0;
  const canGenerateFromItems = !hasGeneratedMap && workspace.extractedItems.length > 0;
  const mapRegenerationLabel =
    reflectionSummary.pendingExtractionCount > 0
      ? "追加ソースあり"
      : reflectionSummary.mapRefreshNeeded
        ? "未反映を再生成"
        : "再生成";
  const shouldReviewDraft =
    hasOnboardingBrief(workspace) && hasUnconfirmedGeneratedItems(workspace);
  const aiLensItems = useMemo(() => buildDraftAiLensItems(workspace), [workspace]);
  const aiLensOpen = mapUiPreferences.aiLensOpen && aiLensItems.length > 0;
  const handleCanvasPositionsChange = useCallback(
    (positions: MapNodeLayout[]) => onSavePositions(mapViewMode, positions),
    [mapViewMode, onSavePositions],
  );

  return (
    <div
      className={`map-workbench ${
        hasGeneratedMap && mapUiPreferences.contextPanelOpen
          ? "map-workbench-context-open"
          : ""
      } ${aiLensOpen ? "map-workbench-ai-lens-open" : ""}`}
    >
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
              次の一手
            </button>
          </div>

          <div className="map-workbench-top-stack">
            <div className="map-edit-toolbar" aria-label="マップ編集モード">
              <button
                className={!editMode ? "active" : ""}
                onClick={() => onEditModeChange(false)}
                title="整理"
                type="button"
              >
                <MousePointer2 size={14} aria-hidden="true" />
                整理
              </button>
              <button
                className={editMode ? "active" : ""}
                onClick={() => onEditModeChange(true)}
                title="構造編集"
                type="button"
              >
                <PencilRuler size={14} aria-hidden="true" />
                構造編集
              </button>
              {!editMode ? (
                <button
                  aria-pressed={flowAnimationUserEnabled}
                  className={flowAnimationUserEnabled ? "active" : ""}
                  onClick={() =>
                    onFlowAnimationUserEnabledChange(!flowAnimationUserEnabled)
                  }
                  title="導線の流れアニメーション"
                  type="button"
                >
                  <Waves size={14} aria-hidden="true" />
                  流れを表示
                </button>
              ) : null}
              <button onClick={onArrangeMap} title="見やすく整列" type="button">
                <MapIcon size={14} aria-hidden="true" />
                整える
              </button>
              <button
                aria-pressed={mapUiPreferences.layoutLocked}
                className={mapUiPreferences.layoutLocked ? "active" : ""}
                onClick={() =>
                  onMapUiPreferencesChange({
                    layoutLocked: !mapUiPreferences.layoutLocked,
                  })
                }
                title="レイアウト固定"
                type="button"
              >
                <Save size={14} aria-hidden="true" />
                固定
              </button>
              <button
                aria-pressed={mapUiPreferences.showInfluence}
                className={mapUiPreferences.showInfluence ? "active" : ""}
                onClick={() =>
                  onMapUiPreferencesChange({
                    showInfluence: !mapUiPreferences.showInfluence,
                  })
                }
                title="影響度を表示"
                type="button"
              >
                <Gauge size={14} aria-hidden="true" />
                影響度
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
              {mapUiPreferences.layoutLocked ? (
                <span className="map-edit-hint">
                  レイアウト固定中。固定を解除するとノードを動かせます。
                </span>
              ) : editMode ? (
                <span className="map-edit-hint">
                  ノードをドラッグ。選択後、角で大きさを調整。ハンドルから導線を追加。
                </span>
              ) : (
                <span className="map-edit-hint">
                  ノードをドラッグして配置を整えられます。
                </span>
              )}
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

      {hasGeneratedMap ? (
        <MapContextPanel
          onGenerateSuggestions={onGenerateSuggestions}
          onMapUiPreferencesChange={onMapUiPreferencesChange}
          onOpenExtractReview={onOpenExtractReview}
          onSelectItem={onSelectItem}
          onSelectSuggestion={onSelectSuggestion}
          onUpdateActionItem={onUpdateActionItem}
          preferences={mapUiPreferences}
          shouldReviewDraft={shouldReviewDraft}
          workspace={workspace}
        />
      ) : null}

      {hasGeneratedMap ? (
        <AiLensToggle
          count={aiLensItems.length}
          open={aiLensOpen}
          onToggle={() =>
            onMapUiPreferencesChange({
              aiLensOpen: !mapUiPreferences.aiLensOpen,
            })
          }
        />
      ) : null}

      <section className="map-stage">
        {workspace.nodes.length > 0 ? (
          <SynergyMapCanvas
            aiLensItems={aiLensItems}
            aiLensOpen={aiLensOpen}
            centerNodeId={centerNodeId}
            editable={editMode}
            edges={workspace.edges}
            flowAnimationUserEnabled={flowAnimationUserEnabled}
            impactStats={impactStats}
            layoutLocked={mapUiPreferences.layoutLocked}
            nodes={workspace.nodes}
            onConnectNodes={onCreateMapEdge}
            onPositionsChange={handleCanvasPositionsChange}
            onSelect={onSelectMapElement}
            positionOverrides={
              mapViewMode === "business_impact" ? impactPositions : undefined
            }
            selected={selectedMapElement}
            showInfluence={mapUiPreferences.showInfluence}
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
            aiSettings={aiSettings}
            canPickFiles={canPickFiles}
            codexBusy={codexBusy}
            codexRuntimeInfo={codexRuntimeInfo}
            codexSmokeResult={codexSmokeResult}
            cursorBusy={cursorBusy}
            cursorSdkSmokeResult={cursorSdkSmokeResult}
            cursorSdkStatus={cursorSdkStatus}
            deviceCodeResult={deviceCodeResult}
            generationBusy={generationBusy}
            generationStage={generationStage}
            key={activeProject?.id ?? "new-map"}
            onCreateMap={onCreateOnboardingMap}
            onOpenExternalUrl={onOpenExternalUrl}
            onPickFiles={onPickFiles}
            onRefreshCodexRuntime={onRefreshCodexRuntime}
            onRefreshCursorSdkStatus={onRefreshCursorSdkStatus}
            onRunCodexLoginCheck={onRunCodexLoginCheck}
            onRunCodexSmokeTest={onRunCodexSmokeTest}
            onRunCursorSdkSmokeTest={onRunCursorSdkSmokeTest}
            workspace={workspace}
          />
        )}
      </section>

      {hasGeneratedMap && aiLensOpen ? (
        <AiLensPanel items={aiLensItems} onAsk={() => onAskWholeMap("explain")} />
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

function MapContextPanel({
  onGenerateSuggestions,
  onMapUiPreferencesChange,
  onOpenExtractReview,
  onSelectItem,
  onSelectSuggestion,
  onUpdateActionItem,
  preferences,
  shouldReviewDraft,
  workspace,
}: {
  onGenerateSuggestions: () => void;
  onMapUiPreferencesChange: (
    patch: Partial<MapUiPreferences>,
    options?: { notify?: boolean },
  ) => void;
  onOpenExtractReview: () => void;
  onSelectItem: (itemId: string) => void;
  onSelectSuggestion: (suggestionId: string) => void;
  onUpdateActionItem: (actionItem: ActionItemRow, draft: ActionItemUpdateDraft) => void;
  preferences: MapUiPreferences;
  shouldReviewDraft: boolean;
  workspace: ProjectWorkspace;
}) {
  const openActionItems = workspace.actionItems
    .filter((actionItem) => actionItem.status === "open")
    .sort(
      (left, right) =>
        priorityRank(left.priority) - priorityRank(right.priority) ||
        sortByDateDesc(left.createdAt, right.createdAt),
    );
  const suggestions = activeSuggestions(workspace);
  const open = preferences.contextPanelOpen;
  const activeTab = preferences.contextPanelTab;

  function setOpen(nextOpen: boolean) {
    onMapUiPreferencesChange({ contextPanelOpen: nextOpen });
  }

  function setTab(tab: MapUiPreferences["contextPanelTab"]) {
    onMapUiPreferencesChange({ contextPanelOpen: true, contextPanelTab: tab });
  }

  function completeActionItem(actionItem: ActionItemRow) {
    onUpdateActionItem(actionItem, {
      title: actionItem.title,
      body: actionItem.body,
      priority: actionItem.priority,
      memo: actionItem.memo ?? "",
      status: "done",
    });
  }

  return (
    <>
      <button
        aria-expanded={open}
        className={`context-panel-tab ${open ? "context-panel-tab-open" : ""}`}
        onClick={() => setOpen(!open)}
        type="button"
      >
        作業箱
      </button>
      <aside
        aria-hidden={!open}
        className={`map-context-panel ${
          open ? "map-context-panel-open" : "map-context-panel-closed"
        }`}
      >
        <div className="panel-heading">
          <div>
            <span>マップ内コンテキスト</span>
            <small>材料・確認・一手・記録</small>
          </div>
          <button
            aria-label="マップ内コンテキストを閉じる"
            className="panel-close-button"
            onClick={() => setOpen(false)}
            type="button"
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>
        <div className="context-panel-tabs" role="tablist" aria-label="作業箱">
          {contextPanelTabs.map((tab) => (
            <button
              className={activeTab === tab.id ? "active" : ""}
              key={tab.id}
              onClick={() => setTab(tab.id)}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="context-panel-body">
          {activeTab === "materials" ? (
            <ContextMaterialsTab
              onOpenExtractReview={onOpenExtractReview}
              onSelectItem={onSelectItem}
              shouldReviewDraft={shouldReviewDraft}
              workspace={workspace}
            />
          ) : null}
          {activeTab === "checks" ? (
            <ContextChecksTab
              actionItems={openActionItems}
              onComplete={completeActionItem}
            />
          ) : null}
          {activeTab === "actions" ? (
            <ContextActionsTab
              onGenerateSuggestions={onGenerateSuggestions}
              onSelectSuggestion={onSelectSuggestion}
              suggestions={suggestions}
            />
          ) : null}
          {activeTab === "records" ? (
            <ContextRecordsTab mapNotes={workspace.mapNotes} />
          ) : null}
        </div>
      </aside>
    </>
  );
}

function ContextMaterialsTab({
  onOpenExtractReview,
  onSelectItem,
  shouldReviewDraft,
  workspace,
}: {
  onOpenExtractReview: () => void;
  onSelectItem: (itemId: string) => void;
  shouldReviewDraft: boolean;
  workspace: ProjectWorkspace;
}) {
  return (
    <div className="context-panel-list">
      {shouldReviewDraft ? (
        <div className="context-panel-alert">
          <TriangleAlert size={15} aria-hidden="true" />
          <span>推定を含む初回生成です。抽出カードの確度を確認してください。</span>
        </div>
      ) : null}
      <div className="context-panel-summary">
        <StatusChip>{workspace.sourceFiles.length}ソース</StatusChip>
        <StatusChip>{workspace.extractedItems.length}カード</StatusChip>
      </div>
      {workspace.extractedItems.slice(0, 8).map((item) => (
        <button
          className="context-item-button"
          key={item.id}
          onClick={() => onSelectItem(item.id)}
          type="button"
        >
          <span className={`category-dot category-${item.itemType}`} />
          <strong>{item.name}</strong>
          <small>
            {labelFor(categoryOptions, item.itemType)} /{" "}
            {labelFor(confidenceOptions, item.confidenceStatus)}
          </small>
        </button>
      ))}
      {workspace.extractedItems.length === 0 ? (
        <div className="empty-panel">AI抽出後に材料カードが表示されます。</div>
      ) : null}
      <button className="ghost-button" onClick={onOpenExtractReview} type="button">
        <ListChecks size={14} aria-hidden="true" />
        抽出カードを確認
      </button>
    </div>
  );
}

function ContextChecksTab({
  actionItems,
  onComplete,
}: {
  actionItems: ActionItemRow[];
  onComplete: (actionItem: ActionItemRow) => void;
}) {
  return (
    <div className="context-panel-list">
      <div className="context-panel-summary">
        <StatusChip>{actionItems.length}件 未確認</StatusChip>
      </div>
      {actionItems.slice(0, 8).map((actionItem) => (
        <article className="context-task-row" key={actionItem.id}>
          <button
            aria-label={`${actionItem.title}を完了`}
            className="question-check"
            onClick={() => onComplete(actionItem)}
            type="button"
          />
          <div>
            <strong>{actionItem.body}</strong>
            <small>
              優先度 {labelFor(priorityOptions, actionItem.priority)} /{" "}
              {formatTime(actionItem.createdAt)}
            </small>
          </div>
        </article>
      ))}
      {actionItems.length === 0 ? (
        <div className="empty-panel">未確認の項目はありません。</div>
      ) : null}
    </div>
  );
}

function ContextActionsTab({
  onGenerateSuggestions,
  onSelectSuggestion,
  suggestions,
}: {
  onGenerateSuggestions: () => void;
  onSelectSuggestion: (suggestionId: string) => void;
  suggestions: SuggestionRow[];
}) {
  return (
    <div className="context-panel-list">
      <div className="context-panel-summary">
        <StatusChip>{suggestions.length}件 一手</StatusChip>
      </div>
      {suggestions.slice(0, 8).map((suggestion) => (
        <button
          className="context-item-button"
          key={suggestion.id}
          onClick={() => onSelectSuggestion(suggestion.id)}
          type="button"
        >
          <strong>{suggestion.title}</strong>
          <small>
            売上 {labelFor(impactLevelOptions, suggestion.expectedRevenueImpact)} / 工数{" "}
            {labelFor(costLevelOptions, suggestion.effortLevel)}
          </small>
        </button>
      ))}
      {suggestions.length === 0 ? (
        <div className="empty-panel">次の一手はまだありません。</div>
      ) : null}
      <button className="ghost-button" onClick={onGenerateSuggestions} type="button">
        <Sparkles size={14} aria-hidden="true" />
        一手を生成
      </button>
    </div>
  );
}

function ContextRecordsTab({ mapNotes }: { mapNotes: MapNoteRow[] }) {
  return (
    <div className="context-panel-list">
      <div className="context-panel-summary">
        <StatusChip>{mapNotes.length}件 記録</StatusChip>
      </div>
      {mapNotes.slice(0, 8).map((note) => (
        <article className="context-note-row" key={note.id}>
          <strong>{note.title}</strong>
          <p>{shortText(note.body, 110)}</p>
          <small>
            {labelFor(noteTypeOptions, note.noteType)} / {formatTime(note.updatedAt)}
          </small>
        </article>
      ))}
      {mapNotes.length === 0 ? (
        <div className="empty-panel">記録はまだありません。</div>
      ) : null}
    </div>
  );
}

function AiLensToggle({
  count,
  onToggle,
  open,
}: {
  count: number;
  onToggle: () => void;
  open: boolean;
}) {
  return (
    <button
      aria-pressed={open}
      className={`ai-lens-toggle ${open ? "ai-lens-toggle-open" : ""}`}
      disabled={count === 0}
      onClick={onToggle}
      type="button"
    >
      <Sparkles size={15} aria-hidden="true" />
      AI視点 {open ? "ON" : ""}
      <span>{count}</span>
    </button>
  );
}

function AiLensPanel({ items, onAsk }: { items: AiLensItem[]; onAsk: () => void }) {
  return (
    <aside className="ai-lens-panel">
      <div className="panel-heading">
        <div>
          <span>AIが見ている点</span>
          <small>現在の材料から見える注目点</small>
        </div>
      </div>
      <div className="ai-lens-card-list">
        {items.map((item, index) => (
          <article className="ai-lens-card" key={item.id}>
            <div className="ai-lens-card-heading">
              <span className="ai-lens-card-marker">
                {item.targetKind === "map" ? "全体" : index + 1}
              </span>
              <strong>{aiLensCategoryLabels[item.category]}</strong>
            </div>
            <h3>{item.title}</h3>
            <p>{item.body}</p>
            <small>
              {item.targetKind === "map"
                ? "マップ全体への指摘"
                : "マップ上の番号に対応"}{" "}
              / {labelFor(confidenceOptions, item.confidenceStatus)}
            </small>
          </article>
        ))}
      </div>
      <button className="primary-button" onClick={onAsk} type="button">
        <MessageSquareText size={15} aria-hidden="true" />
        詳しく聞く
      </button>
    </aside>
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
        <h1>{activeProject?.name ?? "このマップ"} の売上マップを生成できます</h1>
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
  aiSettings,
  canPickFiles,
  codexBusy,
  codexRuntimeInfo,
  codexSmokeResult,
  cursorBusy,
  cursorSdkSmokeResult,
  cursorSdkStatus,
  deviceCodeResult,
  generationBusy,
  generationStage,
  onCreateMap,
  onOpenExternalUrl,
  onPickFiles,
  onRefreshCodexRuntime,
  onRefreshCursorSdkStatus,
  onRunCodexLoginCheck,
  onRunCodexSmokeTest,
  onRunCursorSdkSmokeTest,
  workspace,
}: {
  activeProject: Project | null;
  aiSettings: AiSettings;
  canPickFiles: boolean;
  codexBusy: CodexConnectionAction | null;
  codexRuntimeInfo: CodexRuntimeInfo | null;
  codexSmokeResult: CodexSmokeResult | null;
  cursorBusy: CursorConnectionAction | null;
  cursorSdkSmokeResult: CursorSdkSmokeResult | null;
  cursorSdkStatus: CursorSdkStatus | null;
  deviceCodeResult: DeviceCodeLoginResult | null;
  generationBusy: boolean;
  generationStage: OnboardingGenerationStage | null;
  onCreateMap: (draft: OnboardingDraft) => void;
  onOpenExternalUrl: (url: string) => void;
  onPickFiles: (draft: OnboardingDraft) => void;
  onRefreshCodexRuntime: () => void;
  onRefreshCursorSdkStatus: () => void;
  onRunCodexLoginCheck: () => void;
  onRunCodexSmokeTest: () => void;
  onRunCursorSdkSmokeTest: () => void;
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
  const hasUrlReferences = websiteUrls.length > 0 || snsUrls.length > 0;
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
  const generationStageLabel = onboardingGenerationStageLabel(generationStage);
  const sendScopeItems = [
    `初回入力: ${draft.companyName.trim() || "事業名未入力"} / ${
      purposeLabel || "目的未選択"
    }`,
    draft.industry.trim() ? `業種: ${draft.industry.trim()}` : "",
    draft.memo.trim() ? `調査メモ: ${shortText(draft.memo)}` : "",
    ...websiteUrls.map((url) => `ホームページURL: ${url}`),
    ...snsUrls.map((url) => `SNS URL: ${url}`),
    hasUrlReferences ? "URL本文は未取得、入力URLを参照メモとして送信" : "",
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
            <h1>必要情報を入れると、AIが売上マップを作ります</h1>
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
              <Field label="事業名 / マップ名">
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
            <Field label="調査メモ / 今わかっていること">
              <textarea
                className="research-memo-textarea"
                onChange={(event) => updateDraft("memo", event.target.value)}
                placeholder="公開情報を調べたメモ、商品、集客、顧客層、気になる導線をまとめて貼れます。"
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
            <div className="url-input-note">
              URLやSNSの本文は自動取得しません。見てほしい内容は調査メモに貼ってください。
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
        {aiSettings.primaryProvider === "cursor" ? (
          <CursorSdkConnectionCard
            busy={cursorBusy}
            modelId={aiSettings.cursorModelId}
            onOpenExternalUrl={onOpenExternalUrl}
            onRefresh={onRefreshCursorSdkStatus}
            onSmokeTest={onRunCursorSdkSmokeTest}
            smokeResult={cursorSdkSmokeResult}
            status={cursorSdkStatus}
          />
        ) : (
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
        )}

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
                入力情報が少ないため推測を含みます。ファイル、URL、メモを追加すると精度が上がります。
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
            {generationStageLabel
              ? generationStageLabel
              : generationBusy
                ? "生成中"
                : hypothesisMode
                  ? "仮説マップを生成する"
                  : "売上マップを生成する"}
          </button>
          {generationStageLabel ? (
            <div className="generation-stage-panel" aria-live="polite">
              <span>{generationStageLabel}</span>
              <small>材料整理、AI抽出、マップ生成、次の一手の順に進みます。</small>
            </div>
          ) : null}
          {!canGenerate ? (
            <small>事業名 / マップ名と目的を入力すると生成できます。</small>
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

  function pasteValues(index: number, text: string) {
    const pastedValues = text
      .split(/[\s,，]+/)
      .map((value) => value.trim())
      .filter(Boolean);
    if (pastedValues.length < 2) return false;

    const beforeValues = visibleValues.slice(0, index);
    const afterValues = visibleValues.slice(index + 1);
    const nextValues = [...beforeValues, ...pastedValues, ...afterValues]
      .map((value) => value.trim())
      .filter(Boolean);
    onChange([...nextValues, ""]);
    return true;
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
              onPaste={(event) => {
                if (pasteValues(index, event.clipboardData.getData("text"))) {
                  event.preventDefault();
                }
              }}
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
          <h1>マップ一覧</h1>
          <p>新しいマップを作成し、既存マップを再開します。</p>
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
            <Field label="マップ名">
              <input defaultValue={activeProject.name} name="name" />
            </Field>
            <Field label="事業名 / 屋号 / 会社名">
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
              マップを保存
            </button>
            <button
              className="danger-button"
              onClick={() => onDeleteProject(activeProject.id)}
              type="button"
            >
              <Trash2 size={15} aria-hidden="true" />
              マップを削除
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

function AiProviderSettingsCard({
  busy,
  settings,
  onSave,
}: {
  busy: boolean;
  settings: AiSettings;
  onSave: (settings: AiSettings) => void;
}) {
  function updateProvider(provider: AiProviderKind) {
    onSave({ ...settings, primaryProvider: provider });
  }

  return (
    <section className="codex-card ai-provider-card">
      <div className="section-title">
        <Settings size={15} aria-hidden="true" />
        <span>AIプロバイダ</span>
      </div>
      <p className="ai-provider-copy">
        構造化AI（抽出・マップ・施策・壁打ち）のプライマリを選びます。失敗時はもう一方へ自動フォールバックできます。
      </p>
      <div
        className="ai-provider-options"
        role="radiogroup"
        aria-label="プライマリAIプロバイダ"
      >
        <label className="ai-provider-option">
          <input
            checked={settings.primaryProvider === "codex"}
            name="primary-provider"
            onChange={() => updateProvider("codex")}
            type="radio"
          />
          <span>Codex App Server</span>
        </label>
        <label className="ai-provider-option">
          <input
            checked={settings.primaryProvider === "cursor"}
            name="primary-provider"
            onChange={() => updateProvider("cursor")}
            type="radio"
          />
          <span>Composer（Cursor SDK）</span>
        </label>
      </div>
      <label className="ai-provider-fallback">
        <input
          checked={settings.fallbackEnabled}
          onChange={(event) =>
            onSave({ ...settings, fallbackEnabled: event.target.checked })
          }
          type="checkbox"
        />
        <span>失敗時に他方のプロバイダへフォールバック</span>
      </label>
      <div className="codex-detail-list">
        <span>Composer model: {settings.cursorModelId}</span>
        <span>保存: {busy ? "保存中..." : "即時反映"}</span>
      </div>
    </section>
  );
}

function ExportFolderSettingsCard({
  busy,
  defaultExportDir,
  onSelect,
}: {
  busy: boolean;
  defaultExportDir: string | null;
  onSelect: () => void;
}) {
  return (
    <section className="codex-card export-folder-card">
      <div className="section-title">
        <FolderOpen size={15} aria-hidden="true" />
        <span>既定の出力先</span>
      </div>
      <p className="ai-provider-copy">
        Markdown / CSVの保存先を日常運用用のフォルダに固定できます。
      </p>
      <div className="export-folder-path">
        {defaultExportDir ?? "未設定（アプリ内exportsへ保存）"}
      </div>
      <button className="ghost-button" disabled={busy} onClick={onSelect} type="button">
        <FolderOpen size={15} aria-hidden="true" />
        フォルダを選択
      </button>
    </section>
  );
}

function CursorSdkConnectionCard({
  busy,
  modelId,
  onOpenExternalUrl,
  onRefresh,
  onSmokeTest,
  smokeResult,
  status,
}: {
  busy: CursorConnectionAction | null;
  modelId: string;
  onOpenExternalUrl: (url: string) => void;
  onRefresh: () => void;
  onSmokeTest: () => void;
  smokeResult: CursorSdkSmokeResult | null;
  status: CursorSdkStatus | null;
}) {
  const apiKeyConfigured = status?.apiKeyConfigured ?? false;
  const bridgeReady =
    (status?.pnpmAvailable ?? false) &&
    (status?.tsxAvailable ?? false) &&
    (status?.scriptExists ?? false);
  const connected = apiKeyConfigured && bridgeReady && (smokeResult?.ok ?? false);
  const authTone = connected ? "good" : apiKeyConfigured ? "warn" : "neutral";

  return (
    <section className="codex-card">
      <div className="section-title">
        <Settings size={15} aria-hidden="true" />
        <span>Composer接続</span>
      </div>
      <div className="connection-status-grid">
        <ConnectionStatus
          label="CURSOR_API_KEY"
          state={apiKeyConfigured ? "設定済み" : "未設定"}
          tone={apiKeyConfigured ? "good" : "warn"}
        />
        <ConnectionStatus
          label="SDK bridge"
          state={bridgeReady ? "準備OK" : "未準備"}
          tone={bridgeReady ? "good" : "warn"}
        />
        <ConnectionStatus
          label="接続テスト"
          state={
            smokeResult
              ? smokeResult.ok
                ? "成功"
                : "失敗"
              : connected
                ? "成功"
                : "未確認"
          }
          tone={authTone}
        />
      </div>
      <div className="codex-detail-list">
        <span>Model: {modelId}</span>
        <span>Mode: {connected ? "Composer生成" : "ローカルドラフト可"}</span>
        {smokeResult ? <span>Last test: {smokeResult.durationMs}ms</span> : null}
      </div>
      {!apiKeyConfigured ? (
        <div className="codex-warning">
          <Info size={14} aria-hidden="true" />
          <span>
            リポジトリ直下の <code>.env</code> に <code>CURSOR_API_KEY=...</code>{" "}
            を設定してからアプリを再起動してください。
          </span>
        </div>
      ) : null}
      <div className="connection-actions">
        <button
          className="ghost-button"
          disabled={busy === "refresh"}
          onClick={onRefresh}
          type="button"
        >
          {busy === "refresh" ? "更新中" : "状態更新"}
        </button>
        <button
          className="primary-button"
          disabled={busy === "smoke" || !apiKeyConfigured}
          onClick={onSmokeTest}
          type="button"
        >
          {busy === "smoke" ? "接続中" : "接続テスト"}
        </button>
        <button
          className="inline-link-button"
          onClick={() => onOpenExternalUrl("https://cursor.com/dashboard/integrations")}
          type="button"
        >
          APIキーを発行
          <ExternalLink size={12} aria-hidden="true" />
        </button>
      </div>
      {smokeResult && !smokeResult.ok && smokeResult.errors.length > 0 ? (
        <div className="codex-warning">
          <Info size={14} aria-hidden="true" />
          <span>{smokeResult.errors.join(" ")}</span>
        </div>
      ) : null}
    </section>
  );
}

function SettingsView({
  aiSettings,
  aiSettingsBusy,
  codexBusy,
  codexRuntimeInfo,
  codexSmokeResult,
  cursorBusy,
  cursorSdkSmokeResult,
  cursorSdkStatus,
  deviceCodeResult,
  onOpenExternalUrl,
  onRefreshCodexRuntime,
  onRefreshCursorSdkStatus,
  onRunCodexLoginCheck,
  onRunCodexSmokeTest,
  onRunCursorSdkSmokeTest,
  onSaveAiSettings,
  onSelectDefaultExportDir,
}: {
  aiSettings: AiSettings;
  aiSettingsBusy: boolean;
  codexBusy: CodexConnectionAction | null;
  codexRuntimeInfo: CodexRuntimeInfo | null;
  codexSmokeResult: CodexSmokeResult | null;
  cursorBusy: CursorConnectionAction | null;
  cursorSdkSmokeResult: CursorSdkSmokeResult | null;
  cursorSdkStatus: CursorSdkStatus | null;
  deviceCodeResult: DeviceCodeLoginResult | null;
  onOpenExternalUrl: (url: string) => void;
  onRefreshCodexRuntime: () => void;
  onRefreshCursorSdkStatus: () => void;
  onRunCodexLoginCheck: () => void;
  onRunCodexSmokeTest: () => void;
  onRunCursorSdkSmokeTest: () => void;
  onSaveAiSettings: (settings: AiSettings) => void;
  onSelectDefaultExportDir: () => void;
}) {
  return (
    <section className="page-panel settings-panel">
      <div className="page-header">
        <div>
          <h1>設定</h1>
          <p>
            AIプロバイダ（Codex / Composer）、接続確認、フォールバックを管理します。
          </p>
        </div>
      </div>
      <div className="settings-grid">
        <AiProviderSettingsCard
          busy={aiSettingsBusy}
          onSave={onSaveAiSettings}
          settings={aiSettings}
        />
        <ExportFolderSettingsCard
          busy={aiSettingsBusy}
          defaultExportDir={aiSettings.defaultExportDir}
          onSelect={onSelectDefaultExportDir}
        />
        {aiSettings.primaryProvider === "cursor" ? (
          <CursorSdkConnectionCard
            busy={cursorBusy}
            modelId={aiSettings.cursorModelId}
            onOpenExternalUrl={onOpenExternalUrl}
            onRefresh={onRefreshCursorSdkStatus}
            onSmokeTest={onRunCursorSdkSmokeTest}
            smokeResult={cursorSdkSmokeResult}
            status={cursorSdkStatus}
          />
        ) : (
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
        )}
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
  onDeleteSource,
  onOpenExtractReview,
  onPickFiles,
  reflectionSummary,
}: {
  canPickFiles: boolean;
  canSaveTextSource: boolean;
  generationBusy: boolean;
  onGenerateMap: () => void;
  onCreateInformationSource: (draft: InformationSourceDraft) => void;
  onDeleteSource: (source: SourceFileRow) => void;
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
      <SourceReflectionList
        onDeleteSource={onDeleteSource}
        summary={reflectionSummary}
      />
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

function SourceReflectionList({
  onDeleteSource,
  summary,
}: {
  onDeleteSource: (source: SourceFileRow) => void;
  summary: WorkspaceReflectionSummary;
}) {
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
          <SourceReflectionCard
            key={row.source.id}
            onDeleteSource={onDeleteSource}
            row={row}
          />
        ))}
      </div>
    </section>
  );
}

function SourceReflectionCard({
  onDeleteSource,
  row,
}: {
  onDeleteSource: (source: SourceFileRow) => void;
  row: SourceReflectionRow;
}) {
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
      <button
        aria-label={`${row.title}を削除`}
        className="ghost-button icon-button danger-button"
        onClick={() => onDeleteSource(row.source)}
        title="情報ソースを削除"
        type="button"
      >
        <Trash2 size={15} aria-hidden="true" />
      </button>
    </article>
  );
}

function TodayView({
  busy,
  canEdit,
  onCreateActionItemFromSuggestion,
  onGenerateSuggestions,
  onNavigate,
  onUpdateActionItem,
  reflectionSummary,
  workspace,
}: {
  busy: boolean;
  canEdit: boolean;
  onCreateActionItemFromSuggestion: (suggestion: SuggestionRow) => void;
  onGenerateSuggestions: () => void;
  onNavigate: (view: ViewId) => void;
  onUpdateActionItem: (actionItem: ActionItemRow, draft: ActionItemUpdateDraft) => void;
  reflectionSummary: WorkspaceReflectionSummary;
  workspace: ProjectWorkspace;
}) {
  const nextStep = buildTodayNextStep(workspace, reflectionSummary);
  const openActionItems = workspace.actionItems.filter(
    (actionItem) => actionItem.status === "open",
  );
  const suggestions = activeSuggestions(workspace)
    .sort(
      (left, right) =>
        priorityRank(left.priority) - priorityRank(right.priority) ||
        right.impactScore - left.impactScore,
    )
    .slice(0, 4);
  const recentNotes = [...workspace.mapNotes]
    .sort((left, right) => sortByDateDesc(left.updatedAt, right.updatedAt))
    .slice(0, 3);
  const recentVersions = [...workspace.versions]
    .sort((left, right) => sortByDateDesc(left.createdAt, right.createdAt))
    .slice(0, 3);
  const recentExports = [...workspace.exportJobs]
    .sort((left, right) =>
      sortByDateDesc(
        left.completedAt ?? left.createdAt,
        right.completedAt ?? right.createdAt,
      ),
    )
    .slice(0, 3);
  const needsAttention = needsReflectionAttention(reflectionSummary);

  function updateActionStatus(
    actionItem: ActionItemRow,
    status: ActionItemRow["status"],
  ) {
    onUpdateActionItem(actionItem, {
      title: actionItem.title,
      body: actionItem.body,
      priority: actionItem.priority,
      memo: actionItem.memo ?? "",
      status,
    });
  }

  return (
    <section className="page-panel today-panel">
      <div className="page-header">
        <div>
          <h1>今日</h1>
          <p>実事業の整理を、今見るべき確認事項と次の一手に絞ります。</p>
        </div>
        <div className="button-row">
          <StatusChip>{openActionItems.length}件 未完了</StatusChip>
          <StatusChip>{suggestions.length}件 施策候補</StatusChip>
        </div>
      </div>

      <section className="today-hero">
        <div>
          <span className="section-kicker">次にやること</span>
          <h2>{nextStep.title}</h2>
          <p>{nextStep.body}</p>
        </div>
        <button
          className="primary-button"
          onClick={() => onNavigate(nextStep.view)}
          type="button"
        >
          <Target size={15} aria-hidden="true" />
          {nextStep.actionLabel}
        </button>
      </section>

      {needsAttention ? (
        <section className="today-alert">
          <TriangleAlert size={16} aria-hidden="true" />
          <div>
            <strong>再抽出 / 再生成の確認</strong>
            <span>{reflectionSummaryText(reflectionSummary)}</span>
          </div>
          <button
            className="ghost-button"
            onClick={() => onNavigate(reflectionActionView(reflectionSummary))}
            type="button"
          >
            確認する
          </button>
        </section>
      ) : null}

      <div className="today-grid">
        <section className="today-section">
          <div className="section-title">
            <ListChecks size={15} aria-hidden="true" />
            <span>未完了の確認事項</span>
          </div>
          <div className="today-list">
            {openActionItems.slice(0, 6).map((actionItem) => (
              <article className="today-item" key={actionItem.id}>
                <div className="today-item-main">
                  <strong>{actionItem.title}</strong>
                  <span>{actionItem.body}</span>
                  <small>
                    優先度 {labelFor(priorityOptions, actionItem.priority)}
                    {actionItem.sourceType === "ai_question" ? " / AI確認質問" : ""}
                  </small>
                </div>
                <div className="button-row">
                  <button
                    className="ghost-button"
                    disabled={!canEdit || busy}
                    onClick={() => updateActionStatus(actionItem, "done")}
                    type="button"
                  >
                    完了
                  </button>
                  <button
                    className="ghost-button"
                    disabled={!canEdit || busy}
                    onClick={() => updateActionStatus(actionItem, "dismissed")}
                    type="button"
                  >
                    見送り
                  </button>
                </div>
              </article>
            ))}
            {openActionItems.length === 0 ? (
              <div className="empty-panel">
                未完了の確認事項はありません。次の一手から必要なものを追加できます。
              </div>
            ) : null}
          </div>
          <button
            className="ghost-button"
            onClick={() => onNavigate("records")}
            type="button"
          >
            記録で詳しく見る
          </button>
        </section>

        <section className="today-section">
          <div className="section-title">
            <TrendingUp size={15} aria-hidden="true" />
            <span>次の一手</span>
          </div>
          <div className="today-list">
            {suggestions.map((suggestion) => {
              const alreadyAdded = hasOpenActionForSuggestion(workspace, suggestion);
              return (
                <article className="today-item" key={suggestion.id}>
                  <div className="today-item-main">
                    <strong>{suggestion.title}</strong>
                    <span>{suggestion.description}</span>
                    <small>
                      売上{" "}
                      {labelFor(impactLevelOptions, suggestion.expectedRevenueImpact)}
                      {" / "}
                      工数 {labelFor(costLevelOptions, suggestion.effortLevel)}
                    </small>
                  </div>
                  <button
                    className="ghost-button"
                    disabled={!canEdit || busy || alreadyAdded}
                    onClick={() => onCreateActionItemFromSuggestion(suggestion)}
                    type="button"
                  >
                    <Plus size={14} aria-hidden="true" />
                    {alreadyAdded ? "追加済み" : "確認事項へ"}
                  </button>
                </article>
              );
            })}
            {suggestions.length === 0 ? (
              <div className="empty-panel">次の一手はまだ生成されていません。</div>
            ) : null}
          </div>
          <div className="button-row">
            <button
              className="primary-button"
              disabled={busy || workspace.nodes.length === 0}
              onClick={onGenerateSuggestions}
              type="button"
            >
              <Sparkles size={15} aria-hidden="true" />
              施策と確認質問を生成
            </button>
            <button
              className="ghost-button"
              onClick={() => onNavigate("suggestions")}
              type="button"
            >
              施策を見る
            </button>
          </div>
        </section>

        <section className="today-section">
          <div className="section-title">
            <PencilRuler size={15} aria-hidden="true" />
            <span>最近のメモ</span>
          </div>
          <div className="today-list">
            {recentNotes.map((note) => (
              <button
                className="today-item today-item-compact today-item-button"
                key={note.id}
                onClick={() => onNavigate("records")}
                type="button"
              >
                <strong>{note.title}</strong>
                <span>{shortText(note.body, 96)}</span>
                <small>
                  {labelFor(noteTypeOptions, note.noteType)} /{" "}
                  {formatTime(note.updatedAt)}
                </small>
              </button>
            ))}
            {recentNotes.length === 0 ? (
              <div className="empty-panel">
                思考メモや会議メモを追加すると、ここから最近の状態へ戻れます。
              </div>
            ) : null}
          </div>
          <button
            className="ghost-button"
            onClick={() => onNavigate("records")}
            type="button"
          >
            メモを書く
          </button>
        </section>

        <section className="today-section">
          <div className="section-title">
            <Archive size={15} aria-hidden="true" />
            <span>保存と出力</span>
          </div>
          <div className="today-list">
            {recentVersions.map((version) => (
              <button
                className="today-item today-item-compact today-item-button"
                key={version.id}
                onClick={() => onNavigate("history")}
                type="button"
              >
                <strong>{version.name ?? version.versionType}</strong>
                <span>{version.memo ?? "メモなし"}</span>
                <small>{formatTime(version.createdAt)}</small>
              </button>
            ))}
            {recentExports.map((job) => (
              <button
                className="today-item today-item-compact today-item-button"
                key={job.id}
                onClick={() => onNavigate("export")}
                type="button"
              >
                <strong>{job.exportType}</strong>
                <span>{job.outputPath ?? "出力先未記録"}</span>
                <small>{formatTime(job.completedAt)}</small>
              </button>
            ))}
            {recentVersions.length === 0 && recentExports.length === 0 ? (
              <div className="empty-panel">
                今日の整理が落ち着いたら、名前付き保存かMarkdown/CSV出力で残します。
              </div>
            ) : null}
          </div>
          <div className="button-row">
            <button
              className="ghost-button"
              onClick={() => onNavigate("history")}
              type="button"
            >
              保存へ
            </button>
            <button
              className="ghost-button"
              onClick={() => onNavigate("export")}
              type="button"
            >
              出力へ
            </button>
          </div>
        </section>
      </div>
    </section>
  );
}

function RecordsView({
  canEdit,
  onCreateActionItem,
  onCreateMapNote,
  onDeleteMapNote,
  onUpdateActionItem,
  onUpdateMapNote,
  workspace,
}: {
  canEdit: boolean;
  onCreateActionItem: (draft: ActionItemDraft) => void;
  onCreateMapNote: (draft: MapNoteDraft) => void;
  onDeleteMapNote: (note: MapNoteRow) => void;
  onUpdateActionItem: (actionItem: ActionItemRow, draft: ActionItemUpdateDraft) => void;
  onUpdateMapNote: (note: MapNoteRow, draft: MapNoteDraft) => void;
  workspace: ProjectWorkspace;
}) {
  const [actionDraft, setActionDraft] = useState<ActionItemDraft>({
    title: "",
    body: "",
    priority: "medium",
    memo: "",
  });
  const [noteDraft, setNoteDraft] = useState<MapNoteDraft>({
    title: "",
    body: "",
    noteType: "thought",
  });
  const openCount = workspace.actionItems.filter(
    (actionItem) => actionItem.status === "open",
  ).length;

  function submitAction(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit || !actionDraft.title.trim() || !actionDraft.body.trim()) return;
    onCreateActionItem(actionDraft);
    setActionDraft({ title: "", body: "", priority: "medium", memo: "" });
  }

  function submitNote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit || !noteDraft.title.trim() || !noteDraft.body.trim()) return;
    onCreateMapNote(noteDraft);
    setNoteDraft({ title: "", body: "", noteType: "thought" });
  }

  return (
    <section className="page-panel records-panel">
      <div className="page-header">
        <div>
          <h1>記録</h1>
          <p>AIが出した確認質問、手動タスク、思考メモを同じ場所で扱います。</p>
        </div>
        <div className="button-row">
          <StatusChip>{openCount}件 未完了</StatusChip>
          <StatusChip>{workspace.mapNotes.length}件 メモ</StatusChip>
        </div>
      </div>

      <div className="records-grid">
        <section className="record-section">
          <div className="section-title">
            <ListChecks size={15} aria-hidden="true" />
            <span>確認事項 / タスク</span>
          </div>
          <form className="record-form" onSubmit={submitAction}>
            <Field label="タイトル">
              <input
                onChange={(event) =>
                  setActionDraft((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                placeholder="例: 問い合わせ後の担当者を確認"
                value={actionDraft.title}
              />
            </Field>
            <Field label="内容">
              <textarea
                onChange={(event) =>
                  setActionDraft((current) => ({
                    ...current,
                    body: event.target.value,
                  }))
                }
                placeholder="次に確認すること、やること"
                value={actionDraft.body}
              />
            </Field>
            <FormGrid>
              <Field label="優先度">
                <select
                  onChange={(event) =>
                    setActionDraft((current) => ({
                      ...current,
                      priority: event.target.value as ActionItemRow["priority"],
                    }))
                  }
                  value={actionDraft.priority}
                >
                  {(["high", "medium", "low"] as const).map((priority) => (
                    <option key={priority} value={priority}>
                      {labelFor(priorityOptions, priority)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="メモ">
                <input
                  onChange={(event) =>
                    setActionDraft((current) => ({
                      ...current,
                      memo: event.target.value,
                    }))
                  }
                  placeholder="補足"
                  value={actionDraft.memo}
                />
              </Field>
            </FormGrid>
            <button
              className="primary-button"
              disabled={
                !canEdit || !actionDraft.title.trim() || !actionDraft.body.trim()
              }
              type="submit"
            >
              <Plus size={15} aria-hidden="true" />
              追加
            </button>
          </form>

          <div className="record-list">
            {workspace.actionItems.map((actionItem) => (
              <ActionItemCard
                actionItem={actionItem}
                canEdit={canEdit}
                key={`${actionItem.id}:${actionItem.updatedAt}:${actionItem.status}`}
                onUpdate={onUpdateActionItem}
              />
            ))}
            {workspace.actionItems.length === 0 ? (
              <div className="empty-panel">確認事項はまだありません。</div>
            ) : null}
          </div>
        </section>

        <section className="record-section">
          <div className="section-title">
            <PencilRuler size={15} aria-hidden="true" />
            <span>思考メモ</span>
          </div>
          <form className="record-form" onSubmit={submitNote}>
            <FormGrid>
              <Field label="タイトル">
                <input
                  onChange={(event) =>
                    setNoteDraft((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                  placeholder="例: 5月の見直し"
                  value={noteDraft.title}
                />
              </Field>
              <Field label="種類">
                <select
                  onChange={(event) =>
                    setNoteDraft((current) => ({
                      ...current,
                      noteType: event.target.value as MapNoteRow["noteType"],
                    }))
                  }
                  value={noteDraft.noteType}
                >
                  {(["thought", "meeting", "daily"] as const).map((noteType) => (
                    <option key={noteType} value={noteType}>
                      {labelFor(noteTypeOptions, noteType)}
                    </option>
                  ))}
                </select>
              </Field>
            </FormGrid>
            <Field label="メモ">
              <textarea
                onChange={(event) =>
                  setNoteDraft((current) => ({
                    ...current,
                    body: event.target.value,
                  }))
                }
                placeholder="考えたこと、会議メモ、日次の気づき"
                value={noteDraft.body}
              />
            </Field>
            <button
              className="primary-button"
              disabled={!canEdit || !noteDraft.title.trim() || !noteDraft.body.trim()}
              type="submit"
            >
              <Plus size={15} aria-hidden="true" />
              追加
            </button>
          </form>

          <div className="record-list">
            {workspace.mapNotes.map((note) => (
              <MapNoteCard
                canEdit={canEdit}
                key={`${note.id}:${note.updatedAt}`}
                note={note}
                onDelete={onDeleteMapNote}
                onUpdate={onUpdateMapNote}
              />
            ))}
            {workspace.mapNotes.length === 0 ? (
              <div className="empty-panel">思考メモはまだありません。</div>
            ) : null}
          </div>
        </section>
      </div>
    </section>
  );
}

function ActionItemCard({
  actionItem,
  canEdit,
  onUpdate,
}: {
  actionItem: ActionItemRow;
  canEdit: boolean;
  onUpdate: (actionItem: ActionItemRow, draft: ActionItemUpdateDraft) => void;
}) {
  const [draft, setDraft] = useState<ActionItemUpdateDraft>({
    title: actionItem.title,
    body: actionItem.body,
    priority: actionItem.priority,
    memo: actionItem.memo ?? "",
    status: actionItem.status,
  });

  function save(status = draft.status) {
    if (!canEdit || !draft.title.trim() || !draft.body.trim()) return;
    onUpdate(actionItem, { ...draft, status });
  }

  return (
    <article className={`record-card record-card-${actionItem.status}`}>
      <div className="record-card-head">
        <span className="status-chip">
          {labelFor(actionStatusOptions, actionItem.status)}
        </span>
        <span className="status-chip">
          優先度 {labelFor(priorityOptions, actionItem.priority)}
        </span>
        {actionItem.sourceType === "ai_question" ? (
          <span className="status-chip">AI確認質問</span>
        ) : null}
      </div>
      <Field label="タイトル">
        <input
          disabled={!canEdit}
          onChange={(event) =>
            setDraft((current) => ({ ...current, title: event.target.value }))
          }
          value={draft.title}
        />
      </Field>
      <Field label="内容">
        <textarea
          disabled={!canEdit}
          onChange={(event) =>
            setDraft((current) => ({ ...current, body: event.target.value }))
          }
          value={draft.body}
        />
      </Field>
      <FormGrid>
        <Field label="状態">
          <select
            disabled={!canEdit}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                status: event.target.value as ActionItemRow["status"],
              }))
            }
            value={draft.status}
          >
            {(["open", "done", "dismissed"] as const).map((status) => (
              <option key={status} value={status}>
                {labelFor(actionStatusOptions, status)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="優先度">
          <select
            disabled={!canEdit}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                priority: event.target.value as ActionItemRow["priority"],
              }))
            }
            value={draft.priority}
          >
            {(["high", "medium", "low"] as const).map((priority) => (
              <option key={priority} value={priority}>
                {labelFor(priorityOptions, priority)}
              </option>
            ))}
          </select>
        </Field>
      </FormGrid>
      <Field label="メモ">
        <input
          disabled={!canEdit}
          onChange={(event) =>
            setDraft((current) => ({ ...current, memo: event.target.value }))
          }
          value={draft.memo}
        />
      </Field>
      <div className="button-row">
        <button
          className="ghost-button"
          disabled={!canEdit}
          onClick={() => save()}
          type="button"
        >
          <Save size={14} aria-hidden="true" />
          保存
        </button>
        <button
          className="ghost-button"
          disabled={!canEdit}
          onClick={() => save("done")}
          type="button"
        >
          <ListChecks size={14} aria-hidden="true" />
          完了
        </button>
        <button
          className="ghost-button"
          disabled={!canEdit}
          onClick={() => save("dismissed")}
          type="button"
        >
          <X size={14} aria-hidden="true" />
          見送り
        </button>
      </div>
    </article>
  );
}

function MapNoteCard({
  canEdit,
  note,
  onDelete,
  onUpdate,
}: {
  canEdit: boolean;
  note: MapNoteRow;
  onDelete: (note: MapNoteRow) => void;
  onUpdate: (note: MapNoteRow, draft: MapNoteDraft) => void;
}) {
  const [draft, setDraft] = useState<MapNoteDraft>({
    title: note.title,
    body: note.body,
    noteType: note.noteType,
  });

  function save() {
    if (!canEdit || !draft.title.trim() || !draft.body.trim()) return;
    onUpdate(note, draft);
  }

  return (
    <article className="record-card">
      <div className="record-card-head">
        <span className="status-chip">{labelFor(noteTypeOptions, note.noteType)}</span>
        <span className="status-chip">更新 {formatTime(note.updatedAt)}</span>
      </div>
      <FormGrid>
        <Field label="タイトル">
          <input
            disabled={!canEdit}
            onChange={(event) =>
              setDraft((current) => ({ ...current, title: event.target.value }))
            }
            value={draft.title}
          />
        </Field>
        <Field label="種類">
          <select
            disabled={!canEdit}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                noteType: event.target.value as MapNoteRow["noteType"],
              }))
            }
            value={draft.noteType}
          >
            {(["thought", "meeting", "daily"] as const).map((noteType) => (
              <option key={noteType} value={noteType}>
                {labelFor(noteTypeOptions, noteType)}
              </option>
            ))}
          </select>
        </Field>
      </FormGrid>
      <Field label="メモ">
        <textarea
          disabled={!canEdit}
          onChange={(event) =>
            setDraft((current) => ({ ...current, body: event.target.value }))
          }
          value={draft.body}
        />
      </Field>
      <div className="button-row">
        <button
          className="ghost-button"
          disabled={!canEdit}
          onClick={save}
          type="button"
        >
          <Save size={14} aria-hidden="true" />
          保存
        </button>
        <button
          className="danger-button"
          disabled={!canEdit}
          onClick={() => onDelete(note)}
          type="button"
        >
          <Trash2 size={14} aria-hidden="true" />
          削除
        </button>
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
  const extractDisabledReason =
    selectedChunkIds.length === 0
      ? "送信対象の情報ソースがありません"
      : !aiSendApproved
        ? "送信範囲を確認するとAI抽出できます"
        : null;

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
            disabled={Boolean(extractDisabledReason)}
            onClick={onExtract}
            title={extractDisabledReason ?? "AI抽出を実行"}
            type="button"
          >
            <Sparkles size={15} aria-hidden="true" />
            AI抽出
          </button>
          {extractDisabledReason ? (
            <small className="button-row-hint">{extractDisabledReason}</small>
          ) : null}
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
            <div className="empty-panel">先にマップの材料を追加してください。</div>
          ) : null}
        </div>
        {excludedChunks.length > 0 ? (
          <div className="excluded-chunks">
            送信しない情報ソース:{" "}
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
          <h1>次の一手</h1>
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
  canOpenPath,
  defaultExportDir,
  onExport,
  onOpenPath,
  workspace,
}: {
  canOpenPath: boolean;
  defaultExportDir: string | null;
  onExport: (command: "export_markdown" | "export_csv_bundle") => void;
  onOpenPath: (path: string | null) => void;
  workspace: ProjectWorkspace;
}) {
  return (
    <section className="page-panel">
      <div className="page-header">
        <div>
          <h1>出力</h1>
          <p>
            MarkdownとCSVを
            {defaultExportDir ? "設定済みの出力フォルダ" : "アプリ内exports"}
            へ保存します。
          </p>
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
      <div className="export-destination">
        <FolderOpen size={15} aria-hidden="true" />
        <span>{defaultExportDir ?? "未設定: アプリ内exportsへ保存"}</span>
      </div>
      <div className="data-table export-table">
        {workspace.exportJobs.map((job) => (
          <div className="table-row" key={job.id}>
            <span>{job.exportType}</span>
            <span>{job.status}</span>
            <span>{job.outputPath}</span>
            <span>{formatTime(job.completedAt)}</span>
            <span>
              <button
                className="ghost-button"
                disabled={!canOpenPath || !job.outputPath}
                onClick={() => onOpenPath(job.outputPath)}
                type="button"
              >
                <ExternalLink size={14} aria-hidden="true" />
                開く
              </button>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function HistoryView({
  canSave,
  onCreateNamedVersion,
  workspace,
}: {
  canSave: boolean;
  onCreateNamedVersion: (name: string, memo: string) => void;
  workspace: ProjectWorkspace;
}) {
  const [draft, setDraft] = useState({ name: "", memo: "" });
  const canSubmit = canSave && draft.name.trim().length > 0;

  function submitVersion(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    onCreateNamedVersion(draft.name, draft.memo);
    setDraft({ name: "", memo: "" });
  }

  return (
    <section className="page-panel">
      <div className="page-header">
        <div>
          <h1>AI履歴</h1>
          <p>AI実行と任意タイミングで保存した状態を確認します。</p>
        </div>
      </div>
      <form className="named-version-form" onSubmit={submitVersion}>
        <Field label="保存名">
          <input
            onChange={(event) =>
              setDraft((current) => ({ ...current, name: event.target.value }))
            }
            placeholder="例: 5月試験運用前"
            value={draft.name}
          />
        </Field>
        <Field label="メモ">
          <textarea
            onChange={(event) =>
              setDraft((current) => ({ ...current, memo: event.target.value }))
            }
            placeholder="この時点で見ておきたいこと"
            value={draft.memo}
          />
        </Field>
        <button className="primary-button" disabled={!canSubmit} type="submit">
          <Save size={15} aria-hidden="true" />
          現在の状態を保存
        </button>
      </form>
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
          <span className="status-chip snapshot-chip" key={version.id}>
            <Archive size={12} aria-hidden="true" />
            {version.name ?? version.versionType} {formatTime(version.createdAt)}
            {version.memo ? ` / ${version.memo}` : ""}
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
  onClose,
  onSetCenterNode,
  onWorkspaceChange,
  projectId,
  suggestion,
  workspace,
}: {
  edge: MapEdgeRow | null;
  isTauriRuntime: boolean;
  item: ExtractedItemRow | null;
  node: MapNodeRow | null;
  onClose: () => void;
  onSetCenterNode: (nodeId: string | null) => void;
  onWorkspaceChange: (workspace: ProjectWorkspace) => void;
  projectId: string | null;
  suggestion: SuggestionRow | null;
  workspace: ProjectWorkspace;
}) {
  const [askBusy, setAskBusy] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const insightTargetKind = node ? "node" : edge ? "edge" : "map";
  const insightTargetId = node?.id ?? edge?.id ?? null;
  const resolvedCenterNodeId = resolveCenterNodeId(workspace);
  const selectedNodeIsCenter = Boolean(node && resolvedCenterNodeId === node.id);

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
              body: `${targetLabel}について、情報ソース要約とマップ構造から確認するための下書きです。実際の状況では、重要度、担当、成果指標を確認してください。`,
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
        <div>
          <span>
            {item ? "抽出カード" : node ? "ノード" : edge ? "導線" : "施策候補"}
          </span>
          <small>編集</small>
        </div>
        <button
          aria-label="詳細パネルを閉じる"
          className="panel-close-button"
          onClick={onClose}
          type="button"
        >
          <X size={15} aria-hidden="true" />
        </button>
      </div>
      {!item && !suggestion ? (
        <MapInsightActions
          busy={askBusy}
          error={askError}
          onAsk={askMapInsight}
          targetLabel={node ? node.label : edge ? "選択中の導線" : "マップ全体"}
        />
      ) : null}
      {node ? (
        <div className="inspector-center-actions">
          <div>
            <strong>売上の核</strong>
            <span>
              {selectedNodeIsCenter
                ? "このノードが現在の中心です。"
                : "このノードをマップの中心として強調できます。"}
            </span>
          </div>
          <button
            className={selectedNodeIsCenter ? "ghost-button" : "primary-button"}
            onClick={() => onSetCenterNode(selectedNodeIsCenter ? null : node.id)}
            type="button"
          >
            <Star size={14} aria-hidden="true" />
            {selectedNodeIsCenter ? "核指定を解除" : "売上の核にする"}
          </button>
        </div>
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
