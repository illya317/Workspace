import { createHash } from "node:crypto";

import type {
  ConsolidationVoucherMatchGroup,
} from "../domain/consolidation-entry-generation";
import {
  buildGenerateConsolidationEntriesCommand,
  type GenerateConsolidationEntriesCommand,
} from "../domain/consolidation-entry-validation";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { isRootAdminUser } from "@workspace/platform/server/auth";
import { assertBusinessActionDirectExecutionAllowed } from "@workspace/platform/server/business-action-executor";
import { Prisma, prisma } from "@workspace/platform/server/prisma";
import { resolveUserEmployeeName } from "@workspace/platform/server/user-identity";
import { loadConsolidationBatchRow } from "./consolidation-dto";
import {
  appendConsolidationBatchEvent,
  claimConsolidationBatchRevision,
  immutableAuditSnapshot,
  resolveConsolidationActorName,
} from "./consolidation-mutations";
import { loadConsolidationVoucherMatchGroups } from "./consolidation-voucher-matches";

class GenerationError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function entryTitle(
  group: ConsolidationVoucherMatchGroup,
  entityByCompanyId: Map<number, { companyCode: string; companyName: string }>,
) {
  const left = entityByCompanyId.get(group.leftCompanyId);
  const right = group.rightCompanyId ? entityByCompanyId.get(group.rightCompanyId) : null;
  const pair = `${left?.companyCode ?? group.leftCompanyId} ↔ ${right?.companyCode ?? "待确认"}`;
  return group.category === "investmentEquity" ? `${pair} 投资与权益抵销` : `${pair} 往来款抵销`;
}

function groupFingerprint(group: ConsolidationVoucherMatchGroup) {
  return fingerprint({
    category: group.category,
    generationKey: group.generationKey,
    status: group.status,
    companies: [group.leftCompanyId, group.rightCompanyId],
    amounts: [group.leftNetAmount, group.rightNetAmount, group.matchedAmount, group.differenceAmount],
    matchingVersion: group.matchingVersion,
    sources: [...group.leftFacts, ...group.rightFacts]
      .map((fact) => [fact.itemId, fact.signedAmount, fact.lineCode, fact.sourceFingerprint])
      .sort((left, right) => Number(left[0]) - Number(right[0])),
  });
}

function groupSources(
  group: ConsolidationVoucherMatchGroup,
  entityByCompanyId: Map<number, { id: number }>,
) {
  const leftEntity = entityByCompanyId.get(group.leftCompanyId);
  const rightEntity = group.rightCompanyId ? entityByCompanyId.get(group.rightCompanyId) : null;
  if (!leftEntity) throw new GenerationError("匹配组的母公司主体不在当前合并范围", 409);
  return [
    ...group.leftFacts.map((fact) => ({ fact, side: "left" as const, entity: leftEntity, counterparty: rightEntity })),
    ...group.rightFacts.map((fact) => ({ fact, side: "right" as const, entity: rightEntity, counterparty: leftEntity })),
  ].map(({ fact, side, entity, counterparty }) => {
    if (!entity) throw new GenerationError("匹配组的对方主体不在当前合并范围", 409);
    return {
      entitySnapshotId: entity.id,
      counterpartyEntitySnapshotId: counterparty?.id ?? null,
      voucherItemId: fact.itemId,
      matchSide: side,
      sourceAmount: fact.signedAmount,
      allocatedAmount: Math.abs(fact.signedAmount),
      currencyCode: fact.currencyCode,
      sourceFingerprint: fact.sourceFingerprint,
    };
  });
}

function entryLines(
  group: ConsolidationVoucherMatchGroup,
  entityByCompanyId: Map<number, { id: number; companyId: number; companyCode: string }>,
) {
  const leftEntity = entityByCompanyId.get(group.leftCompanyId);
  const rightEntity = group.rightCompanyId ? entityByCompanyId.get(group.rightCompanyId) : null;
  if (!leftEntity || !rightEntity) throw new GenerationError("已匹配凭证缺少合并主体快照", 409);
  return [
    ...group.leftFacts.map((fact) => ({ fact, side: "left" as const, entity: leftEntity, counterparty: rightEntity })),
    ...group.rightFacts.map((fact) => ({ fact, side: "right" as const, entity: rightEntity, counterparty: leftEntity })),
  ].map(({ fact, side, entity, counterparty }, index) => {
    if (!fact.lineCode) throw new GenerationError("已匹配凭证存在未映射报表项目", 409);
    const amount = Math.abs(Math.round(fact.signedAmount * 100) / 100);
    return {
      lineNo: index + 1,
      entitySnapshotId: entity.id,
      companyId: entity.companyId,
      companyCode: entity.companyCode,
      statementType: "balanceSheet",
      lineCode: fact.lineCode,
      accountCode: fact.accountCode,
      debit: fact.signedAmount < 0 ? amount : 0,
      credit: fact.signedAmount > 0 ? amount : 0,
      currencyCode: fact.currencyCode,
      periodBasis: "current",
      note: `${fact.voucherDate} ${fact.voucherNo} · ${fact.accountCode} ${fact.accountName}`,
      matchSide: side,
      sourceKind: "voucher",
      sourceId: `voucher:${fact.itemId}`,
      sourceFingerprint: fact.sourceFingerprint,
      sourceAmount: amount,
      sourceCurrency: fact.currencyCode,
      counterpartyEntitySnapshotId: counterparty.id,
      counterpartyCompanyId: counterparty.companyId,
      sourceVoucherItemId: fact.itemId,
    };
  });
}

function entryData(
  group: ConsolidationVoucherMatchGroup,
  groupHash: string,
  userId: number,
  entityByCompanyId: Map<number, { companyCode: string; companyName: string }>,
) {
  const sourceCount = group.leftFacts.length + group.rightFacts.length;
  return {
    entryNo: `${group.category === "investmentEquity" ? "AUTO-INV" : "AUTO-IC"}-${fingerprint(group.generationKey).slice(0, 10).toUpperCase()}`,
    entryType: group.category,
    title: entryTitle(group, entityByCompanyId),
    description: `按 ${sourceCount} 条凭证明细形成 ${group.leftFacts.length}:${group.rightFacts.length} 匹配；未使用期末余额替代凭证。`,
    evidence: `${group.matchingRule}；来源凭证明细 ID：${[...group.leftFacts, ...group.rightFacts].map((fact) => fact.itemId).join("、")}`,
    matchDifference: group.differenceAmount,
    differenceResolution: group.differenceResolution ?? "双方凭证明细净额一致",
    origin: "system",
    generationKey: group.generationKey,
    generationFingerprint: groupHash,
    generatedAt: new Date(),
    preparedBy: userId,
  };
}

function persistedStatus(group: ConsolidationVoucherMatchGroup, existing: { status: string; sourceFingerprint: string } | undefined) {
  return existing && existing.sourceFingerprint === groupFingerprint(group) && ["accepted", "rejected"].includes(existing.status)
    ? existing.status
    : group.status;
}

export async function generateConsolidationEntries(rawCommand: GenerateConsolidationEntriesCommand) {
  const validation = buildGenerateConsolidationEntriesCommand(
    rawCommand.batchId,
    { expectedRevision: rawCommand.expectedRevision },
    rawCommand.userId,
  );
  if (!validation.ok) return serviceError(validation.issue.message, validation.issue.status);
  const command = validation.data;
  try {
    const batch = await loadConsolidationBatchRow(command.batchId);
    if (!batch) throw new GenerationError("合并批次不存在", 404);
    if (batch.status !== "draft") throw new GenerationError("只有草稿批次允许自动生成抵销分录", 409);
    const direct = await assertBusinessActionDirectExecutionAllowed({
      businessActionKey: "finance.statements.consolidationEntry.save",
      actorUserId: command.userId,
      resourceKey: "finance.statements",
      scopeType: "global",
      scopeId: null,
      blockedMessage: "抵销分录生成已配置为必须走流程，请从统一保存入口提交",
    });
    if (!direct.ok) return direct;

    const groups = await loadConsolidationVoucherMatchGroups(batch);
    const entityByCompanyId = new Map(batch.entities.map((entity) => [entity.companyId, entity]));
    const existingGroups = await prisma.financeConsolidationMatchGroup.findMany({
      where: { batchId: batch.id },
      include: { entry: { select: { id: true, status: true, generationFingerprint: true } }, sources: { select: { id: true } } },
    });
    const existingByKey = new Map(existingGroups.map((group) => [group.generationKey, group]));
    const candidates = groups.map((group) => {
      const sourceFingerprint = groupFingerprint(group);
      const existing = existingByKey.get(group.generationKey);
      const status = persistedStatus(group, existing);
      const entryChanged = group.status === "matched"
        ? !existing?.entry || existing.entry.generationFingerprint !== sourceFingerprint
        : Boolean(existing?.entry);
      const changed = !existing
        || existing.sourceFingerprint !== sourceFingerprint
        || existing.status !== status
        || entryChanged;
      return { group, sourceFingerprint, status, existing, changed };
    });
    const activeKeys = new Set(groups.map((group) => group.generationKey));
    const staleGroups = existingGroups.filter((group) => !activeKeys.has(group.generationKey));
    const protectedMutation = [...candidates.filter((item) => item.changed).map((item) => item.existing), ...staleGroups]
      .find((group) => group?.entry && group.entry.status !== "draft");
    if (protectedMutation) {
      throw new GenerationError("来源凭证已变化，但已有提交或批准的系统抵销分录；请新建合并批次版本后重新生成", 409);
    }
    const changedCandidates = candidates.filter((item) => item.changed);
    if (changedCandidates.length === 0 && staleGroups.length === 0) {
      return serviceOk({
        created: 0,
        updated: 0,
        unchanged: groups.filter((group) => group.status === "matched").length,
        exceptions: groups.filter((group) => group.status !== "matched").length,
        sourceItems: groups.reduce((sum, group) => sum + group.leftFacts.length + group.rightFacts.length, 0),
        batchRevision: batch.revision,
      });
    }
    const employeeName = await resolveUserEmployeeName(command.userId);
    const actorName = resolveConsolidationActorName(
      employeeName,
      employeeName ? false : await isRootAdminUser(command.userId),
    );
    if (!actorName) return serviceError("当前账号缺少员工身份，且不是系统管理员，不能生成抵销分录", 409);

    const result = await prisma.$transaction(async (tx) => {
      const batchRevision = await claimConsolidationBatchRevision(tx, {
        batchId: batch.id,
        status: "draft",
        expectedRevision: command.expectedRevision,
      });
      if (!batchRevision) throw new GenerationError("合并批次已被提交或被其他人修改，请刷新后重试", 409);
      let created = 0;
      let updated = 0;
      for (const stale of staleGroups) {
        if (stale.entry) {
          await tx.financeConsolidationMatchGroup.update({ where: { id: stale.id }, data: { entryId: null } });
          await tx.financeConsolidationEntry.delete({ where: { id: stale.entry.id } });
        }
        await tx.financeConsolidationMatchGroup.delete({ where: { id: stale.id } });
      }
      for (const candidate of changedCandidates) {
        const { group, sourceFingerprint, status, existing } = candidate;
        const leftEntity = entityByCompanyId.get(group.leftCompanyId);
        const rightEntity = group.rightCompanyId ? entityByCompanyId.get(group.rightCompanyId) : null;
        if (!leftEntity) throw new GenerationError("匹配组主体不在当前合并范围", 409);
        if (existing?.entry && group.status !== "matched") {
          await tx.financeConsolidationMatchGroup.update({ where: { id: existing.id }, data: { entryId: null } });
          await tx.financeConsolidationEntry.delete({ where: { id: existing.entry.id } });
        }
        const matchGroup = await tx.financeConsolidationMatchGroup.upsert({
          where: { batchId_generationKey: { batchId: batch.id, generationKey: group.generationKey } },
          create: {
            batchId: batch.id,
            category: group.category,
            status,
            leftEntitySnapshotId: leftEntity.id,
            rightEntitySnapshotId: rightEntity?.id ?? null,
            matchingRule: group.matchingRule,
            matchingVersion: group.matchingVersion,
            matchedAmount: group.matchedAmount,
            differenceAmount: group.differenceAmount,
            differenceResolution: group.differenceResolution,
            generationKey: group.generationKey,
            sourceFingerprint,
          },
          update: {
            status,
            leftEntitySnapshotId: leftEntity.id,
            rightEntitySnapshotId: rightEntity?.id ?? null,
            matchingRule: group.matchingRule,
            matchingVersion: group.matchingVersion,
            matchedAmount: group.matchedAmount,
            differenceAmount: group.differenceAmount,
            differenceResolution: group.differenceResolution,
            sourceFingerprint,
          },
        });
        await tx.financeConsolidationMatchSource.deleteMany({ where: { matchGroupId: matchGroup.id } });
        const sources = groupSources(group, entityByCompanyId);
        if (sources.length) {
          await tx.financeConsolidationMatchSource.createMany({
            data: sources.map((source) => ({ matchGroupId: matchGroup.id, ...source })),
          });
        }
        if (group.status !== "matched") continue;
        const data = entryData(group, sourceFingerprint, command.userId, entityByCompanyId);
        const lines = entryLines(group, entityByCompanyId);
        const currentEntry = existing?.entry;
        let entryId: number;
        if (currentEntry) {
          await tx.financeConsolidationEntryLine.deleteMany({ where: { entryId: currentEntry.id } });
          await tx.financeConsolidationEntry.update({
            where: { id: currentEntry.id },
            data: { ...data, lines: { create: lines } },
          });
          entryId = currentEntry.id;
          updated += 1;
        } else {
          const entry = await tx.financeConsolidationEntry.create({
            data: { batchId: batch.id, ...data, lines: { create: lines } },
            select: { id: true },
          });
          entryId = entry.id;
          created += 1;
        }
        await tx.financeConsolidationMatchGroup.update({ where: { id: matchGroup.id }, data: { entryId } });
      }
      await appendConsolidationBatchEvent(tx, {
        batchId: batch.id,
        eventType: "mutation",
        action: "entry.generate",
        fromStatus: "draft",
        toStatus: "draft",
        note: `按凭证明细自动匹配：新增 ${created}，更新 ${updated}，待复核 ${groups.filter((group) => group.status !== "matched").length}`,
        actorUserId: command.userId,
        actorName,
        batchRevision,
        snapshot: immutableAuditSnapshot({
          groups: groups.map((group) => ({
            generationKey: group.generationKey,
            status: group.status,
            sourceVoucherItemIds: [...group.leftFacts, ...group.rightFacts].map((fact) => fact.itemId),
          })),
        }),
      });
      return { created, updated, batchRevision };
    });
    return serviceOk({
      ...result,
      unchanged: candidates.filter((item) => !item.changed && item.group.status === "matched").length,
      exceptions: groups.filter((group) => group.status !== "matched").length,
      sourceItems: groups.reduce((sum, group) => sum + group.leftFacts.length + group.rightFacts.length, 0),
    });
  } catch (cause) {
    if (cause instanceof GenerationError) return serviceError(cause.message, cause.status);
    if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2002") {
      return serviceError("自动抵销分录编号或生成键冲突，请刷新后重试", 409);
    }
    throw cause;
  }
}
