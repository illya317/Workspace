import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";

export type WorkResponsibilityReferenceReplaceCommand = {
  targetKind: "work_item";
  referenceRole: "execution";
  workItemId: number;
  responsibilityNodeId: number | null;
  ownerEmployeeId: number | null;
  positionId: number | null;
};

export function validateWorkResponsibilityReferenceReplaceCommand(input: {
  targetKind?: string | null;
  referenceRole?: string | null;
  workItemId?: number | null;
  responsibilityNodeId?: number | null;
  ownerEmployeeId?: number | null;
  positionId?: number | null;
}): DomainValidationResult<WorkResponsibilityReferenceReplaceCommand> {
  if (input.targetKind !== "work_item") return failCommand("职责引用目标必须是工作项", 400, "targetKind");
  if (input.referenceRole !== "execution") return failCommand("工作项职责引用角色无效", 400, "referenceRole");
  const workItemId = normalizeNullablePositiveId(input.workItemId);
  if (!workItemId) return failCommand("工作项职责引用必须关联工作项", 400);
  return okCommand({
    targetKind: "work_item",
    referenceRole: "execution",
    workItemId,
    responsibilityNodeId: normalizeNullablePositiveId(input.responsibilityNodeId),
    ownerEmployeeId: normalizeNullablePositiveId(input.ownerEmployeeId),
    positionId: normalizeNullablePositiveId(input.positionId),
  });
}

function normalizeNullablePositiveId(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}
