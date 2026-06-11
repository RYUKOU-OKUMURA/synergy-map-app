import {
  Archive,
  FileText,
  Globe2,
  Link as LinkIcon,
  MessageSquareText,
} from "lucide-react";

export type InformationSourceKind =
  | "manual_note"
  | "website_url"
  | "sns_url"
  | "product_info";

export type InformationSourceDraft = {
  sourceKind: InformationSourceKind;
  title: string;
  body: string;
  url: string;
};

export const informationSourceOptions: Array<{
  id: InformationSourceKind;
  label: string;
  icon: typeof FileText;
}> = [
  { id: "manual_note", label: "自由メモ", icon: MessageSquareText },
  { id: "website_url", label: "ホームページURL", icon: Globe2 },
  { id: "sns_url", label: "SNS URL", icon: LinkIcon },
  { id: "product_info", label: "商品情報", icon: Archive },
];

export function sourceTypeLabel(fileType: string) {
  return (
    informationSourceOptions.find((option) => option.id === fileType)?.label ??
    (fileType === "onboarding_brief"
      ? "初回入力"
      : fileType === "markdown"
        ? "Markdown"
        : fileType.toUpperCase())
  );
}
