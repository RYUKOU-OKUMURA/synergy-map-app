import { invoke } from "@tauri-apps/api/core";
import {
  CheckCircle2,
  Database,
  FileText,
  FolderKanban,
  Plus,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useEffect, useState } from "react";

import "./App.css";
import { Button } from "@/components/ui/button";

const gateItems = [
  {
    label: "Tauri + React + Vite",
    value: "起動済み",
    icon: CheckCircle2,
  },
  {
    label: "SQLite保存",
    value: "P0-3検証中",
    icon: Database,
  },
  {
    label: "Codex接続",
    value: "P0-5で検証",
    icon: Sparkles,
  },
  {
    label: "資料読み取り",
    value: "P0-4で検証",
    icon: FileText,
  },
];

type Project = {
  id: string;
  name: string;
  clientName: string | null;
  industry: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};

type StorageInfo = {
  dbPath: string;
  appDataDir: string;
};

function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  async function loadProjects() {
    const [projectRows, storage] = await Promise.all([
      invoke<Project[]>("list_projects"),
      invoke<StorageInfo>("get_storage_info"),
    ]);

    setProjects(projectRows);
    setStorageInfo(storage);
  }

  async function handleCreateProject() {
    setIsCreating(true);
    setError(null);

    try {
      await invoke<Project>("create_project", {
        name: `Phase 0 検証案件 ${projects.length + 1}`,
      });
      await loadProjects();
    } catch (caughtError) {
      setError(String(caughtError));
    } finally {
      setIsCreating(false);
    }
  }

  useEffect(() => {
    let isMounted = true;

    async function loadInitialProjects() {
      try {
        const [projectRows, storage] = await Promise.all([
          invoke<Project[]>("list_projects"),
          invoke<StorageInfo>("get_storage_info"),
        ]);

        if (!isMounted) {
          return;
        }

        setProjects(projectRows);
        setStorageInfo(storage);
      } catch (caughtError) {
        if (isMounted) {
          setError(String(caughtError));
        }
      }
    }

    void loadInitialProjects();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <main className="min-h-screen bg-[var(--app-bg)] text-[var(--app-fg)]">
      <div className="grid min-h-screen grid-cols-[248px_1fr]">
        <aside className="border-r border-[var(--app-border)] bg-white px-5 py-5">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-md bg-[var(--app-accent)] text-white">
              <FolderKanban size={20} aria-hidden="true" />
            </div>
            <div>
              <div className="text-sm font-semibold">Synergy Map</div>
              <div className="text-xs text-[var(--app-muted)]">Phase 0 PoC</div>
            </div>
          </div>

          <nav className="mt-8 space-y-1 text-sm">
            <a className="nav-item nav-item-active" href="#projects">
              <FolderKanban size={16} aria-hidden="true" />
              案件一覧
            </a>
            <a className="nav-item" href="#sources">
              <FileText size={16} aria-hidden="true" />
              資料投入
            </a>
            <a className="nav-item" href="#go-no-go">
              <ShieldCheck size={16} aria-hidden="true" />
              技術ゲート
            </a>
          </nav>
        </aside>

        <section className="px-8 py-6">
          <header className="flex items-start justify-between gap-4 border-b border-[var(--app-border)] pb-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--app-muted)]">
                Desktop PoC
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-normal">案件一覧</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--app-muted)]">
                MVP-1へ進むための技術検証用シェルです。SQLite保存はTauri
                command経由で検証します。
              </p>
            </div>
            <Button disabled={isCreating} onClick={handleCreateProject} type="button">
              <Plus size={16} aria-hidden="true" />
              {isCreating ? "作成中" : "新規案件"}
            </Button>
          </header>

          <div className="mt-6 grid grid-cols-4 gap-3">
            {gateItems.map((item) => {
              const Icon = item.icon;

              return (
                <div className="metric-card" key={item.label}>
                  <div className="flex items-center justify-between gap-3">
                    <Icon
                      className="text-[var(--app-accent)]"
                      size={18}
                      aria-hidden="true"
                    />
                    <span className="text-xs text-[var(--app-muted)]">
                      {item.value}
                    </span>
                  </div>
                  <div className="mt-3 text-sm font-medium">{item.label}</div>
                </div>
              );
            })}
          </div>

          {error ? <div className="mt-4 error-banner">{error}</div> : null}

          <div
            className="mt-6 overflow-hidden rounded-md border border-[var(--app-border)] bg-white"
            id="projects"
          >
            <div className="grid grid-cols-[1fr_160px_120px_160px] border-b border-[var(--app-border)] bg-[var(--app-surface)] px-4 py-3 text-xs font-semibold text-[var(--app-muted)]">
              <div>案件名</div>
              <div>状態</div>
              <div>資料数</div>
              <div>更新</div>
            </div>
            {projects.length > 0 ? (
              projects.map((project) => (
                <div
                  className="grid grid-cols-[1fr_160px_120px_160px] items-center border-b border-[var(--app-border)] px-4 py-4 text-sm last:border-b-0"
                  key={project.id}
                >
                  <div className="font-medium">{project.name}</div>
                  <div>
                    <span className="status-pill">保存済み</span>
                  </div>
                  <div className="text-[var(--app-muted)]">0</div>
                  <div className="text-[var(--app-muted)]">
                    {new Date(project.updatedAt).toLocaleDateString("ja-JP")}
                  </div>
                </div>
              ))
            ) : (
              <div className="px-4 py-10 text-center text-sm text-[var(--app-muted)]">
                案件はまだありません。新規案件を作成するとSQLiteへの保存を確認できます。
              </div>
            )}
          </div>

          <div className="mt-4 text-xs leading-5 text-[var(--app-muted)]">
            SQLite DB: {storageInfo?.dbPath ?? "確認中"}
          </div>
        </section>
      </div>
    </main>
  );
}

export default App;
