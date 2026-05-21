# Cursor SDK（Composer）統合

作成日: 2026-05-21

Tauri デスクトップ版で、構造化 AI 呼び出しに Codex App Server に加えて Cursor SDK（Composer）を使えるようにした運用メモ。

## 概要

- 対象: 抽出、マップ生成、施策生成、壁打ちなど **構造化 JSON 出力** の AI 呼び出しすべて
- 既定: Codex（`app-settings.json` の `primaryProvider: "codex"`）
- 切替: 設定画面で **Codex / Composer** を選択
- フォールバック: 失敗時に他方プロバイダへ自動切替（ON/OFF 可）

## API キー（個人利用）

アプリは API キーを **DB や設定 UI に保存しません**（[phase-0-information-policy.md](phase-0-information-policy.md) 準拠）。起動時に次の `.env` を読み込み、環境変数として使います（既にシェルで設定済みの値は上書きしません）。

| 場所 | 用途 |
|------|------|
| リポジトリ直下 `.env` | `pnpm tauri dev` 向け（おすすめ） |
| `~/Library/Application Support/com.synergymap.app/.env` | ビルド版 `.app` 向け |

セットアップ:

```bash
cp .env.example .env
# .env を編集して CURSOR_API_KEY=... を記入
pnpm tauri dev
```

キー発行: [Cursor Dashboard → Integrations](https://cursor.com/dashboard/integrations)

`export` は不要（`.env` があれば自動読み込み）。シェルで先に `export` している場合はそちらが優先されます。

## 設定ファイル

`~/Library/Application Support/com.synergymap.app/app-settings.json`（macOS）

```json
{
  "primaryProvider": "codex",
  "fallbackEnabled": true,
  "cursorModelId": "composer-2.5"
}
```

## 接続確認

1. 設定 → AIプロバイダで Composer を選択
2. 「接続テスト」でスモーク実行
3. マップ画面で抽出 → マップ生成を実行
4. 履歴の `ai_runs` request summary に `providerUsed` / `durationMs` が記録される

## ベンチ（開発用）

Codex との速度比較:

```bash
export CURSOR_API_KEY="..."
pnpm bench:ai-provider
```

Tauri 上のマップ生成と `durationMs` を並べて比較する。

## 課金

Composer 利用は Cursor Pro の利用枠から消費される。IDE / Cloud Agents と同様。

確認: [利用ダッシュボード](https://cursor.com/dashboard/usage)

## 実装メモ

- Rust は `@cursor/sdk` を直接呼ばず、`scripts/cursor-structured-turn.mts` を子プロセス起動
- v1 は 1 リクエスト = 1 子プロセス（Codex の app-server 起動と parity）
- 将来: 常駐 Agent セッションで起動コスト削減（v2）
