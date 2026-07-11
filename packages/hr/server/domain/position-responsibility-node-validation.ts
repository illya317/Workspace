import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";

export type PositionResponsibilityNodeSyncCommand = {
  positionDescriptionId: number;
};

export function validatePositionResponsibilityNodeSyncCommand(input: {
  positionDescriptionId?: number | null;
}): DomainValidationResult<PositionResponsibilityNodeSyncCommand> {
  const id = Number(input.positionDescriptionId);
  if (!Number.isInteger(id) || id <= 0) return failCommand("岗位说明书 ID 无效", 400, "positionDescriptionId");
  return okCommand({ positionDescriptionId: id });
}
