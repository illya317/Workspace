import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";

export function validateWorkReportCommand(action: string): DomainValidationResult<string> {
  const text = normalizeWorkReportText(action);
  return text ? okCommand(text) : failCommand("目标/考核表操作无效");
}

export function normalizeWorkReportText(value: unknown) {
  return String(value ?? "").trim();
}
