import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { guardedDelete } from "@workspace/platform/server/delete-guard";
import { prisma } from "@workspace/platform/server/prisma";
import { buildContractRecordAccessWhere } from "./contract-access";
import type { ContractTargetCommand } from "./domain/administration-contract-validation";
import { canHardDeleteContractFacts } from "./domain/contract-lifecycle-policy";

const DELETE_FACTS_SELECT = {
  lifecycleStatus: true,
  version: true,
  isArchived: true,
  currentRevisionId: true,
  approvalSourceKey: true,
  revisions: { select: { recordState: true } },
  _count: { select: { attachments: true, records: true, stateEvents: true } },
} as const;

function canDelete(record: {
  lifecycleStatus: string;
  isArchived: boolean;
  currentRevisionId: number | null;
  approvalSourceKey: string | null;
  revisions: Array<{ recordState: string }>;
  _count: { attachments: number; records: number; stateEvents: number };
}) {
  return canHardDeleteContractFacts({
    lifecycleStatus: record.lifecycleStatus,
    isArchived: record.isArchived,
    currentRevisionId: record.currentRevisionId,
    approvalSourceKey: record.approvalSourceKey,
    attachmentCount: record._count.attachments,
    recordCount: record._count.records,
    stateEventCount: record._count.stateEvents,
    revisionStates: record.revisions.map((revision) => revision.recordState),
  });
}

export async function commitDeleteContractCommand(command: ContractTargetCommand) {
  const accessWhere = await buildContractRecordAccessWhere(command.userId);
  const visible = await prisma.contract.findFirst({
    where: { AND: [{ id: command.id }, accessWhere] },
    select: DELETE_FACTS_SELECT,
  });
  if (!visible) return serviceError("合同不存在", 404);
  if (!canDelete(visible)) return serviceError("只有未发布且没有材料、事件或正式修订的合同草稿可以删除", 409);
  const result = await guardedDelete({
    entityType: "Contract",
    modelKey: "contract",
    id: command.id,
    userId: command.userId,
    expectedVersion: command.expectedVersion,
    deleteMode: "hard",
    referencePolicy: "none",
    transactionIsolation: "serializable",
    onBeforeDelete: async (_id, context) => {
      const guarded = await context.tx.contract.findUnique({ where: { id: command.id }, select: DELETE_FACTS_SELECT });
      return guarded && canDelete(guarded)
        ? { ok: true }
        : { error: "只有未发布且没有材料、事件或正式修订的合同草稿可以删除", status: 409 };
    },
  });
  return result.ok ? serviceOk({ success: true }) : serviceError(result.error, result.status || 400);
}
