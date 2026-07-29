import { canViewProject } from "./access";
import { findApprovalProjectPhaseReference } from "./task-approval-reference-adapter";

export function normalizeApprovalParticipants(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value !== "string") return [];
  return value.split(/,|，/).map((item) => item.trim()).filter(Boolean);
}

export async function validateReferencedProjectVisibility(actorUserId: number, data: {
  linkedProjectId?: unknown;
  linkedProjectPhaseId?: unknown;
}) {
  const ids = new Set<number>();
  const linkedProjectId = positiveNumber(data.linkedProjectId);
  if (linkedProjectId) ids.add(linkedProjectId);
  const linkedProjectPhaseId = positiveNumber(data.linkedProjectPhaseId);
  const phase = linkedProjectPhaseId
    ? await findApprovalProjectPhaseReference(linkedProjectPhaseId)
    : null;
  if (phase?.projectId) ids.add(phase.projectId);
  for (const projectId of ids) {
    if (!(await canViewProject(actorUserId, projectId))) return "无权限引用该项目";
  }
  return null;
}

function positiveNumber(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}
