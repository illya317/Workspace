import { randomUUID } from "node:crypto";

import { businessTemporalIdempotencyMatches } from "@workspace/platform/server/business-temporal-idempotency";
import { Prisma } from "@workspace/platform/server/prisma";
import {
  organizationStructureChangeRecord,
} from "./domain/organization-structure-command";
import {
  assertPositionReportOverrideBatchLedgerInput,
  type OrganizationLifecycleMeta,
} from "./domain/organization-effective-version-validation";

type TransactionClient = Prisma.TransactionClient;

export class OrganizationStructureIdempotencyConflictError extends Error {
  constructor() {
    super("幂等键已用于另一条组织结构命令");
    this.name = "OrganizationStructureIdempotencyConflictError";
  }
}

export async function findIdempotentChange(
  tx: TransactionClient,
  idempotencyKey: string,
  requestFingerprint: string,
  aggregateType: string,
  aggregateId?: number,
) {
  const existing = await tx.organizationStructureChange.findUnique({ where: { idempotencyKey } });
  if (!existing) return null;
  if (
    existing.aggregateType !== aggregateType
    || (aggregateId !== undefined && existing.aggregateId !== aggregateId)
    || !businessTemporalIdempotencyMatches(existing.requestFingerprint, requestFingerprint)
  ) {
    throw new OrganizationStructureIdempotencyConflictError();
  }
  return existing;
}

export async function recordPositionReportOverrideBatchChange(
  tx: TransactionClient,
  input: {
    positionId: number;
    meta: OrganizationLifecycleMeta;
    userId: number;
    requestFingerprint: string;
    overrideCount: number;
    deletedIds: number[];
  },
) {
  assertPositionReportOverrideBatchLedgerInput(input);
  await tx.organizationStructureChange.create({
    data: organizationStructureChangeRecord({
      id: randomUUID(),
      aggregateType: "PositionReportOverrideBatch",
      aggregateId: input.positionId,
      meta: input.meta,
      userId: input.userId,
      manifest: {
        operation: "replace-set",
        overrideCount: input.overrideCount,
        deletedIds: input.deletedIds,
      },
      requestFingerprint: input.requestFingerprint,
    }),
  });
}
