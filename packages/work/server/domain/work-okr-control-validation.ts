import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";

const WORK_OKR_CONTROL_ACTIONS = [
  "listWorkOkrControlPolicies",
  "updateWorkOkrControlSettings",
  "upsertWorkOkrControlPolicy",
  "upsertWorkOkrKrReviewOpenPolicy",
] as const;

export type WorkOkrControlAction = (typeof WORK_OKR_CONTROL_ACTIONS)[number];

export function validateWorkOkrControlCommand(action: string): DomainValidationResult<WorkOkrControlAction> {
  if (!(WORK_OKR_CONTROL_ACTIONS as readonly string[]).includes(action)) {
    return failCommand("OKR 管控操作无效");
  }
  return okCommand(action as WorkOkrControlAction);
}
