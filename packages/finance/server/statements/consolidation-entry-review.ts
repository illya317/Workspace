import {
  buildReviewConsolidationEntryCommand,
  type ReviewConsolidationEntryCommand,
  validateConsolidationEntryReviewTarget,
} from "../domain/consolidation-entry-validation";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { assertBusinessActionDirectExecutionAllowed } from "@workspace/platform/server/business-action-executor";
import { prisma } from "@workspace/platform/server/prisma";
import { resolveUserBusinessActorName } from "@workspace/platform/server/user-identity";
import { loadConsolidationBatchRow } from "./consolidation-dto";
import {
  appendConsolidationBatchEvent,
  claimConsolidationBatchRevision,
  immutableAuditSnapshot,
} from "./consolidation-mutations";

class EntryReviewError extends Error {
  constructor(message: string, readonly status = 409) {
    super(message);
  }
}

const ACTION_KEYS = {
  approve: "finance.statements.consolidationEntry.approve",
  return: "finance.statements.consolidationEntry.return",
} as const;

export async function reviewConsolidationEntry(rawCommand: ReviewConsolidationEntryCommand) {
  const validation = buildReviewConsolidationEntryCommand(
    rawCommand.action,
    rawCommand.batchId,
    rawCommand.entryId,
    { expectedRevision: rawCommand.expectedRevision, note: rawCommand.note },
    rawCommand.userId,
  );
  if (!validation.ok) return serviceError(validation.issue.message, validation.issue.status);
  const command = validation.data;
  const batch = await loadConsolidationBatchRow(command.batchId);
  if (!batch) return serviceError("合并批次不存在", 404);
  if (batch.revision !== command.expectedRevision) return serviceError("合并批次内容已变化，请刷新后重试", 409);
  const entry = batch.entries.find((item) => item.id === command.entryId);
  const group = batch.matchGroups.find((item) => item.entryId === command.entryId);
  if (!entry || !group) return serviceError("抵销分录不是当前批次自动匹配生成的审阅事项", 409);
  const target = validateConsolidationEntryReviewTarget(command.action, {
    batchStatus: batch.status,
    entryOrigin: entry.origin,
    generationKey: entry.generationKey,
    matchStatus: group.status,
  });
  if (!target.ok) return serviceError(target.issue.message, target.issue.status);
  const direct = await assertBusinessActionDirectExecutionAllowed({
    businessActionKey: ACTION_KEYS[command.action],
    actorUserId: command.userId,
    resourceKey: "finance.statements",
    scopeType: "global",
    scopeId: null,
    blockedMessage: command.action === "approve"
      ? "抵销分录通过已配置为必须走流程，请从统一入口处理"
      : "抵销分录退回已配置为必须走流程，请从统一入口处理",
  });
  if (!direct.ok) return direct;
  const actorName = await resolveUserBusinessActorName(command.userId);
  if (!actorName) return serviceError("当前账号缺少员工身份且不是管理员，不能审阅抵销分录", 409);

  try {
    const now = new Date();
    const result = await prisma.$transaction(async (tx) => {
      const batchRevision = await claimConsolidationBatchRevision(tx, {
        batchId: batch.id,
        status: "draft",
        expectedRevision: command.expectedRevision,
      });
      if (!batchRevision) throw new EntryReviewError("合并批次已被提交或被其他人修改，请刷新后重试");
      const approved = command.action === "approve";
      await tx.financeConsolidationMatchGroup.update({
        where: { id: group.id },
        data: { status: target.data.matchStatus },
      });
      await tx.financeConsolidationEntry.update({
        where: { id: entry.id },
        data: approved ? {
          status: "approved",
          approvedBy: command.userId,
          approvedAt: now,
          approvalNote: command.note,
        } : {
          status: "draft",
          submittedBy: null,
          submittedAt: null,
          approvedBy: null,
          approvedAt: null,
          approvalNote: null,
        },
      });
      await appendConsolidationBatchEvent(tx, {
        batchId: batch.id,
        eventType: "mutation",
        action: approved ? "entry.approve" : "entry.return",
        fromStatus: "draft",
        toStatus: "draft",
        note: command.note,
        actorUserId: command.userId,
        actorName,
        batchRevision,
        targetType: "entry",
        targetId: entry.id,
        snapshot: immutableAuditSnapshot({
          entryId: entry.id,
          generationKey: entry.generationKey,
          previousEntryStatus: entry.status,
          previousMatchStatus: group.status,
          nextEntryStatus: target.data.entryStatus,
          nextMatchStatus: target.data.matchStatus,
        }),
      });
      return { batchRevision, reviewStatus: approved ? "approved" as const : "returned" as const };
    });
    return serviceOk({ entryId: entry.id, ...result });
  } catch (cause) {
    if (cause instanceof EntryReviewError) return serviceError(cause.message, cause.status);
    throw cause;
  }
}
