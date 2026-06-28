import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";

const WORK_PLAN_ACTIONS = ["createWorkPlan", "updateWorkPlan", "archiveWorkPlan"] as const;

export type WorkPlanAction = (typeof WORK_PLAN_ACTIONS)[number];

export function validateWorkPlanCommand(action: string): DomainValidationResult<WorkPlanAction> {
  if (!(WORK_PLAN_ACTIONS as readonly string[]).includes(action)) {
    return failCommand("工作计划操作无效");
  }
  return okCommand(action as WorkPlanAction);
}
