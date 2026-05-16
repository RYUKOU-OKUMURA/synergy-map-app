import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { toPng } from "html-to-image";
import {
  FileJson,
  FileText,
  FolderKanban,
  Network,
  Upload,
  Plus,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import "./App.css";
import {
  CodexPanel,
  GateMetrics,
  MapPanel,
  ProjectsPanel,
  SchemaPanel,
  SourcesPanel,
} from "@/components/Phase0Panels";
import { Button } from "@/components/ui/button";
import type {
  AiSchemaPocResult,
  CodexRuntimeInfo,
  CodexSmokeResult,
  CodexUiEvent,
  DeviceCodeLoginResult,
  ImportSourceResult,
  MapExportInfo,
  Project,
  StorageInfo,
} from "@/lib/phase0Types";

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

const PROJECT_REQUIRED_MESSAGE = "先に新規案件を作成してください。";
const CODEX_EVENT_NAME = "codex-app-server-event";
const MAX_CODEX_EVENTS = 32;
const MAP_EXPORT = {
  backgroundColor: "#f8faf6",
  fileName: "phase-0-synergy-map.png",
  pixelRatio: 2,
};

function hasTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
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
  const [codexRuntimeInfo, setCodexRuntimeInfo] = useState<CodexRuntimeInfo | null>(
    null,
  );
  const [liveDeviceCode, setLiveDeviceCode] = useState<{
    verificationUrl: string | null;
    userCode: string | null;
  }>({ verificationUrl: null, userCode: null });
  const [isExportingMap, setIsExportingMap] = useState(false);
  const [mapExportInfo, setMapExportInfo] = useState<MapExportInfo | null>(null);
  const [isSchemaRunning, setIsSchemaRunning] = useState(false);
  const [schemaPocResult, setSchemaPocResult] = useState<AiSchemaPocResult | null>(
    null,
  );
  const [isAiSendConfirmed, setIsAiSendConfirmed] = useState(false);
  const flowExportRef = useRef<HTMLDivElement | null>(null);
  const isTauriRuntime = hasTauriRuntime();

  async function loadProjects() {
    if (!isTauriRuntime) {
      return;
    }

    const [projectRows, storage] = await Promise.all([
      invoke<Project[]>("list_projects"),
      invoke<StorageInfo>("get_storage_info"),
    ]);

    setProjects(projectRows);
    setSelectedProjectId((currentProjectId) =>
      currentProjectId && projectRows.some((project) => project.id === currentProjectId)
        ? currentProjectId
        : (projectRows[0]?.id ?? null),
    );
    setStorageInfo(storage);
  }

  async function handleCreateProject() {
    setIsCreating(true);
    setError(null);

    try {
      const project = await invoke<Project>("create_project", {
        name: `Phase 0 検証案件 ${projects.length + 1}`,
      });
      setSelectedProjectId(project.id);
      await loadProjects();
    } catch (caughtError) {
      setError(String(caughtError));
    } finally {
      setIsCreating(false);
    }
  }

  async function handleImportSamples() {
    if (!activeProject) {
      setError(PROJECT_REQUIRED_MESSAGE);
      return;
    }

    setIsImporting(true);
    setError(null);

    try {
      const results = [];

      for (const sampleFileName of sampleFiles) {
        const result = await invoke<ImportSourceResult>("import_sample_source", {
          projectId: activeProject.id,
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

  async function handleExportMapImage() {
    const exportElement = flowExportRef.current;

    if (!exportElement) {
      setError("マップの描画対象が見つかりません。");
      return;
    }

    setIsExportingMap(true);
    setError(null);

    try {
      const dataUrl = await toPng(exportElement, {
        backgroundColor: MAP_EXPORT.backgroundColor,
        cacheBust: true,
        pixelRatio: MAP_EXPORT.pixelRatio,
      });
      const link = document.createElement("a");

      link.href = dataUrl;
      link.download = MAP_EXPORT.fileName;
      link.click();

      const base64 = dataUrl.split(",")[1] ?? "";
      setMapExportInfo({
        fileName: MAP_EXPORT.fileName,
        width: Math.round(exportElement.offsetWidth * MAP_EXPORT.pixelRatio),
        height: Math.round(exportElement.offsetHeight * MAP_EXPORT.pixelRatio),
        bytes: Math.round((base64.length * 3) / 4),
      });
    } catch (caughtError) {
      setError(String(caughtError));
    } finally {
      setIsExportingMap(false);
    }
  }

  async function handleAiSchemaPoc() {
    if (!activeProject) {
      setError(PROJECT_REQUIRED_MESSAGE);
      return;
    }

    setIsSchemaRunning(true);
    setError(null);
    setSchemaPocResult(null);

    try {
      const result = await invoke<AiSchemaPocResult>("run_ai_schema_poc", {
        projectId: activeProject.id,
      });
      setSchemaPocResult(result);
    } catch (caughtError) {
      setError(String(caughtError));
    } finally {
      setIsSchemaRunning(false);
    }
  }

  useEffect(() => {
    let isMounted = true;

    async function loadInitialProjects() {
      if (!isTauriRuntime) {
        return;
      }

      try {
        const [projectRows, storage, runtimeInfo] = await Promise.all([
          invoke<Project[]>("list_projects"),
          invoke<StorageInfo>("get_storage_info"),
          invoke<CodexRuntimeInfo>("get_codex_runtime_info"),
        ]);

        if (!isMounted) {
          return;
        }

        setProjects(projectRows);
        setSelectedProjectId((currentProjectId) =>
          currentProjectId &&
          projectRows.some((project) => project.id === currentProjectId)
            ? currentProjectId
            : (projectRows[0]?.id ?? null),
        );
        setStorageInfo(storage);
        setCodexRuntimeInfo(runtimeInfo);
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
  }, [isTauriRuntime]);

  useEffect(() => {
    if (!isTauriRuntime) {
      return;
    }

    const unlisten = listen<CodexUiEvent>(CODEX_EVENT_NAME, (event) => {
      setCodexEvents((currentEvents) => [
        ...currentEvents.slice(1 - MAX_CODEX_EVENTS),
        event.payload,
      ]);
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
  }, [isTauriRuntime]);

  const isCodexBusy = !isTauriRuntime || isCodexRunning || isDeviceChecking;
  const visibleVerificationUrl =
    deviceCodeResult?.verificationUrl ?? liveDeviceCode.verificationUrl;
  const visibleUserCode = deviceCodeResult?.userCode ?? liveDeviceCode.userCode;
  const activeProject =
    projects.find((project) => project.id === selectedProjectId) ?? projects[0] ?? null;

  return (
    <main className="min-h-screen bg-[var(--app-bg)] text-[var(--app-fg)]">
      <div className="grid min-h-screen grid-cols-[248px_minmax(0,1fr)]">
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
            <a className="nav-item" href="#map">
              <Network size={16} aria-hidden="true" />
              マップ出力
            </a>
            <a className="nav-item" href="#schema">
              <FileJson size={16} aria-hidden="true" />
              Schema検証
            </a>
          </nav>
        </aside>

        <section className="min-w-0 px-8 py-6">
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
              <Button
                disabled={isCreating || !isTauriRuntime}
                onClick={handleCreateProject}
                type="button"
              >
                <Plus size={16} aria-hidden="true" />
                {isCreating ? "作成中" : "新規案件"}
              </Button>
              <Button
                disabled={isImporting || !activeProject}
                onClick={handleImportSamples}
                type="button"
                variant="outline"
              >
                <Upload size={16} aria-hidden="true" />
                {isImporting ? "読取中" : "サンプル読取"}
              </Button>
            </div>
          </header>

          <GateMetrics />

          {error ? <div className="mt-4 error-banner">{error}</div> : null}

          <ProjectsPanel
            activeProject={activeProject}
            onSelectProject={setSelectedProjectId}
            projects={projects}
          />

          <div className="mt-4 text-xs leading-5 text-[var(--app-muted)]">
            SQLite DB: {storageInfo?.dbPath ?? "確認中"}
          </div>

          <SourcesPanel importResults={importResults} />

          <CodexPanel
            codexEvents={codexEvents}
            codexRuntimeInfo={codexRuntimeInfo}
            codexSmokeResult={codexSmokeResult}
            deviceCodeResult={deviceCodeResult}
            isCodexBusy={isCodexBusy}
            isCodexRunning={isCodexRunning}
            isDeviceChecking={isDeviceChecking}
            liveDeviceCode={liveDeviceCode}
            onDeviceCodeCheck={handleDeviceCodeCheck}
            onSmokeTest={handleCodexSmokeTest}
            visibleUserCode={visibleUserCode}
            visibleVerificationUrl={visibleVerificationUrl}
          />

          <MapPanel
            flowExportRef={flowExportRef}
            isExportingMap={isExportingMap}
            mapExportInfo={mapExportInfo}
            onExportMapImage={handleExportMapImage}
          />

          <SchemaPanel
            activeProject={activeProject}
            isAiSendConfirmed={isAiSendConfirmed}
            isSchemaRunning={isSchemaRunning}
            onAiSchemaPoc={handleAiSchemaPoc}
            onAiSendConfirmedChange={setIsAiSendConfirmed}
            schemaPocResult={schemaPocResult}
          />
        </section>
      </div>
    </main>
  );
}

export default App;
