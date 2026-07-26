export function normalizeWorkReportScore(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const score = Number(value);
  if (!Number.isInteger(score)) return null;
  return Math.max(0, Math.min(100, score));
}

export function normalizeWorkReportPlanKind(value: unknown): "okr" | "routine" | null {
  return value === "okr" || value === "routine" ? value : null;
}

export function normalizeWorkReportItemType(value: unknown): "objective" | "key_result" | "task" | null {
  if (value === "objective" || value === "key_result" || value === "task") return value;
  return null;
}

export function normalizeWorkReportItemKind(value: unknown): "assessment" | "current" | "routine" | "next" {
  if (value === "current" || value === "routine" || value === "next") return value;
  return "assessment";
}
