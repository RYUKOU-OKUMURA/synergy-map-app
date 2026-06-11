import {
  Database,
  FileText,
  ListChecks,
  Plus,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import type * as React from "react";
import { useState } from "react";

import { Field, FormGrid, StatusChip } from "@/features/app/AppPrimitives";
import {
  type InformationSourceDraft,
  informationSourceOptions,
  sourceTypeLabel,
} from "@/features/sources/sourceTypes";
import { formatTime } from "@/lib/appFormatters";
import type { SourceFileRow } from "@/lib/mvp1Types";
import {
  reflectionStateLabel,
  reflectionSummaryText,
  type SourceReflectionRow,
  type WorkspaceReflectionSummary,
} from "@/lib/workspaceProgress";

export function SourcesView({
  canPickFiles,
  canSaveTextSource,
  generationBusy,
  onGenerateMap,
  onCreateInformationSource,
  onDeleteSource,
  onOpenExtractReview,
  onPickFiles,
  reflectionSummary,
}: {
  canPickFiles: boolean;
  canSaveTextSource: boolean;
  generationBusy: boolean;
  onGenerateMap: () => void;
  onCreateInformationSource: (draft: InformationSourceDraft) => Promise<boolean>;
  onDeleteSource: (source: SourceFileRow) => void;
  onOpenExtractReview: () => void;
  onPickFiles: () => void;
  reflectionSummary: WorkspaceReflectionSummary;
}) {
  const [draft, setDraft] = useState<InformationSourceDraft>({
    sourceKind: "manual_note",
    title: "",
    body: "",
    url: "",
  });
  const [isSourceSaving, setIsSourceSaving] = useState(false);
  const selectedOption =
    informationSourceOptions.find((option) => option.id === draft.sourceKind) ??
    informationSourceOptions[0];
  const needsUrl = draft.sourceKind === "website_url" || draft.sourceKind === "sns_url";
  const canSave =
    canSaveTextSource &&
    (needsUrl ? draft.url.trim().length > 0 : draft.body.trim().length > 0);
  const canSubmit = canSave && !isSourceSaving;

  function updateDraft<K extends keyof InformationSourceDraft>(
    key: K,
    value: InformationSourceDraft[K],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function submitInformationSource(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    setIsSourceSaving(true);
    try {
      const saved = await onCreateInformationSource(draft);
      if (saved) {
        setDraft({
          sourceKind: draft.sourceKind,
          title: "",
          body: "",
          url: "",
        });
      }
    } finally {
      setIsSourceSaving(false);
    }
  }

  return (
    <section className="page-panel">
      <div className="page-header">
        <div>
          <h1>情報ソース</h1>
          <p>ファイル、メモ、URL、SNS、商品情報をマップの材料として追加します。</p>
        </div>
      </div>
      <SourceReflectionOverview
        generationBusy={generationBusy}
        onGenerateMap={onGenerateMap}
        onOpenExtractReview={onOpenExtractReview}
        summary={reflectionSummary}
      />
      <form className="source-add-panel" onSubmit={submitInformationSource}>
        <div className="source-add-heading">
          <strong>情報ソースを追加</strong>
          <span>
            URLやSNSは本文を自動取得せず、入力したURLと補足メモを材料として扱います。
          </span>
        </div>
        <div className="source-kind-tabs" role="tablist" aria-label="情報ソース種別">
          {informationSourceOptions.map((option) => {
            const SourceIcon = option.icon;
            return (
              <button
                className={draft.sourceKind === option.id ? "active" : ""}
                disabled={isSourceSaving}
                key={option.id}
                onClick={() => updateDraft("sourceKind", option.id)}
                type="button"
              >
                <SourceIcon size={14} aria-hidden="true" />
                {option.label}
              </button>
            );
          })}
        </div>
        <FormGrid>
          <Field label="タイトル">
            <input
              disabled={isSourceSaving}
              onChange={(event) => updateDraft("title", event.target.value)}
              placeholder={selectedOption.label}
              value={draft.title}
            />
          </Field>
          {needsUrl ? (
            <Field label="URL">
              <input
                disabled={isSourceSaving}
                onChange={(event) => updateDraft("url", event.target.value)}
                placeholder={
                  draft.sourceKind === "sns_url"
                    ? "https://instagram.com/example"
                    : "https://example.com"
                }
                value={draft.url}
              />
            </Field>
          ) : null}
        </FormGrid>
        <Field label={needsUrl ? "補足メモ" : "内容"}>
          <textarea
            disabled={isSourceSaving}
            onChange={(event) => updateDraft("body", event.target.value)}
            placeholder={
              needsUrl
                ? "このURLから確認したいこと、見てほしい商品や導線など"
                : "事業、商品、集客、顧客接点、売上導線について分かっていること"
            }
            value={draft.body}
          />
        </Field>
        <div className="source-add-actions">
          <button className="primary-button" disabled={!canSubmit} type="submit">
            <Plus size={15} aria-hidden="true" />
            {isSourceSaving ? "保存中" : "情報ソースに追加"}
          </button>
          <small>
            URLやSNSは本文を自動取得せず、入力内容をローカルの材料として保存します。
          </small>
        </div>
      </form>
      <button
        className="drop-zone"
        disabled={!canPickFiles}
        onClick={onPickFiles}
        type="button"
      >
        <Upload size={24} aria-hidden="true" />
        <strong>ここにファイルをドロップ / クリックして選択</strong>
        <span>PDF / CSV / Excel / Markdown / Textを追加できます。</span>
      </button>
      <SourceReflectionList
        onDeleteSource={onDeleteSource}
        summary={reflectionSummary}
      />
    </section>
  );
}

function SourceReflectionOverview({
  generationBusy,
  onGenerateMap,
  onOpenExtractReview,
  summary,
}: {
  generationBusy: boolean;
  onGenerateMap: () => void;
  onOpenExtractReview: () => void;
  summary: WorkspaceReflectionSummary;
}) {
  const needsExtraction = summary.pendingExtractionCount > 0;
  const needsMapRefresh = summary.pendingMapCount > 0 || summary.mapRefreshNeeded;

  return (
    <section
      className={`source-overview ${
        needsExtraction || needsMapRefresh ? "source-overview-warning" : ""
      }`}
    >
      <div>
        <span className="section-kicker">反映状況</span>
        <strong>{reflectionSummaryText(summary)}</strong>
      </div>
      <div className="source-overview-stats">
        <StatusChip>{summary.sourceCount}ソース</StatusChip>
        <StatusChip>{summary.extractedSourceCount}抽出済み</StatusChip>
        <StatusChip>{summary.mappedSourceCount}マップ反映済み</StatusChip>
      </div>
      <div className="source-overview-actions">
        {needsExtraction ? (
          <button
            className="primary-button"
            onClick={onOpenExtractReview}
            type="button"
          >
            <ListChecks size={15} aria-hidden="true" />
            抽出カードを更新
          </button>
        ) : needsMapRefresh ? (
          <button
            className="primary-button"
            disabled={generationBusy}
            onClick={onGenerateMap}
            type="button"
          >
            <Sparkles size={15} aria-hidden="true" />
            {generationBusy ? "再生成中" : "追加内容でマップ再生成"}
          </button>
        ) : null}
      </div>
    </section>
  );
}

function SourceReflectionList({
  onDeleteSource,
  summary,
}: {
  onDeleteSource: (source: SourceFileRow) => void;
  summary: WorkspaceReflectionSummary;
}) {
  if (summary.rows.length === 0) {
    return (
      <div className="source-empty-state">
        <Database size={18} aria-hidden="true" />
        <strong>まだ情報ソースがありません</strong>
        <span>ファイル、メモ、URL、SNS、商品情報を追加するとここに表示されます。</span>
      </div>
    );
  }

  return (
    <section className="source-inventory">
      <div className="source-inventory-header">
        <strong>登録済みソース</strong>
        <span>抽出カードとマップへの反映状態</span>
      </div>
      <div className="source-grid">
        {summary.rows.map((row) => (
          <SourceReflectionCard
            key={row.source.id}
            onDeleteSource={onDeleteSource}
            row={row}
          />
        ))}
      </div>
    </section>
  );
}

function SourceReflectionCard({
  onDeleteSource,
  row,
}: {
  onDeleteSource: (source: SourceFileRow) => void;
  row: SourceReflectionRow;
}) {
  const SourceIcon =
    informationSourceOptions.find((option) => option.id === row.source.fileType)
      ?.icon ?? FileText;

  return (
    <article className={`source-row source-row-${row.mapState}`}>
      <SourceIcon size={16} aria-hidden="true" />
      <div className="source-row-main">
        <div className="source-row-title">
          <strong>{row.title}</strong>
          <span>{sourceTypeLabel(row.source.fileType)}</span>
        </div>
        {row.detail ? <small>{row.detail}</small> : null}
        <small>
          追加 {formatTime(row.source.createdAt)} / 読み取り {row.source.chunkCount}
          chunks
        </small>
      </div>
      <div className="source-row-progress">
        <span className={`reflection-pill reflection-pill-${row.extractionState}`}>
          {reflectionStateLabel(row.extractionState, "extract")}
        </span>
        <span className={`reflection-pill reflection-pill-${row.mapState}`}>
          {reflectionStateLabel(row.mapState, "map")}
        </span>
      </div>
      <div className="source-row-counts">
        <span>{row.extractedItemCount}カード</span>
        <span>{row.mappedItemCount}ノード</span>
      </div>
      <button
        aria-label={`${row.title}を削除`}
        className="ghost-button icon-button danger-button"
        onClick={() => onDeleteSource(row.source)}
        title="情報ソースを削除"
        type="button"
      >
        <Trash2 size={15} aria-hidden="true" />
      </button>
    </article>
  );
}
