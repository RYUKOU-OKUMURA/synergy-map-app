import { FolderOpen, Plus } from "lucide-react";

import { StatusChip } from "@/features/app/AppPrimitives";
import { formatTime } from "@/lib/appFormatters";
import type { Project, ProjectWorkspace } from "@/lib/mvp1Types";

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

export function HomeView({
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
