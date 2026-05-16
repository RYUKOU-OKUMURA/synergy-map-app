# Synergy Map App

コンサル前の事業整理、資料読み取り、AIによるシナジーマップ生成、優先施策の整理を行うための開発プロジェクト。

## Goal

資料を入れるだけで、AIが事業・商品・集客チャネル・顧客接点・財務参考情報を抽出し、コンサル現場で使えるシナジーマップと施策カードを生成する。

## MVP Scope

- MVP-1は、資料投入からAI抽出カード、顧客導線マップ、Markdown/CSV出力までに絞る
- 3ステップ式の生成体験を基本にする
  - 資料投入
  - AI抽出結果の確認
  - シナジーマップ生成
- チェックリスト + ドラッグ&ドロップで資料を投入
- PDF、CSV、Markdown、テキスト、スプレッドシート書き出し、決算書PDFを読み込み対象にする
- 抽出カードで、事業・商品・チャネル・顧客接点・財務参考情報を確認
- MVP-1のマップは顧客導線ビューのみ
- 施策カード、確認質問、AIコメントを簡易生成
- Markdown、CSVで出力
- PDFはレポート型1テンプレートのみ検証後に対応
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
| Typst CLI | 未インストール: `typst: command not found` |

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
```

Phase 0の現時点では、`pnpm tauri dev`でSynergy Mapのデスクトップウィンドウが起動し、React画面に案件一覧プレースホルダーが表示される。
