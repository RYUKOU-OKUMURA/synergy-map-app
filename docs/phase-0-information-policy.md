# Phase 0 情報管理・ログ方針

作成日: 2026-05-16

## 基本方針

Phase 0 / MVP-1初期は、AIへ送る情報とローカルに残す履歴を最小化する。

- 既定送信モードは「要約だけ送る」。
- AI送信前に、送信範囲と履歴保存内容をUIで確認する。
- 資料本文、source chunks本文、prompt全文はAI実行履歴に保存しない。
- `ai_runs`には追跡に必要なschema、入力hash、request summary path、response JSON pathを保存する。
- response JSONはschema検証済みの構造化出力だけを保存する。
- schema不一致またはJSON parse失敗時は`ai_runs`へcompleted出力として保存しない。

## Phase 0実装

- `run_ai_schema_poc`は固定のPhase 0 sample summaryだけをCodexへ送る。
- `request-summary.json`には概要、`inputHash`、schema名、schema versionだけを保存する。
- `response.json`には検証済みの`AiAnalysisOutput`を保存する。
- UIの`Schema検証`では、`要約のみで送信`を確認した場合だけ実行ボタンを有効にする。

## MVP-1送信モード

MVP-1の既定値は「要約だけ送る」にする。

将来の選択肢:

- 要約だけ送る: 既定。source chunks本文は履歴に残さず、AIへ渡す内容も要約に限定する。
- 選択範囲だけ送る: ユーザーが明示選択したchunkだけを送る。
- 全文を送る: デフォルトでは無効。明示確認と上限設定を必須にする。

## 削除方針

案件削除時は、同じproject配下のローカル成果物を一括削除する。

- 元資料コピー
- source chunks本文ファイル
- `ai-runs/`配下のrequest summary / response JSON
- export成果物
- SQLite上の`projects`関連行

SQLiteは外部キー`ON DELETE CASCADE`を使う。ファイル削除はDB削除前に対象pathを列挙し、失敗時は削除結果をUIに返す。

## 認証情報

Phase 0 / MVP-1初期のSynergy Map本体はChatGPT / OpenAI認証情報を保存しない。Codex App Server / Codex CLI側の既存認証導線に委ねる。

将来、アプリ独自のtoken保存が必要になった場合はOS keychainを第一候補にする。Tauri Strongholdは、アプリ内で暗号化vaultを明示管理する必要が出た場合に再検討する。

