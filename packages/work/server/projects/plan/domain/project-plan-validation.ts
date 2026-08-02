import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";
import { isValidDateValue } from "@workspace/platform/server/api";

export function validateProjectPlanCommand(action: string): DomainValidationResult<string> {
  const text = normalizeProjectPlanText(action);
  return text ? okCommand(text) : failCommand("项目计划操作无效");
}

export function normalizeProjectPlanText(value: unknown) {
  return String(value ?? "").trim();
}

export function isValidProjectPlanDateValue(value: unknown) {
  return isValidDateValue(value);
}
