import type { ReactNode } from "react";

type StatusTone = "success" | "neutral" | "error";

function statusPillClass(tone: StatusTone = "success") {
  return tone === "success" ? "status-pill" : `status-pill status-pill-${tone}`;
}

export function StatusPill({
  children,
  tone = "success",
}: {
  children: ReactNode;
  tone?: StatusTone;
}) {
  return <span className={statusPillClass(tone)}>{children}</span>;
}
