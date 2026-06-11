import {
  Clock3,
  Download,
  FolderKanban,
  FolderOpen,
  History,
  Home,
  Info,
  Layers3,
  ListChecks,
  Map as MapIcon,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
  PencilRuler,
  Plus,
  Save,
  Settings,
  Sparkles,
  Target,
  TriangleAlert,
  Upload,
} from "lucide-react";
import type * as React from "react";

import { StatusChip } from "@/features/app/AppPrimitives";
import {
  aiRunSourceLabel,
  aiRunStatusLabel,
  isFallbackRun,
} from "@/features/app/aiRunLabels";
import { clampSidebarWidth } from "@/features/app/sidebarLayout";
import type { ViewId } from "@/lib/appViewTypes";
import type {
  AiRunRow,
  MapUiPreferences,
  Project,
  ProjectWorkspace,
} from "@/lib/mvp1Types";
import {
  needsReflectionAttention,
  reflectionSummaryText,
  type WorkspaceReflectionSummary,
} from "@/lib/workspaceProgress";

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

export function AppSidebar({
  activeProject,
  collapsed,
  onOpenProjects,
  onSidebarModeChange,
  onSidebarWidthCommit,
  onSidebarWidthPreview,
  onSelectView,
  onStartNewMap,
  width,
  view,
}: {
  activeProject: Project | null;
  collapsed: boolean;
  onOpenProjects: () => void;
  onSidebarModeChange: (mode: MapUiPreferences["sidebarMode"]) => void;
  onSidebarWidthCommit: (width: number) => void;
  onSidebarWidthPreview: (width: number | null) => void;
  onSelectView: (view: ViewId) => void;
  onStartNewMap: () => void;
  width: number;
  view: ViewId;
}) {
  const toggleLabel = collapsed ? "サイドバーを開く" : "サイドバーを閉じる";
  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;

  function handleResizePointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    if (collapsed) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;

    function handlePointerMove(pointerEvent: PointerEvent) {
      onSidebarWidthPreview(
        clampSidebarWidth(startWidth + pointerEvent.clientX - startX),
      );
    }

    function handlePointerUp(pointerEvent: PointerEvent) {
      const nextWidth = clampSidebarWidth(startWidth + pointerEvent.clientX - startX);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      onSidebarWidthCommit(nextWidth);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }

  return (
    <aside
      className={`side-rail ${collapsed ? "side-rail-collapsed" : ""}`}
      aria-label="主要ナビゲーション"
    >
      <div className="sidebar-brand">
        <div className="brand-mark">
          <Layers3 size={19} aria-hidden="true" />
        </div>
        <div className="sidebar-brand-copy">
          <strong>Synergy Map</strong>
          <span>売上マップ作成</span>
        </div>
        <button
          aria-label={toggleLabel}
          className="sidebar-toggle-button"
          onClick={() => onSidebarModeChange(collapsed ? "expanded" : "collapsed")}
          title={toggleLabel}
          type="button"
        >
          <ToggleIcon size={16} aria-hidden="true" />
        </button>
      </div>

      <button
        aria-label="新しいマップを作る"
        className="sidebar-create-button"
        onClick={onStartNewMap}
        title="新しいマップを作る"
        type="button"
      >
        <Plus size={16} aria-hidden="true" />
        <span className="sidebar-label">新しいマップを作る</span>
      </button>

      <section className="project-switcher">
        <span className="sidebar-section-label">現在のマップ</span>
        <div className="project-switcher-card">
          <strong className="sidebar-label">
            {activeProject?.name ?? "マップが選択されていません"}
          </strong>
          <small className="sidebar-label">
            {activeProject?.clientName ?? "マップを選ぶか、新しく作成してください"}
          </small>
          <button
            aria-label="マップを切り替え"
            className="ghost-button"
            onClick={onOpenProjects}
            title="マップを切り替え"
            type="button"
          >
            <FolderOpen size={14} aria-hidden="true" />
            <span className="sidebar-label">マップを切り替え</span>
          </button>
        </div>
      </section>

      <nav className="sidebar-nav" aria-label="全体メニュー">
        <span className="sidebar-section-label">全体メニュー</span>
        {globalNavItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              aria-label={item.label}
              className={`sidebar-nav-item ${
                view === item.id ? "sidebar-nav-item-active" : ""
              }`}
              key={item.id}
              onClick={() => onSelectView(item.id)}
              title={item.label}
              type="button"
            >
              <Icon size={16} aria-hidden="true" />
              <span className="sidebar-label">{item.label}</span>
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
                aria-label={item.label}
                className={`sidebar-nav-item ${
                  view === item.id ? "sidebar-nav-item-active" : ""
                } ${item.id === "today" ? "sidebar-nav-item-primary" : ""}`}
                key={item.id}
                onClick={() => onSelectView(item.id)}
                title={item.label}
                type="button"
              >
                <Icon size={16} aria-hidden="true" />
                <span className="sidebar-label">{item.label}</span>
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
        aria-label="設定"
        className={`sidebar-nav-item sidebar-settings ${
          view === "settings" ? "sidebar-nav-item-active" : ""
        }`}
        onClick={() => onSelectView("settings")}
        title="設定"
        type="button"
      >
        <Settings size={16} aria-hidden="true" />
        <span className="sidebar-label">設定</span>
      </button>
      {!collapsed ? (
        <button
          aria-label="サイドバーの幅を調整"
          className="sidebar-resize-handle"
          onPointerDown={handleResizePointerDown}
          title="ドラッグしてサイドバー幅を調整"
          type="button"
        />
      ) : null}
    </aside>
  );
}

export function WorkspaceTopBar({
  activeProject,
  aiLensCount,
  aiLensOpen,
  generationBusy,
  isBusy,
  latestAiRun,
  onAiUpdate,
  onGenerateAiLens,
  onGenerateMap,
  onOpenExtractReview,
  onOpenHistory,
  onRefreshCodexRuntime,
  onToggleAiLens,
  primaryActionLabel,
  reflectionSummary,
  saveStatus,
  view,
  workspace,
}: {
  activeProject: Project | null;
  aiLensCount: number;
  aiLensOpen: boolean;
  generationBusy: boolean;
  isBusy: boolean;
  latestAiRun: AiRunRow | null;
  onAiUpdate: () => void;
  onGenerateAiLens: () => void;
  onGenerateMap: () => void;
  onOpenExtractReview: () => void;
  onOpenHistory: () => void;
  onRefreshCodexRuntime: () => void;
  onToggleAiLens: () => void;
  primaryActionLabel: string;
  reflectionSummary: WorkspaceReflectionSummary;
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
  const showMapHeaderTools = Boolean(activeProject && view === "map");
  const hasGeneratedMap = workspace.nodes.length > 0;

  return (
    <header className="top-bar">
      <div className="project-heading">
        <div className="project-title">{title}</div>
        <div className="project-meta">{meta}</div>
      </div>
      {showMapHeaderTools && reflectionSummary.sourceCount > 0 ? (
        <div className="top-reflection-slot">
          <MapReflectionBanner
            generationBusy={generationBusy}
            onGenerateMap={onGenerateMap}
            onOpenExtractReview={onOpenExtractReview}
            summary={reflectionSummary}
          />
        </div>
      ) : null}
      {activeProject ? (
        <div className="top-status">
          <span className="save-status">
            <Save size={13} aria-hidden="true" />
            {saveStatus}
          </span>
          <StatusChip className="top-count-chip">
            {workspace.extractedItems.length}カード
          </StatusChip>
          <StatusChip className="top-count-chip">
            {workspace.nodes.length}ノード
          </StatusChip>
          <StatusChip className="top-count-chip">
            {workspace.edges.length}導線
          </StatusChip>
          <span
            className={`ai-source-chip ${
              isFallbackRun(latestAiRun) ? "ai-source-chip-fallback" : ""
            }`}
            title={latestAiRun?.error ?? aiRunStatusLabel(latestAiRun)}
          >
            {aiRunSourceLabel(latestAiRun)}
          </span>
          {showMapHeaderTools && hasGeneratedMap ? (
            <AiLensToggle
              busy={generationBusy}
              count={aiLensCount}
              open={aiLensOpen}
              onGenerate={onGenerateAiLens}
              onToggle={onToggleAiLens}
            />
          ) : null}
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
  const needsMissingSourceReview = summary.missingSourceReferenceCount > 0;
  const needsAttention = needsReflectionAttention(summary);
  const summaryText = reflectionSummaryText(summary);

  if (!needsAttention) {
    return (
      <div className="map-reflection-banner map-reflection-banner-ok">
        <Info size={15} aria-hidden="true" />
        <span title={summaryText}>{summaryText}</span>
        <StatusChip>
          {summary.mappedSourceCount}/{summary.sourceCount}反映済み
        </StatusChip>
      </div>
    );
  }

  return (
    <div className="map-reflection-banner map-reflection-banner-warning">
      <TriangleAlert size={15} aria-hidden="true" />
      <span title={summaryText}>{summaryText}</span>
      {needsExtraction || needsMissingSourceReview ? (
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

function AiLensToggle({
  busy,
  count,
  onGenerate,
  onToggle,
  open,
}: {
  busy: boolean;
  count: number;
  onGenerate: () => void;
  onToggle: () => void;
  open: boolean;
}) {
  const hasItems = count > 0;
  return (
    <button
      aria-pressed={open}
      className={`ai-lens-toggle ${open ? "ai-lens-toggle-open" : ""}`}
      disabled={busy}
      onClick={hasItems ? onToggle : onGenerate}
      type="button"
    >
      <Sparkles size={15} aria-hidden="true" />
      AI視点
      <span>{count}</span>
    </button>
  );
}
