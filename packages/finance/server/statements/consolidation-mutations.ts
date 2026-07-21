import type { Prisma } from "@workspace/platform/server/prisma";
import {
  validateConsolidationBatchEventPersistence,
  validateConsolidationRevisionClaim,
} from "../domain/consolidation-persistence-validation";

function invalidPersistenceEnvelope(message: string): never {
  throw new Error(`合并批次持久化参数无效：${message}`);
}

export function resolveConsolidationActorName(employeeName: string | null, isRootAdmin: boolean) {
  return employeeName || (isRootAdmin ? "系统管理员" : null);
}

export async function claimConsolidationBatchRevision(
  tx: Prisma.TransactionClient,
  input: {
    batchId: number;
    status: string;
    expectedRevision: number;
    data?: Prisma.FinanceConsolidationBatchUpdateManyMutationInput;
  },
) {
  const validation = validateConsolidationRevisionClaim(input);
  if (!validation.ok) invalidPersistenceEnvelope(validation.issue.message);
  const claimed = await tx.financeConsolidationBatch.updateMany({
    where: {
      id: input.batchId,
      status: input.status,
      revision: input.expectedRevision,
    },
    data: {
      ...input.data,
      revision: { increment: 1 },
    },
  });
  return claimed.count === 1 ? input.expectedRevision + 1 : null;
}

export function immutableAuditSnapshot(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function appendConsolidationBatchEvent(
  tx: Prisma.TransactionClient,
  input: {
    batchId: number;
    eventType: "lifecycle" | "mutation";
    action: string;
    fromStatus: string;
    toStatus: string;
    note: string | null;
    actorUserId: number;
    actorName: string;
    batchRevision: number;
    targetType?: "entry" | "taxEffect" | null;
    targetId?: number | null;
    snapshot?: Prisma.InputJsonValue;
  },
) {
  const validation = validateConsolidationBatchEventPersistence(input);
  if (!validation.ok) invalidPersistenceEnvelope(validation.issue.message);
  return tx.financeConsolidationBatchEvent.create({
    data: {
      batchId: input.batchId,
      eventType: input.eventType,
      action: input.action,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      note: input.note,
      actorUserId: input.actorUserId,
      actorName: input.actorName,
      batchRevision: input.batchRevision,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      ...(input.snapshot === undefined ? {} : { snapshot: input.snapshot }),
    },
  });
}
