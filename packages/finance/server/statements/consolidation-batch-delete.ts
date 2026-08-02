import {
  buildDeleteConsolidationBatchCommand,
  type DeleteConsolidationBatchCommand,
} from "../domain/consolidation-batch-delete-validation";
import { serviceError, serviceOk } from "@workspace/platform/service-result";
import { assertBusinessActionDirectExecutionAllowed } from "@workspace/platform/server/business-action-executor";
import { guardedDelete } from "@workspace/platform/server/delete-guard";

export async function deleteConsolidationBatch(rawCommand: DeleteConsolidationBatchCommand) {
  const validation = buildDeleteConsolidationBatchCommand(rawCommand.batchId, rawCommand, rawCommand.userId);
  if (!validation.ok) return serviceError(validation.issue.message, validation.issue.status);
  const command = validation.data;
  const direct = await assertBusinessActionDirectExecutionAllowed({
    businessActionKey: "finance.statements.consolidationBatch.delete",
    actorUserId: command.userId,
    resourceKey: "finance.statements",
    scopeType: "global",
    scopeId: null,
    blockedMessage: "合并批次删除不接审批流程，请使用具备删除权限的直接入口",
  });
  if (!direct.ok) return direct;
  const result = await guardedDelete({
    entityType: "FinanceConsolidationBatch",
    modelKey: "financeConsolidationBatch",
    id: command.batchId,
    userId: command.userId,
    actionLabel: "删除合并批次草稿",
    deleteMode: "hard",
    auditPolicy: "none",
    skipVersionCheck: true,
    referencePolicy: "checked",
    references: [
      {
        label: "后续合并批次版本",
        count: (tx) => tx.financeConsolidationBatch.count({ where: { baseBatchId: command.batchId } }),
      },
      {
        label: "锁定输出快照",
        count: (tx) => tx.financeConsolidationOutputSnapshot.count({ where: { batchId: command.batchId } }),
      },
      {
        label: "其他批次引用的抵销分录",
        count: async (tx) => {
          const entryIds = (await tx.financeConsolidationEntry.findMany({
            where: { batchId: command.batchId },
            select: { id: true },
          })).map((entry) => entry.id);
          if (entryIds.length === 0) return 0;
          return tx.financeConsolidationEntry.count({
            where: {
              batchId: { not: command.batchId },
              OR: [
                { supersedesEntryId: { in: entryIds } },
                { reversalOfEntryId: { in: entryIds } },
                { predecessorEntryId: { in: entryIds } },
              ],
            },
          });
        },
      },
      {
        label: "草稿批次聚合事实",
        policy: "cascade",
        count: async (tx) => {
          let count = 0;
          count += await tx.financeConsolidationEntitySnapshot.count({ where: { batchId: command.batchId } });
          count += await tx.financeConsolidationSourceSnapshot.count({ where: { batchId: command.batchId } });
          count += await tx.financeConsolidationRateSnapshot.count({ where: { batchId: command.batchId } });
          count += await tx.financeConsolidationEntry.count({ where: { batchId: command.batchId } });
          count += await tx.financeConsolidationControlDecision.count({ where: { batchId: command.batchId } });
          count += await tx.financeConsolidationMatchGroup.count({ where: { batchId: command.batchId } });
          return count;
        },
        cleanup: async (tx) => {
          await tx.financeConsolidationMatchSource.deleteMany({ where: { matchGroup: { batchId: command.batchId } } });
          await tx.financeConsolidationMatchGroup.deleteMany({ where: { batchId: command.batchId } });
          await tx.financeConsolidationEntryLine.deleteMany({ where: { entry: { batchId: command.batchId } } });
          await tx.financeConsolidationTaxEffect.deleteMany({ where: { entry: { batchId: command.batchId } } });
          await tx.financeConsolidationEntry.updateMany({
            where: { batchId: command.batchId },
            data: { supersedesEntryId: null, reversalOfEntryId: null, predecessorEntryId: null },
          });
          await tx.financeConsolidationEntry.deleteMany({ where: { batchId: command.batchId } });
          await tx.financeConsolidationSourceSnapshot.deleteMany({ where: { batchId: command.batchId } });
          await tx.financeConsolidationEntitySnapshot.deleteMany({ where: { batchId: command.batchId } });
          await tx.financeConsolidationRateSnapshot.deleteMany({ where: { batchId: command.batchId } });
          await tx.financeConsolidationControlDecision.deleteMany({ where: { batchId: command.batchId } });
        },
      },
      {
        label: "批次事件",
        policy: "cascade",
        count: (tx) => tx.financeConsolidationBatchEvent.count({ where: { batchId: command.batchId } }),
        cleanup: async (tx) => {
          await tx.financeConsolidationBatchEvent.deleteMany({ where: { batchId: command.batchId } });
        },
      },
    ],
    onBeforeDelete: async (_id, context) => {
      const batch = await context.tx.financeConsolidationBatch.findUnique({
        where: { id: command.batchId },
        select: { status: true, revision: true },
      });
      if (!batch) return { error: "合并批次不存在", status: 404 };
      if (batch.status !== "draft") return { error: "只有草稿合并批次可以删除", status: 409 };
      if (batch.revision !== command.expectedRevision) {
        return { error: "合并批次内容已变化，请刷新后重试", status: 409 };
      }
      return { ok: true };
    },
  });
  return result.ok
    ? serviceOk({ deletedBatchId: command.batchId, note: command.note })
    : serviceError(result.error, result.status ?? 400);
}
