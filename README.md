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
- 確認質問/タスクと思考メモを記録ビューで管理
- 任意タイミングで名前付き保存
- Markdown、CSVで出力し、既定出力フォルダを設定可能
- 情報ソース単体を削除し、再抽出/再生成の判断へつなげる
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
- [ドキュメント目次](docs/README.md)
- [Phase 0実装計画](docs/archive/implementation-plan-phase-0.md)
- [MVP-1実装計画](docs/plans/implementation-plan-mvp-1.md)
- [Phase 1試験運用チェックリスト](docs/plans/trial-operation-phase-1.md)
- [Beta実装計画](docs/plans/implementation-plan-beta.md)
- [構想メモ](docs/archive/シナジーマップ可視化ツール構想.md)
- [エージェント運用ルール](agent.md)

## Project Structure

```text
synergy-map-app/
├── docs/       # 正本、計画、設計、参考資料。入口は docs/README.md
├── samples/    # サンプル入力資料、生成例
├── src/        # React frontend
└── src-tauri/  # Tauri / Rust backend
```

## Development Environment

MVP-1 / Phase 1では、開発者本人がmacOS上の`pnpm tauri dev`で実事業メモを投入し、AI抽出、売上マップ、次の一手、記録、出力まで日常的に試験運用できる状態を基準にする。

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

Windowsで検証する前に、以下を確認する。Phase 1の受け入れ対象はmacOS試験運用であり、Windows通し確認、配布、署名、notarizationは対象外。

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
(cd src-tauri && cargo fmt -- --check)
(cd src-tauri && cargo test)
```

Phase 1の受け入れは`pnpm tauri dev`で行う。`pnpm dev`のブラウザ表示はUIデモ確認用。

## Local Data

MVP-1のSQLite DBとアプリ内exportsはTauriのapp data directoryに保存する。既定出力フォルダを設定した場合、Markdown / CSVはそのフォルダへ保存し、利用できない場合はアプリ内exportsへフォールバックする。

- macOS確認済み: `/Users/ryukouokumura/Library/Application Support/com.synergymap.app/synergy-map.db`
- Windows想定: `%APPDATA%\\com.synergymap.app\\synergy-map.db`

frontendにはfilesystem権限を渡さず、DB操作はTauri command経由に限定する。
