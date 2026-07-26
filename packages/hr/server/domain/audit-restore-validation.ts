import { failCommand, okCommand } from "@workspace/platform/server/domain-validation";

export function buildHrAuditRestoreCommand(input: { historyId: number; userId: number }) {
  if (!Number.isInteger(input.historyId) || input.historyId <= 0) {
    return failCommand("历史版本 ID 无效", 400, "historyId");
  }
  if (!Number.isInteger(input.userId) || input.userId <= 0) {
    return failCommand("用户 ID 无效", 400, "userId");
  }
  return okCommand(input);
}
