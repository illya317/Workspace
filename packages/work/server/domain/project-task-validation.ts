import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";

export {
  validateAssignees,
  validateOwner,
  validateProjectTaskPlanBatch,
  validateTaskPlanConstraints,
} from "../project-task-validation";

export function validateProjectTaskCommand(action: string): DomainValidationResult<string> {
  const text = String(action ?? "").trim();
  return text ? okCommand(text) : failCommand("项目任务操作无效");
}
