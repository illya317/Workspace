import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";

const WORK_PLAN_ACTIONS = ["createWorkPlan", "updateWorkPlan", "archiveWorkPlan", "deleteWorkPlan", "ensureSystemOkrPeriodPlans"] as const;

export type WorkPlanAction = (typeof WORK_PLAN_ACTIONS)[number];

export function validateWorkPlanCommand(action: string): DomainValidationResult<WorkPlanAction> {
  if (!(WORK_PLAN_ACTIONS as readonly string[]).includes(action)) {
    return failCommand("工作计划操作无效");
  }
  return okCommand(action as WorkPlanAction);
}

export function validateWorkPlanCycleBinding(input: {
  kind?: string | null;
  isSystemGenerated?: boolean;
  okrCycleId?: number | null;
  periodType?: string | null;
}): DomainValidationResult<true> {
  if ((input.kind || "okr") !== "okr") return okCommand(true);
  if (input.isSystemGenerated) {
    return input.okrCycleId
      ? okCommand(true)
      : failCommand("系统固定周期计划必须选择 OKR 周期");
  }
  return input.okrCycleId || input.periodType
    ? failCommand("额外 OKR 计划不属于固定周期")
    : okCommand(true);
}
