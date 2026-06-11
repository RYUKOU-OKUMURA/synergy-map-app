import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import {
  Archive,
  BarChart3,
  Database,
  Download,
  ExternalLink,
  FileText,
  FolderKanban,
  FolderOpen,
  Gauge,
  ListChecks,
  Map as MapIcon,
  MessageSquareText,
  MousePointer2,
  PencilRuler,
  Plus,
  Save,
  Sparkles,
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
import { Field, FormGrid, StatusChip } from "@/features/app/AppPrimitives";
import { AppSidebar, WorkspaceTopBar } from "@/features/app/AppShell";
import {
  aiRunSourceLabel,
  aiRunStatusLabel,
  isFallbackRun,
} from "@/features/app/aiRunLabels";
import {
  AI_LENS_PANEL_DEFAULT_WIDTH,
  AI_LENS_PANEL_WIDTH_STORAGE_KEY,
  clampAiLensPanelWidth,
  contextPanelTabs,
  defaultAiSettings,
  emptyDeviceCodeResult,
} from "@/features/app/appDefaults";
import {
  aiLensActionHint,
  aiLensCategoryLabels,
  aiLensDefaultQuestion,
  aiLensMemoQuestion,
  aiLensTargetDescription,
  aiLensTargetLabel,
  aiLensTargetNote,
  compactStringList,
  hasOnboardingBrief,
  hasTauriRuntime,
  hasUnconfirmedGeneratedItems,
  isSameSelectedMapElement,
  mergeAiRunWorkspace,
  onboardingGenerationStageLabel,
  shortText,
} from "@/features/app/appHelpers";
import {
  SIDEBAR_COLLAPSED_WIDTH,
  clampSidebarWidth,
} from "@/features/app/sidebarLayout";
import type {
  CodexConnectionAction,
  CursorConnectionAction,
  ProjectFormValues,
} from "@/features/app/appViewTypes";
import { ExtractView } from "@/features/extract/ExtractView";
import { HomeView } from "@/features/home/HomeView";
import {
  SynergyMapCanvas,
  type MapViewMode,
  type MapNodeLayout,
} from "@/features/map/SynergyMapCanvas";
import { InspectorPanel } from "@/features/inspector/InspectorPanel";
import { ProjectsView } from "@/features/projects/ProjectsView";
import {
  CodexConnectionCard,
  CursorSdkConnectionCard,
  SettingsView,
} from "@/features/settings/SettingsView";
import { SourcesView } from "@/features/sources/SourcesView";
import {
  type InformationSourceDraft,
  sourceTypeLabel,
} from "@/features/sources/sourceTypes";
import { SuggestionsView } from "@/features/suggestions/SuggestionsView";
import { api } from "@/lib/api";
import { parseAiLensInsightBody } from "@/lib/aiLensInsight";
import { formatTime } from "@/lib/appFormatters";
import {
  applyLocalMapLayouts,
  buildImpactPositionOverrides,
  buildNodeImpactStats,
  readableCustomerJourneyLayouts,
  resolveCenterNodeId,
} from "@/features/map/mapLayoutModel";
import type { ViewId } from "@/lib/appViewTypes";
import { demoProject, demoWorkspace, emptyWorkspace } from "@/lib/demoWorkspace";
import {
  actionStatusOptions,
  categoryOptions,
  confidenceOptions,
  costLevelOptions,
  impactLevelOptions,
  labelFor,
  noteTypeOptions,
  priorityOptions,
} from "@/lib/mvp1Labels";
import type {
  ActionItemRow,
  AiCommentRow,
  AiLensItem,
  AiRunRow,
  AiSettings,
  MapUiPreferences,
  CodexUiEvent,
  CodexRuntimeInfo,
  CodexSmokeResult,
  CursorSdkSmokeResult,
  CursorSdkStatus,
  DeviceCodeLoginResult,
  MapEdgeRow,
  MapNoteRow,
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
import { priorityRank } from "@/lib/priorityRank";
import {
  activeSuggestions,
  buildTodayNextStep,
  buildWorkspaceReflectionSummary,
  getPrimaryActionLabel,
  hasOpenActionForSuggestion,
  needsReflectionAttention,
  reflectionActionView,
  reflectionSummaryText,
  shouldRegenerateMap,
  sortByDateDesc,
  type WorkspaceReflectionSummary,
} from "@/lib/workspaceProgress";

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

type MapNoteDraft = {
  title: string;
  body: string;
  noteType: MapNoteRow["noteType"];
};

const CODEX_EVENT_NAME = "codex-app-server-event";

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
  const [sidebarWidthDraft, setSidebarWidthDraft] = useState<number | null>(null);
  const [flowAnimationUserEnabled, setFlowAnimationUserEnabled] = useState(true);
  const [layoutSaveStatus, setLayoutSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [layoutSaveScope, setLayoutSaveScope] = useState<string | null>(null);
  const [mapInsightBusy, setMapInsightBusy] = useState(false);
  const [aiLensInsightBusyId, setAiLensInsightBusyId] = useState<string | null>(null);
  const [deletingAiLensMemoId, setDeletingAiLensMemoId] = useState<string | null>(null);
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
  const aiLensItems = useMemo(() => workspace.aiLensItems.slice(0, 3), [workspace]);
  const aiLensOpen = aiSettings.mapUiPreferences.aiLensOpen && aiLensItems.length > 0;
  const currentLayoutScope = `${activeProjectId ?? "none"}:${mapViewMode}`;
  const visibleLayoutSaveStatus =
    layoutSaveScope === currentLayoutScope ? layoutSaveStatus : "idle";
  const primaryActionLabel = getPrimaryActionLabel(workspace);
  const savedSidebarWidth = clampSidebarWidth(aiSettings.mapUiPreferences.sidebarWidth);
  const sidebarMode = aiSettings.mapUiPreferences.sidebarMode ?? "auto";
  const sidebarCollapsed =
    sidebarMode === "collapsed" || (sidebarMode === "auto" && view === "map");
  const sidebarWidth = sidebarCollapsed
    ? SIDEBAR_COLLAPSED_WIDTH
    : (sidebarWidthDraft ?? savedSidebarWidth);
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
      return true;
    } catch (caughtError) {
      setError(String(caughtError));
      return false;
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
    return runAction(
      async () => {
        const nextWorkspace = await api.updateProject(projectId, values);
        const nextProjects = await api.listProjects();
        return { nextProjects, nextWorkspace };
      },
      ({ nextProjects, nextWorkspace }) => {
        setProjects(nextProjects);
        if (projectId === activeProjectId) {
          setWorkspace(nextWorkspace);
          setSelectedProjectId(projectId);
          setSelectedSuggestionId(null);
          setApprovedChunkSignature(null);
        }
        setNotice("マップ情報を保存しました。");
      },
    );
  }

  async function handleDeleteProject(projectId: string) {
    return runAction(
      async () => {
        await api.deleteProject(projectId);
        const nextProjects = await api.listProjects();
        return { nextProjects };
      },
      ({ nextProjects }) => {
        setProjects(nextProjects);
        if (projectId === activeProjectId) {
          handleClearProjectSelection("projects");
        }
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
        () => api.runExtractItems(activeProjectId, selectedChunkIds),
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
        () => api.generateMapFromItems(activeProjectId),
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
        () => api.generateSuggestionsFromMap(activeProjectId),
        (result) => {
          setWorkspace(result.workspace);
          setNotice(result.message);
          void handleMapUiPreferencesChange({ aiLensOpen: true });
        },
      );
      return;
    }
    if (workspace.aiLensItems.length === 0) {
      await runAction(
        () => api.generateAiLensFromMap(activeProjectId),
        (result) => {
          setWorkspace(result.workspace);
          setNotice(result.message);
          setView("map");
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
      () => api.runExtractItems(activeProjectId, selectedChunkIds),
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
      () => api.generateMapFromItems(activeProjectId),
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
        api.createExtractedItem(activeProjectId, {
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
      () => api.generateSuggestionsFromMap(activeProjectId),
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

  async function handleGenerateAiLens() {
    if (!activeProjectId) return;
    await runAction(
      () => api.generateAiLensFromMap(activeProjectId),
      (result) => {
        setWorkspace(result.workspace);
        setNotice(result.message);
        void handleMapUiPreferencesChange({ aiLensOpen: true });
      },
    );
  }

  async function handleExport(command: "export_markdown" | "export_csv_bundle") {
    if (!activeProjectId) return;
    await runAction(
      () => api.exportProject(command, activeProjectId),
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
      const result = await api.getCodexRuntimeInfo();
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
      const result = await api.runCodexSmokeTest();
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
      const result = await api.runCodexDeviceCodeCheck();
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
      const saved = await api.saveAiSettings(nextSettings);
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
      const saved = await api.saveAiSettings(nextSettings);
      setAiSettings(saved);
      if (options.notify) setNotice("マップ表示設定を保存しました。");
    } catch (caughtError) {
      setError(String(caughtError));
    }
  }

  function handleSidebarModeChange(mode: MapUiPreferences["sidebarMode"]) {
    setSidebarWidthDraft(null);
    void handleMapUiPreferencesChange({ sidebarMode: mode });
  }

  function handleSidebarWidthCommit(width: number) {
    const nextWidth = clampSidebarWidth(width);
    setSidebarWidthDraft(null);
    void handleMapUiPreferencesChange({
      sidebarMode: "expanded",
      sidebarWidth: nextWidth,
    });
  }

  async function handleSelectDefaultExportDir() {
    if (!isTauriRuntime) return;
    setAiSettingsBusy(true);
    setError(null);
    try {
      const saved = await api.selectDefaultExportDir();
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
      const result = await api.getCursorSdkStatus();
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
      const result = await api.runCursorSdkSmokeTest();
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
      await api.openExternalUrl(url);
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
      await api.openExportPath(path);
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
        const created = await api.createProject({
          name: draft.companyName.trim(),
          clientName: draft.companyName.trim(),
          industry: draft.industry.trim(),
          description: purposeLabel,
          memo: draft.memo.trim(),
        });
        projectId = created.id;
        nextProjects = await api.listProjects();
      } else {
        await api.updateProject(projectId, {
          name: draft.companyName.trim(),
          clientName: activeProject.clientName?.trim() || draft.companyName.trim(),
          industry: draft.industry.trim() || activeProject.industry || "",
          description: purposeLabel,
          memo: draft.memo.trim() || activeProject.memo || "",
        });
        nextProjects = await api.listProjects();
      }

      const sourceWorkspace = await api.createOnboardingBriefSource(projectId, {
        companyName: draft.companyName.trim(),
        purposeId: draft.purposeId,
        purposeLabel,
        industry: draft.industry.trim(),
        memo: draft.memo.trim(),
        websiteUrls: compactStringList(draft.websiteUrls),
        snsUrls: compactStringList(draft.snsUrls),
        productInfo: draft.productInfo.trim(),
      });

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
      const extractResult = await api.runExtractItems(projectId, sourceChunkIds);
      setWorkspace(extractResult.workspace);

      setOnboardingGenerationStage("map");
      const mapResult = await api.generateMapFromItems(projectId);
      setWorkspace(mapResult.workspace);

      setOnboardingGenerationStage("suggestions");
      const suggestionsResult = await api.generateSuggestionsFromMap(projectId);

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
            ? await api.saveMapLayout(activeProjectId, positions)
            : await api.saveViewLayout(activeProjectId, viewMode, positions)
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
        ? await api.setProjectCenterNode(activeProjectId, nodeId)
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
        ? await api.createMapEdge(activeProjectId, sourceNodeId, targetNodeId)
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
        const imported = await api.importSourceFilesFromDialog(activeProjectId);
        if (imported.length === 0) {
          return null;
        }
        const nextWorkspace = await api.getProjectWorkspace(activeProjectId);
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
    if (!activeProjectId || !isTauriRuntime) return false;
    return runAction(
      () =>
        api.createTextInformationSource(activeProjectId, {
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
      () => api.deleteSourceFile(activeProjectId, source.id),
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
        api.createActionItem(activeProjectId, {
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
        api.updateActionItem(activeProjectId, actionItem.id, {
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
      () => api.createActionItemFromSuggestion(activeProjectId, suggestion.id),
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
        api.createMapNote(activeProjectId, {
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
        api.updateMapNote(activeProjectId, note.id, {
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
      () => api.deleteMapNote(activeProjectId, note.id),
      (nextWorkspace) => {
        setWorkspace(nextWorkspace);
        setNotice("メモを削除しました。");
      },
    );
  }

  async function handleCreateNamedVersion(name: string, memo: string) {
    if (!activeProjectId || !isTauriRuntime) return;
    await runAction(
      () => api.createNamedVersion(activeProjectId, name.trim(), memo.trim()),
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
        const project = await api.createProject({
          name: draft.companyName.trim(),
          clientName: draft.companyName.trim(),
          industry: draft.industry.trim(),
          description: purposeLabel,
          memo: draft.memo.trim(),
        });
        const imported = await api.importSourceFilesFromDialog(project.id);
        const nextProjects = await api.listProjects();
        const nextWorkspace = await api.getProjectWorkspace(project.id);
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
        setWorkspace((current) => ({
          ...current,
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
            ...current.aiComments,
          ],
        }));
        void handleMapUiPreferencesChange({ aiLensOpen: true });
        return;
      }
      const result = await api.askMapInsight(
        activeProjectId,
        "map",
        null,
        questionType,
      );
      setWorkspace((current) => mergeAiRunWorkspace(current, result.workspace));
      setNotice(result.message);
      void handleMapUiPreferencesChange({ aiLensOpen: true });
    } catch (caughtError) {
      setError(String(caughtError));
    } finally {
      setMapInsightBusy(false);
    }
  }

  async function handleAskAiLens(aiLensItemId: string, questionText: string) {
    if (!activeProjectId) return;
    const question = questionText.trim();
    if (!question) {
      setError("質問を入力してください。");
      return;
    }
    setAiLensInsightBusyId(aiLensItemId);
    setError(null);
    try {
      if (!isTauriRuntime) {
        const item = workspace.aiLensItems.find(
          (candidate) => candidate.id === aiLensItemId,
        );
        if (!item) throw new Error("AI視点カードが見つかりません。");
        const now = new Date().toISOString();
        setWorkspace((current) => ({
          ...current,
          aiComments: [
            {
              id: `local-ai-lens-insight-${Date.now()}`,
              projectId: activeProjectId,
              aiRunId: null,
              commentType: "ai_lens_insight",
              title: `AI視点: ${item.title}`,
              body: `質問: ${question}\n${item.title}について、根拠「${item.evidence}」を確認しながら次の判断材料を整理してください。`,
              confidenceStatus: item.confidenceStatus,
              createdAt: now,
            },
            ...current.aiComments,
          ],
        }));
        setNotice("AI視点への理解メモを生成しました。");
        return;
      }
      const result = await api.askAiLensInsight(
        activeProjectId,
        aiLensItemId,
        question,
      );
      setWorkspace((current) => mergeAiRunWorkspace(current, result.workspace));
      setNotice(result.message);
    } catch (caughtError) {
      setError(String(caughtError));
    } finally {
      setAiLensInsightBusyId(null);
    }
  }

  async function handleDeleteAiLensMemo(commentId: string) {
    if (!activeProjectId) return;
    setDeletingAiLensMemoId(commentId);
    setError(null);
    try {
      if (!isTauriRuntime) {
        setWorkspace((current) => ({
          ...current,
          aiComments: current.aiComments.filter((comment) => comment.id !== commentId),
        }));
        setNotice("理解メモを削除しました。");
        return;
      }
      const nextWorkspace = await api.deleteAiLensInsightComment(
        activeProjectId,
        commentId,
      );
      setWorkspace((current) => ({
        ...current,
        aiComments: nextWorkspace.aiComments,
        versions: nextWorkspace.versions,
      }));
      setNotice("理解メモを削除しました。");
    } catch (caughtError) {
      setError(String(caughtError));
    } finally {
      setDeletingAiLensMemoId(null);
    }
  }

  useEffect(() => {
    if (!isTauriRuntime) return;
    let cancelled = false;

    async function loadAiProviderState() {
      try {
        const [settings, status] = await Promise.all([
          api.getAiSettings(),
          api.getCursorSdkStatus(),
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
      const rows = await api.listProjects();
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
    const projectId = activeProjectId;

    async function loadActiveWorkspace() {
      const nextWorkspace = await api.getProjectWorkspace(projectId);
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
                await api.importSourceFiles(activeProjectId, droppedPaths);
              } catch (caughtError) {
                importError = String(caughtError);
              }
              return api
                .getProjectWorkspace(activeProjectId)
                .then((nextWorkspace) => ({ importError, nextWorkspace }));
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
    <main
      className={`app-root ${sidebarCollapsed ? "app-root-sidebar-collapsed" : ""}`}
      style={{ "--sidebar-width": `${sidebarWidth}px` } as React.CSSProperties}
    >
      <AppSidebar
        activeProject={activeProject}
        collapsed={sidebarCollapsed}
        onOpenProjects={() => handleSelectView("projects")}
        onSidebarModeChange={handleSidebarModeChange}
        onSidebarWidthCommit={handleSidebarWidthCommit}
        onSidebarWidthPreview={setSidebarWidthDraft}
        onSelectView={handleSelectView}
        onStartNewMap={handleStartNewMap}
        width={sidebarWidth}
        view={view}
      />

      <section className="app-shell">
        <WorkspaceTopBar
          activeProject={activeProject}
          aiLensCount={aiLensItems.length}
          aiLensOpen={aiLensOpen}
          generationBusy={isBusy}
          isBusy={isBusy}
          latestAiRun={latestAiRun}
          onAiUpdate={handleAiUpdate}
          onGenerateAiLens={handleGenerateAiLens}
          onGenerateMap={handleRegenerateMap}
          onOpenHistory={() => handleSelectView("history")}
          onOpenExtractReview={() => {
            setSelectedItemId(workspace.extractedItems[0]?.id ?? null);
            setView("extract");
          }}
          onRefreshCodexRuntime={handleRefreshCodexRuntime}
          onToggleAiLens={() =>
            handleMapUiPreferencesChange({
              aiLensOpen: !aiSettings.mapUiPreferences.aiLensOpen,
            })
          }
          primaryActionLabel={primaryActionLabel}
          reflectionSummary={reflectionSummary}
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
              aiLensInsightBusyId={aiLensInsightBusyId}
              deletingAiLensMemoId={deletingAiLensMemoId}
              mapInsightBusy={mapInsightBusy}
              mapUiPreferences={aiSettings.mapUiPreferences}
              mapViewMode={mapViewMode}
              aiLensItems={aiLensItems}
              aiLensOpen={aiLensOpen}
              onArrangeMap={handleArrangeMap}
              onAskAiLens={handleAskAiLens}
              onAskWholeMap={handleAskWholeMap}
              onCreateMapEdge={handleCreateMapEdge}
              onCreateOnboardingMap={handleCreateOnboardingMap}
              onEditModeChange={setIsMapEditMode}
              onDeleteAiLensMemo={handleDeleteAiLensMemo}
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
              busy={isBusy}
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
  aiLensInsightBusyId,
  deletingAiLensMemoId,
  mapInsightBusy,
  mapUiPreferences,
  mapViewMode,
  aiLensItems,
  aiLensOpen,
  onArrangeMap,
  onAskAiLens,
  onAskWholeMap,
  onCreateMapEdge,
  onCreateOnboardingMap,
  onDeleteAiLensMemo,
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
  aiLensInsightBusyId: string | null;
  deletingAiLensMemoId: string | null;
  mapInsightBusy: boolean;
  mapUiPreferences: MapUiPreferences;
  mapViewMode: MapViewMode;
  aiLensItems: AiLensItem[];
  aiLensOpen: boolean;
  onArrangeMap: () => void;
  onAskAiLens: (aiLensItemId: string, questionText: string) => void;
  onAskWholeMap: (questionType?: string) => void;
  onCreateMapEdge: (sourceNodeId: string, targetNodeId: string) => void;
  onCreateOnboardingMap: (draft: OnboardingDraft) => void;
  onDeleteAiLensMemo: (commentId: string) => void;
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
  const [aiLensPanelWidth, setAiLensPanelWidth] = useState(() => {
    if (typeof window === "undefined") return AI_LENS_PANEL_DEFAULT_WIDTH;
    return clampAiLensPanelWidth(
      Number(window.localStorage.getItem(AI_LENS_PANEL_WIDTH_STORAGE_KEY)),
    );
  });
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
      style={
        {
          "--ai-lens-panel-width": `${aiLensPanelWidth}px`,
        } as React.CSSProperties
      }
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
        <AiLensPanel
          aiComments={workspace.aiComments}
          busyItemId={aiLensInsightBusyId}
          deletingMemoId={deletingAiLensMemoId}
          items={aiLensItems}
          onAsk={onAskAiLens}
          onDeleteMemo={onDeleteAiLensMemo}
          onPanelWidthChange={setAiLensPanelWidth}
          panelWidth={aiLensPanelWidth}
        />
      ) : null}
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
  const [expandedActionItemId, setExpandedActionItemId] = useState<string | null>(null);

  function toggleActionItem(actionItemId: string) {
    setExpandedActionItemId((current) =>
      current === actionItemId ? null : actionItemId,
    );
  }

  function handleActionItemKeyDown(
    event: React.KeyboardEvent<HTMLElement>,
    actionItemId: string,
  ) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    toggleActionItem(actionItemId);
  }

  return (
    <div className="context-panel-list">
      <div className="context-panel-summary">
        <StatusChip>{actionItems.length}件 未確認</StatusChip>
      </div>
      {actionItems.slice(0, 8).map((actionItem) => {
        const expanded = expandedActionItemId === actionItem.id;

        return (
          <article
            aria-expanded={expanded}
            className={`context-task-row ${expanded ? "context-card-expanded" : ""}`}
            key={actionItem.id}
            onClick={() => toggleActionItem(actionItem.id)}
            onKeyDown={(event) => handleActionItemKeyDown(event, actionItem.id)}
            role="button"
            tabIndex={0}
          >
            <button
              aria-label={`${actionItem.title}を完了`}
              className="question-check"
              onClick={(event) => {
                event.stopPropagation();
                onComplete(actionItem);
              }}
              onKeyDown={(event) => event.stopPropagation()}
              type="button"
            />
            <div>
              <strong>{expanded ? actionItem.title : actionItem.body}</strong>
              {expanded ? (
                <p className="context-card-detail">{actionItem.body}</p>
              ) : null}
              <small>
                優先度 {labelFor(priorityOptions, actionItem.priority)} /{" "}
                {formatTime(actionItem.createdAt)}
              </small>
            </div>
          </article>
        );
      })}
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
  const [expandedSuggestionId, setExpandedSuggestionId] = useState<string | null>(null);

  function selectSuggestion(suggestionId: string) {
    setExpandedSuggestionId((current) =>
      current === suggestionId ? null : suggestionId,
    );
    onSelectSuggestion(suggestionId);
  }

  return (
    <div className="context-panel-list">
      <div className="context-panel-summary">
        <StatusChip>{suggestions.length}件 一手</StatusChip>
      </div>
      {suggestions.slice(0, 8).map((suggestion) => {
        const expanded = expandedSuggestionId === suggestion.id;

        return (
          <button
            aria-expanded={expanded}
            className={`context-item-button context-action-button ${
              expanded ? "context-card-expanded" : ""
            }`}
            key={suggestion.id}
            onClick={() => selectSuggestion(suggestion.id)}
            type="button"
          >
            <strong>{suggestion.title}</strong>
            {expanded ? (
              <p className="context-card-detail">{suggestion.description}</p>
            ) : null}
            <small>
              売上 {labelFor(impactLevelOptions, suggestion.expectedRevenueImpact)} /
              工数 {labelFor(costLevelOptions, suggestion.effortLevel)}
            </small>
          </button>
        );
      })}
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

function AiLensPanel({
  aiComments,
  busyItemId,
  deletingMemoId,
  items,
  onAsk,
  onDeleteMemo,
  onPanelWidthChange,
  panelWidth,
}: {
  aiComments: AiCommentRow[];
  busyItemId: string | null;
  deletingMemoId: string | null;
  items: AiLensItem[];
  onAsk: (aiLensItemId: string, questionText: string) => void;
  onDeleteMemo: (commentId: string) => void;
  onPanelWidthChange: (width: number) => void;
  panelWidth: number;
}) {
  const [resizeStart, setResizeStart] = useState<{
    startWidth: number;
    startX: number;
  } | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(
    items[0]?.id ?? null,
  );
  const [expandedItemIds, setExpandedItemIds] = useState<string[]>([]);
  const [memoDialogOpen, setMemoDialogOpen] = useState(false);
  const [questionText, setQuestionText] = useState("");
  const selectedItem =
    items.find((item) => item.id === selectedItemId) ?? items[0] ?? null;
  const insightComments = aiComments
    .filter((comment) => comment.commentType === "ai_lens_insight")
    .slice(0, 8);
  const latestInsightComment = insightComments[0] ?? null;

  useEffect(() => {
    if (!resizeStart) return;
    const activeResizeStart = resizeStart;

    function handleMouseMove(event: MouseEvent) {
      const nextWidth =
        activeResizeStart.startWidth - (event.clientX - activeResizeStart.startX);
      onPanelWidthChange(clampAiLensPanelWidth(nextWidth));
    }

    function handleMouseUp() {
      setResizeStart(null);
      window.localStorage.setItem(AI_LENS_PANEL_WIDTH_STORAGE_KEY, String(panelWidth));
    }

    document.body.classList.add("ai-lens-panel-resizing");
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.body.classList.remove("ai-lens-panel-resizing");
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [onPanelWidthChange, panelWidth, resizeStart]);

  function persistPanelWidth(width: number) {
    const clamped = clampAiLensPanelWidth(width);
    onPanelWidthChange(clamped);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(AI_LENS_PANEL_WIDTH_STORAGE_KEY, String(clamped));
    }
  }

  function submitQuestion(question: string) {
    if (!selectedItem) return;
    const trimmed = question.trim();
    if (!trimmed) return;
    onAsk(selectedItem.id, trimmed);
    setQuestionText("");
  }

  function toggleExpanded(itemId: string) {
    setExpandedItemIds((current) =>
      current.includes(itemId)
        ? current.filter((id) => id !== itemId)
        : [...current, itemId],
    );
  }

  function selectItemForQuestion(item: AiLensItem) {
    setSelectedItemId(item.id);
    setQuestionText(aiLensDefaultQuestion(item));
  }

  return (
    <aside
      className="ai-lens-panel"
      style={{ "--ai-lens-panel-width": `${panelWidth}px` } as React.CSSProperties}
    >
      <div
        aria-label="AI視点パネルの幅を調整"
        className="ai-lens-resize-handle"
        onDoubleClick={() => persistPanelWidth(AI_LENS_PANEL_DEFAULT_WIDTH)}
        onMouseDown={(event) => {
          event.preventDefault();
          setResizeStart({ startWidth: panelWidth, startX: event.clientX });
        }}
        role="separator"
        tabIndex={0}
      />
      <div className="panel-heading">
        <div>
          <span>AIが見ている点</span>
          <small>現在の材料から見える注目点</small>
        </div>
      </div>
      <div className="ai-lens-card-list">
        {items.map((item, index) => (
          <article
            className={`ai-lens-card ${
              selectedItem?.id === item.id ? "ai-lens-card-selected" : ""
            }`}
            key={item.id}
          >
            <div className="ai-lens-card-meta">
              <span className="ai-lens-card-marker">
                {aiLensTargetLabel(item, index)}
              </span>
              <span>{aiLensCategoryLabels[item.category]}</span>
              <strong>{index === 0 ? "重要" : "注目"}</strong>
            </div>
            <div className="ai-lens-card-heading">
              <h3>{item.title}</h3>
              <small>
                {aiLensTargetDescription(item)} /{" "}
                {labelFor(confidenceOptions, item.confidenceStatus)}
              </small>
            </div>
            <p className="ai-lens-summary">{shortText(item.body, 112)}</p>
            <p className="ai-lens-target-note">{aiLensTargetNote(item, index)}</p>
            <div className="ai-lens-card-actions">
              <button onClick={() => selectItemForQuestion(item)} type="button">
                <MessageSquareText size={14} aria-hidden="true" />
                この視点で質問
              </button>
              <button
                disabled={Boolean(busyItemId)}
                onClick={() => {
                  setSelectedItemId(item.id);
                  onAsk(item.id, aiLensMemoQuestion(item));
                }}
                type="button"
              >
                <FileText size={14} aria-hidden="true" />
                メモに残す
              </button>
            </div>
            <button
              className="ai-lens-detail-toggle"
              onClick={() => toggleExpanded(item.id)}
              type="button"
            >
              {expandedItemIds.includes(item.id) ? "詳細を閉じる" : "詳細を開く"}
            </button>
            {expandedItemIds.includes(item.id) ? (
              <div className="ai-lens-detail">
                <div>
                  <span>AIの見立て</span>
                  <p>{item.body}</p>
                </div>
                <div>
                  <span>根拠</span>
                  <p>{item.evidence}</p>
                </div>
                {item.followUpQuestion ? (
                  <div>
                    <span>要確認</span>
                    <p>{item.followUpQuestion}</p>
                  </div>
                ) : null}
                <div>
                  <span>次に試す一手</span>
                  <p>{aiLensActionHint(item.category)}</p>
                </div>
              </div>
            ) : null}
            {busyItemId === item.id ? (
              <small className="ai-lens-card-busy">AIが確認中...</small>
            ) : null}
          </article>
        ))}
      </div>
      <form
        className="ai-lens-question-box"
        onSubmit={(event) => {
          event.preventDefault();
          submitQuestion(questionText);
        }}
      >
        <div className="ai-lens-question-target">
          <strong>{selectedItem ? selectedItem.title : "AI視点"}</strong>
          <span>質問は選択中の視点に紐づいて理解メモへ残ります。</span>
        </div>
        <textarea
          maxLength={500}
          onChange={(event) => setQuestionText(event.target.value)}
          placeholder={
            selectedItem ? `${selectedItem.title}について聞く` : "AI視点について聞く"
          }
          value={questionText}
        />
        <button
          className="primary-button"
          disabled={!selectedItem || !questionText.trim() || Boolean(busyItemId)}
          type="submit"
        >
          <MessageSquareText size={15} aria-hidden="true" />
          送信
        </button>
      </form>
      <div className="ai-lens-memo-summary">
        <div>
          <strong>理解メモ</strong>
          <span>
            {latestInsightComment
              ? `最新 ${formatTime(latestInsightComment.createdAt)} / ${insightComments.length}件`
              : "質問するとメモに残ります"}
          </span>
        </div>
        <button
          disabled={insightComments.length === 0}
          onClick={() => setMemoDialogOpen(true)}
          type="button"
        >
          <FileText size={14} aria-hidden="true" />
          理解メモを開く
        </button>
      </div>
      {memoDialogOpen ? (
        <div className="ai-lens-memo-modal-backdrop" role="presentation">
          <section
            aria-label="最近の理解メモ"
            aria-modal="true"
            className="ai-lens-memo-modal"
            role="dialog"
          >
            <div className="ai-lens-memo-modal-header">
              <div>
                <span>最近の理解メモ</span>
                <small>AI視点への質問と回答を、後から読み返すための記録です。</small>
              </div>
              <button
                aria-label="理解メモを閉じる"
                onClick={() => setMemoDialogOpen(false)}
                type="button"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            <div className="ai-lens-memo-modal-list">
              {insightComments.map((comment) => {
                const memo = parseAiLensInsightBody(comment.body);
                return (
                  <article className="ai-lens-insight-card" key={comment.id}>
                    <div className="ai-lens-memo-card-header">
                      <div>
                        <small>{formatTime(comment.createdAt)}</small>
                        <h4>{comment.title}</h4>
                      </div>
                      <button
                        aria-label={`${comment.title}を削除`}
                        disabled={deletingMemoId === comment.id}
                        onClick={() => onDeleteMemo(comment.id)}
                        type="button"
                      >
                        <Trash2 size={14} aria-hidden="true" />
                        {deletingMemoId === comment.id ? "削除中" : "削除"}
                      </button>
                    </div>
                    {memo.question ? (
                      <div className="ai-lens-memo-section">
                        <span>質問</span>
                        <p>{memo.question}</p>
                      </div>
                    ) : null}
                    <div className="ai-lens-memo-section">
                      <span>AIの見立て</span>
                      <p>{memo.estimation}</p>
                    </div>
                    {memo.keyPoints ? (
                      <div className="ai-lens-memo-section">
                        <span>根拠 / 要点</span>
                        <p>{memo.keyPoints}</p>
                      </div>
                    ) : null}
                    {memo.followUp ? (
                      <div className="ai-lens-memo-section">
                        <span>要確認</span>
                        <p>{memo.followUp}</p>
                      </div>
                    ) : null}
                    {memo.nextAction ? (
                      <div className="ai-lens-memo-section">
                        <span>次に試す一手</span>
                        <p>{memo.nextAction}</p>
                      </div>
                    ) : null}
                  </article>
                );
              })}
              {insightComments.length === 0 ? (
                <div className="empty-panel">理解メモはまだありません。</div>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
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
  const [approvedSendScopeSignature, setApprovedSendScopeSignature] = useState<
    string | null
  >(null);

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
  const sendScopeSignature = JSON.stringify({
    companyName: draft.companyName.trim(),
    purposeId: draft.purposeId,
    purposeLabel: purposeLabel ?? "",
    industry: draft.industry.trim(),
    memo: draft.memo.trim(),
    productInfo: draft.productInfo.trim(),
    websiteUrls,
    snsUrls,
    sourceFiles: workspace.sourceFiles.map((source) => ({
      id: source.id,
      fileName: source.fileName,
      chunkCount: source.chunkCount,
    })),
  });
  const sendScopeApproved = approvedSendScopeSignature === sendScopeSignature;

  function updateDraft<K extends keyof OnboardingDraft>(
    key: K,
    value: OnboardingDraft[K],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function updateUrlList(key: "websiteUrls" | "snsUrls", values: string[]) {
    setDraft((current) => ({ ...current, [key]: values }));
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
              checked={sendScopeApproved}
              onChange={(event) =>
                setApprovedSendScopeSignature(
                  event.target.checked ? sendScopeSignature : null,
                )
              }
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
            disabled={!canGenerate || !sendScopeApproved || generationBusy}
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
          ) : !sendScopeApproved ? (
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

export default App;
