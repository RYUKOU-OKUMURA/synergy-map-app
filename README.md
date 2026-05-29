# Synergy Map App

個人事業主・小規模会社の経営者が、自分の事業情報を材料にして、AIで売上マップと次の一手を整理するための開発プロジェクト。

## Goal

メモ、URL、SNS、商品情報、ファイルなどのマップの材料を入れると、AIが事業・商品・集客チャネル・顧客接点・財務参考情報を抽出し、商品・集客・売上の流れを1枚の売上マップと次の一手に整理する。

## MVP Scope

- MVP-1は、マップの材料入力からAI抽出カード、顧客導線の売上マップ、Markdown/CSV出力までに絞る
- 3ステップ式の生成体験を基本にする
  - マップの材料入力
  - AI抽出結果の確認
  - 売上マップ生成
- チェックリスト + ドラッグ&ドロップ / クリック選択でマップの材料を追加
- PDF、CSV、Markdown、テキスト、スプレッドシート書き出し、決算書PDFを読み込み対象にする
- 抽出カードで、事業・商品・チャネル・顧客接点・財務参考情報を確認
- MVP-1のマップは顧客導線ビューのみ
- 施策カード、確認質問、AIコメントを簡易生成
- Markdown、CSVで出力
- PDF出力はMVP-1から外し、Beta以降でレポート型テンプレートを再検討する
- AI実行履歴、出典管理、簡易スナップショットを保存

## Source Spec

本リポジトリでは、実装判断の正本を以下とする。

- [要件定義書](docs/requirements.md)
- [技術スタック](docs/tech-stack.md)
- [MVP仕様](docs/mvp-spec.md)

Obsidian Vault の構想メモは背景資料として扱う。

`/Users/ryukouokumura/Obsidian Vault/仕事/AI顧問/シナジーマップ可視化ツール構想.md`

## Requirements

- [要件定義書](docs/requirements.md)
- [技術スタック](docs/tech-stack.md)
- [MVP仕様](docs/mvp-spec.md)
- [Phase 0実装計画](docs/implementation-plan-phase-0.md)
- [MVP-1実装計画](docs/implementation-plan-mvp-1.md)
- [Beta実装計画](docs/implementation-plan-beta.md)
- [構想メモ](docs/シナジーマップ可視化ツール構想.md)
- [エージェント運用ルール](agent.md)

## Project Structure

```text
synergy-map-app/
├── docs/       # 要件、画面設計、技術メモ
├── samples/    # サンプル入力資料、生成例
├── src/        # React frontend
└── src-tauri/  # Tauri / Rust backend
```

## Development Environment

Phase 0では、MVP-1へ進む前の技術検証としてTauriデスクトップPoCを起動する。

確認日: 2026-05-16

| Tool      | Result                                     |
| --------- | ------------------------------------------ |
| Node.js   | `v24.13.0`                                 |
| pnpm      | `10.30.1`                                  |
| rustc     | `rustc 1.90.0 (1159e78c4 2025-09-14)`      |
| Cargo     | `cargo 1.90.0 (840b83a10 2025-07-30)`      |
| Codex CLI | `codex-cli 0.130.0`                        |
| Typst CLI | `typst 0.14.2`                            |

### macOS Prerequisites

Tauri v2公式Prerequisitesでは、macOS desktop開発にXcodeまたはXcode Command Line Toolsが必要とされている。

この環境では`pnpm tauri dev`が起動済みのため、Phase 0のP0-2に必要なmacOS側のTauri前提は満たしている。

Reference: [Tauri v2 Prerequisites](https://v2.tauri.app/start/prerequisites/)

### Windows Prerequisites

WindowsでPhase 0を検証する前に、以下を確認する。

- Microsoft C++ Build Toolsを入れ、`Desktop development with C++`を有効にする。
- Microsoft Edge WebView2 Runtimeを確認する。Windows 10 version 1803以降では通常インストール済み。
- RustはMSVC toolchainを使う。必要に応じて`rustup default stable-msvc`を実行する。
- MSI installerを作る場合は、VBSCRIPT optional featureの有効状態を確認する。
- Node.jsとpnpmを利用できる状態にする。

## Local Commands

```bash
pnpm install
pnpm dev
pnpm tauri dev
pnpm build
pnpm lint
pnpm format:check
(cd src-tauri && cargo test)
```

Phase 0の現時点では、`pnpm tauri dev`でSynergy Mapのデスクトップウィンドウが起動し、React画面にマップ一覧プレースホルダーが表示される。

## Local Data

Phase 0のSQLite DBはTauriのapp data directoryに保存する。

- macOS確認済み: `/Users/ryukouokumura/Library/Application Support/com.synergymap.app/synergy-map.db`
- Windows想定: `%APPDATA%\\com.synergymap.app\\synergy-map.db`

frontendにはfilesystem権限を渡さず、DB操作はTauri command経由に限定する。
