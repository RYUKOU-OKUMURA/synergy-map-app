# MVP-1 シナジーマップデザイン仕様

作成日: 2026-05-16

## 参照画像

![MVP-1 map UI reference](assets/mvp-1-map-ui-reference.png)

この仕様は、React Flowで確実に実装できる2D編集モデルを前提にする。見た目は軽い2.5Dにするが、座標、選択、ドラッグ、保存は通常の2Dとして扱う。

## 基本方針

- React Flowの通常キャンバスを使う。
- キャンバス全体を傾けない。
- 立体感はノードの影、下層プレート、境界線、エッジのハイライトで表現する。
- エッジはSVG pathの太さ、破線、色、矢印、ラベルで表現する。
- 情報の読み取りやすさを、立体表現より優先する。

## キャンバス

| 項目 | 仕様 |
| --- | --- |
| 背景 | `#F8FAFC` |
| グリッド | 薄い斜めグリッド + 補助ドット |
| ズーム | React Flow標準 |
| パン | React Flow標準 |
| Minimap | 右下、折りたたみなし |
| Controls | 左下または右下、控えめ |

背景グリッドはCSSの`linear-gradient`で実装する。画像素材にしない。

```css
.map-canvas {
  background-color: #f8fafc;
  background-image:
    linear-gradient(135deg, rgba(100, 116, 139, 0.08) 1px, transparent 1px),
    linear-gradient(45deg, rgba(100, 116, 139, 0.045) 1px, transparent 1px);
  background-size: 28px 28px, 56px 56px;
}
```

## ノード分類

| 分類 | 用途 | Stripe | Surface |
| --- | --- | --- | --- |
| 事業 | 既存事業、事業単位 | `#536579` | `#FFFFFF` |
| 商品・サービス | 提供価値、サービス | `#168A83` | `#F0FDFA` |
| 集客チャネル | Web、紹介、展示会など | `#4F5DAA` | `#F3F5FF` |
| 顧客接点 | 商談、問い合わせ、購入、継続 | `#D97706` | `#FFF7ED` |
| 財務参考情報 | 売上、粗利、LTVなど | `#2E7D64` | `#F0FDF4` |
| データ資料 | CSV、台帳、分析元データ | `#64748B` | `#F8FAFC` |

分類色はノード全体を塗りつぶさず、上部stripe、アイコン、アクセントに限定する。

## ノード構造

推奨サイズ:

- 幅: 176pxから220px
- 高さ: 76pxから104px
- 角丸: 6px
- 上部stripe: 4px
- 下層プレート: 4px下、3px右にずらす

表示要素:

- 分類stripe
- ノード名
- 分類ラベル
- 確度バッジ
- 情報充実度バー
- 出典数または主要出典

疑似立体の実装例:

```css
.map-node {
  position: relative;
  border: 1px solid #d8dee8;
  border-radius: 6px;
  background: #fff;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.12);
}

.map-node::after {
  content: "";
  position: absolute;
  inset: auto -1px -5px 3px;
  height: 8px;
  border: 1px solid #b8c1d1;
  border-top: 0;
  border-radius: 0 0 6px 6px;
  background: #e2e8f0;
  z-index: -1;
}
```

## 影響力

影響力はノードサイズを大きく変えすぎない。会議中の読み取り安定性を優先し、影とわずかな高さで表す。

| 影響力 | 表現 |
| --- | --- |
| 低 | 通常shadow、下層プレート薄め |
| 中 | shadow標準、下層プレート標準 |
| 高 | shadow強め、border強め、上部stripe太め |

## 情報充実度

情報充実度はノード下部の細いprogress barで表す。

| 値 | 表現 |
| --- | --- |
| 0-39 | 赤またはamber寄り、短いbar |
| 40-69 | amber、半分程度のbar |
| 70-100 | tealまたはgreen、長いbar |

数値を常時表示しない。必要ならhover tooltipまたはインスペクターで表示する。

## 確度

| 確度 | 表示 |
| --- | --- |
| 確定 | green系badge |
| 推定 | indigo系badge |
| 要確認 | amber系badge |

確度はノード色とは別軸。分類色と混ぜない。

## 採用状態

| 状態 | 表示 |
| --- | --- |
| 採用 | 通常表示 |
| 保留 | opacityを少し下げ、badge表示 |
| 却下 | マップには原則表示しない。必要時のみフィルターで表示 |

## エッジ種別

| 種別 | 用途 | 表現 |
| --- | --- | --- |
| strong | 主要導線 | 3px teal、ハイライトあり |
| normal | 通常導線 | 2px slate/teal |
| weak | 弱い導線、推定導線 | 2px dashed、透明度低め |
| bottleneck | 詰まり、摩擦 | amber/red、警告dot |
| data_reference | データ根拠 | slate dashed、細線 |

エッジはReact Flow custom edgeで実装する。まずは`getBezierPath`を使い、必要になったらstep / smoothstepを追加する。

## エッジ表示

表示要素:

- 曲線path
- 矢印marker
- optional halo path
- ラベル
- bottleneck marker

推奨実装:

```tsx
<BaseEdge
  path={edgePath}
  markerEnd={markerEnd}
  style={{
    stroke: edgeColor,
    strokeWidth,
    strokeDasharray,
  }}
/>
```

強い導線だけ、背面に太い半透明pathを敷く。

```tsx
<path d={edgePath} stroke="rgba(22, 138, 131, 0.18)" strokeWidth={8} />
<path d={edgePath} stroke="#168A83" strokeWidth={3} />
```

## ラベル

導線ラベルは短くする。

- 認知
- 問い合わせ
- 提案
- 購入
- 継続
- 紹介
- データ連携

ラベルは白背景、1px border、11px文字。線と重なって読めない場合は非表示にして、選択時だけ表示する設定も許容する。

## 選択状態

| 対象 | 表現 |
| --- | --- |
| ノード選択 | 2px teal outline、右インスペクター表示 |
| エッジ選択 | pathを太くし、ラベル表示 |
| hover | shadowを少し強め、cursor pointer |
| dragging | opacity 0.92、shadow強め |

選択時にノードサイズを変えない。レイアウトジャンプを避ける。

## データ属性

React Flow node dataには最低限以下を持たせる。

```ts
type SynergyNodeData = {
  name: string;
  category:
    | "business"
    | "service"
    | "channel"
    | "touchpoint"
    | "finance"
    | "data_source";
  confidence: "confirmed" | "estimated" | "needs_review";
  adoptionStatus: "accepted" | "pending" | "rejected";
  impactScore: 1 | 2 | 3;
  informationRichness: number;
  sourceCount: number;
  primarySourceLabel?: string;
  memo?: string;
};
```

Edge data:

```ts
type SynergyEdgeData = {
  flowType:
    | "awareness"
    | "inquiry"
    | "proposal"
    | "purchase"
    | "retention"
    | "referral"
    | "data_reference";
  strength: "strong" | "normal" | "weak";
  status: "active" | "estimated" | "bottleneck";
  label: string;
  confidence: "confirmed" | "estimated" | "needs_review";
  memo?: string;
};
```

## 操作

MVP-1で必要な操作:

- ノード選択
- エッジ選択
- ノードドラッグ
- ノード位置保存
- fit view
- zoom in / out
- minimap
- インスペクターで編集
- 採用 / 保留 / 却下

MVP-1では、キャンバス上での自由なノード作成や複雑なエッジ再配線は必須にしない。必要なら右上またはインスペクターから追加操作を提供する。

## 保存対象

マップ表示状態として保存する。

- node id
- node position x/y
- node width/heightを固定値として扱うかどうか
- selected layout version
- viewportは任意。MVP-1では保存しなくてもよい

業務データとして保存する。

- nodes
- edges
- suggestions
- ai_comments
- source references

## 出力時の扱い

Markdown / CSVでは立体表現を保存しない。データを構造化して出す。

PDFを実装する場合は、React Flowキャンバスを`html-to-image`でPNG化して埋め込む。エクスポート用には、背景、ノード、エッジ、ラベルが読める倍率でキャプチャする。

## 実装優先度

1. React Flowで通常のノードとエッジを表示する。
2. custom nodeで分類stripe、確度badge、情報充実度barを出す。
3. custom edgeで太線、破線、矢印、ラベルを出す。
4. ノードに下層プレートとshadowを付ける。
5. 右インスペクターと連動する。
6. bottleneck表示、hover、selected状態を整える。
7. html-to-imageで出力用キャプチャを確認する。

## やらないこと

- Three.js化。
- キャンバス全体の3D transform。
- ノードの大きな傾き。
- 読めないほど複雑なリボン表現。
- エッジ交差を自動解決する高度なレイアウトエンジン。
- 装飾目的のアニメーション。

