# 売上マップ可視化ツール 要件定義書

作成日: 2026-05-16

## 1. 目的

本プロジェクトは、個人事業主・小規模会社の経営者が、自分の事業、商品、集客チャネル、顧客接点、財務参考情報を整理し、売上導線や未接続の可能性を可視化するためのデスクトップアプリを開発するものである。

単なる図解ツールではなく、メモや資料などのマップの材料をもとにCodexが事業構造を読み取り、抽出カード、売上マップ、施策カード、確認質問、記録出力まで支援する実務用ツールとして設計する。

## 2. プロダクト方針

### 2.1 基本方針

- Windows / macOS 対応のデスクトップアプリとして提供する。
- MVPでは、自分の事業を自分で整理したい個人事業主・小規模会社の経営者を主役ユーザーとして開発する。
- クライアント側ログイン、共同編集、共有リンクはMVPでは提供しない。
- 外部共有や相談材料として使う場合は、Markdown、CSVのエクスポートで対応する。PDFはBeta以降で品質検証する。
- 情報ソース、メモ、マップデータはローカル保存を基本とする。
- AI機能はOpenAI APIを直接呼び出すのではなく、Codex App Serverを主軸として組み込む。
- UIとドメインロジックは将来的なWebアプリ化も見据えて分離する。

### 2.2 想定ユーザー

- 主ユーザー: 個人事業主、小規模会社の経営者、店舗オーナー
- 代表ユーザー: 奥村さん自身
- 副次ユーザー: 中小企業向けコンサルタント、AI顧問、経営支援者
- 利用環境: Windows PC中心。ただし開発者および一部ユーザーはmacOSも利用する。
- 利用シーン:
  - 自分の事業の現状整理
  - 商品、集客、顧客接点、売上の流れの見直し
  - 施策検討前の考える材料づくり
  - 月次振り返りや方向性確認
  - 必要に応じた相談材料、共有メモの作成

### 2.3 提供価値

- 複数事業やチャネルの関係性を短時間で整理できる。
- 経営者自身の頭の中にある事業間のつながりを可視化できる。
- AIの推定と事実情報を分けて確認できる。
- 未接続のシナジー候補と優先施策を発見できる。
- 自分が次に考える/動くための記録としてMarkdown / CSVをMVP-1で出力できる。PDFはBeta以降で品質検証する。

## 3. MVP-1スコープ

MVP-1は、全部入りの初回リリースではなく、最初の価値検証に必要な範囲に絞る。

MVP-1の中心価値:

> マップの材料入力 → AI抽出カード → 人間確認 → 1枚の顧客導線の売上マップ → 次に考える/動くためのMarkdown / CSV出力

MVP-1は、見やすい売上マップが出ることを最低ラインにする。そのうえで、主役ユーザーが自分の事業の詰まり、未接続の可能性、次に試す一手、追加で確認すべきことを判断できる状態をゴールにする。

### 3.1 MVP-1で実現すること

1. マップを作成、保存、再開、削除できる。
2. 自由記述メモ、PDF、CSV、Excel、Markdown、テキストファイルをマップの材料として手動投入できる。
3. 投入された材料をアプリ側で読み取り、source chunksと出典情報に分解できる。
4. AI送信前に、送信対象の情報ソース要約と範囲を確認できる。
5. Codex App Serverに分析依頼を送り、抽出結果を生成できる。
6. AI実行履歴を`ai_runs`として保存できる。
7. 事業、商品・サービス、集客チャネル、顧客接点、財務参考情報、データ資料を抽出カードとして表示できる。
8. 抽出カードの内容を人が確認、修正、確定、却下できる。
9. 顧客導線ビューの売上マップを1種類だけ表示できる。
10. ノード、線、施策、AIコメントに「確定 / 推定 / 要確認」を明示できる。
11. 考える材料、売上の流れ、詰まり、確認質問、次に試す一手を生成できる。
12. 自分が次に考える/動くための記録としてMarkdown、CSVを出力できる。
13. AI生成・人間修正ごとの簡易スナップショットを保存できる。

### 3.2 MVP-1で扱う入力

- 自由記述メモ
- PDF
- CSV
- Excel / スプレッドシート書き出し
- Markdown
- テキスト
- 決算書PDF
- 売上表
- ヒアリングメモ
- 提案資料
- 会社概要資料

メモだけでも仮説マップを作れることを必須にする。PDFはテキスト抽出できるPDFを優先する。スキャンPDF、画像OCR、HP URL、SNS URLの自動読み取りはMVP-1では対象外とし、抽出不可の場合はUI上で明示する。

### 3.3 MVP-1で扱う出力

- Markdown
- CSV

Markdown / CSVを必須出力とする。MVP-1では、出力は納品物ではなく自分が次に考える/動くための記録を優先する。PDFはTypstの日本語フォント、マップ画像埋め込み、Windows / macOS差分の追加検証が必要なため、MVP-1から外しBeta以降で扱う。ダッシュボード型PDFと複数テンプレートもMVP-1では対象外とする。

### 3.4 MVP-1対象外

- クライアントログイン
- 共同編集
- Web共有リンク
- Google Analytics / YouTube Studio / SNSインサイトの認証連携
- freee / マネーフォワード / 弥生などの会計API連携
- Google Drive / OneDrive / Dropbox保存
- Word出力
- 3Dマップ
- 高度な自由配置型の作図編集
- レイヤー型の深掘りマップ
- 本格的な施策評価ビュー
- ダッシュボード型PDF
- 複数PDFテンプレート
- バージョン差分比較
- 本格的なCodex相談チャットUI
- 常時AIが横から提案するモード
- OCR
- URL読み取り
- 完全な会計分析
- 複数人同時利用を前提にした権限管理

### 3.5 Beta以降で追加すること

- 本格的な施策評価ビュー
- レイヤー型の深掘りマップ
- レポート型PDFの品質向上
- ダッシュボード型PDF
- 名前付きバージョン保存
- バージョン差分比較
- 本格的なCodex相談チャットUI
- 会議中モード
- OCR
- HP / SNS URL読み取り
- クラウド保存、同期、共有

## 4. 主要ユースケース

### 4.1 自分の事業の材料投入

ユーザーは、自分の事業について分かっていること、違和感、商品一覧、売上表、ヒアリングメモ、決算書PDFなどをマップの材料として追加する。アプリは材料を読み取り、Codexに分析を依頼し、事業・商品・チャネル・顧客接点・財務参考情報を抽出する。

### 4.2 抽出結果の確認

ユーザーは、AIが抽出したカードを確認し、誤りや推定を修正する。確定情報、推定情報、要確認情報を分けて管理する。

### 4.3 売上マップ生成

MVP-1では、ユーザーは抽出カードをもとに顧客導線ビューの売上マップを生成する。ノードの種類、影響力、情報充実度、線の状態を視覚的に確認する。本格的な施策評価ビューはBeta以降で追加する。

### 4.4 思考中・確認中の軽い修正

考えている途中や確認中に判明した情報をもとに、ノード名、分類、線の状態、優先度、メモを軽く修正する。必要に応じてCodexに短い再分析を依頼する。
Betaでは、マップ編集モードを明示し、ノードの移動、拡大・縮小、導線の任意追加、導線の非表示を迷わず操作できるようにする。レイアウト変更は分析内容を壊さない編集として扱い、構造変更はスナップショット対象にする。

### 4.5 施策提案

Codexは、強い導線、弱い導線、詰まり、未接続シナジー候補を読み取り、次に試す一手と確認質問を生成する。ユーザーは施策カードを編集し、自分の次の行動や相談材料に反映する。

### 4.6 記録出力

ユーザーは、マップ、情報充実度、AI分析コメント、優先施策、追加確認事項をMarkdown、CSVとして出力する。MVP-1では、自分が次に考える/動くための記録を優先し、PDFはBeta以降で対応する。

### 4.7 スナップショット保存

MVP-1では、AI生成時と人間修正時に簡易スナップショットを保存する。名前付き保存と2つのバージョン間の差分比較はBeta以降で対応する。

## 5. 機能要件

### 5.1 マップ管理

- マップを新規作成できる。
- マップ名、事業名 / 屋号 / 会社名、業種、作成日、更新日、メモを保存できる。
- マップ一覧から既存マップを開ける。
- マップを削除できる。
- マップごとに情報ソース、抽出カード、マップ、施策、レポート、Codex thread IDを紐づける。

### 5.2 マップの材料投入

- 自由記述メモをマップの材料として投入できる。
- ドラッグ&ドロップで複数ファイルを投入できる。
- チェックリスト形式で不足資料を確認できる。
- 情報ソースごとに種別、ファイル名、保存場所、取り込み日時、読み取り状態を管理する。
- 読み取り状態は「未処理 / 読み取り中 / 読み取り済み / エラー / 分析待ち」とする。

### 5.3 資料読み取り

- PDFからテキストを抽出する。
- CSVから表データを抽出する。
- Excelからシート、行列、表データを抽出する。
- Markdown / テキストをそのまま読み取る。
- 読み取り結果はsource chunksとして保存する。
- source chunksには、PDFのページ番号、Excelのシート名・行列、CSVの行番号、Markdownの見出し階層など、可能な範囲で出典情報を持たせる。
- 大きい資料は、必要に応じてチャンク分割して分析に渡す。
- スキャンPDFなどテキスト抽出できない資料は「抽出不可 / OCR未対応」として明示する。

### 5.4 AI抽出

- 読み取り済み資料をCodex App Serverに渡し、構造化された抽出結果を生成する。
- 抽出対象は以下とする。
  - 事業
  - 商品・サービス
  - 集客チャネル
  - 顧客接点
  - 財務参考情報
  - データ資料
- 各抽出結果には、名前、分類、説明、情報源、確度、影響力、主観重要度、メモを持たせる。
- AI実行ごとに`ai_runs`へ入力範囲、schema version、出力、エラー、実行状態を保存する。
- AI出力はJSON SchemaまたはZod schemaで検証してから保存する。
- schemaに合わないAI出力はそのままDBに保存せず、エラーまたは再生成対象にする。
- 抽出カードと出典の紐づけは`item_sources`で管理し、1つのカードが複数資料・複数チャンクを根拠に持てるようにする。

### 5.5 抽出カード確認

- 抽出カードを一覧表示できる。
- カードを編集できる。
- 「確定 / 推定 / 要確認」を変更できる。
- 情報源を確認できる。
- 出典の引用、ページ、シート、行番号などを確認できる。
- 不要なカードを除外できる。
- 手動でカードを追加できる。
- カードの修正内容をマップ生成に反映できる。

### 5.6 売上マップ

- React Flowでマップを表示する。
- MVP-1では顧客導線ビューのみ提供する。
- 本格的な施策評価ビューはBeta以降で追加する。
- ノードの種類を視覚的に区別する。
- ノードサイズは影響力を表す。
- 色の濃さは情報充実度を表す。
- バッジで売上貢献、顧客接点強、現場重要、AI注目、財務あり、要確認を示す。
- 線は方向、強さ、状態、流れの種類を持つ。
- 線の種類は以下を扱う。
  - 強い導線
  - 弱い導線
  - 仮説導線
  - 詰まりあり
  - 接続候補
  - 未接続
- 線が表す流れは以下を扱う。
  - 顧客の流れ
  - 売上・購買の流れ
  - 認知・信頼の流れ
- MVP-1では自由作図編集ではなく、軽い修正とAI指示による再構成を優先する。
- Betaのマップ編集モードでは、ノードの移動、選択中ノードの拡大・縮小、ノード間の導線追加、既存導線の非表示をUIから操作できる。
- ノードの位置とサイズはビュー別に保存できる。顧客導線ビューはノード本体のレイアウトとして保存し、本格的な施策評価ビューはビュー専用レイアウトとして保存する。
- 導線の削除は履歴と根拠の追跡を優先し、物理削除ではなく却下状態による非表示を基本とする。

### 5.7 AIコメント

- マップ生成後、Codexが以下を生成する。
  - 現状の全体像
  - 強い導線
  - 弱い導線
  - 詰まっている導線
  - 未接続シナジー候補
  - 次に試す一手
  - 追加で確認すべきこと
- 思考中や確認中は短いコメントを優先する。
- MVP-1では、AIは答えを完成させるのではなく、ユーザーが思考・判断できる準備状態を作る。

### 5.8 施策カード

- Codexが施策カードを生成できる。
- 施策カードは以下を持つ。
  - 施策名
  - つなぐノード
  - やること
  - 期待インパクト
  - 実装コスト
  - 自分にとっての優先度
  - 必要に応じた相談相手視点の補足
  - 確認指標
  - AIの根拠
  - 確認すべき質問
- 優先度は数値スコアではなく、高 / 中 / 低 と根拠コメントで表す。
- 施策カードは編集、採用、保留、却下できる。

### 5.9 Codex連携

- マップごとにCodex threadを紐づける。
- MVP-1では、資料抽出、マップ生成、簡易施策生成のAI実行を主対象にする。
- 本格的な相談チャットUIはBeta以降で追加する。
- Codexのイベントはストリーミング表示する。
- 必要に応じて、現在のマップデータ、抽出カード、マップ、施策、情報ソース要約をCodexに渡す。
- Codexからのマップ修正提案は、ユーザー確認後に反映する。

### 5.10 スナップショット / バージョン管理

- MVP-1ではAI生成ごと、人間修正ごとに簡易スナップショットを自動保存する。
- Beta以降で名前付きバージョン保存と差分比較を追加する。
- スナップショットには以下を含める。
  - ノード
  - 線
  - 抽出カード
  - AIコメント
  - 施策カード
  - 判断根拠
  - 参照資料
  - 自分のメモ
  - 確認すべきこと
- 2つのバージョン比較と、追加、削除、変更、強化、弱体化の差分表示はBeta以降で対応する。

### 5.11 エクスポート

- Markdownを出力できる。
- CSVを出力できる。
- MVP-1ではPDFを出力しない。レポート型PDF 1テンプレートはBeta以降で扱う。
- ダッシュボード型PDFはBeta以降で対応する。
- PDFには、使用した情報ソース、情報充実度、売上マップ、AI分析コメント、優先施策、追加確認事項、次回アクションを含める。
- CSVは、ノード一覧、関係性一覧、施策候補を出力対象とする。
- Markdownは、Obsidian保存、再編集、AI再投入、自分の施策検討ログとして使いやすい構造にする。

### 5.12 AI送信履歴

- AIに送信した資料範囲、要約、schema version、実行種別、実行日時を確認できる。
- AI送信前に「全文を送る / ローカル要約だけ送る / 選択範囲だけ送る」を選べる設計にする。
- MVP-1では、まず「ローカル要約だけ送る」を既定にする。
- AI送信履歴から、どの抽出カードやマップがどの実行で生成されたか追跡できる。

## 6. 非機能要件

### 6.1 対応OS

- Windows 10 / 11
- macOS

LinuxはMVPでは動作保証対象外とする。

### 6.2 パフォーマンス

- マップ一覧、カード一覧、マップ表示はローカルDBから高速に表示する。
- 会議中の軽い編集は即時反映する。
- 重い資料読み取りとAI分析は非同期処理にする。
- 大きいファイル投入時もUIをブロックしない。

### 6.3 セキュリティ・情報管理

- 元資料は原則ローカル保存とする。
- マップデータはローカルSQLiteに保存する。
- AI分析に送信する内容は、ユーザーが明示的に追加した情報ソースとマップデータに限定する。
- AIに送信した内容、生成結果、参照情報ソースをマップ履歴に残す。
- AI送信前に、送信対象の情報ソース要約と範囲をユーザーが確認できる。
- AI送信モードは「全文を送る / ローカル要約だけ送る / 選択範囲だけ送る」を将来選べる設計にする。
- MVP-1の既定は「ローカル要約だけ送る」とする。
- マップ単位で元情報ソース、抽出結果、AI送信履歴、生成結果を削除できる。
- ログには機密本文、プロンプト全文、資料本文を原則残さない。
- エラー報告や外部ログ送信を行う場合も、機密本文を含めない。
- APIキーや認証情報はOS標準のセキュアストレージ利用を第一候補とする。
- MVPでは組織管理、権限管理、監査ログは対象外とするが、将来拡張できるよう責務を分離する。

### 6.4 可用性

- ネットワークがない場合でも、既存マップの閲覧、編集、出力は可能にする。
- Codex App ServerまたはOpenAI認証が利用できない場合は、AI分析・相談機能のみ停止する。
- AI分析失敗時も、既存データは壊さない。

### 6.5 保守性

- UI、ローカル保存、資料読み取り、Codex連携、エクスポートを明確に分離する。
- AI出力schemaをバージョン管理する。
- データモデルは将来のクラウド同期やWeb化を見据えて設計する。

## 7. 技術スタック

### 7.1 採用候補

- Desktop: Tauri
- Frontend: React + TypeScript + Vite
- UI: Tailwind CSS + shadcn/ui
- Graph UI: React Flow
- Local DB: SQLite
- Rust DB Access: rusqlite
- Frontend State: Zustand
- Async / Server State: TanStack Query
- Schema Validation: Zod または JSON Schema
- AI Integration: Codex App Server
- Codex Transport: stdio
- Export: Markdown/CSVはアプリ側生成。PDF生成はBeta以降で再検討

### 7.2 採用理由

- TauriはWindows / macOS向けの軽量デスクトップアプリに向いている。
- ReactはマップUI、カード編集、フォーム、テーブル、PDFプレビューなどの実装資産が豊富。
- React Flowはノード・エッジ型の可視化に適している。
- SQLiteはローカルファーストのマップ管理と相性がよい。
- Codex App Serverは、認証、会話履歴、承認、ストリーミングイベントをアプリに組み込む用途に合っている。
- stdio transportはCodex App Serverの安定した基本経路として扱いやすい。

### 7.3 現時点では採用しないもの

- Next.js: Webアプリ本命ではないため、MVPではViteを優先する。
- Electron: 実績はあるが、軽量性を重視してTauriを優先する。
- WebSocket transport: Codex App Server側でexperimental扱いのため、MVPではstdioを優先する。
- クラウドDB: ローカルファーストを優先するため、MVPでは使わない。

## 8. アーキテクチャ方針

### 8.1 全体構成

```text
Tauri Desktop App
├── React UI
│   ├── マップ一覧
│   ├── 材料投入
│   ├── 抽出カード
│   ├── 売上マップ
│   ├── 施策カード
│   ├── Codex相談
│   └── エクスポート
├── Tauri / Rust Backend
│   ├── ファイル保存
│   ├── 資料読み取り
│   ├── SQLite操作
│   ├── Codex App Server起動
│   ├── JSON-RPC stdio通信
│   └── PDF / CSV / Markdown出力
├── Local Storage
│   ├── SQLite DB
│   └── マップ別ファイルフォルダ
└── Codex App Server
    ├── 認証
    ├── thread / turn管理
    ├── ストリーミングイベント
    ├── 承認フロー
    └── AI分析・相談
```

### 8.2 責務分担

アプリ側の責務:

- マップ管理
- ファイル保存
- 資料読み取り
- 構造化データ保存
- schema検証
- マップ描画
- エクスポート
- ユーザー確認UI

Codex側の責務:

- 情報ソース要約をもとにした事業構造の抽出
- 未確認質問の生成
- 売上マップ案の生成
- マップの解釈
- 施策カード生成
- レポート文章生成
- 追加相談への回答

### 8.3 Codex App Server連携

- Tauri backendが`codex app-server`を子プロセスとして起動する。
- MVPではstdio transportでJSON-RPC通信する。
- 起動後、`initialize`と`initialized`を送る。
- マップ作成時、または初回AI相談時に`thread/start`する。
- 既存マップでは保存済みthread IDを使って`thread/resume`する。
- AI依頼は`turn/start`で送る。
- ストリーミングイベントをUIに反映する。
- Codexからの変更提案は、ユーザー承認後にDBへ反映する。

### 8.4 Thread設計

MVPでは、原則として1マップにつき1 Codex threadを紐づける。

理由:

- マップごとの会話履歴を追いやすい。
- マップ、施策、資料の文脈を継続しやすい。
- 会議中の追加相談を同じ流れで扱いやすい。

将来的に、重い分析やレポート生成を別threadに分ける可能性は残す。

## 9. データモデル初期案

### 9.1 主要エンティティ

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

### 9.2 projects

- id
- name
- client_name
- industry
- description
- created_at
- updated_at
- archived_at

### 9.3 source_files

- id
- project_id
- file_name
- file_type
- local_path
- status
- extracted_text_path
- metadata_json
- created_at
- updated_at

### 9.4 source_chunks

- id
- project_id
- source_file_id
- chunk_index
- content_path
- content_hash
- page_number
- sheet_name
- row_start
- row_end
- column_start
- column_end
- heading_path
- metadata_json
- created_at

### 9.5 extracted_items

- id
- project_id
- item_type
- name
- description
- confidence_status
- influence_level
- subjective_importance
- note
- created_by
- created_at
- updated_at

抽出カードは複数資料を根拠に持つため、`source_file_id`や`source_quote`を直接の正本にはしない。出典との紐づけは`item_sources`で管理する。

### 9.6 item_sources

- id
- extracted_item_id
- source_file_id
- source_chunk_id
- quote
- location_json
- confidence
- created_at

### 9.7 nodes

- id
- project_id
- extracted_item_id
- node_type
- label
- description
- influence_level
- information_richness
- confidence_status
- badges_json
- position_json
- created_at
- updated_at

### 9.8 edges

- id
- project_id
- source_node_id
- target_node_id
- edge_type
- flow_type
- strength
- direction
- confidence_status
- evidence
- note
- created_at
- updated_at

### 9.9 suggestions

- id
- project_id
- title
- connected_node_ids_json
- action
- expected_impact
- implementation_cost
- owner_priority
- consultant_priority
- metric
- rationale
- client_question
- status
- created_at
- updated_at

### 9.10 ai_runs

- id
- project_id
- codex_thread_id
- run_type
- schema_name
- schema_version
- input_hash
- model
- status
- started_at
- completed_at
- error
- request_summary_path
- response_json_path
- created_at

`ai_runs`は、どの資料範囲、どのschema、どの入力、どのCodex threadから抽出カード、マップ、施策が生成されたかを追跡するために使う。

### 9.11 versions

- id
- project_id
- name
- reason
- snapshot_json
- created_by
- created_at

MVP-1では簡易スナップショット保存に使う。Beta以降で差分比較を強化する場合、`change_events`または`version_items`の追加を検討する。

### 9.12 codex_threads

- id
- project_id
- thread_id
- purpose
- created_at
- updated_at

## 10. AI出力schema方針

Codexからの出力は、以下の単位でschema化する。

- ExtractedItemsOutput
- MapDraftOutput
- AiAnalysisOutput
- SuggestionCardsOutput
- ReportDraftOutput
- VersionComparisonOutput

AI出力には必ず以下を含める。

- schema_version
- 生成対象
- 根拠
- 確定 / 推定 / 要確認
- 参照資料
- 不足情報

AI出力はアプリ側の正本ではない。アプリ側で検証、確認、保存された構造化データを正本とする。

MVP-1で必須にするschema:

- ExtractedItemsOutput
- MapDraftOutput
- AiAnalysisOutput
- SuggestionCardsOutput

ReportDraftOutputはPDF 1テンプレート対応時に使う。VersionComparisonOutputはBeta以降で使う。

## 11. 情報充実度の扱い

「完成度」ではなく「情報充実度」と表現する。

情報充実度は以下カテゴリで表示する。

- 事業情報
- 商品・サービス情報
- 集客情報
- 顧客情報
- 財務情報
- 実績データ

情報が薄いノードや線は、薄色、点線、要確認バッジで表示する。AIの正しさを保証する表現は避ける。

## 12. 画面構成初期案

### 12.1 画面一覧

- マップ一覧
- マップホーム
- 材料投入
- AI抽出結果確認
- 売上マップ
- 施策カード一覧
- AI実行履歴
- Codex相談 Beta
- バージョン履歴 Beta
- エクスポート
- 設定

### 12.2 主要導線

1. マップ作成
2. 材料投入
3. 読み取り
4. AI抽出
5. 抽出カード確認
6. マップ生成
7. AIコメント・施策生成
8. 編集・再分析
9. エクスポート
10. スナップショット保存

## 13. 開発フェーズ案

### Phase 0: 技術ゲート

- Tauri + React + Viteの起動確認
- React Flow表示確認
- SQLite保存確認
- Codex App Serverのstdio接続確認
- ChatGPT device-code flow認証確認
- PDF / CSV / Excel / Markdown読み取りの実資料サンプル検証
- Typstの日本語PDF出力確認
- React FlowマップのSVGまたはPNG出力確認
- Codex App Serverのsidecar同梱見込み確認

Phase 0のGo条件:

1. Codex App ServerをTauri backendからstdioで安定起動できる。
2. ChatGPT device-code flowがWindowsユーザーに説明できるUXになる。
3. PDF / Excelの読み取り品質が実務最低ラインを超える。
4. React FlowのマップをPDFに埋め込める品質で画像化できる。
5. Codex App Serverを製品配布時にsidecar同梱できる見込みがある。

Phase 0で上記のいずれかが満たせない場合は、Phase 1以降に進む前に設計を見直す。

### Phase 1: ローカルマップ管理 + 材料入力/ファイル読み取り

- マップ作成
- メモ/ファイル投入
- ローカル保存
- SQLite保存
- source files保存
- source chunks生成
- 出典表示
- 読み取り結果表示

### Phase 2: AI抽出 + 抽出カード確認

- Codex thread作成
- ai_runs保存
- 材料要約の送信
- 抽出schemaの定義
- 抽出カード表示・編集
- item_sourcesによる出典紐づけ
- 確定 / 推定 / 要確認の管理

### Phase 3: 顧客導線マップ

- nodes / edges保存
- React Flow表示
- 顧客導線ビュー
- 軽い編集
- レイアウト保存
- 簡易スナップショット保存

### Phase 4: 施策カード + Markdown / CSV出力

- AIコメント生成
- 施策カード生成
- Markdown / CSV出力

### Phase 5: PDF追加 + バージョン比較

- レポート型PDF 1テンプレート
- ダッシュボード型PDF
- 本格的な施策評価ビュー
- 名前付き保存
- バージョン比較
- 差分表示

## 14. 未決定事項

- rusqlite migration runnerの具体ライブラリをどうするか。
- PDF出力をTypst sidecarで実装した場合の日本語フォント運用をどうするか。
- Excel読み取り品質が実務最低ラインを超えるか。超えない場合、Node/Python sidecarを併用するか。
- Codex認証はChatGPT device-code flowを第一候補にし、API key入力を同時に対応するか。
- Codex App Serverバイナリをアプリに同梱するか、ユーザー環境にインストールされた`codex` CLIを利用するか。
- AI分析に渡す資料量の上限とチャンク戦略。
- マップデータ暗号化をMVPで入れるか、後続対応にするか。
- AI送信前確認UIの具体設計。
- ログに残す情報と残さない情報の境界。
- 画像OCRとHP/SNS URL読み取りをいつ入れるか。

## 15. 初期決定事項

- アプリ形式はTauriデスクトップアプリとする。
- Windows / macOS対応を前提にする。
- フロントエンドはReact + TypeScript + Viteを第一候補とする。
- マップ描画はReact Flowを第一候補とする。
- データ保存はローカルSQLiteを第一候補とする。
- AI統合はCodex App Serverを主軸とする。
- Codex App Serverとの通信はMVPではstdioを第一候補とする。
- 1マップにつき1 Codex threadを基本とする。
- MVP-1のマップビューは顧客導線ビューのみとする。
- 元資料、source chunks、抽出結果、マップ、施策、スナップショットはアプリ側で管理する。
- AI実行履歴は`ai_runs`として保存する。
- 抽出カードと出典の紐づけは`item_sources`で管理する。
- Codex出力はschema検証後にDB保存する。
- MVP-1ではMarkdown / CSVを必須出力とし、PDFはBeta以降へ回す。
