import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";

export interface ReviewStatementExchangeRateCommand {
  rateId: number;
  userId: number;
  note: string | null;
}

export function buildReviewStatementExchangeRateCommand(
  rateIdValue: unknown,
  userId: number,
  note?: string | null,
): DomainValidationResult<ReviewStatementExchangeRateCommand> {
  const rateId = Number(rateIdValue);
  if (!Number.isInteger(rateId) || rateId <= 0) return failCommand("汇率证据ID无效", 400, "rateId");
  if (!Number.isInteger(userId) || userId <= 0) return failCommand("当前用户无效", 401);
  const normalizedNote = note?.trim() || null;
  if (!normalizedNote) return failCommand("汇率复核必须填写意见", 400, "note");
  return okCommand({ rateId, userId, note: normalizedNote });
}

export function validateStatementExchangeRateReview(
  rate: { status: string; updatedBy: number | null },
  reviewerUserId: number,
): DomainValidationResult<{ status: "verified" }> {
  if (rate.status !== "draft") return failCommand("只有草稿汇率证据可以复核", 409, "status");
  if (rate.updatedBy === reviewerUserId) return failCommand("汇率复核人必须独立于录入人", 409, "verifiedBy");
  return okCommand({ status: "verified" });
}
