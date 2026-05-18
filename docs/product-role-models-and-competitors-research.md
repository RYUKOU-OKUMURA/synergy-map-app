# ロールモデル・競合リサーチ

作成日: 2026-05-18

参照資料:

- `docs/product-vision-business-principles.md`
- `docs/mvp-spec.md`
- `docs/requirements.md`
- `docs/シナジーマップ可視化ツール構想.md`

## 前提整理

このプロジェクトは、一般的な作図ツールやマインドマップツールではなく、コンサルタントや経営支援者がクライアント企業の事業情報を投入し、AIで事業構造を読み取り、シナジーマップ、現状分析、施策候補、確認質問、出力物までつなげる実務ツールとして設計されている。

MVP-1の中心価値は次の流れにある。

1. 資料を投入する。
2. AIが事業、商品、チャネル、顧客接点、財務参考情報を抽出する。
3. 抽出カードを人が確認、修正、確定する。
4. 顧客導線ビューのシナジーマップを生成する。
5. AIが現状分析、未接続シナジー、施策候補、確認質問を出す。
6. Markdown / CSVとして出力する。

したがって競合は「図を作るツール」だけではなく、次の4領域に分かれる。

- AI図解・AIホワイトボード
- AIマインドマップ・資料要約マップ
- カスタマージャーニー / サービスデザイン / 事業構造可視化
- AI事業計画、補助金申請、経営支援、汎用AIワークスペース

## 結論

最も参考にすべきロールモデルは、単体ではなく複数プロダクトの組み合わせで見るべき。

- 入力からマップ到達までの短さ: Mapify、MyMap、Whimsical AI
- 根拠つきAI分析: Google NotebookLM、Notion AI
- キャンバス上でAIと考える体験: Miro AI / Sidekicks、Jeda.ai、Lucid AI
- ジャーニーと機会管理: UXPressia、Smaply、TheyDo
- 成果物化: Gamma、Canva

直接競合として最も注意すべきなのは、Miro、Jeda.ai、Napkin AI、Mapify、MyMap、UXPressia、ChatGPT Projects。特にユーザーがすでにChatGPTに課金している前提では、ChatGPT ProjectsやNotebookLMに「資料を入れて相談する」だけで済ませられるリスクが大きい。

一方で、このプロジェクトの勝ち筋は明確にある。汎用AIや汎用ホワイトボードは、ユーザー自身が「何を入れるか」「どう構造化するか」「どこを施策にするか」を考える必要がある。本プロジェクトは、そこを中小企業・コンサル現場向けに固定化し、事業、商品、チャネル、顧客接点、財務、未接続シナジー、確認質問まで一気通貫で扱うことに価値がある。

推奨ポジショニング:

> 資料・URL・メモから、事業のつながりと次の打ち手を1枚にするAI事業構造マップ。

比較表現:

- Miroより迷わない。
- NotebookLMより施策に近い。
- Napkin AIより事業分析に深い。
- 補助金AIより日常的に使える。
- ChatGPT単体より、根拠、推測、未確認事項、マップ到達が明確。

## ロールモデル候補

| 優先 | プロダクト | 何のプロダクトか | 参考になる点 | 真似しすぎない点 |
|---|---|---|---|---|
| 高 | Google NotebookLM | 資料をソースとして読み込み、要約、質問、音声/動画概要などを生成するAIノート | 回答がソースに根ざす体験。根拠と推測を分ける思想に近い | 学習・研究ノート化しすぎると、事業施策への接続が弱くなる |
| 高 | Mapify | PDF、Web、YouTubeなどをAIマインドマップ化するツール | 多様な情報ソースからマップへ到達する入口設計 | 要約マップで止まると差別化できない。事業構造・施策・確認質問まで踏み込む必要がある |
| 高 | Miro AI / Sidekicks | AI付きオンラインホワイトボード、図解、マインドマップ、AIワークフロー | キャンバス上の内容をAIが読み、要約・図解・提案する体験 | 機能が広すぎる。非ITユーザー向けには入口を絞る |
| 高 | Jeda.ai | AIネイティブなビジュアルワークスペース | プロンプト、CSV、PDFなどからマトリクス、マインドマップ、図解を生成する方向性 | モデル選択、AIコマンド、上級者向け機能を前面に出すと複雑になる |
| 中 | UXPressia | カスタマージャーニー、ペルソナ、インパクトマップ作成/管理 | ジャーニーマップを施策、課題、ペルソナ、データに接続する構造 | CX専門に寄りすぎると、事業全体のシナジー可視化から外れる |
| 中 | Smaply | ジャーニーマップ管理、ペルソナ、CXリポジトリ | マップを単発成果物で終わらせず、継続管理する考え方 | 価格・機能がエンタープライズ寄りで重い |
| 中 | Gamma | AIプレゼン、ドキュメント、Webページ生成 | 粗い入力から見栄えのよい提案資料やレポートへ進む成果物化 | きれいな資料生成に寄ると、分析の根拠や確度が薄くなる |
| 中 | Canva AI Whiteboards / Magic Studio | 非デザイナー向けAIデザイン、ホワイトボード、資料作成 | テンプレートとAIで成果物へ短距離で進ませる体験 | 素材・装飾が増えすぎると、事業分析ツールとしての芯がぼやける |
| 中 | Whimsical AI | 軽量なフローチャート、マインドマップ、付箋生成 | 空白キャンバスの不安を下げ、すぐ生成できる | 図解生成だけに寄ると継続利用理由が弱い |
| 低 | FigJam AI | チーム用ホワイトボード、ブレスト、図解 | 付箋の分類、要約、ボード生成の軽さ | デザインチーム文脈が強く、一般事業者には自由度が高すぎる |

## 直接競合・代替ツール

| 脅威度 | プロダクト | 競合になる理由 | 強み | 本プロジェクトの勝ち筋 |
|---|---|---|---|---|
| 高 | ChatGPT Projects | ユーザーが既に課金している汎用AI。ファイル、Web検索、Canvas、会話履歴で代替されやすい | 追加導入不要。資料を入れて相談できる | 入力すべき材料、事業構造抽出、根拠表示、マップ生成、施策カードまでの専用導線 |
| 高 | Miro | AI図解、ホワイトボード、戦略テンプレート、共同編集 | 認知度、テンプレート、共同編集、企業利用 | 「資料投入から事業構造と施策へ」という用途特化。Miroより迷わない入口 |
| 高 | Jeda.ai | AIネイティブなホワイトボードで、PDF/CSV/Excelから図解や分析を生成 | AIで視覚フレームワークを作る力が強い | 日本語の中小企業支援、顧客導線、商流、シナジー、施策に特化 |
| 高 | Mapify | 資料やURLからマインドマップを作る体験が近い | 入力ソースが広く、初回体験が分かりやすい | 要約ではなく、事業ノード、導線、詰まり、未接続シナジー、施策に意味づけする |
| 高 | Napkin AI | テキストからビジネス向け図解を生成 | 図の見栄え、PPT/SVG/PDF出力 | 図解ストーリーテリングではなく、事業情報の解釈と施策判断に寄せる |
| 中 | Lucidchart / Lucidspark | AIで図やボードを生成し、業務構造を可視化できる | 図解品質、企業利用、プロセス図の強さ | UML/ERD/業務図ではなく、非ITの事業整理に特化 |
| 中 | Creately | AI diagrams、ホワイトボード、業務/IT/プロダクト用図解 | 図種が広く、データ連携もある | 汎用図解ではなく、抽出カード、根拠、確度、施策候補まで固定化 |
| 中 | Whimsical | AIでフローチャート、マインドマップ、付箋を生成 | 軽く、低価格で使いやすい | 生成後の事業分析、施策化、会議用出力まで含める |
| 中 | FigJam | AIでボードや図を生成し、付箋を分類/要約 | Figma利用者基盤、共同編集 | デザイン/PM向け汎用ボードではなく、経営支援者向けに絞る |
| 中 | MyMap.ai | 会話からマインドマップ、SWOT、フロー、比較表を生成 | チャットからキャンバスへの変換が速い | モデル/クレジットよりも、事業情報入力と施策判断を前面に出す |
| 中 | UXPressia | AIでカスタマージャーニーやペルソナを生成 | CX/UX領域の構造化とレポート力 | 顧客体験だけでなく、事業、商品、チャネル、売上導線まで横断する |
| 中 | Notion AI | 資料、メモ、DB、外部コネクタを横断してAI検索/整理 | 情報蓄積、検索、ドキュメント化 | Notionは置き場。本プロジェクトはマップ到達と施策探索が中心 |
| 中 | Microsoft 365 Copilot | Office文書から要約、下書き、PowerPoint化できる | 既存Office環境に入りやすい | Office成果物作成ではなく、事業構造の読み取りとマップ化に特化 |
| 低〜中 | Xmind AI / GitMind | AIマインドマップ生成、文書要約 | 低価格でマップ作成に強い | マインドマップではなく、事業シナジーと施策候補の専用意味づけ |
| 低〜中 | Smaply / TheyDo | ジャーニー管理と機会管理 | 大企業のCX管理に強い | 中小企業・支援者向けの軽さ、低価格、会議前後の実務用途 |
| 低〜中 | Kumu | 複雑な関係性やシステムマップの可視化 | 関係性マップ、フィルタ、属性管理が強い | AI入力、非ITユーザー導線、施策生成で差別化 |
| 低 | Eraser / Mermaid Chart | AI図解、diagram-as-code | 技術ドキュメントや開発者向け図解に強い | 対象ユーザーが異なる。参考にするなら構造データから図を安定生成する考え方 |

## 国内・日本語ユーザー視点の競合/隣接

国内では、直接的な「シナジーマップ」競合よりも、補助金申請、経営計画、経営診断、汎用AI活用が代替になりやすい。

| プロダクト/仕組み | 比較対象になる理由 | 参考になる点 | 差別化できる点 |
|---|---|---|---|
| Hojofy | 補助金向けAI事業計画書生成 | 審査基準に合わせた実務特化、入力から提出物までの導線 | 補助金書類ではなく、事業構造・シナジー・施策探索の日常用途 |
| HojoMaker | 小規模事業者持続化補助金向けのAI申請書作成 | URL入力から事業内容を読み取り、Word/PDF出力までつなげる | 補助金申請の一点突破ではなく、商流・顧客導線・チャネル連携まで扱う |
| SubsidyDraft AI / 補助金AI | 事業概要から申請書下書きを作る | 初回ハードルが低く、出力物が明確 | 申請書ではなく、継続的な経営整理、提案準備、振り返りに使う |
| ローカルベンチマーク / ミラサポplus | 財務・非財務で企業の状態を把握する公的支援ツール | 支援者との対話、財務/非財務の構造、健康診断という位置づけ | 入力負荷をAIで下げ、マップと確認質問に変換する |
| 経営計画作成系ツール | 事業計画書・創業計画書を作る | 「最短30分」など、非専門家向けの導線 | 計画書作成ではなく、既存事業の複数チャネル/商品/顧客接点の関係を見せる |
| Cacoo | 日本語でも使いやすいオンライン作図/ホワイトボード | 低価格、共同編集、国内認知 | 汎用作図ではなく、AI事業分析と根拠表示に寄せる |

## 価格帯の見方

月額980円という価格は、Miro、Lucid、Whimsical、Napkin、MyMap、Xmindなどの低価格AI/図解ツールと比較されやすい。ただしユーザー側には、ChatGPT課金や関連ランニングコストも乗る。したがって「安いから使う」ではなく「コンサル実務で毎月使う理由」が必要になる。

価格に対する価値の出し方:

- 初回: 資料投入から短時間で事業構造が見える。
- 会議前: ヒアリングメモや資料から論点と確認質問を作れる。
- 会議中: 軽い修正と短い再分析ができる。
- 会議後: Markdown/CSVで提案・報告の下書きになる。
- 継続: 前回との差分、未接続シナジー、施策の進捗確認に使える。

## 差別化の芯

このプロジェクトが避けるべき方向:

- 汎用ホワイトボード化
- 自由作図ツール化
- きれいなAI図解生成だけに寄ること
- 補助金申請書作成だけに寄ること
- AIモデル選択やクレジット管理を前面に出すこと
- 入力フォームが重く、公的診断シートのようになること

強く打ち出すべき方向:

- 「マップの材料」を受け取る入口
- 出典、根拠、推測、要確認の明示
- 事業、商品、チャネル、顧客接点、財務の抽出カード
- 顧客導線ビューのシナジーマップ
- 未接続シナジー、詰まり、弱い導線の発見
- 次に聞くべき質問と、今すぐ打つべき施策
- コンサルの提案準備、会議、振り返りに使える出力

## 実装・UXへの示唆

### 1. 入口は「資料アップロード」ではなく「マップの材料」

資料、URL、SNS、メモ、口頭情報を同列に扱う思想は正しい。MVPではURL読み取りが対象外でも、URL/SNSを「あとで材料として扱う」入力欄やメモ欄は用意した方がよい。ユーザーは「このツールは自分の事業情報を受け取れる」と感じる。

### 2. 初回生成は仮説でもよいが、ラベルを徹底する

NotebookLM的に根拠へ戻れること、MVP仕様にある「確定 / 推定 / 要確認」を、マップ上でもカード上でも一貫させる。情報が少ないときは仮説マップを許可しつつ、情報量、確度、次に追加すべき材料を見せる。

### 3. 自由配置より、AI生成後の軽い修正を優先する

MiroやFigJamのように自由作図へ寄せると、ユーザーは作図作業を始めてしまう。MVPでは「カード修正」「ノード名修正」「線の状態変更」「AIへの短い再分析」を優先する方がプロダクト思想に合う。

### 4. 施策カードは競合との差別化ポイント

AI図解ツールは多いが、施策候補、期待インパクト、実装コスト、確認指標、クライアントに確認すべき質問まで出すものは少ない。ここをプロダクトの継続利用理由にする。

### 5. 出力は地味でも実務に直結させる

GammaやCanvaのような見栄えのよい出力は参考になるが、MVPではMarkdown/CSVで十分。重要なのは、会議後にそのまま提案書や報告書の下書きに貼れる構造にすること。

## 推奨メッセージング

候補コピー:

- 資料・URL・メモから、事業のつながりと次の打ち手を1枚に。
- バラバラの事業情報を、AIがシナジーマップと施策候補に整理。
- コンサル前の資料整理を、事業構造マップと確認質問に変える。
- どこがつながり、どこが詰まり、次に何を打つべきかを見える化。

避けるコピー:

- AI図解ツール
- マインドマップ作成ツール
- 案件管理ツール
- 資料アップロードツール
- 補助金申請書作成ツール

## 主要ソース

- Miro AI diagram generator: https://miro.com/ai/diagram-ai/
- Miro platform overview: https://miro.com/products/platform-overview/
- Lucid AI features: https://lucid.co/blog/lucid-ai-features
- FigJam AI help: https://help.figma.com/hc/en-us/articles/18706554628119-Make-boards-and-diagrams-with-FigJam-AI
- Whimsical AI: https://whimsical.com/learn/get-started/ai
- Whimsical pricing: https://whimsical.com/pricing
- Creately AI: https://creately.com/creately-ai/
- Creately plans: https://creately.com/plans/
- Jeda.ai AI Whiteboard: https://www.jeda.ai/ai-whiteboard
- Jeda.ai plans: https://www.jeda.ai/plans
- Napkin AI: https://www.napkin.ai/
- Napkin pricing: https://www.napkin.ai/pricing/
- MyMap.ai: https://www.mymap.ai/
- Mapify pricing: https://mapify.so/pricing
- Xmind pricing: https://xmind.com/pricing/?lang=en
- UXPressia pricing: https://uxpressia.com/pricing
- Smaply pricing: https://www.smaply.com/pricing
- TheyDo pricing: https://www.theydo.com/pricing/
- Kumu system mapping: https://www.kumu.io/markets/system-mapping
- Kumu pricing docs: https://www.docs.kumu.io/pricing
- Strategyzer Business Model Canvas: https://www.strategyzer.com/library/the-business-model-canvas
- Visual Paradigm canvas tool: https://www.visual-paradigm.com/features/canvas-tool/
- Canva AI Whiteboards: https://www.canva.com/newsroom/news/canva-ai-whiteboards/
- Gamma: https://gamma.app/
- Gamma pricing: https://gamma.app/pricing
- Google NotebookLM help: https://support.google.com/notebooklm/answer/16164461
- Google NotebookLM blog: https://blog.google/technology/ai/notebooklm-google-ai/
- Notion AI help: https://www.notion.com/help/notion-ai-faqs
- ChatGPT Projects help: https://help.openai.com/en/articles/10169521-projects-in-chatgpt
- Microsoft 365 Copilot pricing: https://www.microsoft.com/en-us/microsoft-365/copilot/pricing
- Cacoo: https://nulab.com/products/cacoo/
- Cacoo pricing: https://nulab.com/pricing/cacoo/
- Hojofy: https://hojofy.com/
- HojoMaker: https://www.hojomaker.com/
- SubsidyDraft AI: https://subsidydraft.jp/
- 補助金AI: https://hojokin.xyz/
- METI ローカルベンチマーク: https://www.meti.go.jp/policy/economy/keiei_innovation/sangyokinyu/locaben/
- ミラサポplus ローカルベンチマーク: https://mirasapo-plus.go.jp/report/top
