import { failCommand, okCommand } from "@workspace/platform/server/domain-validation";

export function normalizeSourceType(value: unknown) {
  if (value === null || value === undefined || value === "") return okCommand("other");
  const sourceType = String(value || "").trim();
  if (sourceType === "manual" || sourceType === "import" || sourceType === "routine") return okCommand("other");
  if (sourceType === "department" || sourceType === "project" || sourceType === "meeting" || sourceType === "other") return okCommand(sourceType);
  return failCommand("来源类型无效");
}

export function normalizeSourceKind(value: unknown) {
  if (value === null || value === undefined || value === "") return okCommand(null);
  const sourceKind = String(value || "").trim();
  if (sourceKind === "project" || sourceKind === "project_phase") return okCommand(sourceKind);
  return failCommand("项目来源类型无效");
}

export function stripProjectSourceFields<T extends { sourceKind?: string | null; linkedProjectId?: number | null; linkedProjectPhaseId?: number | null }>(data: T) {
  data.sourceKind = null;
  data.linkedProjectId = null;
  data.linkedProjectPhaseId = null;
  return data;
}

export function stripMeetingSourceFields<T extends { sourceMeetingId?: number | null; sourceMeetingDecisionId?: number | null; sourceMeetingActionCandidateId?: number | null }>(data: T) {
  data.sourceMeetingId = null;
  data.sourceMeetingDecisionId = null;
  data.sourceMeetingActionCandidateId = null;
  return data;
}

export function stripDepartmentSourceFields<T extends { sourceDepartmentId?: number | null }>(data: T) {
  data.sourceDepartmentId = null;
  return data;
}

export function inferSourceKind(input: { sourceType: string; sourceKind?: string | null; linkedProjectId?: number | null; linkedProjectPhaseId?: number | null }) {
  if (input.sourceType !== "project") return null;
  if (input.sourceKind) return input.sourceKind;
  if (input.linkedProjectPhaseId) return "project_phase";
  if (input.linkedProjectId) return "project";
  return null;
}
