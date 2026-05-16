# Phase 0 Go/No-Go判断レポート

作成日: 2026-05-16

## ゴール

完成アプリではなく、技術検証済みの最小デスクトップPoC + Go/No-Go判断レポート。

## 現在の判定

未判定。

P0-1とP0-2の初期検証を開始した段階であり、Go条件の主要リスクであるCodex App Server stdio接続、device-code flow、資料読み取り、React Flow画像化、Typst日本語PDF、sidecar同梱は未検証。

## 検証ログ

| 項目                          | 結果     | メモ                                                                                                                                           |
| ----------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| P0-1 開発環境確認             | 部分完了 | Node.js / pnpm / Rust / Cargo / Codex CLIは利用可能。Typst CLIは未インストール。                                                               |
| P0-2 Tauri + React + Vite起動 | 完了     | `pnpm tauri dev`でSynergy Mapのデスクトップウィンドウが起動。React画面に案件一覧プレースホルダーを表示。                                       |
| P0-3 SQLite保存PoC            | 部分完了 | Tauri UIからproject作成、再起動後の永続化、migration再実行の安全性を確認。migration drift検知を追加。Windows DB保存場所はP0-12で実機確認する。 |

## 検証コマンド

2026-05-16時点:

- `pnpm format:check`: 成功
- `pnpm lint`: 成功
- `pnpm build`: 成功
- `cargo check`: 成功
- `cargo test`: 成功
- `cargo fmt -- --check`: 成功
- `pnpm tauri dev`: 成功
- Playwright `http://localhost:1420/`: Synergy Map / 案件一覧プレースホルダーの表示を確認
- Tauri UI操作: `新規案件`クリックで`Phase 0 検証案件 1`をSQLiteへ保存。アプリ再起動後も一覧に表示されることを確認。

## Go条件

| 条件                                                          | 状態   | メモ                    |
| ------------------------------------------------------------- | ------ | ----------------------- |
| Codex App ServerをTauri backendからstdioで安定起動できる      | 未検証 | P0-5で検証する。        |
| ChatGPT device-code flowがWindowsユーザーに説明できるUXになる | 未検証 | P0-6で検証する。        |
| PDF / Excelの読み取り品質が実務最低ラインを超える             | 未検証 | P0-4で検証する。        |
| React FlowのマップをPDFに埋め込める品質で画像化できる         | 未検証 | P0-8 / P0-9で検証する。 |
| Codex App Serverを製品配布時にsidecar同梱できる見込みがある   | 未検証 | P0-7で検証する。        |

## 次の実装対象

P0-3より前に、Go条件への影響が大きいP0-5 Codex App Server stdio接続とP0-6 ChatGPT device-code flowを優先して検証する。
