import { failCommand, okCommand } from "@workspace/platform/server/domain-validation";

export function buildAgentPerformanceSelfReviewCommand(params: Record<string, unknown>) {
  const cycleId = optionalPositiveInteger(params.cycleId);
  if (params.cycleId !== undefined && cycleId === null) {
    return failCommand("绩效周期 ID 无效", 400, "cycleId");
  }
  const selfScore = Number(params.selfScore);
  if (!Number.isInteger(selfScore) || selfScore < 0 || selfScore > 100) {
    return failCommand("本人绩效评分必须为 0-100 的整数", 400, "selfScore");
  }
  const selfComment = String(params.selfComment || "").trim();
  if (selfComment.length < 20) {
    return failCommand("绩效自评内容至少需要 20 个字符", 400, "selfComment");
  }
  if (selfComment.length > 4000) {
    return failCommand("绩效自评内容不能超过 4000 个字符", 400, "selfComment");
  }
  const comment = String(params.comment || "").trim();
  if (comment.length > 500) return failCommand("流程备注不能超过 500 个字符", 400, "comment");
  return okCommand({ cycleId, selfScore, selfComment, comment: comment || null });
}

export function parseStoredAgentPerformanceSelfReview(payload: Record<string, unknown>) {
  const employeeId = positiveInteger(payload.employeeId);
  const okrCycleId = positiveInteger(payload.okrCycleId);
  const expectedRequest = parseExpectedRequest(payload.expectedRequest);
  const review = buildAgentPerformanceSelfReviewCommand({
    cycleId: okrCycleId,
    selfScore: payload.selfScore,
    selfComment: payload.selfComment,
    comment: payload.comment,
  });
  if (!employeeId) return failCommand("提案中的员工 ID 无效", 400, "employeeId");
  if (!okrCycleId) return failCommand("提案中的绩效周期无效", 400, "okrCycleId");
  if (!review.ok) return review;
  if (payload.expectedRequest !== null && payload.expectedRequest !== undefined && !expectedRequest) {
    return failCommand("提案中的流程版本快照无效", 400, "expectedRequest");
  }
  return okCommand({ employeeId, okrCycleId, expectedRequest, ...review.data });
}

function parseExpectedRequest(value: unknown) {
  if (value === null || value === undefined) return null;
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = positiveInteger(row.id);
  const version = nonNegativeInteger(row.version);
  const status = typeof row.status === "string" ? row.status : "";
  return id && version !== null && status ? { id, version, status } : null;
}

function optionalPositiveInteger(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  return positiveInteger(value);
}

function positiveInteger(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function nonNegativeInteger(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}
