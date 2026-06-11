export function priorityRank(value: string) {
  if (value === "high") return 0;
  if (value === "medium") return 1;
  return 2;
}
