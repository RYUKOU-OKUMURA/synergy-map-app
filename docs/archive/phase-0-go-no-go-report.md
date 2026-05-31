# Phase 0 Go/No-Go判断レポート

作成日: 2026-05-16

## ゴール

完成アプリではなく、技術検証済みの最小デスクトップPoC + Go/No-Go判断レポート。

## 現在の判定

条件付きGo。

P0-12までの主要リスクのうち、Codex App Server stdio接続、SQLite保存、資料読み取り、React Flow画像化、Typst日本語PDF、AI出力schema検証、情報管理・ログ方針はmacOS PoCで検証済み。device-code flowはURL/code発行とキャンセルまで確認済みだが、実ログイン完了通知は未確認。Windows実機確認は未実施。sidecar同梱は調査済みで、Phase 0 / MVP-1初期は外部CLI前提にする一次判断。

判断:

- MVP-1の設計・macOS PoC継続へ進む。
- Windows配布、実利用者検証、sidecar同梱判断はまだGoにしない。
- Windows実機確認、実ログイン完了通知、Codex CLI配布方針の再評価をMVP-1前半の必須ゲートにする。

## 検証ログ

| 項目                          | 結果     | メモ                                                                                                                                           |
| ----------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| P0-1 開発環境確認             | 完了     | Node.js / pnpm / Rust / Cargo / Codex CLI / Typst CLIは利用可能。Windows prerequisitesはREADMEへ記録。                                        |
| P0-2 Tauri + React + Vite起動 | 完了     | `pnpm tauri dev`でSynergy Mapのデスクトップウィンドウが起動。React画面に案件一覧プレースホルダーを表示。                                       |
| P0-3 SQLite保存PoC            | 部分完了 | Tauri UIからproject作成、再起動後の永続化、migration再実行の安全性を確認。migration drift検知を追加。Windows DB保存場所はP0-12で実機確認する。 |
| P0-4 資料読み取りPoC          | 完了     | PDF / Excel / UTF-8 CSV / Shift-JIS CSV / Markdown / textの合成サンプル読取を確認。スキャンPDFは`unreadable`として表示・保存。                 |
| P0-5 Codex stdio接続          | 完了     | Rustから`codex app-server --listen stdio://`を起動し、JSONLで`initialize` / `account/read` / `thread/start` / `turn/start`を実行。UIへstreaming eventを表示。 |
| P0-6 device-code flow         | 部分完了 | `account/login/start`の`chatgptDeviceCode`で`verificationUrl` / `userCode`を取得し、Tauri eventでログイン待機中にUIへ流す実装を追加。キャンセルは確認済み。認証完了通知の実受信は未確認。 |
| P0-7 sidecar検証              | 完了     | Tauri sidecar配置方式、macOS / Windows候補名、frontend shell権限、署名・更新・version追従課題を記録。現在のCodex CLIはNode scriptのため、Phase 0 / MVP-1初期は外部CLI前提。Windows実機確認はP0-12。 |
| P0-8 React Flow画像化         | 完了     | React Flowのサンプルマップ、custom node / edge、PNG出力を実装。Playwrightで`2188x840px`のPNG出力を確認。 |
| P0-9 Typst日本語PDF           | 完了     | `typst 0.14.2`で日本語本文、表、React Flow画像を含む2ページPDFを生成。macOSでは`BIZ UDGothic`で文字化けなし。Windowsフォント実機確認はP0-12。 |
| P0-10 AI出力schema検証        | 完了     | `AiAnalysisOutput`のJSON SchemaをCodex App Server `outputSchema`へ渡し、`phase0.v1`応答を確認。serde検証後だけ`ai_runs`へrequest summary / response JSON pathを保存。 |
| P0-11 情報管理・ログ方針      | 完了     | AI送信前確認UIを追加し、既定送信モードを「ローカル要約だけ送る」に固定。機密本文、source chunks本文、prompt全文を`ai_runs`履歴に保存しない方針を文書化。 |
| P0-12 macOS / Windows確認     | 部分完了 | macOS dev build、DB、材料入力、Codex接続、PDF出力を確認。Windows実機は未確認で、確認項目と残リスクを文書化。 |

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
- Node probe: `codex app-server --listen stdio://`へ`AiAnalysisOutput` JSON Schema付きturnを送り、`turn/completed`、`schemaVersion: phase0.v1`、opportunity 2件を確認。
- `cargo test`: `save_ai_run_records_paths_without_full_prompt`と`invalid_schema_output_is_rejected_before_save`を追加し、request summaryが全文promptを含まないこと、schema不一致時に`ai_runs`が増えないことを確認。
- `pnpm tauri dev`: P0-12時点の最新実装でmacOS dev build起動を再確認。
- `file reports/phase-0/phase-0-report.pdf`: PDF document, version 1.7, 2 pages。
- `file reports/phase-0/phase-0-synergy-map.png`: PNG image data, 2188 x 840。

## Go条件

| 条件                                                          | 状態   | メモ                                                                                                                                                                      |
| ------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Codex App ServerをTauri backendからstdioで安定起動できる      | 暫定Go | macOS PoCではstdio起動、JSONL request/notification、stream event、timeout/error処理、turn完了まで確認。長時間常駐・再利用はMVP-1で設計が必要。                             |
| ChatGPT device-code flowがWindowsユーザーに説明できるUXになる | 条件付き | URL/code発行、待機中表示、キャンセル、説明文は確認済み。実ログイン完了通知とWindows既定ブラウザ導線は未実機確認。                                                           |
| PDF / Excelの読み取り品質が実務最低ラインを超える             | 暫定Go | 合成サンプルではテキストPDF、表PDF、結合セルありExcel、複数シートExcelを読み取り可能。ただしExcelの結合セル範囲・セル番地・ヘッダー対応保持と実資料品質は追加検証が必要。 |
| React FlowのマップをPDFに埋め込める品質で画像化できる         | Go     | React Flowサンプルマップを固定export surfaceから`2188x840px` PNGとして出力し、Typst PDFへ埋め込み済み。 |
| Codex App Serverを製品配布時にsidecar同梱できる見込みがある   | 条件付き | Tauri sidecar機構は利用可能。ただし現在のCodex CLIはNode scriptのため、単一sidecar binaryとしての同梱は未成立。Phase 0 / MVP-1初期は外部CLI前提で進める。                 |

## 次の実装対象

## 残ゲート

- Windows実機で`pnpm tauri dev`、DB保存、材料入力、Codex接続、PDF出力を確認する。
- ChatGPT device-code flowで実ログイン完了通知を受け取り、その後のCodex turn開始を確認する。
- Codex App Serverの製品配布方針を再評価する。MVP-1初期は外部`codex` CLI前提、sidecar同梱はstandalone binaryまたはNode runtime同梱方針が決まるまで保留。
- 実クライアントに近いPDF / Excelで読み取り品質を追加確認する。

## MVP-1へ進む条件

MVP-1の開発着手は条件付きGo。理由は、主要なアプリ内技術連携がmacOS PoCで動き、未解決点はMVP-1の価値検証そのものを止めるものではないため。

ただし、Windowsユーザー配布と本番導入判断はNo-Go。上記残ゲートを通すまで、対象環境をmacOS開発PoCに限定する。
