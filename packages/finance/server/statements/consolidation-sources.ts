import {
  buildSaveConsolidationControlDecisionCommand,
  type SaveConsolidationControlDecisionCommand,
} from "../domain/consolidation-batch-validation";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { assertBusinessActionDirectExecutionAllowed } from "@workspace/platform/server/business-action-executor";
import { prisma } from "@workspace/platform/server/prisma";
import {
  CONSOLIDATION_BATCH_INCLUDE,
  consolidationBatchSnapshot,
  loadConsolidationBatchRow,
} from "./consolidation-dto";
import { ConsolidationSnapshotError } from "./consolidation-snapshots";
import { claimConsolidationBatchRevision } from "./consolidation-mutations";

async function requireDraftBatch(batchId: number) {
  const batch = await loadConsolidationBatchRow(batchId);
  if (!batch) throw new ConsolidationSnapshotError("合并批次不存在", 404);
  if (batch.status !== "draft") throw new ConsolidationSnapshotError("只有草稿批次允许更新合并准备", 409);
  return batch;
}

export async function saveConsolidationControlDecision(rawCommand: SaveConsolidationControlDecisionCommand) {
  const validation = buildSaveConsolidationControlDecisionCommand(
    rawCommand.batchId,
    rawCommand.input,
    rawCommand.userId,
  );
  if (!validation.ok) return serviceError(validation.issue.message, validation.issue.status);
  const command = validation.data;
  try {
    const batch = await requireDraftBatch(command.batchId);
    const direct = await assertBusinessActionDirectExecutionAllowed({
      businessActionKey: "finance.statements.consolidationControl.resolve",
      actorUserId: command.userId,
      resourceKey: "finance.statements",
      scopeType: "global",
      scopeId: null,
      blockedMessage: "合并控制结论保存已配置为必须走流程，请从统一保存入口提交",
    });
    if (!direct.ok) return direct;
    const row = await prisma.$transaction(async (tx) => {
      const batchRevision = await claimConsolidationBatchRevision(tx, {
        batchId: batch.id,
        status: "draft",
        expectedRevision: command.input.expectedRevision,
      });
      if (!batchRevision) {
        throw new ConsolidationSnapshotError("合并批次已被提交或被其他人修改，请刷新后重试", 409);
      }
      for (const decisionData of command.decisions) {
        await tx.financeConsolidationControlDecision.upsert({
          where: { batchId_controlKey: { batchId: batch.id, controlKey: decisionData.controlKey } },
          create: { batchId: batch.id, ...decisionData, decidedBy: command.userId },
          update: { ...decisionData, decidedBy: command.userId, decidedAt: new Date() },
        });
      }
      return tx.financeConsolidationBatch.findUniqueOrThrow({
        where: { id: batch.id },
        include: CONSOLIDATION_BATCH_INCLUDE,
      });
    });
    return serviceOk({ batch: consolidationBatchSnapshot(row) });
  } catch (cause) {
    if (cause instanceof ConsolidationSnapshotError) return serviceError(cause.message, cause.status);
    throw cause;
  }
}
