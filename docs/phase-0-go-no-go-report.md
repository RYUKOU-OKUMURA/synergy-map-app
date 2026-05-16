# Phase 0 Go/No-Go判断レポート

作成日: 2026-05-16

## ゴール

完成アプリではなく、技術検証済みの最小デスクトップPoC + Go/No-Go判断レポート。

## 現在の判定

未判定。

P0-9までの主要リスクのうち、Codex App Server stdio接続、SQLite保存、資料読み取り、React Flow画像化、Typst日本語PDFはmacOS PoCで検証済み。device-code flowはURL/code発行とキャンセルまで確認済みだが、実ログイン完了通知は未確認。sidecar同梱は調査済みで、Phase 0 / MVP-1初期は外部CLI前提にする一次判断。

## 検証ログ

| 項目                          | 結果     | メモ                                                                                                                                           |
| ----------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| P0-1 開発環境確認             | 部分完了 | Node.js / pnpm / Rust / Cargo / Codex CLIは利用可能。Typst CLIは未インストール。                                                               |
| P0-2 Tauri + React + Vite起動 | 完了     | `pnpm tauri dev`でSynergy Mapのデスクトップウィンドウが起動。React画面に案件一覧プレースホルダーを表示。                                       |
| P0-3 SQLite保存PoC            | 部分完了 | Tauri UIからproject作成、再起動後の永続化、migration再実行の安全性を確認。migration drift検知を追加。Windows DB保存場所はP0-12で実機確認する。 |
| P0-4 資料読み取りPoC          | 完了     | PDF / Excel / UTF-8 CSV / Shift-JIS CSV / Markdown / textの合成サンプル読取を確認。スキャンPDFは`unreadable`として表示・保存。                 |
| P0-5 Codex stdio接続          | 完了     | Rustから`codex app-server --listen stdio://`を起動し、JSONLで`initialize` / `account/read` / `thread/start` / `turn/start`を実行。UIへstreaming eventを表示。 |
| P0-6 device-code flow         | 部分完了 | `account/login/start`の`chatgptDeviceCode`で`verificationUrl` / `userCode`を取得し、Tauri eventでログイン待機中にUIへ流す実装を追加。キャンセルは確認済み。認証完了通知の実受信は未確認。 |
| P0-7 sidecar検証              | 完了     | Tauri sidecar配置方式、macOS / Windows候補名、frontend shell権限、署名・更新・version追従課題を記録。現在のCodex CLIはNode scriptのため、Phase 0 / MVP-1初期は外部CLI前提。Windows実機確認はP0-12。 |
| P0-8 React Flow画像化         | 完了     | React Flowのサンプルマップ、custom node / edge、PNG出力を実装。Playwrightで`2188x840px`のPNG出力を確認。 |
| P0-9 Typst日本語PDF           | 完了     | `typst 0.14.2`で日本語本文、表、React Flow画像を含む2ページPDFを生成。macOSでは`BIZ UDGothic`で文字化けなし。Windowsフォント実機確認はP0-12。 |

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
- Tauri UI操作: `サンプル読取`で9ファイルを読み込み、`source_files`は`read` 8件、`unreadable` 1件、`source_chunks`は142件保存されることを確認。
- Tauri UI操作: `短い依頼を送る`でCodex App Serverへ`Reply with exactly: OK`を送信し、`item/agentMessage/delta`として`OK`を表示することを確認。
- Tauri UI操作: `ログイン手順確認`でdevice-codeの発行を確認し、30秒待機後の`account/login/cancel`で`canceled`表示を確認。レビュー後、待機中にも`verificationUrl` / `userCode`を表示できるようTauri event payloadを追加。
- `which codex`: `/Users/ryukouokumura/.nvm/versions/node/v24.13.0/bin/codex`
- `codex --version`: `codex-cli 0.130.0`
- `@openai/codex` package確認: version `0.130.0`、license `Apache-2.0`、bin `bin/codex.js`、node engine `>=16`
- Playwright `http://localhost:1420/`: React Flowマップが非blankで表示され、5ノードの位置とテキストを確認。
- Playwright UI操作: `PNG出力`で`phase-0-synergy-map.png`を生成。画像サイズは`2188x840px`、成果物は`reports/phase-0/phase-0-synergy-map.png`。
- `brew install typst`: `typst 0.14.2`を導入。
- `typst compile reports/phase-0/phase-0-report.typ reports/phase-0/phase-0-report.pdf`: 成功。
- `typst compile --format png --ppi 144 reports/phase-0/phase-0-report.typ /tmp/phase-0-report-{n}.png`: 2ページをPNG化し、日本語本文とマップ画像を目視確認。

## Go条件

| 条件                                                          | 状態   | メモ                                                                                                                                                                      |
| ------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Codex App ServerをTauri backendからstdioで安定起動できる      | 暫定Go | macOS PoCではstdio起動、JSONL request/notification、stream event、timeout/error処理、turn完了まで確認。長時間常駐・再利用はMVP-1で設計が必要。                             |
| ChatGPT device-code flowがWindowsユーザーに説明できるUXになる | 条件付き | URL/code発行とキャンセルは確認。待機中のURL/code表示は実装済み。実ログイン完了通知、Windowsブラウザ導線、非エンジニア向け説明文はP0-6/P0-12残タスク。                                                   |
| PDF / Excelの読み取り品質が実務最低ラインを超える             | 暫定Go | 合成サンプルではテキストPDF、表PDF、結合セルありExcel、複数シートExcelを読み取り可能。ただしExcelの結合セル範囲・セル番地・ヘッダー対応保持と実資料品質は追加検証が必要。 |
| React FlowのマップをPDFに埋め込める品質で画像化できる         | Go     | React Flowサンプルマップを固定export surfaceから`2188x840px` PNGとして出力し、Typst PDFへ埋め込み済み。 |
| Codex App Serverを製品配布時にsidecar同梱できる見込みがある   | 条件付き | Tauri sidecar機構は利用可能。ただし現在のCodex CLIはNode scriptのため、単一sidecar binaryとしての同梱は未成立。Phase 0 / MVP-1初期は外部CLI前提で進める。                 |

## 次の実装対象

P0-10 AI出力schema検証、P0-11 情報管理・ログ方針、P0-12 macOS / Windows確認を優先する。
