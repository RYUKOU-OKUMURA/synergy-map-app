import { invoke } from "@tauri-apps/api/core";
import {
  CheckCircle2,
  Database,
  FileText,
  FolderKanban,
  Upload,
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

type SourceChunk = {
  id: string;
  chunkIndex: number;
  contentPath: string;
  pageNumber: number | null;
  sheetName: string | null;
  rowStart: number | null;
  rowEnd: number | null;
  headingPath: string | null;
};

type ImportSourceResult = {
  sourceFileId: string;
  fileName: string;
  fileType: string;
  status: string;
  error: string | null;
  chunkCount: number;
  chunks: SourceChunk[];
};

const sampleFiles = [
  "company-overview.pdf",
  "financial-summary.pdf",
  "table-layout.pdf",
  "scanned-placeholder.pdf",
  "sample-workbook.xlsx",
  "channels-utf8.csv",
  "channels-shift-jis.csv",
  "hearing-memo.md",
  "long-hearing-note.txt",
];

function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [importResults, setImportResults] = useState<ImportSourceResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

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

  async function handleImportSamples() {
    const project = projects[0];

    if (!project) {
      setError("先に新規案件を作成してください。");
      return;
    }

    setIsImporting(true);
    setError(null);

    try {
      const results = [];

      for (const sampleFileName of sampleFiles) {
        const result = await invoke<ImportSourceResult>("import_sample_source", {
          projectId: project.id,
          sampleFileName,
        });
        results.push(result);
      }

      setImportResults(results);
    } catch (caughtError) {
      setError(String(caughtError));
    } finally {
      setIsImporting(false);
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
            <Button
              disabled={isImporting || projects.length === 0}
              onClick={handleImportSamples}
              type="button"
              variant="outline"
            >
              <Upload size={16} aria-hidden="true" />
              {isImporting ? "読取中" : "サンプル読取"}
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

          <div
            className="mt-6 overflow-hidden rounded-md border border-[var(--app-border)] bg-white"
            id="sources"
          >
            <div className="grid grid-cols-[1fr_120px_120px_1fr] border-b border-[var(--app-border)] bg-[var(--app-surface)] px-4 py-3 text-xs font-semibold text-[var(--app-muted)]">
              <div>資料</div>
              <div>状態</div>
              <div>Chunks</div>
              <div>出典例</div>
            </div>
            {importResults.length > 0 ? (
              importResults.map((result) => {
                const firstChunk = result.chunks[0];
                const sourceLabel =
                  firstChunk?.pageNumber != null
                    ? `page ${firstChunk.pageNumber}`
                    : firstChunk?.sheetName
                      ? `${firstChunk.sheetName} row ${firstChunk.rowStart}`
                      : firstChunk?.headingPath
                        ? firstChunk.headingPath
                        : firstChunk?.rowStart
                          ? `row ${firstChunk.rowStart}`
                          : result.error || "-";

                return (
                  <div
                    className="grid grid-cols-[1fr_120px_120px_1fr] items-center border-b border-[var(--app-border)] px-4 py-4 text-sm last:border-b-0"
                    key={result.sourceFileId}
                  >
                    <div className="font-medium">{result.fileName}</div>
                    <div>
                      <span
                        className={
                          result.status === "read"
                            ? "status-pill"
                            : "status-pill status-pill-error"
                        }
                      >
                        {result.status}
                      </span>
                    </div>
                    <div className="text-[var(--app-muted)]">{result.chunkCount}</div>
                    <div className="truncate text-[var(--app-muted)]">
                      {sourceLabel}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="px-4 py-8 text-center text-sm text-[var(--app-muted)]">
                サンプル読取を実行すると、source chunksと出典情報を確認できます。
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

export default App;
