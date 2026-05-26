# 導線フローアニメーション仕様

作成日: 2026-05-21

## 目的

シナジーマップの導線（エッジ）上に、光の粒子が一定方向へ流れ続けるアニメーションを追加する。

静止の矢印だけでは伝わりにくい「**どの方向に、どれだけの勢いで流れているか**」を、会議や提案の場で直感的に理解できるようにする。

参考イメージは、拠点間の人の移動を可視化するフローマップ（流線図）。地理マップの「中心点 ↔ 各県」を、シナジーマップでは「**source ノード → target ノード**」に読み替える。

## 関連ドキュメント

| ドキュメント | 関係 |
| --- | --- |
| [シナジーマップ可視化ツール構想](./シナジーマップ可視化ツール構想.md) | Phase 6「矢印の流速アニメーション」として将来候補に言及 |
| [MVP-1 シナジーマップデザイン仕様](./synergy-map-design-mvp-1.md) | エッジ種別・色・太さの現行仕様。MVP では装飾アニメーションは対象外 |
| [Beta 実装計画](./implementation-plan-beta.md) | B9「マップの見やすさを改善する」、Phase 6 演出拡張と整合 |

## 現状

- マップ UI は `@xyflow/react` ベース。
- カスタムエッジ `SynergyEdge`（`src/features/map/SynergyMapCanvas.tsx`）でベジェ曲線、太さ、色、破線、矢印、ラベルを描画している。
- 導線データは `MapEdgeRow`（`src/lib/mvp1Types.ts`）で管理。
- **現時点では導線アニメーションは未実装。** 静止 SVG path のみ。

## 基本コンセプト

アニメーションの本質は次の一文で表せる。

> 中心点と各拠点を結ぶ**固定されたライン（軌跡）**の上を、**光の粒子（ドット）**が一定方向に繰り返し流れ続ける。

粒子が絶え間なく移動することで、方向性と流れの勢いを表現する。

## 3レイヤー構成

動線は以下 3 要素の重ね合わせで成立する。

### ① 軌跡（ベースライン）

| 項目 | 仕様 |
| --- | --- |
| 形状 | 既存の `getBezierPath` による曲線（現行と同じ） |
| 太さ | `strength` に応じて変化（現行 CSS を踏襲） |
| 不透明度 | 40〜60% 程度の半透明。背景グリッドが透ける |
| 矢印 | 現行の `markerEnd` を維持（粒子と併用可） |

### ② 粒子（移動するドット）

| 項目 | 仕様 |
| --- | --- |
| 形状 | 真円。初期版はトレイル（尾）なし |
| サイズ | ライン太さに比例（目安: 2〜4px 半径） |
| 色 | 導線種別と同系色。ラインより明度を上げ、発光感を出す |
| 数 | 1 本の導線あたり 1〜3 個（後述パラメータ参照） |

### ③ アニメーション（移動ロジック）

| 項目 | 仕様 |
| --- | --- |
| 移動 | path 形状に完全に沿った等速移動 |
| 方向 | `sourceNodeId` → `targetNodeId`（React Flow の向きに一致） |
| 速度 | 全粒子共通の一定速度（初期値: path 全長を 2.5 秒で通過） |
| ループ | 終点（100%）到達で消滅し、始点（0%）から再生成 |
| 密度 | 同一 path 上に複数粒子を時間差（delay）で配置し、途切れない流れを作る |
| イージング | 基本 `linear`。始点フェードイン・終点フェードアウトは任意（推奨） |

## 既存データとの対応

地理フローマップの概念を、シナジーマップの既存フィールドにマッピングする。

| フローマップ | シナジーマップ | 備考 |
| --- | --- | --- |
| 中心点 ↔ 拠点 | `sourceNodeId` → `targetNodeId` | 双方向は将来 `direction` フィールドで拡張 |
| 流入 / 流出 | エッジの向き | 常に source → target |
| 人数・流量 | `strength` | strong / normal / weak |
| 線の状態・色 | `edgeType` | strong, normal, weak, bottleneck, data_reference |
| 流れの種類 | `flowType` | awareness, inquiry, proposal, purchase など |
| 根拠の薄さ | `confidenceStatus` | 推定・要確認は粒子を弱める |
| 表示対象 | `adoptionStatus` | rejected は非表示（現行と同じ） |

### `strength` ごとの初期パラメータ

| strength | ベースライン | 粒子数 | 速度係数 | アニメーション |
| --- | --- | --- | --- | --- |
| strong | 3px、ハイロあり | 3 | 1.0（基準） | 有効 |
| normal | 2px | 2 | 0.85 | 有効 |
| weak | 2px dashed | 0 | — | **無効**（推定導線は静止） |
| bottleneck | 3px amber | 1 | 0.5（ゆっくり） | 有効（警告色） |
| data_reference | 細線 dashed | 0 | — | **無効** |

### `edgeType` ごとの色（粒子）

現行エッジ CSS（`src/App.css`）に合わせる。

| edgeType | ベース stroke | 粒子色（例） |
| --- | --- | --- |
| strong | `#168A83` | `rgba(22, 138, 131, 0.95)` |
| normal | slate / teal | `rgba(22, 138, 131, 0.75)` |
| weak | `#94a3b8` | アニメーションなし |
| bottleneck | amber | `rgba(217, 119, 6, 0.9)` |
| data_reference | `#64748b` | アニメーションなし |

## 制御パラメータ

実装時に定数または設定オブジェクトとして持つ項目。

```ts
type FlowAnimationConfig = {
  /** 1 粒子が path 全長を通過する秒数 */
  durationSec: number;
  /** 同一 path 上の粒子間隔（秒） */
  staggerSec: number;
  /** 粒子半径（px） */
  particleRadius: number;
  /** ベースライン不透明度（0-1） */
  trackOpacity: number;
  /** 始点・終点フェードを使うか */
  fadeEnds: boolean;
  /** アニメーション全体の ON/OFF */
  enabled: boolean;
};
```

### 推奨初期値

| パラメータ | 値 |
| --- | --- |
| `durationSec` | 2.5 |
| `staggerSec` | 0.6 |
| `particleRadius` | 3 |
| `trackOpacity` | 0.5 |
| `fadeEnds` | true |
| `enabled` | プレゼンモード時のみ true |

## 表示モードと ON/OFF 条件

アニメーションは常時 ON にしない。用途と操作感を優先する。

| 条件 | アニメーション |
| --- | --- |
| 整理モード（`editable === false`） | ON（設定で切替可） |
| 構造編集モード（`editable === true`） | OFF |
| PDF / 画像エクスポート時 | OFF（静止キャプチャ） |
| `prefers-reduced-motion: reduce` | OFF |
| weak / data_reference 導線 | OFF（粒子なし） |
| 導線が選択中 | 粒子をやや強調（サイズ or 不透明度 UP） |

UI 方針は [ui-design-mvp-1.md](./ui-design-mvp-1.md) の `prefers-reduced-motion` 対応と整合させる。

## 技術実装方針

### 採用アプローチ（現行）

**`SynergyEdge` 内の SVG 粒子 + 共有 1 本の `requestAnimationFrame`（React state 外）**

- 各エッジは計測用 `<path>` と `<circle>` を描画し、`flowParticleRegistry` に登録する。
- `FlowParticleRegistryProvider`（`src/features/map/flowParticleRegistry.tsx`）が **単一 RAF** で全登録エッジの粒子を更新する（`runFlowParticleFrame` in `flowParticleLoop.ts`）。
- **ノードドラッグ中**は粒子ループを停止し、エッジラベル衝突レイアウト（`computeEdgeLabelLayout`）もドラッグ開始時点のノード座標で凍結する（`SynergyMapCanvas` の `onNodeDragStart` / `layoutNodes` 切替）。ドラッグ終了時に 1 回だけ再計算する。

理由:

- エッジ別 RAF は導線数に比例してメインスレッド負荷が増えるため、共有ループに集約した。
- ドラッグ中の `flowNodes` 更新にラベルレイアウトが追従すると操作が重くなるため、凍結で回避する。

### 実装の流れ

1. `SynergyEdge` 内で `<path ref>` と `<circle>` を配置し、`useLayoutEffect` でレジストリに登録。
2. 共有ループで `getTotalLength()` / `getPointAtLength(t)` により各粒子の `cx` / `cy` / `r` / `opacity` を更新。
3. 粒子ごとに `(elapsed + delay) % duration` で進捗率 0〜1 を求める（`flowAnimationConfig` のフェード・選択強調を再利用）。
4. **毎フレーム `setState` しない。**
5. `animationEnabled === false`（構造編集・reduced-motion・ドラッグ中・キャプチャ抑制）のとき RAF を止める。

### 代替アプローチ

| 方式 | メリット | デメリット |
| --- | --- | --- |
| CSS `offset-path` + `animation` | 実装が短い | ブラウザ差、動的 path 更新時の再設定が必要 |
| 単一 Canvas オーバーレイ | 粒子数が増えても軽い | React Flow 座標変換との同期がやや複雑 |
| deck.gl TripsLayer | GIS 連携向き | 本アプリ規模では過剰 |

第一候補で問題が出た場合のみ Canvas オーバーレイを検討する。

### 触るファイル（現行）

| ファイル | 変更内容 |
| --- | --- |
| `src/features/map/SynergyMapCanvas.tsx` | `SynergyEdge`、ドラッグ中ラベル凍結、`FlowParticleRegistryProvider` |
| `src/features/map/flowParticleLoop.ts` | レジストリとフレーム更新ロジック |
| `src/features/map/flowParticleRegistry.tsx` | Context + 共有 RAF |
| `src/App.css` | 粒子・軌跡用スタイル、reduced-motion |
| `src/App.tsx` | 「流れを表示」トグル |

DB スキーマ変更は**不要**。既存 `MapEdgeRow` の `strength` / `edgeType` / `flowType` で足りる。

## パフォーマンス見積もり

| 規模 | 想定 | 評価 |
| --- | --- | --- |
| ノード | 10〜30 | 問題なし |
| 導線 | 15〜40 | 問題なし |
| 粒子総数 | 50〜120 | 問題なし |
| フレームレート | 60fps 目標 | RAF 1 本で十分 |

### 重くなる NG パターン

- 毎フレーム React state 更新による全体 re-render
- **エッジごとに独立した RAF ループ**（共有 1 本に集約すること）
- ノードドラッグ中に `computeEdgeLabelLayout` を毎フレーム実行すること
- 全導線に粒子 10 個以上
- weak / 仮説導線までアニメーション
- 編集モード中も常時アニメーション

### 軽量化ルール

- strong / normal / bottleneck のみ粒子を出す
- 画面外の導線は描画スキップ（Intersection または React Flow viewport 判定）
- ズームが極端に小さいときは粒子非表示（optional）

## 実装フェーズ

段階的に入れ、会議利用への影響を最小化する。

### Phase A: プロトタイプ

- [x] strong 導線のみ粒子 1 個を流す
- [x] 整理モード（`editable === false`）のみ有効
- [x] `prefers-reduced-motion` 対応

### Phase B: 本実装

- [x] strength 別の粒子数・速度・色
- [x] 複数粒子の stagger ループ
- [x] ベースライン半透明化
- [x] 始点・終点フェード

### Phase C: UX 仕上げ

- [x] プレゼンモード ON/OFF トグル
- [x] 選択中導線の強調
- [x] PDF 出力時の自動 OFF 確認
- [x] デモ workspace で見本表示

## 受け入れ条件

- [ ] 整理モードで strong 導線に粒子が source → target 方向へ流れる
- [ ] weak / data_reference 導線は従来どおり静止表示
- [ ] 編集モードではアニメーションが止まり、ドラッグ・接続操作が快適
- [ ] ノード移動・ズーム・パン後も粒子が path に追従する
- [ ] `prefers-reduced-motion` 環境でアニメーションが無効
- [ ] 通常規模（ノード 30 / 導線 40）で操作時にカクつきがない
- [ ] PDF / 画像キャプチャで静止した導線が正しく出力される

## やらないこと（初期版）

- Three.js / WebGL 化
- 粒子のトレイル（尾）エフェクト
- 双方向同時アニメーション（将来 `direction` 対応時）
- 流速を売上数値に比例させる精密マッピング（データが揃うまで見送り）
- 全導線常時アニメーション

## 将来拡張

- `direction: "reverse"` / `"bidirectional"` 対応時、粒子の向きを反転または双方向化
- `flowType` ごとに粒子色・アイコンを変える
- 売上・来店数などの実数データ連携後、粒子速度や太さを数値比例に
- プレゼン用フルスクリーンモード
- 動画 GIF / MP4 エクスポート

## 参考: モーション仕様（開発用）

| 項目 | 仕様 |
| --- | --- |
| 進捗計算 | `progress = ((time + delay) % duration) / duration` |
| 座標 | `point = path.getPointAtLength(progress * pathLength)` |
| 方向切替 | progress を `1 - progress` に反転（将来の reverse 用） |
| マルチドット | delay = `index * staggerSec` |
| フェード | progress < 0.08 で opacity 0→1、progress > 0.92 で 1→0 |

## 一言まとめ

導線フローアニメーションは、既存 React Flow カスタムエッジの上に SVG 粒子を載せる中程度の実装。シナジーマップの規模ではパフォーマンス問題になりにくく、**プレゼンモード限定・strong 中心** から段階導入するのが安全。
