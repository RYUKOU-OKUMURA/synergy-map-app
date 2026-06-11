import type { AiRunRow } from "@/lib/mvp1Types";

export function isFallbackRun(run: AiRunRow | null | undefined) {
  return run?.model === "mvp-local-draft" || run?.status === "fallback_completed";
}

export function aiRunSourceLabel(run: AiRunRow | null | undefined) {
  if (!run) return "AI未実行";
  if (isFallbackRun(run)) return "ローカルドラフト";
  const model = run.model ?? "";
  if (model.startsWith("cursor-sdk/")) return "Composer生成";
  if (model === "codex-app-server") return "Codex生成";
  return "AI生成";
}

export function aiRunStatusLabel(run: AiRunRow | null | undefined) {
  if (!run) return "未実行";
  if (run.status === "completed") return "完了";
  if (run.status === "fallback_completed") return "補完完了";
  if (run.status === "response_validated") return "検証済み";
  if (run.status === "fallback_response_validated") return "補完検証済み";
  return run.status;
}
