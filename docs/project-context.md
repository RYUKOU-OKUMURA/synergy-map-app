# Project Context

作成日: 2026-05-18

このファイルは、Codexやサブエージェントが毎回最初に読むための入口資料。すべてのドキュメントを毎回読むのではなく、この要約を読んでから、タスクに必要な関連資料だけを開く。

## まず理解すること

このプロダクトは、単なる図解ツール、資料アップロードツール、案件管理ツールではない。

事業者や支援者が持っている商品、集客、顧客接点、売上、資料、メモ、URL、SNSなどの情報を材料にして、AIが事業のつながりを整理し、売上導線、詰まり、未接続のチャンス、次に試す施策を見つけるためのツール。

MVP-1の主役ユーザーは、自分の事業を自分で整理したい個人事業主・小規模会社の経営者。代表ユーザーは奥村さん自身とする。コンサルタント、AI顧問、経営支援者は副次ユーザーとして扱い、主役ユーザーの体験を崩さない範囲で考慮する。

外向きの現時点の説明は、次を基準にする。

> AIが、あなたの事業の売上マップを作ります。
>
> 頭の中でバラバラになっている商品・集客・売上の流れを、AIが1枚のマップに整理します。

プロダクト内部では「シナジーマップ」という言葉を使ってよい。ただし初見ユーザー向けのLP、オンボーディング、UIコピーでは、「売上マップ」「商品・集客・売上の流れ」「事業の全体図」を優先する。

## 想定ユーザー

- 個人事業主
- 中小企業の経営者
- 店舗オーナー
- 複数商品、複数チャネルを持つ事業者
- 中小企業向けコンサルタント
- AI顧問、経営支援者、士業、支援機関

MVP-1では、上のうち個人事業主・小規模会社の経営者を主役ユーザーにする。コンサルタント専用にはしない。

## MVP-1の中心価値

MVP-1は、見やすい売上マップが出ることを最低ラインにする。そのうえで、主役ユーザーが自分の事業の詰まり、未接続の可能性、次に試す一手、追加で確認すべきことを判断できる状態をゴールにする。

MVP-1は、次の流れを破綻なく実現することを優先する。

1. マップの材料を入れる。
2. AIが事業、商品、集客チャネル、顧客接点、財務参考情報を抽出する。
3. 抽出結果を人が確認、修正、確定する。
4. 顧客導線ビューの売上マップを生成する。
5. AIが考える材料、売上の流れ、詰まり、確認質問、次に試す一手を整理する。
6. 自分が次に考える/動くための記録としてMarkdown / CSVで出力する。

MVP-1では、自由作図、深掘りレイヤー、本格チャット、共同編集、クライアントログイン、共有リンク、OCR、URL読み取り、SNS/API連携、会計API連携は対象外。

## 競合から見えた勝ち筋

Miro、FigJam、Lucid、Createlyは自由度が高いが、経営者本人には広すぎる。

Mapify、MyMap、Xmind AI、GitMindは入力からマップ生成まで速いが、要約マップで止まりやすい。

NotebookLM、Notion AI、ChatGPT Projectsは資料理解に強いが、ユーザーの問い方に依存し、事業構造から施策までの固定導線は弱い。

Napkin AI、Gamma、Canvaは見栄えのよい出力に強いが、根拠、確度、経営判断への接続は薄くなりやすい。

国内の補助金AIや経営計画作成ツールは提出物が明確だが、日常的な事業整理、売上導線の見直し、施策検討には閉じていない。

このプロダクトの勝ち筋は、次の5つ。

- 経営者本人にも分かる入力体験。
- 商品、集客、顧客接点、売上の流れを専用の型で整理すること。
- 根拠、推測、要確認を画面上で分けること。
- マップだけで終わらず、確認質問と次に試す一手まで出すこと。
- 自分の事業の施策検討、月次振り返り、必要に応じた相談準備で使えること。

## 判断基準

実装、UI、コピー、仕様判断では、次の問いを優先する。

1. 初見の経営者が、何を入れればよいか分かるか。
2. 資料がなくても、メモやURLから始められるか。
3. マップを見て、商品、集客、売上の流れが理解できるか。
4. AIの推測と根拠が区別できるか。
5. 次に試す施策が具体的に出るか。
6. 自分が次に考える/動くための記録として出力できるか。
7. 初回だけでなく、毎月または施策検討のたびに使う理由があるか。

## 読み分けルール

すべてのドキュメントを毎回読まない。まずこのファイルを読み、タスクに応じて次を読む。

### プロダクト思想、価値判断、UX判断

- `docs/product/product-vision-business-principles.md`
- `docs/product/product-competitive-positioning-and-strategy.md`

### 競合名、ロールモデル、調査根拠

- `docs/product/product-role-models-and-competitors-research.md`

### MVP-1の仕様、実装範囲

- `docs/mvp-spec.md`
- `docs/requirements.md`

### 技術選定

- `docs/tech-stack.md`

### UIデザイン、マップ表現

- `docs/design/ui-design-mvp-1.md`
- `docs/design/synergy-map-design-mvp-1.md`
- `docs/design/flow-animation-spec.md`
- `docs/archive/ux-improvement-plan-initial-map-flow.md`
- `docs/archive/implementation-plan-ux-onboarding.md`

### 実装進捗

- `docs/plans/implementation-plan-mvp-1.md`
- `docs/plans/implementation-plan-beta.md`
- `docs/archive/implementation-plan-phase-0.md`

### MVP-1後の将来構想、思考没入、レイヤー型マップ

- `docs/future/layered-map-future-concept.md`
- `docs/future/thinking-immersion-design-direction.md`

### Phase 0検証、情報管理

- `docs/archive/phase-0-go-no-go-report.md`
- `docs/archive/phase-0-information-policy.md`
- `docs/archive/phase-0-platform-verification.md`
- `docs/archive/phase-0-sidecar-verification.md`
- `docs/archive/phase-0-device-code-guide.md`

## 用語の扱い

外向きに優先する言葉:

- 売上マップ
- 事業の全体図
- 商品・集客・売上の流れ
- マップの材料
- 次に試す施策
- 詰まっている導線
- 追加すると精度が上がる情報

内部や仕様で使ってよい言葉:

- シナジーマップ
- 抽出カード
- 顧客導線ビュー
- source chunks
- item_sources
- ai_runs
- 確定 / 推定 / 要確認

避けたい外向き表現:

- 案件管理ツール
- 資料アップロードツール
- 図解作成ツール
- マインドマップ作成ツール
- 補助金申請書作成ツール

## 迷ったとき

機能を増やすより、まず次を優先する。

- 入力しやすいこと。
- マップにたどり着きやすいこと。
- AIが何を根拠に言っているか分かること。
- ユーザーが次に何をすればよいか分かること。
- 経営者本人が自分の事業を考えやすいこと。
