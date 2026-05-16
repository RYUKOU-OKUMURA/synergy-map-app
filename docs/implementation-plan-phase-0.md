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
- [ ] `typst` CLIが実行できることを確認する。
- [x] `README.md`に開発環境の前提を追記する。

補足:

- 2026-05-16確認: `node v24.13.0`、`pnpm 10.30.1`、`rustc 1.90.0`、`cargo 1.90.0`、`codex-cli 0.130.0`。
- `typst --version`は`command not found`。P0-9着手前にTypst CLIの導入が必要。
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

- [ ] `rusqlite`を導入する。
- [ ] アプリデータディレクトリにSQLite DBを作成する。
- [ ] SQL migration runnerの候補を検証する。
- [ ] 最小schemaを作る。
  - [ ] `projects`
  - [ ] `source_files`
  - [ ] `source_chunks`
  - [ ] `ai_runs`
  - [ ] `nodes`
  - [ ] `edges`
- [ ] Tauri command経由でprojectを作成・一覧取得できるようにする。
- [ ] DBファイルの保存場所をmacOS / Windowsで確認する。

完了条件:

- [ ] Tauri UIからprojectを作成できる。
- [ ] アプリ再起動後もprojectが残っている。
- [ ] migrationの再実行が安全に動く。

## P0-4 資料読み取りPoC

### サンプル準備

- [ ] 会社概要PDFサンプルを用意する。
- [ ] 決算書PDFサンプルを用意する。
- [ ] 表組みPDFサンプルを用意する。
- [ ] スキャンPDFサンプルを用意する。
- [ ] 結合セルありExcelサンプルを用意する。
- [ ] 複数シートExcelサンプルを用意する。
- [ ] 文字コード違いCSVサンプルを用意する。
- [ ] 長いヒアリングメモMarkdown / textサンプルを用意する。

### 読み取り実装

- [ ] `pdf-extract`でテキストPDFを読み取る。
- [ ] スキャンPDFを抽出不可として検出・表示できるか確認する。
- [ ] Rust `csv` crateでCSVを読み取る。
- [ ] `calamine`でExcelを読み取る。
- [ ] Markdown / textを読み取る。
- [ ] 読み取り結果をsource chunksへ変換する。
- [ ] 出典情報を保存する。
  - [ ] PDF: ページ番号
  - [ ] Excel: シート名、行列
  - [ ] CSV: 行番号
  - [ ] Markdown: 見出し階層

完了条件:

- [ ] 実資料に近いサンプルで読み取り結果を確認できる。
- [ ] 読み取り不可の資料がUI上で明確に分かる。
- [ ] source chunksに出典情報が残る。

## P0-5 Codex App Server stdio接続

- [ ] Tauri backendから`codex app-server --listen stdio://`を起動する。
- [ ] stdout / stdinのJSONL通信を扱うRustモジュールを作る。
- [ ] `initialize`を送る。
- [ ] `initialized`通知を送る。
- [ ] `account/read`で認証状態を取得する。
- [ ] `thread/start`を実行する。
- [ ] `turn/start`で短いプロンプトを送る。
- [ ] streaming eventをTauri eventでReact UIへ流す。
- [ ] プロセス終了、タイムアウト、stderr、JSON parse errorを扱う。

完了条件:

- [ ] UIからCodexへ短い依頼を送り、streaming responseを表示できる。
- [ ] 失敗時にアプリがクラッシュしない。

## P0-6 ChatGPT device-code flow

- [ ] `account/login/start`に`chatgptDeviceCode`を指定する。
- [ ] `verificationUrl`と`userCode`をUIに表示する。
- [ ] 認証完了通知を受け取る。
- [ ] 認証キャンセル・失敗時の表示を作る。
- [ ] Windowsユーザー向けの説明文を用意する。
- [ ] API key loginを補助候補として検証するか判断する。

完了条件:

- [ ] device-code flowでログインし、Codexのturnを開始できる。
- [ ] 認証手順が非エンジニアにも説明できる。

## P0-7 Codex App Server sidecar検証

- [ ] 開発中はPATH上の`codex` CLIを使う方式で動かす。
- [ ] Tauri sidecarとしてCodex App Serverを同梱できるか調査する。
- [ ] macOS / Windowsそれぞれのバイナリ配置を確認する。
- [ ] Tauri capabilitiesでshell実行範囲を制限する。
- [ ] 署名、更新、バージョン追従の課題を記録する。
- [ ] sidecar同梱が難しい場合の代替導線を決める。

完了条件:

- [ ] 製品配布時にsidecar同梱で進めるか、外部CLI前提にするかの一次判断ができている。

## P0-8 React Flowマップ画像化

- [ ] `@xyflow/react`を導入する。
- [ ] ダミーの顧客導線マップを表示する。
- [ ] custom nodeとcustom edgeを1種類ずつ作る。
- [ ] ノード位置を保存・復元する。
- [ ] マップをSVGまたはPNGとして出力する。
- [ ] PDF埋め込みに耐える解像度・余白・背景色を確認する。

完了条件:

- [ ] React FlowのサンプルマップをPDF用画像として保存できる。
- [ ] 拡大しても実務資料として見られる品質になっている。

## P0-9 Typst日本語PDF

- [ ] Typstテンプレートの最小構成を作る。
- [ ] 日本語本文をPDF出力する。
- [ ] 日本語フォントの扱いをmacOS / Windowsで確認する。
- [ ] React Flowから出力したマップ画像を埋め込む。
- [ ] レポート型PDF 1テンプレートの骨格を作る。

完了条件:

- [ ] 日本語が文字化けしないPDFを生成できる。
- [ ] マップ画像を含むPDFを生成できる。
- [ ] フォント運用方針が決まっている。

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
