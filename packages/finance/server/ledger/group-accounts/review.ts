import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { assertBusinessActionDirectExecutionAllowed } from "@workspace/platform/server/business-action-executor";
import { prisma } from "@workspace/platform/server/prisma";

import {
  buildReviewFinanceGroupAccountCommand,
  type ReviewFinanceGroupAccountCommandInput,
} from "../../domain/group-chart-validation";

import { hardDeleteFinanceGroupAccount } from "./delete";
import { countFinanceGroupAccountReferences } from "./update";

class FinanceGroupAccountReviewConflictError extends Error {}

export type FinanceGroupAccountReviewDecision = "approve" | "reject";

export type GroupAccountReviewTransition =
  | { kind: "setStatus"; nextStatus: "reviewed" | "pending_delete"; recordReview: boolean }
  | { kind: "delete" };

export function resolveGroupAccountReviewTransition(
  currentStatus: string,
  decision: FinanceGroupAccountReviewDecision,
):
  | { ok: true; transition: GroupAccountReviewTransition }
  | { ok: false; message: string; status: number } {
  if (currentStatus === "pending_review") {
    return decision === "approve"
      ? { ok: true, transition: { kind: "setStatus", nextStatus: "reviewed", recordReview: true } }
      : { ok: true, transition: { kind: "setStatus", nextStatus: "pending_delete", recordReview: false } };
  }
  if (currentStatus === "pending_delete") {
    return decision === "approve"
      ? { ok: true, transition: { kind: "delete" } }
      : { ok: true, transition: { kind: "setStatus", nextStatus: "reviewed", recordReview: true } };
  }
  return { ok: false, message: "当前集团科目无需复核", status: 409 };
}

export async function reviewFinanceGroupAccount(input: ReviewFinanceGroupAccountCommandInput) {
  const command = buildReviewFinanceGroupAccountCommand(input);
  if (!command.ok) return serviceError(command.issue.message, command.issue.status);
  const data = command.data.input;
  const direct = await assertBusinessActionDirectExecutionAllowed({
    businessActionKey: "finance.ledger.groupAccount.review",
    actorUserId: data.userId,
    resourceKey: "finance.ledger",
    scopeType: "global",
    scopeId: null,
    blockedMessage: "集团科目复核已配置为必须走流程，请从统一复核入口提交",
  });
  if (!direct.ok) return direct;

  const currentVersion = await prisma.financeAccountingPolicyVersion.findFirst({
    where: { status: "published", effectiveTo: null },
    select: { id: true },
  });
  if (!currentVersion) return serviceError("缺少当前生效的集团科目版本", 409);
  const revision = await prisma.financeGroupAccountRevision.findUnique({
    where: { policyVersionId_groupAccountId: {
      policyVersionId: currentVersion.id,
      groupAccountId: data.groupAccountId,
    } },
    include: {
      groupAccount: {
        select: {
          sourceKind: true,
          originCompanyCode: true,
          originSourceScopeKey: true,
          originLocalAccountCode: true,
        },
      },
    },
  });
  if (!revision) return serviceError("集团科目不存在或不属于当前版本", 404);

  const resolved = resolveGroupAccountReviewTransition(revision.reviewStatus, data.decision);
  if (!resolved.ok) return serviceError(resolved.message, resolved.status);

  if (resolved.transition.kind === "delete") {
    if (revision.updatedAt.toISOString() !== data.expectedUpdatedAt) {
      return serviceError("集团科目已被其他操作修改，请刷新后重试", 409);
    }
    return hardDeleteFinanceGroupAccount(data.groupAccountId, data.userId);
  }

  const nextStatus = resolved.transition.nextStatus;
  if (nextStatus === "pending_delete") {
    const references = await countFinanceGroupAccountReferences(data.groupAccountId, currentVersion.id);
    if (references.mappingCount + references.childCount + references.ruleCount + references.adjustmentCount > 0) {
      return serviceError("仍有公司映射、下级科目或重分类引用，不能标记为待删除", 409);
    }
  }

  const reviewedAt = resolved.transition.recordReview ? new Date() : null;
  try {
    const originMappingConfirmed = await prisma.$transaction(async (tx) => {
      const updated = await tx.financeGroupAccountRevision.updateMany({
        where: { id: revision.id, updatedAt: new Date(data.expectedUpdatedAt) },
        data: {
          reviewStatus: nextStatus,
          reviewedBy: reviewedAt === null ? null : data.userId,
          reviewedAt,
        },
      });
      if (updated.count !== 1) throw new FinanceGroupAccountReviewConflictError();
      await tx.financeGroupAccount.update({ where: { id: data.groupAccountId }, data: {
        reviewStatus: nextStatus,
        reviewedBy: reviewedAt === null ? null : data.userId,
        reviewedAt,
      } });
      if (nextStatus !== "reviewed" || revision.groupAccount.sourceKind !== "suggested"
        || !revision.groupAccount.originCompanyCode
        || !revision.groupAccount.originSourceScopeKey
        || !revision.groupAccount.originLocalAccountCode) {
        return false;
      }
      const confirmed = await tx.financeGroupAccountMapping.updateMany({
        where: {
          policyVersionId: currentVersion.id,
          groupAccountId: data.groupAccountId,
          companyCode: revision.groupAccount.originCompanyCode,
          sourceScopeKey: revision.groupAccount.originSourceScopeKey,
          localAccountCode: revision.groupAccount.originLocalAccountCode,
          mappingMethod: "suggested",
        },
        data: { mappingMethod: "manual_override" },
      });
      return confirmed.count === 1;
    });
    return serviceOk({ success: true, reviewStatus: nextStatus, originMappingConfirmed });
  } catch (error) {
    if (error instanceof FinanceGroupAccountReviewConflictError) {
      return serviceError("集团科目已被其他操作修改，请刷新后重试", 409);
    }
    throw error;
  }
}
