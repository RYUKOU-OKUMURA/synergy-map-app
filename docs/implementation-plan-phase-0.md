# Phase 0 実装計画: 技術ゲート

作成日: 2026-05-16

## 目的

Phase 0はプロダクト機能を作り込むフェーズではなく、MVP-1に進んでよいかを判定するための技術ゲートである。

ゴール:

完成アプリではなく、技術検証済みの最小デスクトップPoC + Go/No-Go判断レポート。

判定対象:

- Tauri + React + Viteの基本構成
- SQLite保存
- Codex App Server stdio接続
- ChatGPT device-code flow
- PDF / CSV / Excel / Markdown読み取り
- React Flowマップ画像化
- Typst日本語PDF
- Codex App Server sidecar同梱見込み
- Windows / macOS dev build

## Go条件

- [ ] Codex App ServerをTauri backendからstdioで安定起動できる。
- [ ] ChatGPT device-code flowがWindowsユーザーに説明できるUXになる。
- [ ] PDF / Excelの読み取り品質が実務最低ラインを超える。
- [ ] React FlowのマップをPDFに埋め込める品質で画像化できる。
- [ ] Codex App Serverを製品配布時にsidecar同梱できる見込みがある。

上記のいずれかを満たせない場合は、MVP-1へ進む前に設計を見直す。

## P0-1 開発環境確認

- [x] Node.js / pnpm / Rust stable / Cargo が利用できることを確認する。
- [x] Tauri v2 prerequisitesをmacOSで確認する。
- [x] Windows側で必要なTauri prerequisitesを洗い出す。
- [x] `codex` CLIがPATH上で実行できることを確認する。
- [x] `typst` CLIが実行できることを確認する。
- [x] `README.md`に開発環境の前提を追記する。

補足:

- 2026-05-16確認: `node v24.13.0`、`pnpm 10.30.1`、`rustc 1.90.0`、`cargo 1.90.0`、`codex-cli 0.130.0`、`typst 0.14.2`。
- P0-9着手時にHomebrewでTypst CLIを導入した。
- Windows prerequisitesはTauri v2公式Prerequisitesを参照し、Microsoft C++ Build Tools、WebView2 Runtime、MSVC Rust toolchain、MSI向けVBSCRIPT optional featureをREADMEへ記録した。

完了条件:

- [x] `node --version`、`pnpm --version`、`rustc --version`、`cargo --version`、`codex --version`、`typst --version`の確認結果を記録している。

## P0-2 Tauri + React + Vite起動

- [x] Tauri + React + TypeScript + Viteの初期プロジェクトを作成する。
- [x] pnpm scriptsを整理する。
- [x] Tauri dev serverを起動できるようにする。
- [x] 最小のアプリシェルを表示する。
- [x] shadcn/ui、Tailwind CSS、lucide-reactを導入する。
- [x] TypeScript strict、ESLint、Prettierの方針を決める。

完了条件:

- [x] `pnpm tauri dev`でデスクトップウィンドウが起動する。
- [x] React画面に案件一覧のプレースホルダーが表示される。

## P0-3 SQLite保存PoC

- [x] `rusqlite`を導入する。
- [x] アプリデータディレクトリにSQLite DBを作成する。
- [x] SQL migration runnerの候補を検証する。
- [x] 最小schemaを作る。
  - [x] `projects`
  - [x] `source_files`
  - [x] `source_chunks`
  - [x] `ai_runs`
  - [x] `nodes`
  - [x] `edges`
- [x] Tauri command経由でprojectを作成・一覧取得できるようにする。
- [ ] DBファイルの保存場所をmacOS / Windowsで確認する。

補足:

- SQL migration files + Rust runnerで`_migrations`を管理する方式を採用。
- 適用済みmigrationは変更せず、新しいschema変更は次versionのmigrationを追加する。version/name/checksumの不一致はdriftとして起動時にエラーにする。
- macOS DB保存場所は`/Users/ryukouokumura/Library/Application Support/com.synergymap.app/synergy-map.db`で確認済み。
- Windows保存場所はTauri app data directory方針として`%APPDATA%\\com.synergymap.app\\synergy-map.db`を想定。実機確認はP0-12で行う。
- `extracted_items` / `item_sources`はP0-10のAI出力schema検証またはMVP-1実装で追加migrationとして扱う。

完了条件:

- [x] Tauri UIからprojectを作成できる。
- [x] アプリ再起動後もprojectが残っている。
- [x] migrationの再実行が安全に動く。

## P0-4 資料読み取りPoC

### サンプル準備

- [x] 会社概要PDFサンプルを用意する。
- [x] 決算書PDFサンプルを用意する。
- [x] 表組みPDFサンプルを用意する。
- [x] スキャンPDFサンプルを用意する。
- [x] 結合セルありExcelサンプルを用意する。
- [x] 複数シートExcelサンプルを用意する。
- [x] 文字コード違いCSVサンプルを用意する。
- [x] 長いヒアリングメモMarkdown / textサンプルを用意する。

### 読み取り実装

- [x] `pdf-extract`でテキストPDFを読み取る。
- [x] スキャンPDFを抽出不可として検出・表示できるか確認する。
- [x] Rust `csv` crateでCSVを読み取る。
- [x] `calamine`でExcelを読み取る。
- [x] Markdown / textを読み取る。
- [x] 読み取り結果をsource chunksへ変換する。
- [x] 出典情報を保存する。
  - [x] PDF: ページ番号
  - [x] Excel: シート名、行列
  - [x] CSV: 行番号
  - [x] Markdown: 見出し階層

補足:

- `samples/phase-0/`に合成サンプルを作成。実クライアント資料は使わない。
- Tauri UIの`サンプル読取`から9ファイルを読み込み、`source_files`は`read` 8件、`unreadable` 1件、`source_chunks`は142件保存されることを確認。
- スキャンPDFサンプルは画像のみPDFとして作成し、OCR未対応の`unreadable`として扱う。
- Excelはシート名・行・列範囲を保存する最小検証。結合セル範囲、セル番地、ヘッダー対応の保持はMVP-1前の追加検証対象。

完了条件:

- [x] 実資料に近いサンプルで読み取り結果を確認できる。
- [x] 読み取り不可の資料がUI上で明確に分かる。
- [x] source chunksに出典情報が残る。

## P0-5 Codex App Server stdio接続

- [x] Tauri backendから`codex app-server --listen stdio://`を起動する。
- [x] stdout / stdinのJSONL通信を扱うRustモジュールを作る。
- [x] `initialize`を送る。
- [x] `initialized`通知を送る。
- [x] `account/read`で認証状態を取得する。
- [x] `thread/start`を実行する。
- [x] `turn/start`で短いプロンプトを送る。
- [x] streaming eventをTauri eventでReact UIへ流す。
- [x] プロセス終了、タイムアウト、stderr、JSON parse errorを扱う。

検証結果:

- `src-tauri/src/codex_app_server.rs`でJSONL request / notification / stream eventを実装。
- `run_codex_smoke_test` Tauri commandから`initialize`、`initialized`、`account/read`、`thread/start`、`turn/start`を順に実行。
- macOS Tauri UIの`短い依頼を送る`ボタンで`Reply with exactly: OK`を送信し、`item/agentMessage/delta`経由で`OK`を表示。
- timeout、stderr収集、JSON parse error、process killを実装。失敗時はUIの`要確認`状態とerrorsへ集約し、アプリをクラッシュさせない。

完了条件:

- [x] UIからCodexへ短い依頼を送り、streaming responseを表示できる。
- [x] 失敗時にアプリがクラッシュしない。

## P0-6 ChatGPT device-code flow

- [x] `account/login/start`に`chatgptDeviceCode`を指定する。
- [x] `verificationUrl`と`userCode`をUIに表示する。
- [ ] 認証完了通知を受け取る。
- [x] 認証キャンセル・失敗時の表示を作る。
- [ ] Windowsユーザー向けの説明文を用意する。
- [x] API key loginを補助候補として検証するか判断する。

検証結果:

- `run_codex_device_code_check` Tauri commandで`account/login/start`の`chatgptDeviceCode`を実行し、`verificationUrl` / `userCode` / `loginId`を取得。
- UIの`ログイン手順確認`ボタンでdevice-code発行を確認。発行直後にTauri eventで`verificationUrl` / `userCode`をReactへ流し、ログイン待機中にも表示できる実装に修正。
- 検証では30秒待機後に`account/login/cancel`を実行し、`canceled`を表示。timeoutはエラーではなく「認証完了通知未受信」のwarningとして扱う。
- `account/login/completed`通知の受信処理は実装済み。ただし今回の自動検証ではユーザー操作で認証完了していないため、成功通知の実受信は未確認。
- API key loginはPhase 0では補助候補にしない。非エンジニア向け配布ではChatGPT device-codeを主導線にする方が説明しやすく、API key管理の漏えい・失効・課金境界リスクが大きい。

完了条件:

- [ ] device-code flowでログインし、Codexのturnを開始できる。
- [ ] 認証手順が非エンジニアにも説明できる。

## P0-7 Codex App Server sidecar検証

- [x] 開発中はPATH上の`codex` CLIを使う方式で動かす。
- [x] Tauri sidecarとしてCodex App Serverを同梱できるか調査する。
- [x] macOS / Windowsそれぞれのsidecar候補ファイル名を調査する。
- [x] frontendへshell実行権限を付与しない方針を確認する。
- [x] 署名、更新、バージョン追従の課題を記録する。
- [x] sidecar同梱が難しい場合の代替導線を決める。

検証結果:

- 現在の実装はRust backendから`codex app-server --listen stdio://`を固定引数で起動する。frontendにはshell plugin権限を付与しない。Tauri capabilitiesはfrontend権限の制御であり、Rust backendの`Command`実行を制限するものではない。
- `get_codex_runtime_info` Tauri commandを追加し、PATH上の`codex`、実体パス、version、host target triple、sidecar候補名、配布判断をUIに表示。
- 現在の`codex`は`@openai/codex` npm packageのNode scriptであり、自己完結した単一sidecar binaryではない。
- Tauri v2 sidecarは`bundle.externalBin`とtarget triple付きファイル名で同梱可能。ただしCodex CLIを同梱するにはNode runtimeまたはstandalone binary方針が必要。
- Windows npm shim候補として`codex.exe` / `codex.cmd` / `codex.bat`をPATH探索対象に含める。
- 詳細は`docs/phase-0-sidecar-verification.md`に記録。

完了条件:

- [x] 製品配布時にsidecar同梱で進めるか、外部CLI前提にするかの一次判断ができている。

一次判断:

- Phase 0 / MVP-1初期は外部`codex` CLI前提で進める。
- sidecar同梱は、Codex CLIのstandalone binaryまたはNode runtime込み同梱設計が確定するまで保留。

## P0-8 React Flowマップ画像化

- [x] `@xyflow/react`を導入する。
- [x] ダミーの顧客導線マップを表示する。
- [x] custom nodeとcustom edgeを1種類ずつ作る。
- [x] ノード位置を保存・復元する。
- [x] マップをSVGまたはPNGとして出力する。
- [x] PDF埋め込み検証に進める固定解像度・余白・背景色を確認する。

検証結果:

- `src/components/SynergyMapFlow.tsx`にReact Flowのサンプルマップを追加。
- custom node `journey`とcustom edge `labeled`を追加。
- Phase 0では固定サンプル位置をコード上の`nodes`配列で保存し、再描画時に復元する。
- `html-to-image`でPNG出力を実装。Playwright上で`PNG出力`を実行し、download成果物を確認。
- export surfaceは`1094x420px`固定、2x pixel ratioで`2188x840px`のPNGを生成。背景色固定、余白込み。
- 検証用成果物としてPlaywright downloadを`reports/phase-0/phase-0-synergy-map.png`へ保存。アプリ本体はユーザーのdownload先へ保存する。

完了条件:

- [x] React FlowのサンプルマップをPDF用画像として保存できる。
- [x] PNG単体では拡大しても実務資料として見られる品質になっている。

## P0-9 Typst日本語PDF

- [x] Typstテンプレートの最小構成を作る。
- [x] 日本語本文をPDF出力する。
- [x] 日本語フォントの扱いをmacOSで確認し、Windows方針を決める。
- [x] React Flowから出力したマップ画像を埋め込む。
- [x] レポート型PDF 1テンプレートの骨格を作る。

検証結果:

- Homebrewで`typst 0.14.2`を導入。
- `reports/phase-0/phase-0-report.typ`を作成し、`reports/phase-0/phase-0-report.pdf`を生成。
- 日本語フォントはmacOS上の`BIZ UDGothic`を明示指定し、Typst出力PNGで文字化けがないことを確認。
- React Flow出力の`reports/phase-0/phase-0-synergy-map.png`をPDF 1ページ目へ埋め込み。
- `typst compile --format png --ppi 144`でPDF各ページをPNG化し、2ページ構成、マップ画像、日本語本文、表、フォント方針を確認。
- PDFは再生成可能な成果物としてgit管理しない。テンプレートとマップPNGを管理し、必要時に`typst compile reports/phase-0/phase-0-report.typ reports/phase-0/phase-0-report.pdf`で生成する。
- WindowsではBIZ UD系フォントの利用可能性をP0-12実機で確認する。未搭載環境には同梱フォントまたは代替フォント指定を用意する方針。

完了条件:

- [x] 日本語が文字化けしないPDFを生成できる。
- [x] マップ画像を含むPDFを生成できる。
- [x] フォント運用方針が決まっている。

## P0-10 AI出力schema検証

- [ ] MVP-1で必要なschemaを仮定義する。
  - [ ] `ExtractedItemsOutput`
  - [ ] `MapDraftOutput`
  - [ ] `AiAnalysisOutput`
  - [ ] `SuggestionCardsOutput`
- [ ] `schema_version`を必須にする。
- [ ] Codexにschema付き出力を依頼する。
- [ ] Rust側でserde deserializeする。
- [ ] 不正な出力を保存しない処理を作る。
- [ ] `ai_runs`にrequest summaryとresponse JSONの保存パスを記録する。

完了条件:

- [ ] Codex出力をschema検証してDB保存できる。
- [ ] schema不一致時に再生成またはエラー表示へ回せる。

## P0-11 情報管理・ログ方針

- [ ] AI送信前確認UIの最小案を作る。
- [ ] MVP-1の既定送信モードを「要約だけ送る」にする。
- [ ] ログに資料本文・プロンプト全文を残さない方針を実装メモに落とす。
- [ ] 案件削除時に元資料、source chunks、ai_runs、exportsを削除する方針を決める。
- [ ] 認証情報保存にOS keychainを使うか、Tauri Strongholdを使うか判断する。

完了条件:

- [ ] 機密本文をログに残さない設計方針が明文化されている。
- [ ] AI送信履歴に残す情報と残さない情報が決まっている。

## P0-12 Windows / macOS確認

- [ ] macOSでdev buildを起動する。
- [ ] macOSでファイル投入、DB保存、Codex接続、PDF出力を確認する。
- [ ] Windowsでdev buildを起動する。
- [ ] Windowsでファイル投入、DB保存、Codex接続、PDF出力を確認する。
- [ ] Windows固有のパス、フォント、権限、sidecar起動問題を記録する。

完了条件:

- [ ] macOS / Windowsの両方でPhase 0 PoCが動く。

## Phase 0完了判定

- [ ] Go条件をすべて満たした。
- [ ] 満たせなかった条件と代替案を記録した。
- [ ] MVP-1に進むか、設計を見直すか判断した。
- [ ] Phase 0の結果を`docs/tech-stack.md`または別レポートへ反映した。
