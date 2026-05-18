import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import {
  Archive,
  BarChart3,
  Clock3,
  Database,
  Download,
  FileText,
  FolderKanban,
  Gauge,
  History,
  Layers3,
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
  TrendingUp,
  Upload,
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
  ExportResult,
  ExtractedItemRow,
  MapEdgeRow,
  MapNodeRow,
  MvpRunResult,
  Project,
  ProjectWorkspace,
  SelectedMapElement,
  SuggestionRow,
  ViewLayoutRow,
} from "@/lib/mvp1Types";

type ViewId =
  | "projects"
  | "sources"
  | "extract"
  | "map"
  | "suggestions"
  | "export"
  | "history";

type ProjectFormValues = {
  name: string;
  clientName: string;
  industry: string;
  description: string;
  memo: string;
};

const navItems: Array<{ id: ViewId; label: string; icon: typeof FolderKanban }> = [
  { id: "projects", label: "案件", icon: FolderKanban },
  { id: "sources", label: "資料", icon: Upload },
  { id: "extract", label: "抽出", icon: ListChecks },
  { id: "map", label: "マップ", icon: MapIcon },
  { id: "suggestions", label: "施策", icon: MessageSquareText },
  { id: "export", label: "出力", icon: Download },
  { id: "history", label: "履歴", icon: History },
];

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
  const [view, setView] = useState<ViewId>("map");
  const [projects, setProjects] = useState<Project[]>(
    isTauriRuntime ? [] : [demoProject],
  );
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    isTauriRuntime ? null : demoProject.id,
  );
  const [workspace, setWorkspace] = useState<ProjectWorkspace>(
    isTauriRuntime ? emptyWorkspace : demoWorkspace,
  );
  const [mapViewMode, setMapViewMode] = useState<MapViewMode>("customer_journey");
  const [selectedMapElement, setSelectedMapElement] =
    useState<SelectedMapElement>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedSuggestionId, setSelectedSuggestionId] = useState<string | null>(null);
  const [isTrayOpen, setIsTrayOpen] = useState(true);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isMapEditMode, setIsMapEditMode] = useState(false);
  const [layoutSaveStatus, setLayoutSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [layoutSaveScope, setLayoutSaveScope] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [approvedChunkSignature, setApprovedChunkSignature] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [excludedChunkIds, setExcludedChunkIds] = useState<string[]>([]);

  const activeProject = useMemo(
    () =>
      projects.find((project) => project.id === selectedProjectId) ??
      projects[0] ??
      null,
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
  const currentLayoutScope = `${activeProjectId ?? "none"}:${mapViewMode}`;
  const visibleLayoutSaveStatus =
    layoutSaveScope === currentLayoutScope ? layoutSaveStatus : "idle";

  useEffect(() => {
    if (!notice) return;
    const timeoutId = window.setTimeout(() => setNotice(null), 3200);
    return () => window.clearTimeout(timeoutId);
  }, [notice]);

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

  async function handleCreateProject() {
    await runAction(
      async () => {
        const project = await invoke<Project>("create_project", {
          name: `新規案件 ${projects.length + 1}`,
          clientName: "",
          industry: "",
          description: "",
          memo: "",
        });
        const nextProjects = await invoke<Project[]>("list_projects");
        const nextWorkspace = await invoke<ProjectWorkspace>("get_project_workspace", {
          projectId: project.id,
        });
        return { nextProjects, nextWorkspace, project };
      },
      ({ nextProjects, nextWorkspace, project }) => {
        setProjects(nextProjects);
        setSelectedProjectId(project.id);
        setWorkspace(nextWorkspace);
        setExcludedChunkIds([]);
        setSelectedSuggestionId(null);
        setApprovedChunkSignature(null);
        setView("sources");
        setNotice("新規案件を作成しました。");
      },
    );
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
        const nextProjectId = nextProjects[0]?.id ?? null;
        const nextWorkspace = nextProjectId
          ? await invoke<ProjectWorkspace>("get_project_workspace", {
              projectId: nextProjectId,
            })
          : emptyWorkspace;
        return { nextProjects, nextProjectId, nextWorkspace };
      },
      ({ nextProjectId, nextProjects, nextWorkspace }) => {
        setProjects(nextProjects);
        setSelectedProjectId(nextProjectId);
        setWorkspace(nextWorkspace);
        setSelectedItemId(null);
        setSelectedMapElement(null);
        setSelectedSuggestionId(null);
        setExcludedChunkIds([]);
        setApprovedChunkSignature(null);
        setView("projects");
        setNotice("案件と関連データを削除しました。");
      },
    );
  }

  async function handleAiUpdate() {
    if (!activeProjectId) return;
    if (workspace.extractedItems.length === 0) {
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
    if (workspace.nodes.length === 0) {
      await runAction(
        () =>
          invoke<MvpRunResult>("generate_map_from_items", {
            projectId: activeProjectId,
          }),
        (result) => {
          setWorkspace(result.workspace);
          setNotice(result.message);
          setView("map");
        },
      );
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

  async function handleGenerateMap() {
    if (!activeProjectId) return;
    await runAction(
      () =>
        invoke<MvpRunResult>("generate_map_from_items", { projectId: activeProjectId }),
      (result) => {
        setWorkspace(result.workspace);
        setSelectedSuggestionId(null);
        setNotice(result.message);
        setView("map");
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

  useEffect(() => {
    if (!isTauriRuntime) return;
    let cancelled = false;

    async function loadInitialProjects() {
      const rows = await invoke<Project[]>("list_projects");
      if (cancelled) return;
      setProjects(rows);
      setSelectedProjectId((current) =>
        current && rows.some((project) => project.id === current)
          ? current
          : (rows[0]?.id ?? null),
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
      <aside className="side-rail" aria-label="主要ナビゲーション">
        <div className="brand-mark">
          <Layers3 size={19} aria-hidden="true" />
        </div>
        <nav className="rail-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={`rail-item ${view === item.id ? "rail-item-active" : ""}`}
                key={item.id}
                onClick={() => setView(item.id)}
                title={item.label}
                type="button"
              >
                <Icon size={17} aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <section className="app-shell">
        <header className="top-bar">
          <div className="project-heading">
            <div className="project-title">{activeProject?.name ?? "案件未選択"}</div>
            <div className="project-meta">
              {activeProject?.clientName ?? "クライアント未設定"}
            </div>
          </div>
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
            <button
              className="ghost-button"
              onClick={() => setView("history")}
              type="button"
            >
              <Clock3 size={15} aria-hidden="true" />
              履歴
            </button>
            <button
              className="primary-button"
              disabled={!activeProject || isBusy}
              onClick={handleAiUpdate}
              type="button"
            >
              <Sparkles size={15} aria-hidden="true" />
              {isBusy ? "処理中" : "AIで更新"}
            </button>
          </div>
        </header>

        {error ? <div className="toast toast-error">{error}</div> : null}
        {notice ? <div className="toast">{notice}</div> : null}

        <div className="workspace">
          {view === "map" ? (
            <MapWorkspace
              drawerOpen={isDrawerOpen}
              editMode={isMapEditMode}
              layoutSaveStatus={visibleLayoutSaveStatus}
              latestAiRun={latestAiRun}
              mapViewMode={mapViewMode}
              onArrangeMap={handleArrangeMap}
              onCreateMapEdge={handleCreateMapEdge}
              onDrawerOpenChange={setIsDrawerOpen}
              onEditModeChange={setIsMapEditMode}
              onGenerateMap={handleGenerateMap}
              onGenerateSuggestions={handleGenerateSuggestions}
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
              onCreateProject={handleCreateProject}
              onDeleteProject={handleDeleteProject}
              onSelectProject={(projectId) => {
                setSelectedProjectId(projectId);
                setSelectedSuggestionId(null);
                setExcludedChunkIds([]);
                setApprovedChunkSignature(null);
                setView("sources");
              }}
              onUpdateProject={handleUpdateProject}
              projects={projects}
            />
          ) : null}
          {view === "sources" ? <SourcesView workspace={workspace} /> : null}
          {view === "extract" ? (
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
          {view === "suggestions" ? (
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
          {view === "export" ? (
            <ExportView onExport={handleExport} workspace={workspace} />
          ) : null}
          {view === "history" ? <HistoryView workspace={workspace} /> : null}
        </div>

        <InspectorPanel
          edge={selectedEdge}
          isTauriRuntime={isTauriRuntime}
          item={selectedItem}
          node={selectedNode}
          onWorkspaceChange={setWorkspace}
          projectId={activeProject?.id ?? null}
          suggestion={selectedSuggestion}
          workspace={workspace}
        />
      </section>
    </main>
  );
}

function StatusChip({ children }: { children: React.ReactNode }) {
  return <span className="status-chip">{children}</span>;
}

function MapWorkspace({
  drawerOpen,
  editMode,
  layoutSaveStatus,
  latestAiRun,
  mapViewMode,
  onArrangeMap,
  onCreateMapEdge,
  onDrawerOpenChange,
  onEditModeChange,
  onGenerateMap,
  onGenerateSuggestions,
  onMapViewModeChange,
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
  drawerOpen: boolean;
  editMode: boolean;
  layoutSaveStatus: "idle" | "saving" | "saved" | "error";
  latestAiRun: AiRunRow | null;
  mapViewMode: MapViewMode;
  onArrangeMap: () => void;
  onCreateMapEdge: (sourceNodeId: string, targetNodeId: string) => void;
  onDrawerOpenChange: (open: boolean) => void;
  onEditModeChange: (enabled: boolean) => void;
  onGenerateMap: () => void;
  onGenerateSuggestions: () => void;
  onMapViewModeChange: (mode: MapViewMode) => void;
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
  const handleCanvasPositionsChange = useCallback(
    (positions: MapNodeLayout[]) => onSavePositions(mapViewMode, positions),
    [mapViewMode, onSavePositions],
  );

  return (
    <div className="map-workbench">
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
        <button
          disabled={workspace.nodes.length === 0}
          onClick={onArrangeMap}
          title="見やすく整列"
          type="button"
        >
          <MapIcon size={14} aria-hidden="true" />
          整える
        </button>
        <span className={`layout-save-status layout-save-status-${layoutSaveStatus}`}>
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

      {mapViewMode === "customer_journey" ? (
        <button
          className={`tray-tab ${trayOpen ? "tray-tab-open" : ""}`}
          aria-expanded={trayOpen}
          aria-label={trayOpen ? "抽出カードを閉じる" : "抽出カードを開く"}
          onClick={() => onTrayOpenChange(!trayOpen)}
          type="button"
        >
          抽出カード {workspace.extractedItems.length}
        </button>
      ) : null}
      {mapViewMode === "customer_journey" ? (
        <aside
          className={`extraction-tray ${
            trayOpen ? "extraction-tray-open" : "extraction-tray-closed"
          }`}
          aria-hidden={!trayOpen}
        >
          <div className="panel-heading">
            <span>抽出カード</span>
            <small>{workspace.extractedItems.length}件</small>
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

      {mapViewMode === "business_impact" && workspace.nodes.length > 0 ? (
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
        ) : (
          <div className="empty-map">
            <MapIcon size={32} aria-hidden="true" />
            <h2>シナジーマップ未生成</h2>
            <p>抽出カードを確認したら、顧客導線マップを生成します。</p>
            <button className="primary-button" onClick={onGenerateMap} type="button">
              <Sparkles size={15} aria-hidden="true" />
              マップ生成
            </button>
          </div>
        )}
      </section>

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
          <h1>案件</h1>
          <p>新規案件を作成し、既存案件を再開します。</p>
        </div>
        <button className="primary-button" onClick={onCreateProject} type="button">
          <Plus size={15} aria-hidden="true" />
          新規案件
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

function SourcesView({ workspace }: { workspace: ProjectWorkspace }) {
  return (
    <section className="page-panel">
      <div className="page-header">
        <div>
          <h1>資料投入</h1>
          <p>PDF / CSV / XLSX / Markdown / Textをドラッグ&ドロップで投入します。</p>
        </div>
      </div>
      <div className="drop-zone">
        <Upload size={24} aria-hidden="true" />
        <strong>ここにファイルをドロップ</strong>
        <span>投入後、原本コピー、ハッシュ、source chunks、出典情報を保存します。</span>
      </div>
      <div className="source-grid">
        {workspace.sourceFiles.map((source) => (
          <div className="source-row" key={source.id}>
            <FileText size={15} aria-hidden="true" />
            <strong>{source.fileName}</strong>
            <span>{source.fileType}</span>
            <span>{source.status}</span>
            <span>{source.chunkCount} chunks</span>
          </div>
        ))}
      </div>
    </section>
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
    return (
      <aside className="inspector">
        <div className="panel-heading">
          <span>インスペクター</span>
        </div>
        <div className="empty-panel">
          ノード、導線、抽出カードを選択してください。マップ全体についてCodexに聞くこともできます。
        </div>
        <MapInsightActions
          busy={askBusy}
          error={askError}
          onAsk={askMapInsight}
          targetLabel="マップ全体"
        />
      </aside>
    );
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
