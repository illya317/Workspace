import { assertBusinessActionDirectExecutionAllowed } from "@workspace/platform/server/business-action-executor";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { Prisma, prisma } from "@workspace/platform/server/prisma";

import { projectEquityLedger } from "./domain/equity-ledger";
import {
  buildSetConsolidationInclusionCommand,
  type SetConsolidationInclusionCommand,
} from "./domain/consolidation-inclusion-validation";
import {
  rebuildOwnershipProjectionInTransaction,
  toEquityLedgerEvents,
} from "./ownership-projection";

const FINANCE_SCOPE_SOURCE_LABEL = "财务报表合并范围";

export function buildSetConsolidationInclusionRouteCommand(
  input: Parameters<typeof buildSetConsolidationInclusionCommand>[0],
  actorUserId: unknown,
) {
  return buildSetConsolidationInclusionCommand(input, actorUserId);
}

const sourceEventInclude = {
  transactions: { orderBy: [{ sequence: "asc" }, { id: "asc" }] },
  snapshotPositions: { orderBy: [{ sequence: "asc" }, { id: "asc" }] },
} satisfies Prisma.ShareCapitalEventInclude;

class ConsolidationInclusionError extends Error {
  constructor(message: string, readonly status = 409) {
    super(message);
  }
}

type ConsolidationDatabase = {
  $transaction<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: { maxWait?: number; timeout?: number },
  ): Promise<T>;
};

function sameUtcDate(value: Date | null, dateText: string) {
  return value?.toISOString().slice(0, 10) === dateText;
}

function relationEffectiveAt(
  relation: { effectiveFrom: Date | null; effectiveTo: Date | null },
  effectiveDate: Date,
) {
  return (!relation.effectiveFrom || relation.effectiveFrom <= effectiveDate)
    && (!relation.effectiveTo || relation.effectiveTo >= effectiveDate);
}

async function executeConsolidationInclusion(
  command: SetConsolidationInclusionCommand,
  database: ConsolidationDatabase,
) {
  const validated = buildSetConsolidationInclusionCommand(command, command.actorUserId);
  if (!validated.ok) return serviceError(validated.issue.message, validated.issue.status);
  const input = validated.data;

  const direct = await assertBusinessActionDirectExecutionAllowed({
    businessActionKey: "capitalSecurities.governance.consolidationScope.update",
    actorUserId: input.actorUserId,
    resourceKey: "capitalSecurities.governance",
    scopeType: "global",
    scopeId: null,
    blockedMessage: "并表范围调整已配置为必须走流程，请从统一保存入口提交",
  });
  if (!direct.ok) return direct;

  try {
    const result = await database.$transaction(async (tx) => {
      const initialRelation = await tx.ownershipInterest.findUnique({
        where: { id: input.relationId },
        select: { issuerCompanyId: true },
      });
      if (!initialRelation) throw new ConsolidationInclusionError("股权关系不存在或已被重建，请刷新后重试", 404);

      const lockKey = `capital-ownership-projection:${initialRelation.issuerCompanyId}`;
      await tx.$queryRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))::text AS locked
      `);

      const relation = await tx.ownershipInterest.findUnique({
        where: { id: input.relationId },
        include: { owner: { select: { company: { select: { id: true } } } } },
      });
      if (!relation || relation.issuerCompanyId !== initialRelation.issuerCompanyId) {
        throw new ConsolidationInclusionError("股权关系已被其他操作重建，请刷新后重试");
      }
      if (relation.version !== input.expectedVersion) {
        throw new ConsolidationInclusionError("股权关系版本已变化，请刷新后重试");
      }
      if (!relation.owner.company) {
        throw new ConsolidationInclusionError("只有内部公司股东可以设置并表范围");
      }

      const effectiveDate = new Date(`${input.effectiveDate}T00:00:00.000Z`);
      if (!relationEffectiveAt(relation, effectiveDate)) {
        throw new ConsolidationInclusionError("该股权关系在所选报告期末无效，请刷新后重试");
      }

      const sourceEvents = await tx.shareCapitalEvent.findMany({
        where: { issuerCompanyId: relation.issuerCompanyId },
        include: sourceEventInclude,
        orderBy: [{ sequence: "asc" }, { id: "asc" }],
      });
      if (sourceEvents.length === 0) {
        throw new ConsolidationInclusionError("该公司尚未建立股权事件账本，不能设置并表范围");
      }
      if (sourceEvents.some((event) => event.effectiveDate && event.effectiveDate > effectiveDate)) {
        throw new ConsolidationInclusionError("所选期间早于账本中的后续事件，历史范围调整必须走冲销更正流程");
      }
      if (sourceEvents.some((event) => event.recordStatus === "pending" && (!event.effectiveDate || event.effectiveDate <= effectiveDate))) {
        throw new ConsolidationInclusionError("该公司存在尚未确认的股权事件，请先完成确认再调整并表范围");
      }

      const ledgerEvents = toEquityLedgerEvents(sourceEvents);
      const current = projectEquityLedger(ledgerEvents, new Date(`${input.effectiveDate}T23:59:59.999Z`)).confirmedState;
      if (!current.holdings.has(relation.ownerPartyId)) {
        throw new ConsolidationInclusionError("控制方在所选期末不是该公司的有效股东");
      }
      const currentlyIncluded = current.consolidatedByPartyId === relation.ownerPartyId;
      if (currentlyIncluded === input.included) {
        return { changed: false, eventId: null, projection: null };
      }

      const latestEvent = sourceEvents.at(-1)!;
      const supersedesEventId = sameUtcDate(latestEvent.effectiveDate, input.effectiveDate)
        && latestEvent.sourceType === "manual"
        && latestEvent.sourceLabel === FINANCE_SCOPE_SOURCE_LABEL
        ? latestEvent.id
        : null;
      const event = await tx.shareCapitalEvent.create({
        data: {
          issuerCompanyId: relation.issuerCompanyId,
          sequence: latestEvent.sequence + 1,
          eventType: "confirmation_snapshot",
          eventName: input.included ? "纳入合并范围" : "移出合并范围",
          effectiveDate,
          effectiveDatePrecision: "day",
          ledgerMode: "confirmation_snapshot",
          dataCompleteness: current.dataCompleteness,
          registeredCapitalCheckpointYuan: current.registeredCapitalYuan,
          recordStatus: "confirmed",
          sourceObservedDate: new Date(),
          consolidatedByPartyIdAfter: input.included ? relation.ownerPartyId : null,
          supersedesEventId,
          sourceType: "manual",
          sourceLabel: FINANCE_SCOPE_SOURCE_LABEL,
          sourceReference: `finance-statements:${input.effectiveDate}`,
          notes: input.included ? "财务报表页面选择并表：是" : "财务报表页面选择并表：否",
          editedBy: input.actorUserId,
          editedAt: new Date(),
          snapshotPositions: {
            create: [...current.holdings].map(([partyId, holding], index) => ({
              sequence: index + 1,
              partyId,
              registeredCapitalAmountYuan: holding.registeredCapitalAmountYuan,
              assertedShareRatio: holding.shareRatio,
              sourceReference: `finance-statements:${input.effectiveDate}`,
              editedBy: input.actorUserId,
              editedAt: new Date(),
            })),
          },
        },
        select: { id: true },
      });
      const projection = await rebuildOwnershipProjectionInTransaction(tx, {
        issuerCompanyId: relation.issuerCompanyId,
        triggerReason: input.included ? "财务报表纳入合并范围" : "财务报表移出合并范围",
        triggeredBy: input.actorUserId,
      });
      return { changed: true, eventId: event.id, projection };
    }, { maxWait: 30_000, timeout: 300_000 });
    return serviceOk(result);
  } catch (cause) {
    if (cause instanceof ConsolidationInclusionError) return serviceError(cause.message, cause.status);
    throw cause;
  }
}

export function setConsolidationInclusion(command: SetConsolidationInclusionCommand) {
  return executeConsolidationInclusion(command, prisma as unknown as ConsolidationDatabase);
}
