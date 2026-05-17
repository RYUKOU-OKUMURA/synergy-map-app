# シナジーマップ可視化ツール 技術スタック

作成日: 2026-05-16

## 1. 技術方針

MVPは、Windows / macOS対応の軽量デスクトップアプリとして開発する。アプリ本体はTauri、UIはReact、ローカル処理はRust、AI統合はCodex App Serverを主軸にする。

基本方針:

- ローカルファーストで設計する。
- 元資料、案件データ、抽出結果、マップ、施策、バージョンはアプリ側で管理する。
- Codex App ServerはAI分析、会話、認証、thread / turn、ストリーミングイベントを担当する。
- UI資産は将来的にWeb化しやすいよう、React + TypeScriptで作る。
- デスクトップ固有処理、ファイル処理、DB処理、Codexプロセス管理はRust側に寄せる。
- なるべくChromium同梱やNode sidecarに依存しない。

## 2. 採用スタック一覧

| 領域 | 採用技術 | 採用度 | 理由 |
| --- | --- | --- | --- |
| Desktop shell | Tauri v2 | 決定 | 軽量、Windows/macOS対応、Rust backendを使える |
| Frontend | React + TypeScript | 決定 | 複雑な業務UI、カード、フォーム、マップUIに強い |
| Build | Vite | 決定 | Tauriとの相性がよく、Next.jsより軽い |
| Package manager | pnpm | 決定 | 依存管理が速く、Tauri公式テンプレートでも選択しやすい |
| Styling | Tailwind CSS | 決定 | 業務UIを高速に組める |
| UI Components | shadcn/ui | 決定 | ソースをアプリ内に持てるため、業務UI向けに調整しやすい |
| Icons | lucide-react | 決定 | shadcn/uiと相性がよく、業務ツールのアイコンに使いやすい |
| Graph UI | React Flow / @xyflow/react | 決定 | ノード・エッジ型の編集、表示、イベント処理に向いている |
| Local DB | SQLite | 決定 | ローカルファーストの案件管理に向いている |
| Rust DB access | rusqlite | 一次決定 | 単一ユーザーのローカルSQLiteではシンプルで扱いやすい |
| Migration | SQL migration files + Rust runner | 一次決定 | DB schemaを明示管理する |
| Frontend state | Zustand | 一次決定 | UI状態、選択中ビュー、編集途中状態を軽く扱える |
| Async state | TanStack Query | 一次決定 | Tauri command経由の読み込み、再取得、状態管理に向く |
| Form | React Hook Form | 一次決定 | 抽出カードや施策カードの編集に向く |
| Validation | Zod + Rust serde validation | 一次決定 | UI入力とAI出力の両方を検証する |
| Type sharing | serde + ts-rs | 候補 | Rust側の型からTypeScript型を生成する |
| AI integration | Codex App Server | 決定 | Codexの認証、会話履歴、承認、ストリーミングを組み込める |
| Codex transport | stdio JSONL | 決定 | Codex App Serverの基本transportとして安定している |
| PDF export | Typst sidecar | 一次決定 | 軽量でテンプレート化しやすく、レポートPDF生成に向く |
| CSV parse/export | Rust csv crate | 一次決定 | CSV読み書きの標準的なRust crate |
| Excel parse | calamine | 一次決定 | Excel / OpenDocument spreadsheet読み取りに向く |
| PDF text parse | pdf-extract | 検証候補 | テキストPDFの抽出から始める |
| Test frontend | Vitest + Testing Library | 一次決定 | Reactコンポーネントとロジックの単体テスト |
| Test integration | Playwright | 候補 | Vite上のUI確認、将来のE2E |
| Test Rust | cargo test + clippy + rustfmt | 決定 | Rust標準の検証導線 |

## 3. フロントエンド

### 3.1 採用

- React
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui
- lucide-react
- React Flow (`@xyflow/react`)
- Zustand
- TanStack Query
- React Hook Form
- Zod

### 3.2 役割

React UIは以下を担当する。

- 案件一覧
- 資料投入画面
- 抽出カード確認
- シナジーマップ表示
- 施策カード編集
- AI実行履歴
- Codex相談UI Beta以降
- バージョン比較 Beta以降
- エクスポート設定

業務ツールとして使うため、画面はランディングページ風にせず、初回起動後すぐに案件一覧または案件作成画面を表示する。

### 3.3 React Flow方針

パッケージは`@xyflow/react`を使う。

MVP-1で使うReact Flow機能:

- custom node
- custom edge
- node selection
- edge selection
- fit view
- minimap
- controls
- background
- viewport保存
- ノード位置保存

MVP-1では顧客導線ビューのみを対象にし、高度な自由作図ツールにはしない。ノード名、分類、線の状態、優先度などの軽い編集をUIで行い、構造変更はAI提案とユーザー確認で進める。
Betaのマップ編集モードではReact Flowのドラッグ、NodeResizer、onConnectを使い、明示的に編集モードへ入ったときだけノード移動、ノードサイズ変更、導線追加を許可する。導線削除は物理削除ではなく`adoption_status = rejected`による非表示を基本とし、履歴・AI根拠との整合を保つ。

## 4. デスクトップ / Rust Backend

### 4.1 採用

- Tauri v2
- Rust stable
- Tauri command
- Tauri event
- tauri-plugin-dialog
- tauri-plugin-shell
- tauri-plugin-opener
- tauri-plugin-single-instance
- tauri-plugin-window-state
- rusqlite
- serde / serde_json
- uuid
- time または chrono

### 4.2 Rust backendの責務

- ファイル選択、ドラッグ&ドロップ後の保存
- 案件フォルダ管理
- SQLite読み書き
- DB migration
- PDF / CSV / Excel / Markdown / text読み取り
- Codex App Serverプロセス起動
- Codex App Serverとのstdio JSON-RPC通信
- CodexイベントのReact UIへの転送
- Typst sidecarによるPDF生成
- Markdown / CSV出力
- OSごとのパス、権限、アプリデータフォルダ管理

### 4.3 Tauri command設計

Reactから直接DBやファイルシステムを触らせず、Tauri commandを通す。

例:

- `create_project`
- `list_projects`
- `get_project`
- `delete_project`
- `import_source_files`
- `read_source_file`
- `list_source_chunks`
- `start_codex_thread`
- `resume_codex_thread`
- `start_ai_extraction`
- `list_ai_runs`
- `save_extracted_item`
- `save_item_source`
- `generate_map`
- `save_map_layout`
- `generate_report`
- `export_markdown`
- `export_csv`

Tauri capabilitiesは最小限にし、frontendに広いfilesystem権限やshell権限を渡さない。

## 5. データ保存

### 5.1 採用

- SQLite
- アプリ専用データディレクトリ
- 案件別ファイルフォルダ
- SQL migration

### 5.2 保存方針

SQLiteには軽い構造化データを保存する。

- projects
- source_files
- source_chunks
- extracted_items
- item_sources
- nodes
- edges
- suggestions
- ai_comments
- ai_runs
- versions
- codex_threads
- export_jobs

元資料や抽出済みテキストはファイルとして保存し、SQLiteにはパス、メタデータ、ハッシュ、状態を保存する。

想定ディレクトリ:

```text
app-data/
├── synergy-map.db
├── projects/
│   └── {project_id}/
│       ├── sources/
│       ├── extracted/
│       ├── exports/
│       └── snapshots/
└── logs/
```

### 5.3 rusqliteを第一候補にする理由

- MVPは単一ユーザーのローカルSQLite利用である。
- Rust backendをDBの正本にしたい。
- frontendから任意SQLを実行する設計にしたくない。
- Tauri SQL pluginは便利だが、frontend SQLに寄りやすいためMVPの主経路にはしない。
- sqlxは強力だが、ローカルSQLite中心のMVPではrusqliteの単純さを優先する。

将来、クラウド同期やPostgreSQL対応が必要になった段階で、DB access層を見直す。

## 6. AI / Codex App Server

### 6.1 採用

- Codex App Server
- stdio transport
- JSON-RPC 2.0風メッセージ
- thread / turn
- account auth endpoints

### 6.2 起動方式

MVP開発中は、ユーザー環境にインストールされた`codex` CLIを利用する。

```text
codex app-server --listen stdio://
```

製品配布時は、Codex App ServerをTauri sidecarとして同梱できるか検証する。

理由:

- WindowsユーザーにCLIインストールを要求すると導入ハードルが上がる。
- ただし、同梱にはOS別バイナリ、署名、更新、ライセンス、Codex側の更新追従が絡む。
- そのため、Phase 0ではPATH上の`codex` CLIを利用し、Phase 1以降でsidecar同梱を検証する。

### 6.3 通信方式

MVPではstdioを使う。

- Tauri backendがCodex App Serverを子プロセスとして起動する。
- stdinにJSONLでrequestを書き込む。
- stdoutからJSONLでresponse / notificationを読み取る。
- React UIにはTauri eventでCodexイベントを流す。
- WebSocket transportはMVPでは使わない。

理由:

- Codex App ServerのWebSocket transportはexperimental / unsupported扱いである。
- ローカルデスクトップ統合ではstdioのほうがシンプルで安全。

### 6.4 認証

第一候補:

- ChatGPT device-code flow

補助候補:

- ChatGPT browser flow
- API key login

Windowsユーザー向けには、device-code flowが一番わかりやすい。アプリ内に認証コードとURLを表示し、ブラウザで認証してもらう。

### 6.5 Thread設計

MVPでは、1案件につき1 Codex threadを基本にする。

保存するもの:

- project_id
- codex_thread_id
- purpose
- created_at
- updated_at

重いレポート生成や別視点分析を分けたくなった場合は、後から`purpose`ごとに複数threadへ拡張する。

### 6.6 AI出力検証

Codexの出力はそのままDBに保存しない。

処理順:

1. CodexからJSON形式の分析結果を受け取る。
2. Rust側でserde deserializeする。
3. 必須項目、enum、参照ID、confidence_statusを検証する。
4. 不正な場合は保存せず、再生成またはユーザー確認に回す。
5. 正常な場合のみSQLiteに保存する。

## 7. 資料読み取り

### 7.1 対応形式

MVP-1:

- PDF
- CSV
- Excel / xlsx
- Markdown
- text

後続:

- 画像OCR
- HP URL
- SNS URL
- Google Drive / OneDrive / Dropbox

### 7.2 採用候補

| 入力 | 技術 | 方針 |
| --- | --- | --- |
| PDF | pdf-extract | まずテキストPDFの抽出に使う |
| CSV | csv crate | Serde対応で読み書きする |
| Excel | calamine | xlsx / odsの読み取りに使う |
| Markdown | pulldown-cmark または plain text | MVP-1では構造化しすぎず本文として扱う |
| Text | std fs + encoding検出 | UTF-8を基本にする |

PDFについては、テキストPDFとスキャンPDFを分ける。MVP-1ではOCRを対象外にし、スキャンPDFは「テキスト抽出不可 / OCR未対応」として扱う。

## 8. PDF / Markdown / CSV出力

### 8.1 PDF

第一候補はTypst sidecar。

MVP-1ではMarkdown / CSVを必須出力とし、PDFはPhase 0の検証を通過した場合にレポート型1テンプレートだけを対象にする。ダッシュボード型PDF、複数テンプレート、精密な印刷調整はBeta以降で扱う。

処理案:

1. React FlowのマップをSVGまたはPNGとして書き出す。
2. Rust backendがレポート用データJSONを作る。
3. Typstテンプレートにデータを渡す。
4. `typst compile`でPDFを生成する。
5. 生成PDFを案件の`exports/`に保存する。

Typstを選ぶ理由:

- PDF生成専用の表現力がある。
- テンプレート管理しやすい。
- ヘッドレスChromiumを同梱しなくてよい。
- 提案書、診断レポート、ダッシュボードPDFと相性がよい。

検証ポイント:

- 日本語フォントの同梱またはOSフォント利用
- Windows / macOSでのフォント差
- マップ画像の解像度
- PDF/Aやアクセシビリティ要件の必要性

### 8.2 Markdown

Rust backendでMarkdown文字列を生成する。

用途:

- Obsidian保存
- AI再投入
- 手直し
- 提案文の下書き

### 8.3 CSV

Rust backendでCSVを書き出す。

出力対象:

- ノード一覧
- 関係性一覧
- 施策カード一覧
- 資料一覧

## 9. セキュリティ方針

### 9.1 ローカルファースト

- 元資料はローカル保存する。
- アプリが明示的に選択されたファイルのみ取り込む。
- Codexへ送る内容は、ユーザーが投入した資料と案件データに限定する。
- AIへ送信した資料要約と生成結果は案件履歴に残す。

### 9.2 Tauri permissions

- frontendに広いfilesystem権限を与えない。
- shell権限はCodex App ServerとTypst sidecarに限定する。
- sidecar引数はcapabilitiesで制限する。
- 外部URLをWebView内で無制限に開かない。
- 認証URLはOSブラウザで開く。

### 9.3 秘密情報

CodexのChatGPT認証はCodex App Server側のaccount endpointsに寄せる。

アプリ独自の秘密情報が必要になった場合は、以下を検討する。

- OS keychain
- Tauri Stronghold plugin

MVPでは、独自のクラウド認証や組織管理は扱わない。

## 10. テスト / 品質管理

### 10.1 Frontend

- TypeScript strict
- ESLint
- Prettier
- Vitest
- Testing Library

テスト対象:

- schema validation
- utility
- form behavior
- card編集
- map data変換

### 10.2 Rust

- cargo fmt
- cargo clippy
- cargo test

テスト対象:

- DB migration
- repository layer
- file import
- CSV / Excel / PDF parsing
- Codex JSON-RPC parser
- export generation

### 10.3 UI確認

- Vite dev server上でPlaywright確認
- Tauri統合E2EはPhase 1以降に検証

## 11. 開発環境

### 11.1 必要ツール

- Node.js: Vite要件を満たすバージョン
- pnpm
- Rust stable
- Tauri prerequisites
- codex CLI
- typst CLI

### 11.2 初期セットアップ案

```bash
pnpm create tauri-app
pnpm install
pnpm tauri dev
```

作成時の選択:

- frontend language: TypeScript
- package manager: pnpm
- UI template: React
- UI flavor: TypeScript

## 12. 採用しないもの

### 12.1 Electron

採用しない理由:

- Chromium同梱によりアプリサイズが大きくなりやすい。
- 今回は軽量デスクトップアプリが重要。
- Rust backendを自然に使えるTauriのほうが今回の要件に合う。

### 12.2 Next.js

MVPでは採用しない。

理由:

- Webアプリ本命ではなく、Tauriデスクトップが本命。
- SSRやルーティングサーバーの価値がMVPでは小さい。
- Vite + Reactのほうが構成が軽い。

将来Web/SaaS化する場合は、React UI部品とドメイン型を再利用し、Next.jsまたは別のWeb構成へ移行する。

### 12.3 Tauri SQL plugin

MVP主経路では採用しない。

理由:

- frontendからSQLを直接扱う設計に寄りやすい。
- DB書き込みルール、schema検証、AI出力検証をRust backendに集約したい。

### 12.4 Codex App Server WebSocket transport

MVPでは採用しない。

理由:

- 公式ドキュメント上でexperimental / unsupported扱いである。
- ローカルデスクトップアプリではstdioで十分。

## 13. 未決定・検証事項

### 優先度高

- Codex App Serverを製品版でsidecar同梱できるか。
- Codex App ServerのWindows配布、署名、更新方式。
- ChatGPT device-code flowのUX。
- AI送信前確認UIの具体設計。
- rusqlite migration runnerの具体ライブラリ。
- Typstの日本語フォント運用。
- PDF抽出ライブラリの精度。
- Excel読み取り品質。
- React FlowマップのSVG / PNG出力品質。
- ログに機密本文を残さない設計。

### 優先度中

- `ts-rs`でRust型からTypeScript型を生成するか。
- schemaをRust起点にするか、JSON Schema起点にするか。
- PlaywrightでどこまでTauri画面を検証するか。
- アプリデータ暗号化をMVPに入れるか。
- 認証情報保存にOS keychainを使うか、Tauri Strongholdを使うか。

### 優先度低

- Tauri updater。
- クラウド同期。
- OAuth外部サービス連携。
- OCR。
- Web版への展開。

## 14. Phase 0 技術ゲート

1. Tauri + React + Viteでアプリを起動できる。
2. React Flowでノード・エッジを表示できる。
3. SQLiteにproject / source_file / source_chunk / ai_run / node / edgeを保存できる。
4. PDF、CSV、Excel、Markdownを実資料に近いサンプルで読み取れる。
5. Tauri backendから`codex app-server --listen stdio://`を起動できる。
6. `initialize`、`thread/start`、`turn/start`を送信できる。
7. Codexのstreaming eventをUIに表示できる。
8. Codex出力をschema versionつきで構造化し、Rust側で検証してDBに保存できる。
9. React Flowのマップを画像化してTypst PDFに埋め込める。
10. Windows / macOSの両方でdev buildを起動できる。

Phase 0のGo条件:

1. Codex App ServerをTauri backendからstdioで安定起動できる。
2. ChatGPT device-code flowがWindowsユーザーに説明できるUXになる。
3. PDF / Excelの読み取り品質が実務最低ラインを超える。
4. React FlowのマップをPDFに埋め込める品質で画像化できる。
5. Codex App Serverを製品配布時にsidecar同梱できる見込みがある。

いずれかを満たせない場合は、Phase 1へ進む前に設計を見直す。

## 15. 参考資料

- Tauri: https://tauri.app/start/
- Tauri Vite integration: https://v2.tauri.app/start/frontend/vite/
- Tauri sidecar: https://v2.tauri.app/develop/sidecar/
- Tauri SQL plugin: https://v2.tauri.app/plugin/sql/
- Vite: https://vite.dev/guide/
- React Flow: https://reactflow.dev/learn
- shadcn/ui with Vite: https://ui.shadcn.com/docs/installation/vite
- Codex App Server: https://developers.openai.com/codex/app-server
- Typst PDF: https://typst.app/docs/reference/pdf/
- Rust csv crate: https://docs.rs/csv/latest/csv/
- calamine: https://docs.rs/calamine/latest/calamine/
- pdf-extract: https://docs.rs/pdf-extract/latest/pdf_extract/
