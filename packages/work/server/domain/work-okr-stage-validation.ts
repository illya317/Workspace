import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";

const WORK_OKR_STAGE_ACTIONS = [
  "syncDueKrReviewsForTarget",
  "syncDueKrReviewForPlan",
  "submitObjectiveReview",
  "approveObjectiveReview",
  "rejectObjectiveReview",
  "submitKrReview",
  "approveKrReview",
  "rejectKrReview",
] as const;

export type WorkOkrStageAction = (typeof WORK_OKR_STAGE_ACTIONS)[number];

export function validateWorkOkrStageCommand(action: string): DomainValidationResult<WorkOkrStageAction> {
  if (!(WORK_OKR_STAGE_ACTIONS as readonly string[]).includes(action)) {
    return failCommand("OKR 阶段操作无效");
  }
  return okCommand(action as WorkOkrStageAction);
}
