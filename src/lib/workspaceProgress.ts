import type { ViewId } from "@/lib/appViewTypes";
import type { ProjectWorkspace, SourceFileRow, SuggestionRow } from "@/lib/mvp1Types";

export type SourceReflectionState =
  | "needs_extraction"
  | "extracted"
  | "no_cards"
  | "needs_map"
  | "mapped"
  | "not_ready";

export type SourceReflectionRow = {
  source: SourceFileRow;
  title: string;
  detail: string | null;
  extractedItemCount: number;
  mappedItemCount: number;
  extractionState: SourceReflectionState;
  mapState: SourceReflectionState;
};

export type WorkspaceReflectionSummary = {
  rows: SourceReflectionRow[];
  sourceCount: number;
  pendingExtractionCount: number;
  extractedSourceCount: number;
  noCardSourceCount: number;
  pendingMapCount: number;
  mappedSourceCount: number;
  missingSourceReferenceCount: number;
  mapRefreshNeeded: boolean;
};

export function sortByDateDesc(
  left: string | null | undefined,
  right: string | null | undefined,
) {
  return (timestampMillis(right) ?? 0) - (timestampMillis(left) ?? 0);
}

function latestRunCreatedAt(workspace: ProjectWorkspace, runType: string) {
  return (
    workspace.aiRuns.find((run) => run.runType === runType)?.completedAt ??
    workspace.aiRuns.find((run) => run.runType === runType)?.createdAt ??
    null
  );
}

export function shouldRegenerateMap(workspace: ProjectWorkspace) {
  return (
    workspace.nodes.length > 0 &&
    (hasAcceptedItemWithoutMapNode(workspace) ||
      hasItemEditedAfterMapGeneration(workspace))
  );
}

function sourceDisplayTitle(source: SourceFileRow) {
  return (
    metadataString(source.metadataJson, "title") ??
    metadataString(source.metadataJson, "url") ??
    source.fileName
  );
}

function sourceDisplayDetail(source: SourceFileRow) {
  const url = metadataString(source.metadataJson, "url");
  if (url) return url;
  if (source.fileType === "onboarding_brief") return "初回マップ作成で入力した情報";
  return null;
}

export function buildWorkspaceReflectionSummary(
  workspace: ProjectWorkspace,
): WorkspaceReflectionSummary {
  const latestExtractTime = timestampMillis(
    latestRunCreatedAt(workspace, "extract_items"),
  );
  const latestMapTime = timestampMillis(latestRunCreatedAt(workspace, "generate_map"));
  const chunksBySource = new Map<string, typeof workspace.sourceChunks>();

  for (const chunk of workspace.sourceChunks) {
    const current = chunksBySource.get(chunk.sourceFileId) ?? [];
    current.push(chunk);
    chunksBySource.set(chunk.sourceFileId, current);
  }
  const knownSourceFileIds = new Set(workspace.sourceFiles.map((source) => source.id));
  const knownSourceChunkIds = new Set(workspace.sourceChunks.map((chunk) => chunk.id));
  const missingSourceReferenceCount = workspace.extractedItems.filter((item) =>
    item.sources.some(
      (source) =>
        (source.sourceFileId !== null &&
          !knownSourceFileIds.has(source.sourceFileId)) ||
        (source.sourceChunkId !== null &&
          !knownSourceChunkIds.has(source.sourceChunkId)) ||
        (source.sourceFileId === null && source.sourceChunkId === null),
    ),
  ).length;

  const mappedItemIds = new Set(
    workspace.nodes
      .filter((node) => node.adoptionStatus !== "rejected")
      .map((node) => node.extractedItemId)
      .filter((id): id is string => Boolean(id)),
  );

  const rows = workspace.sourceFiles.map((source) => {
    const sourceChunks = chunksBySource.get(source.id) ?? [];
    const sourceChunkIds = new Set(sourceChunks.map((chunk) => chunk.id));
    const linkedItems = workspace.extractedItems.filter(
      (item) =>
        item.adoptionStatus !== "rejected" &&
        item.sources.some(
          (itemSource) =>
            itemSource.sourceFileId === source.id ||
            (itemSource.sourceChunkId
              ? sourceChunkIds.has(itemSource.sourceChunkId)
              : false),
        ),
    );
    const acceptedLinkedItems = linkedItems.filter(
      (item) => item.adoptionStatus === "accepted",
    );
    const mappedItemCount = acceptedLinkedItems.filter((item) =>
      mappedItemIds.has(item.id),
    ).length;
    const sourceTimes = [
      timestampMillis(source.createdAt),
      timestampMillis(source.updatedAt),
      ...sourceChunks.map((chunk) => timestampMillis(chunk.createdAt)),
    ].filter((time): time is number => typeof time === "number");
    const latestSourceTime = sourceTimes.length > 0 ? Math.max(...sourceTimes) : null;
    const hasReadableChunks =
      (sourceChunks.length > 0 || source.chunkCount > 0) && source.status !== "error";
    const addedAfterExtraction =
      latestSourceTime !== null &&
      latestExtractTime !== null &&
      latestSourceTime > latestExtractTime;
    const addedAfterMap =
      latestSourceTime !== null &&
      latestMapTime !== null &&
      latestSourceTime > latestMapTime;
    const itemEditedAfterMap =
      latestMapTime !== null &&
      acceptedLinkedItems.some((item) => {
        const itemTime = timestampMillis(item.updatedAt);
        return itemTime !== null && itemTime > latestMapTime;
      });

    let extractionState: SourceReflectionState;
    if (!hasReadableChunks) {
      extractionState = "not_ready";
    } else if (linkedItems.length === 0) {
      extractionState = latestExtractTime ? "no_cards" : "needs_extraction";
    } else if (addedAfterExtraction) {
      extractionState = "needs_extraction";
    } else {
      extractionState = "extracted";
    }

    let mapState: SourceReflectionState;
    if (extractionState === "not_ready") {
      mapState = "not_ready";
    } else if (extractionState === "needs_extraction") {
      mapState = "needs_extraction";
    } else if (acceptedLinkedItems.length === 0) {
      mapState = "no_cards";
    } else if (
      workspace.nodes.length === 0 ||
      (latestMapTime !== null && (addedAfterMap || itemEditedAfterMap)) ||
      mappedItemCount < acceptedLinkedItems.length
    ) {
      mapState = "needs_map";
    } else {
      mapState = "mapped";
    }

    return {
      source,
      title: sourceDisplayTitle(source),
      detail: sourceDisplayDetail(source),
      extractedItemCount: linkedItems.length,
      mappedItemCount,
      extractionState,
      mapState,
    };
  });

  const pendingExtractionCount = rows.filter(
    (row) => row.extractionState === "needs_extraction",
  ).length;
  const pendingMapCount = rows.filter((row) => row.mapState === "needs_map").length;

  return {
    rows,
    sourceCount: rows.length,
    pendingExtractionCount,
    extractedSourceCount: rows.filter((row) => row.extractionState === "extracted")
      .length,
    noCardSourceCount: rows.filter((row) => row.extractionState === "no_cards").length,
    pendingMapCount,
    mappedSourceCount: rows.filter((row) => row.mapState === "mapped").length,
    missingSourceReferenceCount,
    mapRefreshNeeded:
      pendingMapCount > 0 ||
      shouldRegenerateMap(workspace) ||
      missingSourceReferenceCount > 0,
  };
}

export function reflectionStateLabel(
  state: SourceReflectionState,
  phase: "extract" | "map",
) {
  if (state === "needs_extraction") return "抽出未反映";
  if (state === "extracted") return "抽出済み";
  if (state === "no_cards")
    return phase === "extract" ? "カードなし" : "マップ対象なし";
  if (state === "needs_map") return "マップ未反映";
  if (state === "mapped") return "マップ反映済み";
  return "読み取り待ち";
}

export function reflectionSummaryText(summary: WorkspaceReflectionSummary) {
  if (summary.sourceCount === 0) {
    return "情報ソースはまだありません。";
  }
  if (summary.pendingExtractionCount > 0) {
    return `追加・更新された情報ソース ${summary.pendingExtractionCount}件が、まだ抽出カードに反映されていません。`;
  }
  if (summary.missingSourceReferenceCount > 0) {
    return `削除済みの情報ソースを根拠にした抽出カードが ${summary.missingSourceReferenceCount}件あります。再抽出またはマップ再生成を確認してください。`;
  }
  if (summary.pendingMapCount > 0 || summary.mapRefreshNeeded) {
    const countText =
      summary.pendingMapCount > 0 ? ` ${summary.pendingMapCount}件分` : "";
    return `抽出カードの内容${countText}が、まだマップに反映されていません。`;
  }
  return "登録済みの情報ソースは現在のマップに反映されています。";
}

export function needsReflectionAttention(summary: WorkspaceReflectionSummary) {
  return (
    summary.pendingExtractionCount > 0 ||
    summary.pendingMapCount > 0 ||
    summary.missingSourceReferenceCount > 0 ||
    summary.mapRefreshNeeded
  );
}

export function reflectionActionView(summary: WorkspaceReflectionSummary): ViewId {
  return summary.pendingExtractionCount > 0 || summary.missingSourceReferenceCount > 0
    ? "extract"
    : "map";
}

export function getPrimaryActionLabel(workspace: ProjectWorkspace) {
  if (workspace.sourceChunks.length === 0 && workspace.extractedItems.length === 0) {
    return "情報を追加";
  }
  if (workspace.extractedItems.length === 0) {
    return "AIで材料整理";
  }
  if (workspace.nodes.length === 0) {
    return "マップ生成";
  }
  if (shouldRegenerateMap(workspace)) {
    return "マップ再生成";
  }
  if (workspace.suggestions.length === 0 && workspace.aiComments.length === 0) {
    return "施策と確認質問";
  }
  if (workspace.actionItems.some((actionItem) => actionItem.status === "open")) {
    return "今日の確認";
  }
  return "マップに相談";
}

export function activeSuggestions(workspace: ProjectWorkspace) {
  return workspace.suggestions.filter(
    (suggestion) => suggestion.adoptionStatus !== "rejected",
  );
}

export function hasOpenActionForSuggestion(
  workspace: ProjectWorkspace,
  suggestion: SuggestionRow,
) {
  const suggestionTitle = comparableText(suggestion.title);
  const suggestionBody = comparableText(suggestion.description);
  return workspace.actionItems.some(
    (actionItem) =>
      actionItem.status === "open" &&
      actionItem.sourceType === "suggestion" &&
      (actionItem.sourceId === suggestion.id ||
        (comparableText(actionItem.title) === suggestionTitle &&
          comparableText(actionItem.body) === suggestionBody)),
  );
}

export function buildTodayNextStep(
  workspace: ProjectWorkspace,
  reflectionSummary: WorkspaceReflectionSummary,
) {
  const openActionCount = workspace.actionItems.filter(
    (actionItem) => actionItem.status === "open",
  ).length;

  if (
    workspace.sourceFiles.length === 0 &&
    workspace.sourceChunks.length === 0 &&
    workspace.extractedItems.length === 0
  ) {
    return {
      title: "まず事業メモや資料を追加",
      body: "短い自由メモだけでも始められます。実事業の売上導線、商品、集客、困っていることを入れてください。",
      view: "sources" as ViewId,
      actionLabel: "情報ソースを追加",
    };
  }
  if (
    workspace.extractedItems.length === 0 ||
    reflectionSummary.pendingExtractionCount > 0
  ) {
    return {
      title: "AIで材料を抽出カードに整理",
      body: "AI送信前確認で送信範囲を見てから、事業・商品・集客・顧客接点へ分解します。",
      view: "extract" as ViewId,
      actionLabel: "AI抽出を実行",
    };
  }
  if (workspace.nodes.length === 0) {
    return {
      title: "売上マップを生成",
      body: "確認した抽出カードを、顧客導線の売上マップへ反映します。",
      view: "map" as ViewId,
      actionLabel: "売上マップを生成",
    };
  }
  if (reflectionSummary.pendingMapCount > 0 || reflectionSummary.mapRefreshNeeded) {
    return {
      title: "再抽出 / 再生成を確認",
      body: reflectionSummaryText(reflectionSummary),
      view: reflectionActionView(reflectionSummary),
      actionLabel: "再抽出/再生成を確認",
    };
  }
  if (workspace.suggestions.length === 0 && workspace.aiComments.length === 0) {
    return {
      title: "次の一手と確認質問を生成",
      body: "マップから詰まり、未接続の可能性、次に確認すべきことを出します。",
      view: "suggestions" as ViewId,
      actionLabel: "施策へ進む",
    };
  }
  if (openActionCount > 0) {
    return {
      title: "未完了の確認事項を片づける",
      body: `${openActionCount}件の確認事項があります。完了・見送りを整理して、次に動くことを軽くします。`,
      view: "records" as ViewId,
      actionLabel: "記録で整理",
    };
  }
  return {
    title: "名前付き保存 / Markdown・CSV出力",
    body: "今日の整理が落ち着いたら、名前付き保存とMarkdown/CSV出力で振り返りに残します。",
    view: "history" as ViewId,
    actionLabel: "保存 / 出力へ進む",
  };
}

function parseMetadataJson(metadataJson: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(metadataJson) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function metadataString(metadataJson: string, key: string) {
  const value = parseMetadataJson(metadataJson)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function timestampMillis(value: string | null | undefined) {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

function hasAcceptedItemWithoutMapNode(workspace: ProjectWorkspace) {
  const mappedItemIds = new Set(
    workspace.nodes
      .map((node) => node.extractedItemId)
      .filter((id): id is string => Boolean(id)),
  );

  return workspace.extractedItems.some(
    (item) => item.adoptionStatus !== "rejected" && !mappedItemIds.has(item.id),
  );
}

function hasItemEditedAfterMapGeneration(workspace: ProjectWorkspace) {
  const latestMapRunAt = latestRunCreatedAt(workspace, "generate_map");
  if (!latestMapRunAt) return false;

  const latestMapTime = Date.parse(latestMapRunAt);
  if (!Number.isFinite(latestMapTime)) return false;

  return workspace.extractedItems.some((item) => {
    const itemUpdatedTime = Date.parse(item.updatedAt);
    return Number.isFinite(itemUpdatedTime) && itemUpdatedTime > latestMapTime;
  });
}

function comparableText(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}
