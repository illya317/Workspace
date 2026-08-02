import { Prisma, prisma } from "@workspace/platform/server/prisma";

import {
  deriveOwnershipPeriods,
  type EquityLedgerEventState,
} from "./domain/equity-ledger";
import {
  buildOwnershipProjectionRebuildCommand,
  hashOwnershipProjectionLedger,
  OWNERSHIP_PROJECTOR_KEY,
  OWNERSHIP_PROJECTOR_VERSION,
} from "./domain/ownership-projection-rebuild-validation";

const PROJECTION_HORIZON = new Date("9999-12-30T00:00:00.000Z");

const shareCapitalEventInclude = {
  transactions: { orderBy: [{ sequence: "asc" }, { id: "asc" }] },
  snapshotPositions: { orderBy: [{ sequence: "asc" }, { id: "asc" }] },
} satisfies Prisma.ShareCapitalEventInclude;

type ShareCapitalSourceEvent = Prisma.ShareCapitalEventGetPayload<{
  include: typeof shareCapitalEventInclude;
}>;

type ProjectionDatabase = {
  $transaction<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: { maxWait?: number; timeout?: number },
  ): Promise<T>;
};

export type OwnershipProjectionRebuildReceipt = {
  runId: number;
  issuerCompanyId: number;
  generation: number;
  projectorKey: string;
  projectorVersion: number;
  ledgerHash: string;
  sourceEventCount: number;
  projectionRowCount: number;
  projectedAt: Date;
};

export class OwnershipProjectionRebuildError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OwnershipProjectionRebuildError";
  }
}

/**
 * The only Capital service allowed to materialize OwnershipInterest.
 * Event append/confirm services must call this command after persisting the issuer ledger.
 */
export async function rebuildOwnershipProjection(input: {
  issuerCompanyId: unknown;
  triggerReason?: unknown;
  triggeredBy?: unknown;
}, database: ProjectionDatabase = prisma as unknown as ProjectionDatabase) {
  const command = buildOwnershipProjectionRebuildCommand(input);
  if (!command.ok) throw new OwnershipProjectionRebuildError(command.issue.message);
  return database.$transaction(
    (tx) => rebuildOwnershipProjectionInTransaction(tx, command.data),
    { maxWait: 30_000, timeout: 300_000 },
  );
}

export async function rebuildOwnershipProjectionInTransaction(
  tx: Prisma.TransactionClient,
  command: { issuerCompanyId: number; triggerReason: string | null; triggeredBy: number | null },
): Promise<OwnershipProjectionRebuildReceipt> {
  const lockKey = `capital-ownership-projection:${command.issuerCompanyId}`;
  await tx.$queryRaw(Prisma.sql`
    SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))::text AS locked
  `);

  const issuer = await tx.company.findUnique({
    where: { id: command.issuerCompanyId },
    select: { id: true },
  });
  if (!issuer) throw new OwnershipProjectionRebuildError("发行主体不存在");

  const sourceEvents = await tx.shareCapitalEvent.findMany({
    where: { issuerCompanyId: command.issuerCompanyId },
    include: shareCapitalEventInclude,
    orderBy: [{ sequence: "asc" }, { id: "asc" }],
  });
  const existingProjectionCount = await tx.ownershipInterest.count({
    where: { issuerCompanyId: command.issuerCompanyId },
  });
  if (sourceEvents.length === 0 && existingProjectionCount > 0) {
    throw new OwnershipProjectionRebuildError("该发行主体仍有旧投影但没有股本事件账本，已拒绝清空；请先补录来源事件");
  }
  const ledgerEvents = toEquityLedgerEvents(sourceEvents);
  const ledgerHash = hashOwnershipProjectionLedger(ledgerEvents);
  const periods = deriveOwnershipPeriods(ledgerEvents, PROJECTION_HORIZON);
  const previousRun = await tx.ownershipProjectionRun.findFirst({
    where: { issuerCompanyId: command.issuerCompanyId },
    orderBy: { generation: "desc" },
    select: { generation: true },
  });
  const generation = (previousRun?.generation ?? 0) + 1;
  const projectedAt = new Date();
  const run = await tx.ownershipProjectionRun.create({
    data: {
      issuerCompanyId: command.issuerCompanyId,
      generation,
      projectorKey: OWNERSHIP_PROJECTOR_KEY,
      projectorVersion: OWNERSHIP_PROJECTOR_VERSION,
      ledgerHash,
      sourceEventCount: sourceEvents.length,
      projectionRowCount: periods.length,
      triggerReason: command.triggerReason,
      triggeredBy: command.triggeredBy,
      projectedAt,
    },
    select: { id: true },
  });

  await tx.ownershipInterest.deleteMany({ where: { issuerCompanyId: command.issuerCompanyId } });
  if (periods.length > 0) {
    await tx.ownershipInterest.createMany({
      data: periods.map((period) => ({
        ownerPartyId: period.ownerPartyId,
        issuerCompanyId: command.issuerCompanyId,
        shareRatio: period.shareRatio,
        isConsolidated: period.isConsolidated,
        effectiveFrom: period.effectiveFrom,
        effectiveTo: period.effectiveTo,
        recordStatus: "confirmed",
        changeLabel: period.sourceEventName,
        sourceType: period.sourceType,
        sourceLabel: period.sourceLabel,
        sourceReference: period.sourceReference,
        sourceEventId: period.sourceEventId,
        closedByEventId: period.closedByEventId,
        projectionRunId: run.id,
        projectionGeneration: generation,
        editedBy: command.triggeredBy,
        editedAt: projectedAt,
      })),
    });
  }

  return {
    runId: run.id,
    issuerCompanyId: command.issuerCompanyId,
    generation,
    projectorKey: OWNERSHIP_PROJECTOR_KEY,
    projectorVersion: OWNERSHIP_PROJECTOR_VERSION,
    ledgerHash,
    sourceEventCount: sourceEvents.length,
    projectionRowCount: periods.length,
    projectedAt,
  };
}

export function toEquityLedgerEvents(sourceEvents: readonly ShareCapitalSourceEvent[]): EquityLedgerEventState[] {
  return sourceEvents.map((event) => ({
    id: event.id,
    sequence: event.sequence,
    eventType: event.eventType,
    eventName: event.eventName,
    effectiveDate: event.effectiveDate,
    ledgerMode: event.ledgerMode as EquityLedgerEventState["ledgerMode"],
    dataCompleteness: event.dataCompleteness as EquityLedgerEventState["dataCompleteness"],
    recordStatus: event.recordStatus as EquityLedgerEventState["recordStatus"],
    registeredCapitalCheckpointYuan: decimalNullable(event.registeredCapitalCheckpointYuan),
    consolidatedByPartyIdAfter: event.consolidatedByPartyIdAfter,
    supersedesEventId: event.supersedesEventId,
    sourceType: event.sourceType,
    sourceLabel: event.sourceLabel,
    sourceReference: event.sourceReference,
    transactions: event.transactions.map((transaction) => ({
      id: transaction.id,
      sequence: transaction.sequence,
      fromPartyId: transaction.fromPartyId,
      toPartyId: transaction.toPartyId,
      registeredCapitalAmountYuan: Number(transaction.registeredCapitalAmountYuan),
    })),
    snapshotPositions: event.snapshotPositions.map((position) => ({
      id: position.id,
      sequence: position.sequence,
      partyId: position.partyId,
      registeredCapitalAmountYuan: decimalNullable(position.registeredCapitalAmountYuan),
      assertedShareRatio: position.assertedShareRatio,
    })),
  }));
}

function decimalNullable(value: Prisma.Decimal | null) {
  return value === null ? null : Number(value);
}
