import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
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
    value: "P0-5/P0-6",
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

type CodexUiEvent = {
  kind: string;
  label: string;
  detail: string | null;
  verificationUrl: string | null;
  userCode: string | null;
};

type CodexSmokeResult = {
  ok: boolean;
  userAgent: string | null;
  platformOs: string | null;
  authenticated: boolean;
  accountType: string | null;
  requiresOpenaiAuth: boolean;
  threadId: string | null;
  turnId: string | null;
  assistantText: string;
  events: CodexUiEvent[];
  stderr: string[];
  errors: string[];
};

type DeviceCodeLoginResult = {
  ok: boolean;
  loginId: string | null;
  verificationUrl: string | null;
  userCode: string | null;
  completionSuccess: boolean | null;
  cancelStatus: string | null;
  events: CodexUiEvent[];
  stderr: string[];
  errors: string[];
  warnings: string[];
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
  const [isCodexRunning, setIsCodexRunning] = useState(false);
  const [isDeviceChecking, setIsDeviceChecking] = useState(false);
  const [codexEvents, setCodexEvents] = useState<CodexUiEvent[]>([]);
  const [codexSmokeResult, setCodexSmokeResult] = useState<CodexSmokeResult | null>(
    null,
  );
  const [deviceCodeResult, setDeviceCodeResult] =
    useState<DeviceCodeLoginResult | null>(null);
  const [liveDeviceCode, setLiveDeviceCode] = useState<{
    verificationUrl: string | null;
    userCode: string | null;
  }>({ verificationUrl: null, userCode: null });

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

  async function handleCodexSmokeTest() {
    setIsCodexRunning(true);
    setError(null);
    setCodexEvents([]);
    setCodexSmokeResult(null);
    setLiveDeviceCode({ verificationUrl: null, userCode: null });

    try {
      const result = await invoke<CodexSmokeResult>("run_codex_smoke_test");
      setCodexSmokeResult(result);
    } catch (caughtError) {
      setError(String(caughtError));
    } finally {
      setIsCodexRunning(false);
    }
  }

  async function handleDeviceCodeCheck() {
    setIsDeviceChecking(true);
    setError(null);
    setCodexEvents([]);
    setDeviceCodeResult(null);
    setLiveDeviceCode({ verificationUrl: null, userCode: null });

    try {
      const result = await invoke<DeviceCodeLoginResult>("run_codex_device_code_check");
      setDeviceCodeResult(result);
    } catch (caughtError) {
      setError(String(caughtError));
    } finally {
      setIsDeviceChecking(false);
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

  useEffect(() => {
    const unlisten = listen<CodexUiEvent>("codex-app-server-event", (event) => {
      setCodexEvents((currentEvents) => [...currentEvents.slice(-31), event.payload]);
      if (event.payload.verificationUrl || event.payload.userCode) {
        setLiveDeviceCode({
          verificationUrl: event.payload.verificationUrl,
          userCode: event.payload.userCode,
        });
      }
    });

    return () => {
      void unlisten.then((dispose) => {
        dispose();
      });
    };
  }, []);

  const isCodexBusy = isCodexRunning || isDeviceChecking;
  const visibleVerificationUrl =
    deviceCodeResult?.verificationUrl ?? liveDeviceCode.verificationUrl;
  const visibleUserCode = deviceCodeResult?.userCode ?? liveDeviceCode.userCode;

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
            <a className="nav-item" href="#codex">
              <Sparkles size={16} aria-hidden="true" />
              Codex接続
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
            <div className="flex flex-wrap justify-end gap-2">
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
            </div>
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

          <div
            className="mt-6 overflow-hidden rounded-md border border-[var(--app-border)] bg-white"
            id="codex"
          >
            <div className="flex items-center justify-between gap-4 border-b border-[var(--app-border)] bg-[var(--app-surface)] px-4 py-3">
              <div>
                <div className="text-xs font-semibold text-[var(--app-muted)]">
                  Codex App Server
                </div>
                <div className="mt-1 text-sm font-medium">
                  stdio / device-code flow 検証
                </div>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  disabled={isCodexBusy}
                  onClick={handleCodexSmokeTest}
                  type="button"
                >
                  <Sparkles size={16} aria-hidden="true" />
                  {isCodexRunning ? "送信中" : "短い依頼を送る"}
                </Button>
                <Button
                  disabled={isCodexBusy}
                  onClick={handleDeviceCodeCheck}
                  type="button"
                  variant="outline"
                >
                  <ShieldCheck size={16} aria-hidden="true" />
                  {isDeviceChecking ? "確認中" : "ログイン手順確認"}
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-[1fr_1fr] gap-0 border-b border-[var(--app-border)]">
              <div className="border-r border-[var(--app-border)] px-4 py-4">
                <div className="text-xs font-semibold text-[var(--app-muted)]">
                  turn結果
                </div>
                <div className="mt-3 flex items-center gap-2 text-sm">
                  <span
                    className={
                      codexSmokeResult?.ok
                        ? "status-pill"
                        : "status-pill status-pill-neutral"
                    }
                  >
                    {codexSmokeResult
                      ? codexSmokeResult.ok
                        ? "OK"
                        : "要確認"
                      : "未実行"}
                  </span>
                  <span className="text-[var(--app-muted)]">
                    {codexSmokeResult?.accountType ?? "account未確認"}
                  </span>
                </div>
                <div className="mt-3 text-sm font-medium">
                  {codexSmokeResult?.assistantText || "-"}
                </div>
                <div className="mt-2 truncate text-xs text-[var(--app-muted)]">
                  {codexSmokeResult?.errors[0] ??
                    codexSmokeResult?.userAgent ??
                    "userAgent未取得"}
                </div>
              </div>

              <div className="px-4 py-4">
                <div className="text-xs font-semibold text-[var(--app-muted)]">
                  device-code
                </div>
                <div className="mt-3 flex items-center gap-2 text-sm">
                  <span
                    className={
                      deviceCodeResult?.ok
                        ? "status-pill"
                        : "status-pill status-pill-neutral"
                    }
                  >
                    {deviceCodeResult
                      ? deviceCodeResult.ok
                        ? "発行確認"
                        : "要確認"
                      : "未実行"}
                  </span>
                  <span className="text-[var(--app-muted)]">
                    {deviceCodeResult?.cancelStatus
                      ? `cancel: ${deviceCodeResult.cancelStatus}`
                      : deviceCodeResult?.completionSuccess === true
                        ? "login completed"
                        : "待機なし"}
                  </span>
                </div>
                <div className="mt-3 text-sm font-medium">{visibleUserCode ?? "-"}</div>
                {visibleVerificationUrl ? (
                  <a
                    className="mt-2 block truncate text-xs font-medium text-[var(--app-accent)]"
                    href={visibleVerificationUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {visibleVerificationUrl}
                  </a>
                ) : (
                  <div className="mt-2 text-xs text-[var(--app-muted)]">
                    verificationUrl未取得
                  </div>
                )}
                <div className="mt-2 truncate text-xs text-[var(--app-muted)]">
                  {deviceCodeResult?.errors[0] ??
                    deviceCodeResult?.warnings[0] ??
                    (liveDeviceCode.userCode
                      ? "ブラウザでURLを開き、コードを入力できます。"
                      : "")}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-[160px_1fr_1fr] border-b border-[var(--app-border)] bg-[var(--app-surface)] px-4 py-3 text-xs font-semibold text-[var(--app-muted)]">
              <div>種別</div>
              <div>イベント</div>
              <div>詳細</div>
            </div>
            {codexEvents.length > 0 ? (
              codexEvents.map((event, index) => (
                <div
                  className="grid grid-cols-[160px_1fr_1fr] items-center border-b border-[var(--app-border)] px-4 py-3 text-sm last:border-b-0"
                  key={`${event.kind}-${event.label}-${index}`}
                >
                  <div className="text-[var(--app-muted)]">{event.kind}</div>
                  <div className="font-medium">{event.label}</div>
                  <div className="truncate text-[var(--app-muted)]">
                    {event.userCode ?? event.detail ?? "-"}
                  </div>
                </div>
              ))
            ) : (
              <div className="px-4 py-8 text-center text-sm text-[var(--app-muted)]">
                検証ボタンを実行するとJSONL通信イベントがここに流れます。
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

export default App;
