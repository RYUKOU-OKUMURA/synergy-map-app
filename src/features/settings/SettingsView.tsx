import { ExternalLink, FolderOpen, Info, Settings, Sparkles } from "lucide-react";

import type {
  CodexConnectionAction,
  CursorConnectionAction,
} from "@/features/app/appViewTypes";
import type {
  AiProviderKind,
  AiSettings,
  CodexRuntimeInfo,
  CodexSmokeResult,
  CursorSdkSmokeResult,
  CursorSdkStatus,
  DeviceCodeLoginResult,
} from "@/lib/mvp1Types";

export function CodexConnectionCard({
  busy,
  deviceCodeResult,
  onLoginCheck,
  onOpenExternalUrl,
  onRefresh,
  onSmokeTest,
  runtimeInfo,
  smokeResult,
}: {
  busy: CodexConnectionAction | null;
  deviceCodeResult: DeviceCodeLoginResult | null;
  onLoginCheck: () => void;
  onOpenExternalUrl: (url: string) => void;
  onRefresh: () => void;
  onSmokeTest: () => void;
  runtimeInfo: CodexRuntimeInfo | null;
  smokeResult: CodexSmokeResult | null;
}) {
  const cliDetected = Boolean(runtimeInfo?.resolvedPath);
  const deviceCodeCompleted = deviceCodeResult?.completionSuccess === true;
  const loginCodeIssued = Boolean(
    deviceCodeResult?.verificationUrl &&
    !deviceCodeCompleted &&
    !deviceCodeResult?.cancelStatus,
  );
  const authenticated = (smokeResult?.authenticated ?? false) || deviceCodeCompleted;
  const hasSmokeResult = Boolean(smokeResult);
  const hasAuthSignal = hasSmokeResult || deviceCodeResult !== null;
  const authState = authenticated
    ? deviceCodeCompleted && !smokeResult?.authenticated
      ? "認証完了"
      : "接続済み"
    : loginCodeIssued
      ? "認証待ち"
      : hasAuthSignal
        ? "未接続"
        : "未確認";
  const authTone = authenticated ? "good" : hasAuthSignal ? "warn" : "neutral";

  return (
    <section className="codex-card">
      <div className="section-title">
        <Settings size={15} aria-hidden="true" />
        <span>Codex接続</span>
      </div>
      <div className="connection-status-grid">
        <ConnectionStatus
          label="Codex CLI"
          state={cliDetected ? "検出済み" : "未検出"}
          tone={cliDetected ? "good" : "warn"}
        />
        <ConnectionStatus label="ChatGPT認証" state={authState} tone={authTone} />
      </div>
      <div className="codex-detail-list">
        <span>Version: {runtimeInfo?.version ?? "-"}</span>
        <span>Mode: {authenticated ? "Codex生成" : "ローカルドラフト可"}</span>
      </div>
      {runtimeInfo?.warnings.length ? (
        <div className="codex-warning">
          <Info size={14} aria-hidden="true" />
          <span>{runtimeInfo.warnings[0]}</span>
        </div>
      ) : null}
      {deviceCodeResult?.verificationUrl ? (
        <div className="device-code-box">
          <span>認証URL</span>
          <button
            className="inline-link-button"
            onClick={() => onOpenExternalUrl(deviceCodeResult.verificationUrl ?? "")}
            type="button"
          >
            {deviceCodeResult.verificationUrl}
            <ExternalLink size={12} aria-hidden="true" />
          </button>
          <strong>{deviceCodeResult.userCode ?? ""}</strong>
        </div>
      ) : null}
      {deviceCodeResult ? (
        <div
          className={`codex-warning ${deviceCodeCompleted ? "codex-warning-good" : ""}`}
        >
          <Info size={14} aria-hidden="true" />
          <span>
            {deviceCodeCompleted
              ? "ChatGPT認証が完了しました。接続テストでCodex生成を確認できます。"
              : loginCodeIssued
                ? "認証URLを開き、表示されたコードを入力してください。完了後は接続テストで確認できます。"
                : (deviceCodeResult.errors[0] ??
                  deviceCodeResult.warnings[0] ??
                  "ChatGPT認証は未完了です。URLとコードを確認してください。")}
          </span>
        </div>
      ) : null}
      <div className="connection-actions">
        <button
          className="ghost-button"
          disabled={busy !== null}
          onClick={onRefresh}
          type="button"
        >
          <Settings size={14} aria-hidden="true" />
          {busy === "refresh" ? "確認中" : "状態確認"}
        </button>
        <button
          className="ghost-button"
          disabled={busy !== null || !cliDetected}
          onClick={onSmokeTest}
          type="button"
        >
          <Sparkles size={14} aria-hidden="true" />
          {busy === "smoke" ? "接続中" : "接続テスト"}
        </button>
        <button
          className="ghost-button"
          disabled={busy !== null || !cliDetected}
          onClick={onLoginCheck}
          type="button"
        >
          <ExternalLink size={14} aria-hidden="true" />
          {busy === "login" ? "取得中" : "認証コード取得"}
        </button>
      </div>
    </section>
  );
}

function ConnectionStatus({
  label,
  state,
  tone,
}: {
  label: string;
  state: string;
  tone: "good" | "neutral" | "warn";
}) {
  return (
    <div className={`connection-status connection-status-${tone}`}>
      <span>{label}</span>
      <strong>{state}</strong>
    </div>
  );
}

function AiProviderSettingsCard({
  busy,
  settings,
  onSave,
}: {
  busy: boolean;
  settings: AiSettings;
  onSave: (settings: AiSettings) => void;
}) {
  function updateProvider(provider: AiProviderKind) {
    onSave({ ...settings, primaryProvider: provider });
  }

  return (
    <section className="codex-card ai-provider-card">
      <div className="section-title">
        <Settings size={15} aria-hidden="true" />
        <span>AIプロバイダ</span>
      </div>
      <p className="ai-provider-copy">
        構造化AI（抽出・マップ・施策・壁打ち）のプライマリを選びます。失敗時はもう一方へ自動フォールバックできます。
      </p>
      <div
        className="ai-provider-options"
        role="radiogroup"
        aria-label="プライマリAIプロバイダ"
      >
        <label className="ai-provider-option">
          <input
            checked={settings.primaryProvider === "codex"}
            name="primary-provider"
            onChange={() => updateProvider("codex")}
            type="radio"
          />
          <span>Codex App Server</span>
        </label>
        <label className="ai-provider-option">
          <input
            checked={settings.primaryProvider === "cursor"}
            name="primary-provider"
            onChange={() => updateProvider("cursor")}
            type="radio"
          />
          <span>Composer（Cursor SDK）</span>
        </label>
      </div>
      <label className="ai-provider-fallback">
        <input
          checked={settings.fallbackEnabled}
          onChange={(event) =>
            onSave({ ...settings, fallbackEnabled: event.target.checked })
          }
          type="checkbox"
        />
        <span>失敗時に他方のプロバイダへフォールバック</span>
      </label>
      <div className="codex-detail-list">
        <span>Composer model: {settings.cursorModelId}</span>
        <span>保存: {busy ? "保存中..." : "即時反映"}</span>
      </div>
    </section>
  );
}

function ExportFolderSettingsCard({
  busy,
  defaultExportDir,
  onSelect,
}: {
  busy: boolean;
  defaultExportDir: string | null;
  onSelect: () => void;
}) {
  return (
    <section className="codex-card export-folder-card">
      <div className="section-title">
        <FolderOpen size={15} aria-hidden="true" />
        <span>既定の出力先</span>
      </div>
      <p className="ai-provider-copy">
        Markdown / CSVの保存先を日常運用用のフォルダに固定できます。
      </p>
      <div className="export-folder-path">
        {defaultExportDir ?? "未設定（アプリ内exportsへ保存）"}
      </div>
      <button className="ghost-button" disabled={busy} onClick={onSelect} type="button">
        <FolderOpen size={15} aria-hidden="true" />
        フォルダを選択
      </button>
    </section>
  );
}

export function CursorSdkConnectionCard({
  busy,
  modelId,
  onOpenExternalUrl,
  onRefresh,
  onSmokeTest,
  smokeResult,
  status,
}: {
  busy: CursorConnectionAction | null;
  modelId: string;
  onOpenExternalUrl: (url: string) => void;
  onRefresh: () => void;
  onSmokeTest: () => void;
  smokeResult: CursorSdkSmokeResult | null;
  status: CursorSdkStatus | null;
}) {
  const apiKeyConfigured = status?.apiKeyConfigured ?? false;
  const bridgeReady =
    (status?.pnpmAvailable ?? false) &&
    (status?.tsxAvailable ?? false) &&
    (status?.scriptExists ?? false);
  const connected = apiKeyConfigured && bridgeReady && (smokeResult?.ok ?? false);
  const authTone = connected ? "good" : apiKeyConfigured ? "warn" : "neutral";

  return (
    <section className="codex-card">
      <div className="section-title">
        <Settings size={15} aria-hidden="true" />
        <span>Composer接続</span>
      </div>
      <div className="connection-status-grid">
        <ConnectionStatus
          label="CURSOR_API_KEY"
          state={apiKeyConfigured ? "設定済み" : "未設定"}
          tone={apiKeyConfigured ? "good" : "warn"}
        />
        <ConnectionStatus
          label="SDK bridge"
          state={bridgeReady ? "準備OK" : "未準備"}
          tone={bridgeReady ? "good" : "warn"}
        />
        <ConnectionStatus
          label="接続テスト"
          state={
            smokeResult
              ? smokeResult.ok
                ? "成功"
                : "失敗"
              : connected
                ? "成功"
                : "未確認"
          }
          tone={authTone}
        />
      </div>
      <div className="codex-detail-list">
        <span>Model: {modelId}</span>
        <span>Mode: {connected ? "Composer生成" : "ローカルドラフト可"}</span>
        {smokeResult ? <span>Last test: {smokeResult.durationMs}ms</span> : null}
      </div>
      {!apiKeyConfigured ? (
        <div className="codex-warning">
          <Info size={14} aria-hidden="true" />
          <span>
            リポジトリ直下の <code>.env</code> に <code>CURSOR_API_KEY=...</code>{" "}
            を設定してからアプリを再起動してください。
          </span>
        </div>
      ) : null}
      <div className="connection-actions">
        <button
          className="ghost-button"
          disabled={busy === "refresh"}
          onClick={onRefresh}
          type="button"
        >
          {busy === "refresh" ? "更新中" : "状態更新"}
        </button>
        <button
          className="primary-button"
          disabled={busy === "smoke" || !apiKeyConfigured}
          onClick={onSmokeTest}
          type="button"
        >
          {busy === "smoke" ? "接続中" : "接続テスト"}
        </button>
        <button
          className="inline-link-button"
          onClick={() => onOpenExternalUrl("https://cursor.com/dashboard/integrations")}
          type="button"
        >
          APIキーを発行
          <ExternalLink size={12} aria-hidden="true" />
        </button>
      </div>
      {smokeResult && !smokeResult.ok && smokeResult.errors.length > 0 ? (
        <div className="codex-warning">
          <Info size={14} aria-hidden="true" />
          <span>{smokeResult.errors.join(" ")}</span>
        </div>
      ) : null}
    </section>
  );
}

export function SettingsView({
  aiSettings,
  aiSettingsBusy,
  codexBusy,
  codexRuntimeInfo,
  codexSmokeResult,
  cursorBusy,
  cursorSdkSmokeResult,
  cursorSdkStatus,
  deviceCodeResult,
  onOpenExternalUrl,
  onRefreshCodexRuntime,
  onRefreshCursorSdkStatus,
  onRunCodexLoginCheck,
  onRunCodexSmokeTest,
  onRunCursorSdkSmokeTest,
  onSaveAiSettings,
  onSelectDefaultExportDir,
}: {
  aiSettings: AiSettings;
  aiSettingsBusy: boolean;
  codexBusy: CodexConnectionAction | null;
  codexRuntimeInfo: CodexRuntimeInfo | null;
  codexSmokeResult: CodexSmokeResult | null;
  cursorBusy: CursorConnectionAction | null;
  cursorSdkSmokeResult: CursorSdkSmokeResult | null;
  cursorSdkStatus: CursorSdkStatus | null;
  deviceCodeResult: DeviceCodeLoginResult | null;
  onOpenExternalUrl: (url: string) => void;
  onRefreshCodexRuntime: () => void;
  onRefreshCursorSdkStatus: () => void;
  onRunCodexLoginCheck: () => void;
  onRunCodexSmokeTest: () => void;
  onRunCursorSdkSmokeTest: () => void;
  onSaveAiSettings: (settings: AiSettings) => void;
  onSelectDefaultExportDir: () => void;
}) {
  return (
    <section className="page-panel settings-panel">
      <div className="page-header">
        <div>
          <h1>設定</h1>
          <p>
            AIプロバイダ（Codex / Composer）、接続確認、フォールバックを管理します。
          </p>
        </div>
      </div>
      <div className="settings-grid">
        <AiProviderSettingsCard
          busy={aiSettingsBusy}
          onSave={onSaveAiSettings}
          settings={aiSettings}
        />
        <ExportFolderSettingsCard
          busy={aiSettingsBusy}
          defaultExportDir={aiSettings.defaultExportDir}
          onSelect={onSelectDefaultExportDir}
        />
        {aiSettings.primaryProvider === "cursor" ? (
          <CursorSdkConnectionCard
            busy={cursorBusy}
            modelId={aiSettings.cursorModelId}
            onOpenExternalUrl={onOpenExternalUrl}
            onRefresh={onRefreshCursorSdkStatus}
            onSmokeTest={onRunCursorSdkSmokeTest}
            smokeResult={cursorSdkSmokeResult}
            status={cursorSdkStatus}
          />
        ) : (
          <CodexConnectionCard
            busy={codexBusy}
            runtimeInfo={codexRuntimeInfo}
            smokeResult={codexSmokeResult}
            deviceCodeResult={deviceCodeResult}
            onLoginCheck={onRunCodexLoginCheck}
            onOpenExternalUrl={onOpenExternalUrl}
            onRefresh={onRefreshCodexRuntime}
            onSmokeTest={onRunCodexSmokeTest}
          />
        )}
        <div className="settings-detail-card">
          <div className="section-title">
            <Info size={15} aria-hidden="true" />
            <span>接続情報</span>
          </div>
          <dl>
            <dt>Codex CLI path</dt>
            <dd>{codexRuntimeInfo?.resolvedPath ?? "-"}</dd>
            <dt>real path</dt>
            <dd>{codexRuntimeInfo?.realPath ?? "-"}</dd>
            <dt>target</dt>
            <dd>{codexRuntimeInfo?.targetTriple ?? "-"}</dd>
            <dt>sidecar candidate</dt>
            <dd>{codexRuntimeInfo?.sidecarCandidateName ?? "-"}</dd>
            <dt>distribution</dt>
            <dd>{codexRuntimeInfo?.distributionDecision ?? "-"}</dd>
          </dl>
        </div>
      </div>
    </section>
  );
}
