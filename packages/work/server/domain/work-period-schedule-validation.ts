import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";

const WORK_PERIOD_SCHEDULE_ACTIONS = ["createWorkPeriodScheduleItem"] as const;

export type WorkPeriodScheduleAction = (typeof WORK_PERIOD_SCHEDULE_ACTIONS)[number];

export function validateWorkPeriodScheduleCommand(action: string): DomainValidationResult<WorkPeriodScheduleAction> {
  if (!(WORK_PERIOD_SCHEDULE_ACTIONS as readonly string[]).includes(action)) {
    return failCommand("时间安排操作无效");
  }
  return okCommand(action as WorkPeriodScheduleAction);
}
