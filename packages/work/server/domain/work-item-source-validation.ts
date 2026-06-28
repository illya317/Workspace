import { failCommand, okCommand } from "@workspace/platform/server/domain-validation";

export function normalizeSourceType(value: unknown) {
  if (value === null || value === undefined || value === "") return okCommand("other");
  const sourceType = String(value || "").trim();
  if (sourceType === "manual" || sourceType === "import") return okCommand("other");
  if (sourceType === "routine" || sourceType === "project" || sourceType === "meeting" || sourceType === "other") return okCommand(sourceType);
  return failCommand("来源类型无效");
}

export function normalizeSourceKind(value: unknown) {
  if (value === null || value === undefined || value === "") return okCommand(null);
  const sourceKind = String(value || "").trim();
  if (sourceKind === "project" || sourceKind === "project_phase" || sourceKind === "project_task") return okCommand(sourceKind);
  return failCommand("项目来源类型无效");
}

export function stripProjectSourceFields<T extends { sourceKind?: string | null; linkedProjectId?: number | null; linkedProjectPhaseId?: number | null; linkedProjectTaskId?: number | null }>(data: T) {
  data.sourceKind = null;
  data.linkedProjectId = null;
  data.linkedProjectPhaseId = null;
  data.linkedProjectTaskId = null;
  return data;
}

export function stripMeetingSourceFields<T extends { sourceMeetingId?: number | null; sourceMeetingDecisionId?: number | null; sourceMeetingActionCandidateId?: number | null }>(data: T) {
  data.sourceMeetingId = null;
  data.sourceMeetingDecisionId = null;
  data.sourceMeetingActionCandidateId = null;
  return data;
}

export function inferSourceKind(input: { sourceType: string; sourceKind?: string | null; linkedProjectId?: number | null; linkedProjectPhaseId?: number | null; linkedProjectTaskId?: number | null }) {
  if (input.sourceType !== "project") return null;
  if (input.sourceKind) return input.sourceKind;
  if (input.linkedProjectTaskId) return "project_task";
  if (input.linkedProjectPhaseId) return "project_phase";
  if (input.linkedProjectId) return "project";
  return null;
}
