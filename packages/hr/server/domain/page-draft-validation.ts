import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";

export interface HrPageDraftChange {
  id: number;
  field: string;
  value: unknown;
}

export interface HrPageDraftInput {
  userId: number;
  changes: HrPageDraftChange[];
}

export function buildHrPageDraftEnvelopeCommand(
  input: HrPageDraftInput,
): DomainValidationResult<HrPageDraftInput> {
  if (!Number.isInteger(input.userId) || input.userId <= 0) return failCommand("用户无效", 400, "userId");
  if (!Array.isArray(input.changes) || input.changes.length === 0) return failCommand("至少需要一项修改", 400, "changes");
  if (input.changes.length > 500) return failCommand("批量保存上限 500 项", 400, "changes");
  const seen = new Set<string>();
  for (const change of input.changes) {
    if (!Number.isInteger(change.id) || change.id <= 0) return failCommand("记录 ID 无效", 400, "id");
    if (!change.field?.trim()) return failCommand("字段不能为空", 400, "field");
    const key = `${change.id}:${change.field}`;
    if (seen.has(key)) return failCommand("同一字段不能重复提交", 400, "changes");
    seen.add(key);
  }
  return okCommand(input);
}
