# インシデントレポート: 整理モード（観覧モード）導線非表示

作成日: 2026-05-21  
ステータス: **解決済み（2026-05-26）** — `MapLayoutCoordinator` + `mergeFlowNodes` / `mergeFlowEdges` による再実装  
関連セッション: `整理モード導線デバッグ` (`b4987a36-242f-40ca-8f78-3af36f773368`)

---

## 1. 背景と目的

### やりたかったこと

「閲覧モード」でもノードをドラッグしてレイアウトを整えられるようにし、編集モードは「構造変更（リサイズ・導線追加/非表示）」専用として役割を分ける。

| モード | `editable` | 想定される操作 |
|--------|------------|----------------|
| 整理（旧・閲覧） | `false` | パン/ズーム、ノード選択、**ノード移動+保存**、導線アニメーション |
| 構造編集（旧・編集） | `true` | 上記 + リサイズ、導線追加、導線非表示 |

`editable` の意味を「構造編集可能」に寄せ、ノード移動は常時許可する方針。バックエンド変更は不要（既存の `handleSavePositions` / `save_map_layout` をそのまま利用）。

---

## 2. 実装した内容（機能側）

### 2.1 `SynergyMapCanvas.tsx`

| 項目 | 変更前 | 変更後 |
|------|--------|--------|
| `nodesDraggable` | `editable` | `true`（常時） |
| `onNodeDragStop` | `editable` のときだけ保存 | 常時 `onPositionsChange` |
| `nodeDragThreshold` | `0` | `4`（誤ドラッグ防止） |
| ノード CSS クラス | `map-node-readonly` | `map-node-readonly map-node-arrangeable` 追加 |
| workspace 同期 | `setNodes(initialNodes)` 全置換 | `mergeFlowNodes()` で `measured` / `width` / `height` を保持しながらマージ（後述） |

### 2.2 `App.tsx`

- ツールバーラベル: 「閲覧 / 編集」→「整理 / 構造編集」
- モード別ヒント文言の更新
- `editable={editMode}` の意味は変更なし（構造編集 ON/OFF）

### 2.3 `App.css`

- 整理モードの grab カーソル、ドラッグ中フィードバック
- `.map-node-readonly .map-handle { display: none }`（ハンドル非表示）
- `.map-edit-hint` 幅調整

### 2.4 ドキュメント

- `docs/tech-stack.md` — 整理 vs 構造編集の切り分け追記
- `docs/design/flow-animation-spec.md` — 同上

---

## 3. 発生した問題（症状）

整理モード（`editable=false`）**だけ**、以下が表示されない。

- 導線（エッジの線本体）
- 粒子アニメーション（「流れを表示」ON 時）

ユーザー観察:

- **構造編集モード**では導線が見える
- **「整える」操作後**（ノードを動かした後）も見えることがある
- **整理モードの初回表示**で見えない

「流れが表示されなくなった」→「導線も表示されてない」→「構造編集だけ見える、観覧だけ見えない」と段階的に報告。

---

## 4. デバッグで判明したこと

### 4.1 却下された仮説

| ID | 仮説 | 結果 | 根拠 |
|----|------|------|------|
| A | `globalFlowAnimationEnabled` が false | **却下** | ログ: `globalFlowAnimationEnabled: true`, `animated: 6` |
| B | `flowEdges` 状態が古い | **却下** | `flowAnimation` が 6 本に正しく付与 |
| C | 全エッジが weak / data_reference | **却下** | `hasAnim: true` のエッジが存在 |
| E | `displayEdges` 生成時に `flowAnimation` が落ちる | **却下** | `flowEdgeStateAnimated: 6` が一貫 |

アニメーション設定・エッジデータ自体は正常。**表示ロジックの上流（React Flow の path 計算）** に問題がある。

### 4.2 確認された仮説

| ID | 仮説 | 結果 | 根拠 |
|----|------|------|------|
| D | エッジ path の長さが ≈ 0 | **確認** | `pathLength ≈ 0.00001`。ドラッグ中は `47+` px |
| F | `fitView={!editable}` とノード計測のタイミングずれ | **確認** | 整理モード切替・初回表示で fitView が先に走る |
| G | ドラッグ保存 → `setNodes` 全置換で `measured` 消失 | **確認（部分）** | 保存ループで path 再発。ただし初回表示でも再現 |

### 4.3 最新ログ（CanvasLayoutSync 試行時）

`.cursor/debug-b4987a.log` より:

```json
{"message":"nodes initialized layout sync","data":{"editable":false,"nodeCount":6,"measuredCount":6}}
{"message":"edge animation path sample","data":{"pathLength":0,"sourceX":-260,"sourceY":-56,"targetX":-260,"targetY":-56}}
```

**重要:** ノード 6 個すべて `measuredCount: 6` なのに、全エッジの source/target 座標が **同一点 (-260, -56)** に潰れ、`pathLength: 0`。

→ 「未計測」だけでは説明できず、**ハンドル位置の内部計算自体が壊れている**可能性が高い。

### 4.4 整理モードだけ壊れる理由（推定）

整理モード固有の条件:

1. `fitView={!editable}` — 整理モードだけ React Flow が自動 fitView
2. `isGlobalFlowAnimationEnabled` — 整理モードだけ粒子 ON（線自体はモード非依存のはず）
3. 整理モードでドラッグ保存を有効化 → workspace 更新 → `initialNodes` 再生成ループ

構造編集では `fitView` が走らないため、viewport / path 計算のタイミング問題が表面化しにくい。

---

## 5. 試した修正と結果

### 修正 1: pathLength 待機 + fitView prop 削除

**内容:**

- `fitView={false}` に変更
- 粒子 RAF で `MIN_FLOW_PATH_LENGTH = 4` 以上になるまで待機
- `pathRef` 未準備時も RAF 継続

**意図:** path が 0 の瞬間にアニメーションが空振りするのを防ぐ。

**結果:** ❌ **悪化** — `animation tick running` が 0 件。fitView が走らず viewport がずれ、導線ごと画面外に。

---

### 修正 2: `scheduleFitView` + `onInit`

**内容:**

- `onInit` と整理モード切替時に `scheduleFitView()` を呼ぶ
- double `requestAnimationFrame` で計測待ち
- pathLength 待機は維持

**意図:** fitView prop 削除の副作用（画面外）を補う。

**結果:** ❌ 整理モードに戻るたび fitView が再実行され、**未計測の path が固定**される。構造編集では見え、整理だけ見えない状態が再現。

---

### 修正 3: fitView を初回のみ + ノード計測後に `setEdges` 再描画

**内容:**

- モード切替時の fitView を廃止
- `tryFitViewOnce` — ビュー/ノード数スコープで 1 回だけ fitView
- `useNodesInitialized` 相当のタイミングで `setEdges(eds => eds.map(...))` による path 再計算

**意図:** 切替時 viewport 維持 + 計測後に edge refresh。

**結果:** ❌ ユーザー報告「やっぱり表示されてない」。

---

### 修正 4: ドラッグ実装の見直し（`mergeFlowNodes`）

**内容:**

- fitView まわりの暫定パッチを削除し、`fitView={!editable}` を復元
- `setNodes(initialNodes)` → `mergeFlowNodes(current, initialNodes)` に変更
- `measured` / `width` / `height` / `selected` / `dragging` をマージ保持
- デバッグログ削除

**意図:** 根本原因は「ドラッグ保存 → 全置換 → measured 消失」。

**結果:** ❌ ユーザー報告「やっぱり表示されてない」。初回表示でも再現するため、保存ループだけでは説明不足。

---

### 修正 5: `CanvasLayoutSync`（`useNodesInitialized`）

**内容:**

- `fitView={!editable}` prop を削除
- React Flow 子コンポーネント `CanvasLayoutSync` を追加
  - ノード計測完了後に edge を 1 回 refresh
  - 初回が整理モードのときだけ fitView を 1 回
  - モード切替では fitView しない
- `mergeFlowNodes` 維持
- 検証用ログ再投入

**結果:** ❌ ログ上 `measuredCount: 6` でも source/target が同一座標、`pathLength: 0`。ユーザー報告「表示されない」。

---

## 6. 修正が効かなかった理由（現時点の理解）

1. **単一原因ではない** — `measured` 消失、fitView タイミング、edge path 再計算、viewport ずれが絡み合っている。
2. **fitView 問題と保存ループ問題は別軸** — mergeFlowNodes は保存後向け。初回表示の不具合は別原因。
3. **計測完了 ≠ path 正常** — 最新ログでは measured 済みでも handle 座標が全部同一点。React Flow 内部の edge routing / handle position 更新が走っていない可能性。
4. **パッチの積み上げで複雑化** — fitView ON/OFF、scheduleFitView、tryFitViewOnce などが相互に副作用を生んだ。

---

## 7. 解決後のコード状態（2026-05-26）

- ツールバー: 「整理 / 構造編集」
- `nodesDraggable` 常時 true（構造編集は `nodesConnectable` / `NodeResizer` / Handle のみ `editable` 依存）
- `onNodeDragStop` → debounce 保存（400ms）+ ドラッグ直後 1s の position ガード
- [`MapLayoutCoordinator.tsx`](../../src/features/map/MapLayoutCoordinator.tsx): `useNodesInitialized` → `useUpdateNodeInternals` → 整理モード初回のみ imperative `fitView`
- [`mergeFlowNodes.ts`](../../src/features/map/mergeFlowNodes.ts) / [`mergeFlowEdges.ts`](../../src/features/map/mergeFlowEdges.ts): workspace 同期時に RF 内部 state を保持
- `fitView` prop は使用しない

---

## 8. 採用した解決手順（再実装時のチェックリスト）

1. **インフラ先行:** `MapLayoutCoordinator` で path 計算パイプラインを固めてから常時ドラッグを有効化
2. **fitView:** prop 廃止。`nodesInitialized` 後に 1 回だけ。モード切替では fitView しない
3. **保存ループ:** `mergeFlowNodes` + debounce + ドラッグガードで `measured` 消失を防ぐ
4. **モード切替:** `mergeFlowEdges` で `flowAnimation` のみ patch（edge 全 remount を避ける）
5. **禁止:** handle の `display: none`、`setEdges(map)` のみでの path 再計算、fitView パッチの積み上げ

---

## 9. 関連ファイル

| ファイル | 役割 |
|----------|------|
| `src/features/map/SynergyMapCanvas.tsx` | Canvas 本体、React Flow 設定 |
| `src/features/map/MapLayoutCoordinator.tsx` | 計測後の internals 更新と fitView |
| `src/features/map/mergeFlowNodes.ts` | ノード同期マージ |
| `src/features/map/mergeFlowEdges.ts` | エッジ同期マージ（粒子 patch） |
| `src/features/map/flowAnimationConfig.ts` | 整理モード限定の粒子 ON/OFF |
| `src/App.tsx` | 編集モード切替、位置保存 |
| `src/App.css` | 整理モード用スタイル |
| `.cursor/debug-b4987a.log` | デバッグセッション NDJSON ログ |

---

## 10. タイムライン（要約）

| 段階 | 内容 | 結果 |
|------|------|------|
| 1 | 整理モード常時ドラッグ + UI 文言変更を実装 | 機能は動くが導線非表示 |
| 2 | ログ計測 → pathLength ≈ 0 を特定 | 原因候補を絞込 |
| 3 | fitView prop 削除 + path 待機 | 画面外に悪化 |
| 4 | scheduleFitView / onInit | 整理モード切替で再発 |
| 5 | fitView 初回のみ + edge refresh | 効果なし |
| 6 | mergeFlowNodes で保存ループ修正 | 初回表示は未解決 |
| 7 | CanvasLayoutSync（useNodesInitialized） | measured 済みでも path 0 |
| 8 | ユーザー報告「やっぱり表示されてない」 | ロールバック |
| 9 | MapLayoutCoordinator + mergeFlowNodes/Edges | **解決（2026-05-26）** |

---

## 11. 教訓

- **React Flow の `fitView` prop と `setNodes` 全置換は edge path に強く影響する。** 整理モード固有の fitView と、常時ドラッグによる保存ループを同時に入れると、既存の安定動作を壊しやすい。
- **粒子が見えない ≠ アニメーション設定の問題。** pathLength と handle 座標を先に確認すべき。
- **パッチを足す前に、整理モード常時ドラッグのデータフロー（dragStop → save → initialNodes → setNodes）を最初から設計し直す** 方が早い可能性が高い。
