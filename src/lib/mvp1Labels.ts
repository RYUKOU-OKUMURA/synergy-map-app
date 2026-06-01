export type LabelOption = readonly [value: string, label: string];

export const categoryOptions = [
  ["business", "事業"],
  ["service", "商品・サービス"],
  ["channel", "集客チャネル"],
  ["touchpoint", "顧客接点"],
  ["finance", "財務参考情報"],
  ["data_source", "データ資料"],
] as const satisfies readonly LabelOption[];

export const confidenceOptions = [
  ["confirmed", "確定"],
  ["estimated", "推定"],
  ["needs_review", "要確認"],
] as const satisfies readonly LabelOption[];

export const adoptionOptions = [
  ["accepted", "採用"],
  ["pending", "保留"],
  ["rejected", "却下"],
] as const satisfies readonly LabelOption[];

export const actionStatusOptions = [
  ["open", "未完了"],
  ["done", "完了"],
  ["dismissed", "見送り"],
] as const satisfies readonly LabelOption[];

export const priorityOptions = [
  ["high", "高"],
  ["medium", "中"],
  ["low", "低"],
] as const satisfies readonly LabelOption[];

export const noteTypeOptions = [
  ["thought", "思考メモ"],
  ["meeting", "会議メモ"],
  ["daily", "日次メモ"],
] as const satisfies readonly LabelOption[];

export const impactLevelOptions = [
  ["high", "大"],
  ["medium", "中"],
  ["low", "小"],
  ["unknown", "不明"],
] as const satisfies readonly LabelOption[];

export const costLevelOptions = [
  ["low", "小"],
  ["medium", "中"],
  ["high", "大"],
  ["unknown", "不明"],
] as const satisfies readonly LabelOption[];

export const timeToImpactOptions = [
  ["short", "短期"],
  ["mid", "中期"],
  ["long", "長期"],
  ["unknown", "不明"],
] as const satisfies readonly LabelOption[];

export const categoryLabels = Object.fromEntries(categoryOptions);
export const confidenceLabels = Object.fromEntries(confidenceOptions);
export const impactLevelLabels = Object.fromEntries(impactLevelOptions);

export function labelFor(
  options: readonly LabelOption[],
  value: string | null | undefined,
) {
  return options.find(([key]) => key === value)?.[1] ?? value ?? "-";
}
