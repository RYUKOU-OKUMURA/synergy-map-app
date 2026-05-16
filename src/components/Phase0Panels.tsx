import {
  CheckCircle2,
  CheckSquare,
  Database,
  Download,
  FileJson,
  FileText,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { RefObject } from "react";

import { SynergyMapFlow } from "@/components/SynergyMapFlow";
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
} from "@/lib/phase0Types";
import { StatusPill } from "@/components/StatusPill";

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

function sourceLabelFor(result: ImportSourceResult) {
  const firstChunk = result.chunks[0];

  if (firstChunk?.pageNumber != null) {
    return `page ${firstChunk.pageNumber}`;
  }

  if (firstChunk?.sheetName) {
    return `${firstChunk.sheetName} row ${firstChunk.rowStart ?? "-"}`;
  }

  if (firstChunk?.headingPath) {
    return firstChunk.headingPath;
  }

  if (firstChunk?.rowStart != null) {
    return `row ${firstChunk.rowStart}`;
  }

  return result.error || "-";
}

export function GateMetrics() {
  return (
    <div
      className="mt-6 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3"
      id="go-no-go"
    >
      {gateItems.map((item) => {
        const Icon = item.icon;

        return (
          <div className="metric-card" key={item.label}>
            <div className="flex items-center justify-between gap-3">
              <Icon className="text-[var(--app-accent)]" size={18} aria-hidden="true" />
              <span className="text-xs text-[var(--app-muted)]">{item.value}</span>
            </div>
            <div className="mt-3 text-sm font-medium">{item.label}</div>
          </div>
        );
      })}
    </div>
  );
}

export function ProjectsPanel({
  activeProject,
  onSelectProject,
  projects,
}: {
  activeProject: Project | null;
  onSelectProject: (projectId: string) => void;
  projects: Project[];
}) {
  return (
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
            <button
              className="text-left font-medium"
              onClick={() => onSelectProject(project.id)}
              type="button"
            >
              {project.name}
            </button>
            <div>
              <StatusPill
                tone={project.id === activeProject?.id ? "success" : "neutral"}
              >
                {project.id === activeProject?.id ? "選択中" : "保存済み"}
              </StatusPill>
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
  );
}

export function SourcesPanel({
  importResults,
}: {
  importResults: ImportSourceResult[];
}) {
  return (
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
          const sourceLabel = sourceLabelFor(result);

          return (
            <div
              className="grid grid-cols-[1fr_120px_120px_1fr] items-center border-b border-[var(--app-border)] px-4 py-4 text-sm last:border-b-0"
              key={result.sourceFileId}
            >
              <div className="font-medium">{result.fileName}</div>
              <div>
                <StatusPill tone={result.status === "read" ? "success" : "error"}>
                  {result.status}
                </StatusPill>
              </div>
              <div className="text-[var(--app-muted)]">{result.chunkCount}</div>
              <div className="truncate text-[var(--app-muted)]">{sourceLabel}</div>
            </div>
          );
        })
      ) : (
        <div className="px-4 py-8 text-center text-sm text-[var(--app-muted)]">
          サンプル読取を実行すると、source chunksと出典情報を確認できます。
        </div>
      )}
    </div>
  );
}

export function CodexPanel({
  codexEvents,
  codexRuntimeInfo,
  codexSmokeResult,
  deviceCodeResult,
  isCodexBusy,
  isCodexRunning,
  isDeviceChecking,
  liveDeviceCode,
  onDeviceCodeCheck,
  onSmokeTest,
  visibleUserCode,
  visibleVerificationUrl,
}: {
  codexEvents: CodexUiEvent[];
  codexRuntimeInfo: CodexRuntimeInfo | null;
  codexSmokeResult: CodexSmokeResult | null;
  deviceCodeResult: DeviceCodeLoginResult | null;
  isCodexBusy: boolean;
  isCodexRunning: boolean;
  isDeviceChecking: boolean;
  liveDeviceCode: { verificationUrl: string | null; userCode: string | null };
  onDeviceCodeCheck: () => void;
  onSmokeTest: () => void;
  visibleUserCode: string | null;
  visibleVerificationUrl: string | null;
}) {
  return (
    <div
      className="mt-6 overflow-hidden rounded-md border border-[var(--app-border)] bg-white"
      id="codex"
    >
      <div className="flex items-center justify-between gap-4 border-b border-[var(--app-border)] bg-[var(--app-surface)] px-4 py-3">
        <div>
          <div className="text-xs font-semibold text-[var(--app-muted)]">
            Codex App Server
          </div>
          <div className="mt-1 text-sm font-medium">stdio / device-code flow 検証</div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button disabled={isCodexBusy} onClick={onSmokeTest} type="button">
            <Sparkles size={16} aria-hidden="true" />
            {isCodexRunning ? "送信中" : "短い依頼を送る"}
          </Button>
          <Button
            disabled={isCodexBusy}
            onClick={onDeviceCodeCheck}
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
          <div className="text-xs font-semibold text-[var(--app-muted)]">turn結果</div>
          <div className="mt-3 flex items-center gap-2 text-sm">
            <StatusPill tone={codexSmokeResult?.ok ? "success" : "neutral"}>
              {codexSmokeResult ? (codexSmokeResult.ok ? "OK" : "要確認") : "未実行"}
            </StatusPill>
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
            <StatusPill tone={deviceCodeResult?.ok ? "success" : "neutral"}>
              {deviceCodeResult
                ? deviceCodeResult.ok
                  ? "発行確認"
                  : "要確認"
                : "未実行"}
            </StatusPill>
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

      <div className="border-t border-[var(--app-border)] px-4 py-4">
        <div className="grid grid-cols-[160px_1fr] gap-y-2 text-sm">
          <div className="text-[var(--app-muted)]">実行方式</div>
          <div className="font-medium">
            {codexRuntimeInfo?.commandStrategy ?? "確認中"}
          </div>
          <div className="text-[var(--app-muted)]">CLI</div>
          <div className="truncate">
            {codexRuntimeInfo?.version ?? "未検出"} /{" "}
            {codexRuntimeInfo?.realPath ?? codexRuntimeInfo?.resolvedPath ?? "-"}
          </div>
          <div className="text-[var(--app-muted)]">sidecar候補</div>
          <div>{codexRuntimeInfo?.sidecarCandidateName ?? "-"}</div>
          <div className="text-[var(--app-muted)]">配布判断</div>
          <div>{codexRuntimeInfo?.distributionDecision ?? "未判定"}</div>
          <div className="text-[var(--app-muted)]">shell権限</div>
          <div>{codexRuntimeInfo?.frontendShellPermissions ?? "-"}</div>
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
  );
}

export function MapPanel({
  flowExportRef,
  isExportingMap,
  mapExportInfo,
  onExportMapImage,
}: {
  flowExportRef: RefObject<HTMLDivElement | null>;
  isExportingMap: boolean;
  mapExportInfo: MapExportInfo | null;
  onExportMapImage: () => void;
}) {
  return (
    <div
      className="mt-6 overflow-hidden rounded-md border border-[var(--app-border)] bg-white"
      id="map"
    >
      <div className="flex items-center justify-between gap-4 border-b border-[var(--app-border)] bg-[var(--app-surface)] px-4 py-3">
        <div>
          <div className="text-xs font-semibold text-[var(--app-muted)]">
            React Flow
          </div>
          <div className="mt-1 text-sm font-medium">PDF埋め込み用マップ画像</div>
        </div>
        <Button disabled={isExportingMap} onClick={onExportMapImage} type="button">
          <Download size={16} aria-hidden="true" />
          {isExportingMap ? "出力中" : "PNG出力"}
        </Button>
      </div>
      <div className="p-4">
        <div ref={flowExportRef}>
          <SynergyMapFlow />
        </div>
        <div className="mt-3 grid grid-cols-[120px_1fr] gap-y-2 text-xs text-[var(--app-muted)]">
          <div>出力</div>
          <div>
            {mapExportInfo
              ? `${mapExportInfo.fileName} / ${mapExportInfo.width}x${mapExportInfo.height}px / ${mapExportInfo.bytes.toLocaleString("ja-JP")} bytes`
              : "未出力"}
          </div>
          <div>品質条件</div>
          <div>2x pixel ratio、背景色固定、余白込みのA4横向き埋め込み想定</div>
        </div>
      </div>
    </div>
  );
}

export function SchemaPanel({
  activeProject,
  isAiSendConfirmed,
  isSchemaRunning,
  onAiSendConfirmedChange,
  onAiSchemaPoc,
  schemaPocResult,
}: {
  activeProject: Project | null;
  isAiSendConfirmed: boolean;
  isSchemaRunning: boolean;
  onAiSendConfirmedChange: (confirmed: boolean) => void;
  onAiSchemaPoc: () => void;
  schemaPocResult: AiSchemaPocResult | null;
}) {
  return (
    <div
      className="mt-6 overflow-hidden rounded-md border border-[var(--app-border)] bg-white"
      id="schema"
    >
      <div className="flex items-center justify-between gap-4 border-b border-[var(--app-border)] bg-[var(--app-surface)] px-4 py-3">
        <div>
          <div className="text-xs font-semibold text-[var(--app-muted)]">
            AI Output Schema
          </div>
          <div className="mt-1 text-sm font-medium">AiAnalysisOutput / phase0.v1</div>
        </div>
        <Button
          disabled={isSchemaRunning || !activeProject || !isAiSendConfirmed}
          onClick={onAiSchemaPoc}
          type="button"
        >
          <FileJson size={16} aria-hidden="true" />
          {isSchemaRunning ? "検証中" : "schema検証"}
        </Button>
      </div>
      <div className="border-b border-[var(--app-border)] px-4 py-4">
        <label className="inline-flex items-center gap-2 text-sm font-medium">
          <input
            checked={isAiSendConfirmed}
            className="size-4 accent-[var(--app-accent)]"
            onChange={(event) => onAiSendConfirmedChange(event.target.checked)}
            type="checkbox"
          />
          <CheckSquare size={16} aria-hidden="true" />
          要約のみで送信
        </label>
        <div className="mt-3 grid grid-cols-[160px_1fr] gap-y-2 text-sm">
          <div className="text-[var(--app-muted)]">送信範囲</div>
          <div>Phase 0 sample summary</div>
          <div className="text-[var(--app-muted)]">履歴保存</div>
          <div>request summary / inputHash / response JSON path</div>
          <div className="text-[var(--app-muted)]">本文ログ</div>
          <div>保存しない</div>
        </div>
      </div>
      <div className="grid grid-cols-[160px_1fr] gap-y-2 px-4 py-4 text-sm">
        <div className="text-[var(--app-muted)]">状態</div>
        <div>
          <StatusPill tone={schemaPocResult?.ok ? "success" : "neutral"}>
            {schemaPocResult ? (schemaPocResult.ok ? "保存済み" : "要確認") : "未実行"}
          </StatusPill>
        </div>
        <div className="text-[var(--app-muted)]">ai_run</div>
        <div>{schemaPocResult?.aiRunId ?? "-"}</div>
        <div className="text-[var(--app-muted)]">summary</div>
        <div>
          {schemaPocResult?.responseSummary ?? schemaPocResult?.errors[0] ?? "-"}
        </div>
        <div className="text-[var(--app-muted)]">response</div>
        <div className="truncate">{schemaPocResult?.responseJsonPath ?? "-"}</div>
      </div>
    </div>
  );
}
