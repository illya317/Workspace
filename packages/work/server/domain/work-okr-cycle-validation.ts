import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";

const WORK_OKR_CYCLE_ACTIONS = [
  "ensureWorkOkrCyclesForYears",
  "ensureWorkOkrCyclesForYear",
] as const;

export type WorkOkrCycleAction = (typeof WORK_OKR_CYCLE_ACTIONS)[number];

export function validateWorkOkrCycleCommand(action: string): DomainValidationResult<WorkOkrCycleAction> {
  if (!(WORK_OKR_CYCLE_ACTIONS as readonly string[]).includes(action)) {
    return failCommand("OKR 周期操作无效");
  }
  return okCommand(action as WorkOkrCycleAction);
}
