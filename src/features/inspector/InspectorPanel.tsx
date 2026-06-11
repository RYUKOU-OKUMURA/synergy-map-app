import { MessageSquareText, Star, Trash2, X } from "lucide-react";
import type * as React from "react";
import { useState } from "react";

import { api } from "@/lib/api";
import {
  parseRelatedNodeIds,
  resolveCenterNodeId,
} from "@/features/map/mapLayoutModel";
import {
  adoptionOptions,
  categoryOptions,
  confidenceOptions,
  costLevelOptions,
  impactLevelOptions,
  priorityOptions,
  timeToImpactOptions,
} from "@/lib/mvp1Labels";
import type {
  ExtractedItemRow,
  MapEdgeRow,
  MapNodeRow,
  ProjectWorkspace,
  SuggestionRow,
} from "@/lib/mvp1Types";

function InspectorPanel({
  edge,
  isTauriRuntime,
  item,
  node,
  onClose,
  onSetCenterNode,
  onWorkspaceChange,
  projectId,
  suggestion,
  workspace,
}: {
  edge: MapEdgeRow | null;
  isTauriRuntime: boolean;
  item: ExtractedItemRow | null;
  node: MapNodeRow | null;
  onClose: () => void;
  onSetCenterNode: (nodeId: string | null) => void;
  onWorkspaceChange: (workspace: ProjectWorkspace) => void;
  projectId: string | null;
  suggestion: SuggestionRow | null;
  workspace: ProjectWorkspace;
}) {
  const [askBusy, setAskBusy] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const insightTargetKind = node ? "node" : edge ? "edge" : "map";
  const insightTargetId = node?.id ?? edge?.id ?? null;
  const resolvedCenterNodeId = resolveCenterNodeId(workspace);
  const selectedNodeIsCenter = Boolean(node && resolvedCenterNodeId === node.id);

  async function askMapInsight(questionType: string) {
    if (!projectId) return;
    setAskBusy(true);
    setAskError(null);
    try {
      if (!isTauriRuntime) {
        const now = new Date().toISOString();
        const targetLabel = node
          ? `ノード「${node.label}」`
          : edge
            ? "選択中の導線"
            : "マップ全体";
        onWorkspaceChange({
          ...workspace,
          aiComments: [
            {
              id: `local-insight-${Date.now()}`,
              projectId,
              aiRunId: null,
              commentType: "map_insight",
              title: "壁打ち: ローカルドラフト",
              body: `${targetLabel}について、情報ソース要約とマップ構造から確認するための下書きです。実際の状況では、重要度、担当、成果指標を確認してください。`,
              confidenceStatus: "estimated",
              createdAt: now,
            },
            ...workspace.aiComments,
          ],
        });
        return;
      }
      const result = await api.askMapInsight(
        projectId,
        insightTargetKind,
        insightTargetId,
        questionType,
      );
      onWorkspaceChange(result.workspace);
    } catch (caughtError) {
      setAskError(String(caughtError));
    } finally {
      setAskBusy(false);
    }
  }

  if (!item && !node && !edge && !suggestion) {
    return null;
  }

  async function submitItem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!item || !projectId || !isTauriRuntime) return;
    const form = new FormData(event.currentTarget);
    const nextWorkspace = await api.updateExtractedItem(projectId, item.id, {
      name: String(form.get("name") ?? ""),
      itemType: String(form.get("itemType") ?? "business"),
      description: String(form.get("description") ?? ""),
      confidenceStatus: String(form.get("confidenceStatus") ?? "estimated"),
      impactScore: Number(form.get("impactScore") ?? 2),
      subjectiveImportance: Number(form.get("subjectiveImportance") ?? 2),
      adoptionStatus: String(form.get("adoptionStatus") ?? "accepted"),
      memo: String(form.get("memo") ?? ""),
    });
    onWorkspaceChange(nextWorkspace);
  }

  async function submitNode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!node || !projectId || !isTauriRuntime) return;
    const form = new FormData(event.currentTarget);
    const nextWorkspace = await api.updateMapNode(projectId, node.id, {
      label: String(form.get("label") ?? ""),
      nodeType: String(form.get("nodeType") ?? "business"),
      description: String(form.get("description") ?? ""),
      confidenceStatus: String(form.get("confidenceStatus") ?? "estimated"),
      influenceLevel: String(form.get("influenceLevel") ?? "2"),
      informationRichness: String(form.get("informationRichness") ?? "50"),
      adoptionStatus: String(form.get("adoptionStatus") ?? "accepted"),
      memo: String(form.get("memo") ?? ""),
    });
    onWorkspaceChange(nextWorkspace);
  }

  async function submitEdge(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!edge || !projectId || !isTauriRuntime) return;
    const form = new FormData(event.currentTarget);
    const nextWorkspace = await api.updateMapEdge(projectId, edge.id, {
      label: String(form.get("label") ?? ""),
      flowType: String(form.get("flowType") ?? "inquiry"),
      strength: String(form.get("strength") ?? "normal"),
      confidenceStatus: String(form.get("confidenceStatus") ?? "estimated"),
      edgeType: String(form.get("edgeType") ?? "normal"),
      adoptionStatus: String(form.get("adoptionStatus") ?? "accepted"),
      note: String(form.get("note") ?? ""),
    });
    onWorkspaceChange(nextWorkspace);
  }

  async function hideEdge() {
    if (!edge || !projectId) return;
    if (!isTauriRuntime) {
      onWorkspaceChange({
        ...workspace,
        edges: workspace.edges.map((candidate) =>
          candidate.id === edge.id
            ? {
                ...candidate,
                adoptionStatus: "rejected",
                updatedAt: new Date().toISOString(),
              }
            : candidate,
        ),
      });
      return;
    }
    const nextWorkspace = await api.updateMapEdge(projectId, edge.id, {
      label: edge.label ?? "",
      flowType: edge.flowType ?? "inquiry",
      strength: edge.strength ?? "normal",
      confidenceStatus: edge.confidenceStatus ?? "estimated",
      edgeType: edge.edgeType,
      adoptionStatus: "rejected",
      note: edge.note ?? "",
    });
    onWorkspaceChange(nextWorkspace);
  }

  async function submitSuggestion(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!suggestion || !projectId || !isTauriRuntime) return;
    const form = new FormData(event.currentTarget);
    const nextWorkspace = await api.updateSuggestion(projectId, suggestion.id, {
      title: String(form.get("title") ?? ""),
      description: String(form.get("description") ?? ""),
      priority: String(form.get("priority") ?? "medium"),
      adoptionStatus: String(form.get("adoptionStatus") ?? "pending"),
      rationale: String(form.get("rationale") ?? ""),
      expectedRevenueImpact: String(form.get("expectedRevenueImpact") ?? "medium"),
      expectedProfitImpact: String(form.get("expectedProfitImpact") ?? "medium"),
      costLevel: String(form.get("costLevel") ?? "medium"),
      effortLevel: String(form.get("effortLevel") ?? "medium"),
      timeToImpact: String(form.get("timeToImpact") ?? "mid"),
      confidenceStatus: String(form.get("confidenceStatus") ?? "estimated"),
      impactScore: Number(form.get("impactScore") ?? 50),
      evidence: String(form.get("evidence") ?? ""),
      memo: String(form.get("memo") ?? ""),
    });
    onWorkspaceChange(nextWorkspace);
  }

  return (
    <aside className="inspector">
      <div className="panel-heading">
        <div>
          <span>
            {item ? "抽出カード" : node ? "ノード" : edge ? "導線" : "施策候補"}
          </span>
          <small>編集</small>
        </div>
        <button
          aria-label="詳細パネルを閉じる"
          className="panel-close-button"
          onClick={onClose}
          type="button"
        >
          <X size={15} aria-hidden="true" />
        </button>
      </div>
      {!item && !suggestion ? (
        <MapInsightActions
          busy={askBusy}
          error={askError}
          onAsk={askMapInsight}
          targetLabel={node ? node.label : edge ? "選択中の導線" : "マップ全体"}
        />
      ) : null}
      {node ? (
        <div className="inspector-center-actions">
          <div>
            <strong>売上の核</strong>
            <span>
              {selectedNodeIsCenter
                ? "このノードが現在の中心です。"
                : "このノードをマップの中心として強調できます。"}
            </span>
          </div>
          <button
            className={selectedNodeIsCenter ? "ghost-button" : "primary-button"}
            onClick={() => onSetCenterNode(selectedNodeIsCenter ? null : node.id)}
            type="button"
          >
            <Star size={14} aria-hidden="true" />
            {selectedNodeIsCenter ? "核指定を解除" : "売上の核にする"}
          </button>
        </div>
      ) : null}
      {item ? <ItemForm item={item} onSubmit={submitItem} /> : null}
      {node ? <NodeForm node={node} onSubmit={submitNode} /> : null}
      {edge ? <EdgeForm edge={edge} onHide={hideEdge} onSubmit={submitEdge} /> : null}
      {suggestion ? (
        <SuggestionForm
          suggestion={suggestion}
          workspace={workspace}
          onSubmit={submitSuggestion}
        />
      ) : null}
    </aside>
  );
}

function MapInsightActions({
  busy,
  error,
  onAsk,
  targetLabel,
}: {
  busy: boolean;
  error: string | null;
  onAsk: (questionType: string) => void;
  targetLabel: string;
}) {
  return (
    <div className="map-insight-actions">
      <div className="map-insight-header">
        <MessageSquareText size={14} aria-hidden="true" />
        <span>Codexに聞く</span>
        <small>{targetLabel}</small>
      </div>
      <div className="map-insight-buttons">
        <button disabled={busy} onClick={() => onAsk("explain")} type="button">
          これは何？
        </button>
        <button disabled={busy} onClick={() => onAsk("importance")} type="button">
          なぜ重要？
        </button>
        <button disabled={busy} onClick={() => onAsk("bottleneck")} type="button">
          詰まりは？
        </button>
        <button disabled={busy} onClick={() => onAsk("next_questions")} type="button">
          次に聞くこと
        </button>
        <button disabled={busy} onClick={() => onAsk("revenue_action")} type="button">
          売上への一手
        </button>
      </div>
      {busy ? <small className="map-insight-status">Codex確認中...</small> : null}
      {error ? <small className="map-insight-error">{error}</small> : null}
    </div>
  );
}

function SuggestionForm({
  onSubmit,
  suggestion,
  workspace,
}: {
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  suggestion: SuggestionRow;
  workspace: ProjectWorkspace;
}) {
  return (
    <form className="inspector-form" key={suggestion.id} onSubmit={onSubmit}>
      <Field label="施策名">
        <input defaultValue={suggestion.title} name="title" />
      </Field>
      <Field label="やること">
        <textarea defaultValue={suggestion.description} name="description" />
      </Field>
      <FormGrid>
        <Field label="優先度">
          <select defaultValue={suggestion.priority} name="priority">
            {priorityOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="状態">
          <select defaultValue={suggestion.adoptionStatus} name="adoptionStatus">
            {adoptionOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      </FormGrid>
      <FormGrid>
        <Field label="売上影響">
          <select
            defaultValue={suggestion.expectedRevenueImpact}
            name="expectedRevenueImpact"
          >
            {impactLevelOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="利益影響">
          <select
            defaultValue={suggestion.expectedProfitImpact}
            name="expectedProfitImpact"
          >
            {impactLevelOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      </FormGrid>
      <FormGrid>
        <Field label="費用">
          <select defaultValue={suggestion.costLevel} name="costLevel">
            {costLevelOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="工数">
          <select defaultValue={suggestion.effortLevel} name="effortLevel">
            {costLevelOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      </FormGrid>
      <FormGrid>
        <Field label="時期">
          <select defaultValue={suggestion.timeToImpact} name="timeToImpact">
            {timeToImpactOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="確度">
          <select defaultValue={suggestion.confidenceStatus} name="confidenceStatus">
            {confidenceOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      </FormGrid>
      <Field label="インパクトスコア">
        <input
          defaultValue={suggestion.impactScore}
          max={100}
          min={0}
          name="impactScore"
          type="number"
        />
      </Field>
      <Field label="判断理由">
        <textarea defaultValue={suggestion.rationale ?? ""} name="rationale" />
      </Field>
      <Field label="根拠">
        <textarea defaultValue={suggestion.evidence ?? ""} name="evidence" />
      </Field>
      <Field label="メモ">
        <textarea defaultValue={suggestion.memo ?? ""} name="memo" />
      </Field>
      <SuggestionSources suggestion={suggestion} workspace={workspace} />
      <button className="primary-button" type="submit">
        保存
      </button>
    </form>
  );
}

function SuggestionSources({
  suggestion,
  workspace,
}: {
  suggestion: SuggestionRow;
  workspace: ProjectWorkspace;
}) {
  const relatedNodeIds = parseRelatedNodeIds(suggestion.relatedNodeIdsJson);
  const relatedNodes = workspace.nodes.filter((node) =>
    relatedNodeIds.includes(node.id),
  );
  const relatedItems = workspace.extractedItems.filter((item) =>
    relatedNodes.some((node) => node.extractedItemId === item.id),
  );
  const sources = relatedItems.flatMap((item) => item.sources);

  return (
    <div className="source-list">
      <span>根拠ノード・source</span>
      {relatedNodes.length === 0 ? <small>関連ノード未設定</small> : null}
      {relatedNodes.map((node) => (
        <small key={node.id}>{node.label}</small>
      ))}
      {sources.map((source) => (
        <small key={source.id}>
          {source.sourceFileName ?? "source"}
          {source.pageNumber ? ` p.${source.pageNumber}` : ""}
          {source.rowStart ? ` row ${source.rowStart}` : ""}
        </small>
      ))}
    </div>
  );
}

function ItemForm({
  item,
  onSubmit,
}: {
  item: ExtractedItemRow;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form className="inspector-form" key={item.id} onSubmit={onSubmit}>
      <Field label="名前">
        <input defaultValue={item.name} name="name" />
      </Field>
      <Field label="分類">
        <select defaultValue={item.itemType} name="itemType">
          {categoryOptions.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="説明">
        <textarea defaultValue={item.description ?? ""} name="description" />
      </Field>
      <FormGrid>
        <Field label="確度">
          <select defaultValue={item.confidenceStatus} name="confidenceStatus">
            {confidenceOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="影響力">
          <input
            defaultValue={item.impactScore}
            max={3}
            min={1}
            name="impactScore"
            type="number"
          />
        </Field>
      </FormGrid>
      <FormGrid>
        <Field label="主観重要度">
          <input
            defaultValue={item.subjectiveImportance}
            max={3}
            min={1}
            name="subjectiveImportance"
            type="number"
          />
        </Field>
        <Field label="状態">
          <select defaultValue={item.adoptionStatus} name="adoptionStatus">
            {adoptionOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      </FormGrid>
      <Field label="メモ">
        <textarea defaultValue={item.memo ?? ""} name="memo" />
      </Field>
      <SourceList item={item} />
      <button className="primary-button" type="submit">
        保存
      </button>
    </form>
  );
}

function NodeForm({
  node,
  onSubmit,
}: {
  node: MapNodeRow;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form className="inspector-form" key={node.id} onSubmit={onSubmit}>
      <Field label="名前">
        <input defaultValue={node.label} name="label" />
      </Field>
      <Field label="分類">
        <select defaultValue={node.nodeType} name="nodeType">
          {categoryOptions.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="説明">
        <textarea defaultValue={node.description ?? ""} name="description" />
      </Field>
      <FormGrid>
        <Field label="確度">
          <select
            defaultValue={node.confidenceStatus ?? "estimated"}
            name="confidenceStatus"
          >
            {confidenceOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="影響力">
          <input
            defaultValue={node.influenceLevel ?? "2"}
            max={3}
            min={1}
            name="influenceLevel"
            type="number"
          />
        </Field>
      </FormGrid>
      <FormGrid>
        <Field label="情報充実度">
          <input
            defaultValue={node.informationRichness ?? "50"}
            max={100}
            min={0}
            name="informationRichness"
            type="number"
          />
        </Field>
        <Field label="状態">
          <select defaultValue={node.adoptionStatus} name="adoptionStatus">
            {adoptionOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      </FormGrid>
      <Field label="メモ">
        <textarea defaultValue={node.memo ?? ""} name="memo" />
      </Field>
      <button className="primary-button" type="submit">
        保存
      </button>
    </form>
  );
}

function EdgeForm({
  edge,
  onHide,
  onSubmit,
}: {
  edge: MapEdgeRow;
  onHide: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form className="inspector-form" key={edge.id} onSubmit={onSubmit}>
      <Field label="ラベル">
        <input defaultValue={edge.label ?? ""} name="label" />
      </Field>
      <FormGrid>
        <Field label="線の状態">
          <select defaultValue={edge.edgeType} name="edgeType">
            <option value="strong">強い導線</option>
            <option value="normal">通常</option>
            <option value="weak">弱い導線</option>
            <option value="bottleneck">詰まり</option>
            <option value="data_reference">データ根拠</option>
          </select>
        </Field>
        <Field label="強さ">
          <select defaultValue={edge.strength ?? "normal"} name="strength">
            <option value="strong">strong</option>
            <option value="normal">normal</option>
            <option value="weak">weak</option>
          </select>
        </Field>
      </FormGrid>
      <FormGrid>
        <Field label="流れ">
          <select defaultValue={edge.flowType ?? "inquiry"} name="flowType">
            <option value="awareness">認知</option>
            <option value="inquiry">問い合わせ</option>
            <option value="proposal">提案</option>
            <option value="purchase">購入</option>
            <option value="retention">継続</option>
            <option value="referral">紹介</option>
            <option value="data_reference">データ連携</option>
          </select>
        </Field>
        <Field label="確度">
          <select
            defaultValue={edge.confidenceStatus ?? "estimated"}
            name="confidenceStatus"
          >
            {confidenceOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      </FormGrid>
      <Field label="状態">
        <select defaultValue={edge.adoptionStatus} name="adoptionStatus">
          {adoptionOptions.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="メモ">
        <textarea defaultValue={edge.note ?? ""} name="note" />
      </Field>
      <div className="form-actions">
        <button className="ghost-button danger-button" onClick={onHide} type="button">
          <Trash2 size={14} aria-hidden="true" />
          非表示
        </button>
        <button className="primary-button" type="submit">
          保存
        </button>
      </div>
    </form>
  );
}

function SourceList({ item }: { item: ExtractedItemRow }) {
  return (
    <div className="source-list">
      <span>出典</span>
      {item.sources.length === 0 ? <small>出典なし</small> : null}
      {item.sources.map((source) => (
        <small key={source.id}>
          {source.sourceFileName ?? "source"}
          {source.pageNumber ? ` p.${source.pageNumber}` : ""}
          {source.rowStart ? ` row ${source.rowStart}` : ""}
        </small>
      ))}
    </div>
  );
}

function Field({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function FormGrid({ children }: { children: React.ReactNode }) {
  return <div className="form-grid">{children}</div>;
}

export { InspectorPanel };
