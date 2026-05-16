import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import {
  Archive,
  Clock3,
  Database,
  Download,
  FileText,
  FolderKanban,
  History,
  Layers3,
  ListChecks,
  Map,
  MessageSquareText,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import type * as React from "react";
import { useEffect, useMemo, useState } from "react";

import "./App.css";
import { SynergyMapCanvas } from "@/features/map/SynergyMapCanvas";
import { demoProject, demoWorkspace, emptyWorkspace } from "@/lib/demoWorkspace";
import {
  adoptionOptions,
  categoryOptions,
  confidenceOptions,
  labelFor,
} from "@/lib/mvp1Labels";
import type {
  ExportResult,
  ExtractedItemRow,
  MapEdgeRow,
  MapNodeRow,
  MvpRunResult,
  Project,
  ProjectWorkspace,
  SelectedMapElement,
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
  { id: "map", label: "マップ", icon: Map },
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
  const [selectedMapElement, setSelectedMapElement] =
    useState<SelectedMapElement>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [isTrayOpen, setIsTrayOpen] = useState(true);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
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

  const saveStatus = workspace.versions[0]
    ? `保存済み ${formatTime(workspace.versions[0].createdAt)}`
    : "保存済み";

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

  async function handleSavePositions(
    positions: Array<{ nodeId: string; x: number; y: number }>,
  ) {
    if (!activeProjectId || !isTauriRuntime) return;
    try {
      const nextWorkspace = await invoke<ProjectWorkspace>("save_map_layout", {
        projectId: activeProjectId,
        positions,
      });
      setWorkspace(nextWorkspace);
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
              onDrawerOpenChange={setIsDrawerOpen}
              onGenerateMap={handleGenerateMap}
              onGenerateSuggestions={handleGenerateSuggestions}
              onSavePositions={handleSavePositions}
              onSelectItem={(itemId) => {
                setSelectedItemId(itemId);
                setSelectedMapElement(null);
              }}
              onSelectMapElement={(selection) => {
                setSelectedMapElement(selection);
                if (selection) setSelectedItemId(null);
              }}
              selectedMapElement={selectedMapElement}
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
              onSelectItem={setSelectedItemId}
              selectedItemId={selectedItemId}
              selectedChunkIds={selectedChunkIds}
              workspace={workspace}
            />
          ) : null}
          {view === "suggestions" ? (
            <SuggestionsView
              onGenerate={handleGenerateSuggestions}
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
  onDrawerOpenChange,
  onGenerateMap,
  onGenerateSuggestions,
  onSavePositions,
  onSelectItem,
  onSelectMapElement,
  selectedMapElement,
  trayOpen,
  onTrayOpenChange,
  workspace,
}: {
  drawerOpen: boolean;
  onDrawerOpenChange: (open: boolean) => void;
  onGenerateMap: () => void;
  onGenerateSuggestions: () => void;
  onSavePositions: (positions: Array<{ nodeId: string; x: number; y: number }>) => void;
  onSelectItem: (itemId: string) => void;
  onSelectMapElement: (selection: SelectedMapElement) => void;
  selectedMapElement: SelectedMapElement;
  trayOpen: boolean;
  onTrayOpenChange: (open: boolean) => void;
  workspace: ProjectWorkspace;
}) {
  return (
    <div className="map-workbench">
      <button
        className={`tray-tab ${trayOpen ? "tray-tab-open" : ""}`}
        onClick={() => onTrayOpenChange(!trayOpen)}
        type="button"
      >
        抽出カード {workspace.extractedItems.length}
      </button>
      {trayOpen ? (
        <aside className="extraction-tray">
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

      <section className="map-stage">
        {workspace.nodes.length > 0 ? (
          <SynergyMapCanvas
            edges={workspace.edges}
            nodes={workspace.nodes}
            onPositionsChange={onSavePositions}
            onSelect={onSelectMapElement}
            selected={selectedMapElement}
          />
        ) : (
          <div className="empty-map">
            <Map size={32} aria-hidden="true" />
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
              AIコメント生成
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
  workspace,
}: {
  onGenerate: () => void;
  workspace: ProjectWorkspace;
}) {
  return (
    <section className="page-panel">
      <div className="page-header">
        <div>
          <h1>施策</h1>
          <p>マップから簡易施策と確認質問を生成します。</p>
        </div>
        <button className="primary-button" onClick={onGenerate} type="button">
          <Sparkles size={15} aria-hidden="true" />
          施策生成
        </button>
      </div>
      <div className="cards-grid">
        {workspace.suggestions.map((suggestion) => (
          <article className="review-card" key={suggestion.id}>
            <div className="card-row">
              <strong>{suggestion.title}</strong>
              <span className="status-chip">{suggestion.priority}</span>
            </div>
            <p>{suggestion.description}</p>
            <small>{suggestion.rationale}</small>
          </article>
        ))}
      </div>
    </section>
  );
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
      <div className="data-table">
        {workspace.aiRuns.map((run) => (
          <div className="table-row" key={run.id}>
            <span>{run.runType}</span>
            <span>{run.schemaName}</span>
            <span>{run.status}</span>
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
}: {
  edge: MapEdgeRow | null;
  isTauriRuntime: boolean;
  item: ExtractedItemRow | null;
  node: MapNodeRow | null;
  onWorkspaceChange: (workspace: ProjectWorkspace) => void;
  projectId: string | null;
}) {
  if (!item && !node && !edge) {
    return (
      <aside className="inspector">
        <div className="panel-heading">
          <span>インスペクター</span>
        </div>
        <div className="empty-panel">ノード、導線、抽出カードを選択してください。</div>
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

  return (
    <aside className="inspector">
      <div className="panel-heading">
        <span>{item ? "抽出カード" : node ? "ノード" : "導線"}</span>
        <small>編集</small>
      </div>
      {item ? <ItemForm item={item} onSubmit={submitItem} /> : null}
      {node ? <NodeForm node={node} onSubmit={submitNode} /> : null}
      {edge ? <EdgeForm edge={edge} onSubmit={submitEdge} /> : null}
    </aside>
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
  onSubmit,
}: {
  edge: MapEdgeRow;
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
      <button className="primary-button" type="submit">
        保存
      </button>
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
