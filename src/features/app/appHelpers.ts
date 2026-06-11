import type { AiLensItem, ProjectWorkspace, SelectedMapElement } from "@/lib/mvp1Types";

export const aiLensCategoryLabels: Record<AiLensItem["category"], string> = {
  sales_flow_defect: "売上導線の欠陥",
  dormant_revenue_asset: "眠っている売上資産",
  profit_blind_spot: "利益化の盲点",
};

export function shortText(value: string, limit = 92) {
  const trimmed = value.trim();
  if (trimmed.length <= limit) return trimmed;
  return `${trimmed.slice(0, limit)}...`;
}

export function compactStringList(values: string[]) {
  return values.map((value) => value.trim()).filter(Boolean);
}

export function onboardingGenerationStageLabel(
  stage: "source" | "extract" | "map" | "suggestions" | null,
) {
  if (stage === "source") return "材料を整理中";
  if (stage === "extract") return "AI抽出中";
  if (stage === "map") return "売上マップ生成中";
  if (stage === "suggestions") return "次の一手を整理中";
  return null;
}

export function hasOnboardingBrief(workspace: ProjectWorkspace) {
  return workspace.sourceFiles.some((source) => source.fileType === "onboarding_brief");
}

export function hasUnconfirmedGeneratedItems(workspace: ProjectWorkspace) {
  return workspace.extractedItems.some(
    (item) =>
      item.confidenceStatus === "estimated" || item.confidenceStatus === "needs_review",
  );
}

export function hasTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function aiLensTargetLabel(item: AiLensItem, index: number) {
  if (item.targetKind === "map") return "全体";
  return `${index + 1}`;
}

export function aiLensTargetDescription(item: AiLensItem) {
  if (item.targetKind === "map") return "マップ全体";
  if (item.targetKind === "node") return "該当ノード";
  return "該当導線";
}

export function aiLensActionHint(category: AiLensItem["category"]) {
  if (category === "sales_flow_defect") {
    return "問い合わせ後の対応、提案、成約までの流れをマップ上で確認する。";
  }
  if (category === "dormant_revenue_asset") {
    return "既にある商品、顧客接点、発信をどの売上導線につなぐか確認する。";
  }
  return "単価、継続、高単価商品につながるポイントを確認する。";
}

export function aiLensDefaultQuestion(item: AiLensItem) {
  return item.followUpQuestion ?? `${item.title}について、次に確認すべき点を整理して。`;
}

export function aiLensMemoQuestion(item: AiLensItem) {
  return `${item.title}を、AIの見立て・根拠・要確認・次に試す一手に分けて理解メモとして残して。`;
}

export function mergeAiRunWorkspace(current: ProjectWorkspace, next: ProjectWorkspace) {
  return {
    ...current,
    aiComments: next.aiComments,
    aiRuns: next.aiRuns,
    versions: next.versions,
  };
}

export function aiLensTargetNote(item: AiLensItem, index: number) {
  if (item.targetKind === "map") {
    return "マップ全体を対象にした指摘です。";
  }
  const target = item.targetKind === "node" ? "ノード" : "導線";
  return `マップ上の番号${index + 1}の${target}を強調表示しています。`;
}

export function isSameSelectedMapElement(
  current: SelectedMapElement,
  next: SelectedMapElement,
) {
  if (current === next) return true;
  if (!current || !next) return false;
  return current.kind === next.kind && current.id === next.id;
}
