export type MapPurposeId =
  | "sales_flow"
  | "sns_web_sales"
  | "multi_business_synergy"
  | "existing_customer_upsell"
  | "business_overview"
  | "pre_proposal_questions";

export type MapPurposeOption = {
  id: MapPurposeId;
  label: string;
  description: string;
};

export const mapPurposeOptions: MapPurposeOption[] = [
  {
    id: "sales_flow",
    label: "売上導線を整理したい",
    description: "認知から問い合わせ、商談、購入、継続までの流れを見ます。",
  },
  {
    id: "sns_web_sales",
    label: "SNS / Webから売上につなげたい",
    description: "SNS、Web、LP、EC、問い合わせの接続を重点的に見ます。",
  },
  {
    id: "multi_business_synergy",
    label: "複数事業のつながりを見たい",
    description: "事業、商品、顧客層、チャネルの重なりを探します。",
  },
  {
    id: "existing_customer_upsell",
    label: "既存顧客への追加提案を考えたい",
    description: "既存顧客との接点から追加提案や継続導線を見ます。",
  },
  {
    id: "business_overview",
    label: "事業の全体像を整理したい",
    description: "事業、商品、顧客、チャネル、財務の全体像を整理します。",
  },
  {
    id: "pre_proposal_questions",
    label: "提案前のヒアリング項目を出したい",
    description: "提案前に確認すべき不足情報や質問を洗い出します。",
  },
];

export function mapPurposeLabel(id: string) {
  return mapPurposeOptions.find((option) => option.id === id)?.label ?? "";
}
