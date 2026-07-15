import type { ReviewStatementExchangeRateCommand } from "../domain/consolidation-exchange-rate-validation";
import { validateStatementExchangeRateReview } from "../domain/consolidation-exchange-rate-validation";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { assertBusinessActionDirectExecutionAllowed } from "@workspace/platform/server/business-action-executor";
import { prisma } from "@workspace/platform/server/prisma";
import { statementExchangeRateSnapshot } from "./exchange-rates";

export async function reviewStatementExchangeRate(command: ReviewStatementExchangeRateCommand) {
  const rate = await prisma.financeStatementExchangeRate.findUnique({ where: { id: command.rateId } });
  if (!rate) return serviceError("汇率证据不存在", 404);
  const validation = validateStatementExchangeRateReview(rate, command.userId);
  if (!validation.ok) return serviceError(validation.issue.message, validation.issue.status);
  if (!rate.publishedAt) return serviceError("复核汇率前必须填写牌价发布时间", 409);
  const direct = await assertBusinessActionDirectExecutionAllowed({
    businessActionKey: "finance.statements.exchangeRate.review",
    actorUserId: command.userId,
    resourceKey: "finance.statements",
    scopeType: "global",
    scopeId: null,
    blockedMessage: "汇率证据复核已配置为必须走流程，请从统一复核入口提交",
  });
  if (!direct.ok) return direct;
  const now = new Date();
  const update = await prisma.financeStatementExchangeRate.updateMany({
    where: { id: rate.id, status: "draft" },
    data: {
      status: "verified",
      verifiedBy: command.userId,
      verifiedAt: now,
      note: rate.note ? `${rate.note}\n复核意见：${command.note}` : `复核意见：${command.note}`,
    },
  });
  if (update.count !== 1) return serviceError("汇率证据状态已变化，请刷新后重试", 409);
  const reviewed = await prisma.financeStatementExchangeRate.findUniqueOrThrow({ where: { id: rate.id } });
  return serviceOk({ rate: statementExchangeRateSnapshot(reviewed) });
}
