# MVP-1 実装計画

作成日: 2026-05-16

## 目的

MVP-1では、最小の業務価値を一気通貫で実装する。

中心価値:

> マップの材料入力 → AI抽出カード → 人間確認 → 1枚の顧客導線の売上マップ → 次に考える/動くためのMarkdown / CSV出力

MVP-1は、見やすい売上マップが出ることを最低ラインにする。そのうえで、主役ユーザーが自分の事業の詰まり、未接続の可能性、次に試す一手、追加で確認すべきことを判断できる状態をゴールにする。

## 前提

- [x] Phase 0のGo条件を満たしている。
- [x] Tauri + React + Viteの土台がある。
- [x] SQLite migration方針が決まっている。
- [x] Codex App Server stdio接続が動いている。
- [x] 資料読み取りの最低品質が確認済み。
- [x] Markdown / CSV出力を必須、PDFはBeta以降へ回す方針が確定している。

## M1-1 アプリ基盤

- [x] 画面ルーティングまたは画面状態管理の方針を決める。
- [x] アプリシェルを作る。
  - [x] サイドナビ
  - [x] ヘッダー
  - [x] メイン領域
  - [x] トースト / 通知
  - [x] ローディング状態
  - [x] エラー表示
- [ ] Tauri commandの呼び出しラッパーを作る。
- [ ] TanStack Queryのquery key設計を決める。
- [ ] Zustandで選択中project、選択中view、編集中状態を管理する。

完了条件:

- [x] マップ一覧、マップ詳細、材料投入、抽出カード、マップ、エクスポートの画面枠が移動できる。

## M1-2 DB schema / repository

- [x] migrationを作成する。
  - [x] `projects`
  - [x] `source_files`
  - [x] `source_chunks`
  - [x] `extracted_items`
  - [x] `item_sources`
  - [x] `nodes`
  - [x] `edges`
  - [x] `suggestions`
  - [x] `ai_comments`
  - [x] `ai_runs`
  - [x] `versions`
  - [x] `codex_threads`
  - [x] `export_jobs`
- [ ] Rust repository層を作る。
- [x] ID生成方針を決める。
- [x] created_at / updated_atの扱いを統一する。
- [x] DBテストを作る。

完了条件:

- [x] migrationを空DBに適用できる。
- [ ] 主要エンティティの作成・取得・更新・削除テストが通る。

## M1-3 マップ管理

- [x] マップ一覧を表示する。
- [x] マップを新規作成できる。
- [x] マップ名、事業名 / 屋号 / 会社名、業種、説明、メモを編集できる。
- [x] マップ詳細を開ける。
- [x] マップを削除できる。
- [x] マップ削除時の対象データを確認する。
  - [x] DBレコード
  - [x] 元情報ソース
  - [x] source chunks
  - [x] ai_runs関連ファイル
  - [x] exports

完了条件:

- [x] マップの作成、編集、再開、削除がUIからできる。

## M1-4 マップの材料投入

- [x] 自由記述メモを投入できる。
- [x] URL / SNS / 商品情報を、本文自動取得なしの手入力材料として投入できる。
- [x] ドラッグ&ドロップでファイルを投入できる。
- [x] ファイル選択ダイアログから投入できる。
- [x] 対応拡張子を制限する。
  - [x] PDF
  - [x] CSV
  - [x] XLSX
  - [x] Markdown
  - [x] Text
- [x] マップ用フォルダへ元情報ソースをコピーする。
- [x] `source_files`に保存する。
- [x] ファイルハッシュを保存する。
- [x] 読み取り状態を表示する。

完了条件:

- [x] メモ、URL、SNS、商品情報、複数ファイルを投入し、マップごとにマップの材料が保存される。

## M1-5 source chunks生成

- [x] PDF読み取りを実装する。
- [x] CSV読み取りを実装する。
- [x] Excel読み取りを実装する。
- [x] Markdown / text読み取りを実装する。
- [x] 読み取り結果をsource chunksに分割する。
- [x] 出典情報を保存する。
  - [x] PDFページ
  - [x] CSV行番号
  - [x] Excelシート名・行列
  - [x] Markdown見出し階層
- [x] 抽出不可ファイルをエラーではなく「抽出不可」として扱う。
- [x] source chunks一覧をUIで確認できる。

完了条件:

- [x] 投入した材料の読み取り結果と出典がUIで確認できる。

## M1-6 AI送信前確認

- [x] AI送信対象のsource chunksを選択できる。
- [x] 送信前に材料要約と送信範囲を表示する。
- [x] MVP-1の既定送信モードを「ローカル要約だけ送る」にする。
- [x] 「全文を送る / ローカル要約だけ送る / 選択範囲だけ送る」は設計上拡張できる形にする。
- [x] AI送信前確認の承認ボタンを作る。
- [x] 送信しない情報ソースを明示できる。

完了条件:

- [x] ユーザーがAIへ送る内容を確認してから実行できる。

## M1-7 Codex thread / ai_runs

- [ ] マップごとにCodex threadを作成する。
- [ ] 既存マップでthreadをresumeする。
- [x] AI実行ごとに`ai_runs`を作成する。
- [x] `run_type`を定義する。
  - [x] `extract_items`
  - [x] `generate_map`
  - [x] `generate_suggestions`
  - [x] `analyze_map`
- [x] `schema_name`と`schema_version`を保存する。
- [x] request summaryをファイル保存する。
- [x] response JSONをファイル保存する。
- [x] status、started_at、completed_at、errorを保存する。
- [x] AI実行履歴画面を作る。

完了条件:

- [x] どのAI実行がどの入力と出力に対応するか追跡できる。

## M1-8 AI抽出schema

- [x] `ExtractedItemsOutput` schemaを定義する。
- [x] `schema_version`を必須にする。
- [x] item type enumを定義する。
  - [x] 事業
  - [x] 商品・サービス
  - [x] 集客チャネル
  - [x] 顧客接点
  - [x] 財務参考情報
  - [x] データ資料
- [x] confidence status enumを定義する。
  - [x] 確定
  - [x] 推定
  - [x] 要確認
- [x] Rust側でdeserialize / validateする。
- [x] schema不一致時のエラー表示を作る。

完了条件:

- [x] Codexの抽出結果を検証して`extracted_items`と`item_sources`へ保存できる。

## M1-9 抽出カード確認

- [x] 抽出カード一覧を表示する。
- [x] カード詳細を表示する。
- [x] 名前、分類、説明、確度、影響力、主観重要度、メモを編集できる。
- [x] 確定 / 推定 / 要確認を変更できる。
- [x] 採用 / 保留 / 却下を管理できる。
- [x] item_sourcesを表示する。
- [x] 引用、ページ、シート、行番号を確認できる。
- [x] 手動でカードを追加できる。
- [x] 不要なカードを除外できる。

完了条件:

- [x] AI抽出結果を人間が確認・修正・確定できる。

## M1-10 顧客導線マップ生成

- [x] `MapDraftOutput` schemaを定義する。
- [x] 抽出カードからnodes / edgesを生成するAI依頼を作る。
- [x] nodes / edgesをDB保存する。
- [x] React Flowで顧客導線ビューを表示する。
- [x] custom nodeを作る。
- [x] custom edgeを作る。
- [x] ノードの種類、影響力、情報充実度、確度を視覚表現する。
- [x] 線の方向、強さ、状態、流れの種類を視覚表現する。
- [x] ノード位置を保存する。
- [x] fit view、minimap、controlsを入れる。

完了条件:

- [x] 抽出カードから顧客導線マップを生成し、UIで確認できる。

## M1-11 マップ編集

- [x] ノード名を編集できる。
- [x] ノード分類を編集できる。
- [x] ノード説明を編集できる。
- [x] 線の状態を編集できる。
- [x] 線の流れの種類を編集できる。
- [x] 優先度やメモを編集できる。
- [x] 変更をDBへ保存する。
- [x] 編集後に簡易スナップショットを保存する。

完了条件:

- [x] 会議中に必要な軽い修正ができる。

## M1-12 AIコメント / 簡易施策カード

- [x] `AiAnalysisOutput` schemaを定義する。
- [x] `SuggestionCardsOutput` schemaを定義する。
- [x] 現状の全体像を生成する。
- [x] 強い導線、弱い導線、詰まりを生成する。
- [x] 未接続シナジー候補を生成する。
- [x] 簡易施策カードを生成する。
- [x] 確認すべきことを生成する。
- [x] 施策カードを編集できる。
- [x] 採用 / 保留 / 却下を管理できる。

完了条件:

- [x] マップから次に試す一手と確認すべきことを生成し、編集できる。

## M1-13 Markdown出力

- [x] Markdown出力の構成を定義する。
  - [x] 概要
  - [x] 使用した情報ソース
  - [x] 情報充実度
  - [x] 抽出カード
  - [x] 顧客導線マップ要約
- [x] AIコメント
- [x] 施策カード
- [x] 確認質問
- [x] 確認事項 / タスク
- [x] 思考メモ
- [x] Markdown生成処理をRust backendに実装する。
- [x] 出力先を選択できる。
  - 既定出力フォルダを設定し、利用不可時はマップ用フォルダの`exports`配下へフォールバックする。
- [x] マップ用フォルダのexportsに保存する。

完了条件:

- [x] Obsidianや通常エディタで読めるMarkdownを出力できる。

## M1-14 CSV出力

- [x] ノード一覧CSVを出力する。
- [x] 関係性一覧CSVを出力する。
- [x] 施策カードCSVを出力する。
- [x] 資料一覧CSVを出力する。
- [x] 確認事項CSVを出力する。
- [x] 思考メモCSVを出力する。
- [x] 文字コードと改行コードの方針を決める。

完了条件:

- [x] 管理用に再利用できるCSVを出力できる。

## M1-15 PDF出力の扱い

- [x] MVP-1ではPDFを外し、Markdown / CSVのみでリリースする判断を記録する。
- [ ] Beta以降でレポート型PDFの必要性と品質条件を再評価する。

完了条件:

- [x] MVP-1の出力範囲がMarkdown / CSVに確定している。

## M1-19 マップ体験とCodex理解支援

- [x] 最新AI実行がCodex生成かローカルドラフトかをUIで確認できる。
- [x] 編集モード中にノード移動・サイズ変更の操作ヒントを表示する。
- [x] 顧客導線マップを見やすい配置へ整える操作を追加する。
- [x] 選択中ノード / 導線 / マップ全体についてCodexに定型質問できる。
- [x] 未選択時はインスペクターを隠し、マップ全体への質問は下部ドロワーから実行できる。
- [x] Codex壁打ち回答をschema検証し、`ai_runs`とAIコメントへ保存する。
- [x] 情報ソースごとの抽出カード反映 / マップ反映状態をUIで確認できる。
- [x] 追加・更新ソースがある場合に、抽出カード更新またはマップ再生成の次アクションを表示する。

完了条件:

- [x] マップの材料を入れて生成したマップを軽く動かし、選択対象についてCodexに聞ける。

## M1-16 簡易スナップショット

- [x] AI生成時にsnapshotを保存する。
- [x] 人間修正時にsnapshotを保存する。
- [x] snapshot_jsonに保存する対象を定義する。
  - [x] extracted_items
  - [x] item_sources
  - [x] nodes
  - [x] edges
  - [x] suggestions
  - [x] ai_comments
  - [x] action_items
  - [x] map_notes
- [x] 保存済みスナップショットの存在と時刻を確認できる最小UIを作る。
- [x] 任意タイミングで名前付き保存できる。

完了条件:

- [x] いつ、どの状態が保存されたか追跡できる。

## M1-17 情報管理

- [x] マップ削除機能を実装する。
- [x] マップ削除時にDBレコード、元情報ソース、source chunks、ai_runs関連ファイル、exportsを削除対象として確認する。
- [x] AI送信履歴を閲覧できる。
- [x] ログに機密本文を残さない。
- [x] エラー表示に情報ソース本文を含めない。
- [x] 認証情報保存方針を実装する。
  - MVP-1ではSynergy Map本体にAPIキーや認証情報を保存しない。
  - Codex認証はCodex App Server / Codex CLI側の既存認証導線に委ねる。
  - Cursor SDK（Composer）の`CURSOR_API_KEY`は環境変数または`.env`から読み込む。
  - 将来、アプリ本体で独自tokenを保存する必要が出た場合は、OS標準のセキュアストレージを第一候補にする。
- [x] エクスポートファイルの保存場所を明示する。
- [x] 既定出力フォルダを設定できる。
- [x] 出力履歴から許可された出力先を開ける。
- [x] 情報ソース単体を削除できる。
- [x] 情報ソース削除後、既存カード/マップを残して再抽出/再生成推奨を表示する。

完了条件:

- [x] 実事業の情報ソースを扱う前提で最低限の削除・送信履歴・ログ方針が守られている。

## M1-18 テスト / QA

- [x] Rust unit testsを作る。
- [ ] DB repository testsを作る。
- [x] file parser testsを作る。
- [x] schema validation testsを作る。
- [ ] React component testsを作る。
- [x] 主要導線の手動QAシナリオを作る。
- [x] 新MVPの主役ユーザーに合わせ、外向きUI/AI出力/主要ドキュメントの語彙を `マップ` / `売上マップ` / `情報ソース` / `次の一手` に整理する。
- [ ] macOSで通し確認する。
- [ ] Windowsで通し確認する。

完了条件:

- [ ] MVP-1の中心導線がmacOS / Windowsで通る。

## M1-19 Cursor SDK プロバイダ（個人実運用）

- [x] `scripts/cursor-structured-turn.mts` で構造化 JSON ターンを実行する。
- [x] `ai_provider.rs` で Codex / Cursor の primary + fallback を実装する。
- [x] 構造化 AI 呼び出しすべてを `try_structured_ai` 経由に統一する。
- [x] `app-settings.json` でプロバイダ設定を永続化する。
- [x] 設定画面で Codex / Composer 切替と接続テストを提供する。
- [x] `ai_runs` request summary に `providerUsed` / `durationMs` を記録する。
- [x] [cursor-sdk-integration.md](../operations/cursor-sdk-integration.md) に運用メモを書く。
- [ ] Composer 常駐セッション（v2）で起動コストを削減する。

完了条件:

- [x] 設定で Composer を選び、マップ生成まで Tauri 上で実行できる。
- [x] 失敗時フォールバックが動作する。

## M1-20 Phase 1 本人試験運用

- [x] `action_items`を追加する。
- [x] `map_notes`を追加する。
- [x] AI生成の確認質問を`action_items`へ重複回避しながら登録する。
- [x] UIに「記録」ビューを追加する。
- [x] 出力先設定`defaultExportDir`を追加する。
- [x] Markdown / CSV出力を既定出力フォルダ優先、利用不可時app data exportsへフォールバックする。
- [x] 出力履歴から出力先を開ける。
- [x] `delete_source_file`で情報ソース単体を削除できる。
- [x] `versions`へ`name` / `memo`を追加する。
- [x] History画面から名前付き保存できる。
- [x] [trial-operation-phase-1.md](trial-operation-phase-1.md)を試験運用チェックリストの正本にする。

完了条件:

- [ ] 開発者本人が`pnpm tauri dev`で実事業メモを投入し、抽出、マップ、次の一手、記録、出力まで日常運用できることを手動QAで確認する。

## M1-21 Phase 2 実事業試験運用・継続利用化

- [x] プロジェクト内ナビに「今日」ビューを追加する。
- [x] 既存プロジェクト選択時の初期表示を「今日」にする。
- [x] 新規マップ作成時は従来通りマップ作成フローを優先する。
- [x] 「今日」ビューに次にやることを表示する。
- [x] 「今日」ビューに未完了確認事項を優先度順で表示し、完了/見送りをインライン操作できる。
- [x] 「今日」ビューに未却下の次の一手を表示する。
- [x] suggestionから確認事項を作成する`create_action_item_from_suggestion`を追加する。
- [x] suggestion由来の未完了確認事項の重複作成を避ける。
- [x] 「今日」ビューに再抽出/再生成推奨、最近のメモ、最近の保存、最近の出力を集約する。
- [x] [trial-operation-phase-2.md](trial-operation-phase-2.md)を実事業試験運用チェックリストの正本にする。

完了条件:

- [ ] 開発者本人が`pnpm tauri dev`で実事業メモを投入し、「今日」ビューから入力、AI抽出、マップ生成、次の一手、確認事項、メモ、保存、Markdown/CSV出力まで週次/月次で運用できることを手動QAで確認する。

## MVP-1完了判定

- [x] マップの材料入力からMarkdown / CSV出力まで一気通貫で動く。
- [x] AI抽出カードを人間が確認できる。
- [x] 顧客導線の売上マップが生成・軽微編集できる。
- [x] 出典とAI実行履歴を追える。
- [x] 実事業の情報ソースを入れる前の最低限の情報管理方針が実装されている。
- [ ] 売上マップを見て、詰まり・未接続・次に試す一手・確認すべきことを判断できることを手動QAで確認する。
