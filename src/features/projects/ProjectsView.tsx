import { Check, MoreHorizontal, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import type * as React from "react";
import { useEffect, useState } from "react";

import { Field, FormGrid } from "@/features/app/AppPrimitives";
import type { ProjectFormValues } from "@/features/app/appViewTypes";
import { formatTime } from "@/lib/appFormatters";
import type { Project } from "@/lib/mvp1Types";

export function ProjectsView({
  activeProject,
  activeProjectId,
  busy,
  onCreateProject,
  onDeleteProject,
  onSelectProject,
  onUpdateProject,
  projects,
}: {
  activeProject: Project | null;
  activeProjectId: string | null;
  busy: boolean;
  onCreateProject: () => void;
  onDeleteProject: (projectId: string) => Promise<boolean>;
  onSelectProject: (projectId: string) => void;
  onUpdateProject: (projectId: string, values: ProjectFormValues) => Promise<boolean>;
  projects: Project[];
}) {
  const [openActionProjectId, setOpenActionProjectId] = useState<string | null>(null);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  useEffect(() => {
    if (!openActionProjectId && !editingProjectId) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpenActionProjectId(null);
      setEditingProjectId(null);
      setEditingTitle("");
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editingProjectId, openActionProjectId]);

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

  function startTitleEdit(project: Project) {
    setEditingProjectId(project.id);
    setEditingTitle(project.name);
    setOpenActionProjectId(null);
  }

  function cancelTitleEdit() {
    setEditingProjectId(null);
    setEditingTitle("");
  }

  async function saveTitleEdit(project: Project) {
    const nextName = editingTitle.trim();
    if (!nextName) return;
    if (nextName === project.name) {
      cancelTitleEdit();
      return;
    }
    const didSave = await onUpdateProject(project.id, {
      name: nextName,
      clientName: project.clientName ?? "",
      industry: project.industry ?? "",
      description: project.description ?? "",
      memo: project.memo ?? "",
    });
    if (didSave) {
      cancelTitleEdit();
    }
  }

  async function confirmDeleteProject(project: Project) {
    if (
      !window.confirm(`「${project.name}」を削除しますか？この操作は元に戻せません。`)
    ) {
      return;
    }
    const didDelete = await onDeleteProject(project.id);
    if (didDelete) {
      setOpenActionProjectId(null);
      if (editingProjectId === project.id) {
        cancelTitleEdit();
      }
    }
  }

  return (
    <section className="page-panel">
      <div className="page-header">
        <div>
          <h1>マップ一覧</h1>
          <p>新しいマップを作成し、既存マップを再開します。</p>
        </div>
        <button
          className="primary-button"
          disabled={busy}
          onClick={onCreateProject}
          type="button"
        >
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
            <button className="primary-button" disabled={busy} type="submit">
              <Save size={15} aria-hidden="true" />
              マップを保存
            </button>
          </div>
        </form>
      ) : null}
      <div className="data-table">
        {projects.map((project) => {
          const isActive = project.id === activeProjectId;
          const isEditingTitle = project.id === editingProjectId;
          const titleIsSaveable = editingTitle.trim().length > 0;
          return (
            <div
              className={`table-row project-table-row ${
                isActive ? "table-row-active" : ""
              }`}
              key={project.id}
            >
              {isEditingTitle ? (
                <div className="project-row-main project-row-main-editing">
                  <form
                    className="project-title-edit-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void saveTitleEdit(project);
                    }}
                  >
                    <input
                      aria-label={`${project.name}のマップ名`}
                      autoFocus
                      disabled={busy}
                      onChange={(event) => setEditingTitle(event.target.value)}
                      value={editingTitle}
                    />
                    <button
                      aria-label="マップ名を保存"
                      className="ghost-button icon-button"
                      disabled={busy || !titleIsSaveable}
                      title="マップ名を保存"
                      type="submit"
                    >
                      <Check size={15} aria-hidden="true" />
                    </button>
                    <button
                      aria-label="マップ名の編集をキャンセル"
                      className="ghost-button icon-button"
                      disabled={busy}
                      onClick={cancelTitleEdit}
                      title="キャンセル"
                      type="button"
                    >
                      <X size={15} aria-hidden="true" />
                    </button>
                  </form>
                  <span>{project.clientName ?? "未設定"}</span>
                  <span>{project.industry ?? "業種未設定"}</span>
                  <span>{formatTime(project.updatedAt)}</span>
                </div>
              ) : (
                <button
                  className="project-row-main"
                  disabled={busy}
                  onClick={() => onSelectProject(project.id)}
                  type="button"
                >
                  <span>{project.name}</span>
                  <span>{project.clientName ?? "未設定"}</span>
                  <span>{project.industry ?? "業種未設定"}</span>
                  <span>{formatTime(project.updatedAt)}</span>
                </button>
              )}
              <div className="project-row-actions">
                <button
                  aria-expanded={openActionProjectId === project.id}
                  aria-label={`${project.name}の操作`}
                  className="ghost-button icon-button"
                  disabled={busy}
                  onClick={() =>
                    setOpenActionProjectId((current) =>
                      current === project.id ? null : project.id,
                    )
                  }
                  title="マップの操作"
                  type="button"
                >
                  <MoreHorizontal size={16} aria-hidden="true" />
                </button>
                {openActionProjectId === project.id ? (
                  <div className="project-row-menu" role="menu">
                    <button
                      aria-label={`${project.name}のタイトルを編集`}
                      className="ghost-button icon-button"
                      onClick={() => startTitleEdit(project)}
                      title="タイトルを編集"
                      type="button"
                    >
                      <Pencil size={15} aria-hidden="true" />
                    </button>
                    <button
                      aria-label={`${project.name}を削除`}
                      className="ghost-button icon-button danger-button"
                      onClick={() => void confirmDeleteProject(project)}
                      title="マップを削除"
                      type="button"
                    >
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
