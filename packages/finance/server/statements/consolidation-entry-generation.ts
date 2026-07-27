import { createHash } from "node:crypto";

import type {
  ConsolidationVoucherMatchGroup,
} from "../domain/consolidation-entry-generation";
import {
  buildGenerateConsolidationEntriesCommand,
  type GenerateConsolidationEntriesCommand,
} from "../domain/consolidation-entry-validation";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { assertBusinessActionDirectExecutionAllowed } from "@workspace/platform/server/business-action-executor";
import { Prisma, prisma } from "@workspace/platform/server/prisma";
import { getTenantProfile } from "@workspace/platform/server/tenant-config";
import { resolveUserBusinessActorName } from "@workspace/platform/server/user-identity";
import { consolidationBatchSnapshot, loadConsolidationBatchRow } from "./consolidation-dto";
import {
  appendConsolidationBatchEvent,
  claimConsolidationBatchRevision,
  immutableAuditSnapshot,
} from "./consolidation-mutations";
import { loadConsolidationVoucherMatchGroups } from "./consolidation-voucher-matches";
import { consolidationSourcesReady } from "./consolidation-source-coverage";
import { loadConsolidationCompanyDirectory } from "./consolidation-company-directory";
import { buildRemittanceFxEntries } from "./consolidation-remittance-fx-entries";
import { buildOpeningCapitalReclassificationEntries } from "./consolidation-opening-capital-reclassification";

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
  const pair = `${left?.companyName ?? "待确认公司"} → ${right?.companyName ?? "待确认公司"}`;
  return group.category === "investmentEquity" ? `${pair} 投资与权益抵销` : `${pair} 往来款抵销`;
}

function groupFingerprint(group: ConsolidationVoucherMatchGroup) {
  return fingerprint({
    entryGenerationVersion: "voucher-entry-lines-v2",
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
      sourceAmount: Math.abs(Math.round(fact.signedAmount * 100) / 100),
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
    if (!consolidationSourcesReady(batch.entities.length, batch.sources)) {
      throw new GenerationError("个别三表未全部就绪，不能开始生成抵销分录", 409);
    }
    const direct = await assertBusinessActionDirectExecutionAllowed({
      businessActionKey: "finance.statements.consolidationEntry.save",
      actorUserId: command.userId,
      resourceKey: "finance.statements",
      scopeType: "global",
      scopeId: null,
      blockedMessage: "抵销分录生成已配置为必须走流程，请从统一保存入口提交",
    });
    if (!direct.ok) return direct;

    const openingPolicies = getTenantProfile().financeConsolidationPolicies.openingCapitalReclassifications;
    const directoryCompanyCodes = [...new Set([
      ...batch.entities.map((entity) => entity.companyCode),
      ...openingPolicies.map((policy) => policy.payableCounterpartyCompanyCode),
    ])];
    const [groups, companyDirectory] = await Promise.all([
      loadConsolidationVoucherMatchGroups(batch),
      loadConsolidationCompanyDirectory(directoryCompanyCodes),
    ]);
    const entityByCompanyId = new Map(batch.entities.map((entity) => [entity.companyId, {
      ...entity,
      companyName: companyDirectory.displayName(entity.companyId, entity.companyCode, entity.companyName),
    }]));
    const batchSnapshot = consolidationBatchSnapshot(batch);
    const openingCounterparties = new Map(openingPolicies.flatMap((policy) => {
      const company = companyDirectory.find(null, policy.payableCounterpartyCompanyCode);
      return company ? [[policy.payableCounterpartyCompanyCode, {
        id: company.id,
        code: company.code,
        name: company.fullName || company.name,
      }] as const] : [];
    }));
    const openingResult = buildOpeningCapitalReclassificationEntries(
      batchSnapshot,
      openingPolicies,
      openingCounterparties,
    );
    if (!openingResult.ok) throw new GenerationError(openingResult.issue.message, openingResult.issue.status);
    const policyEntries = [
      ...openingResult.data,
      ...buildRemittanceFxEntries(batchSnapshot),
    ];
    const existingGroups = await prisma.financeConsolidationMatchGroup.findMany({
      where: { batchId: batch.id },
      include: { entry: { select: { id: true, status: true, generationFingerprint: true } }, sources: { select: { id: true } } },
    });
    const existingPolicyEntries = await prisma.financeConsolidationEntry.findMany({
      where: {
        batchId: batch.id,
        OR: [
          { generationKey: { startsWith: "policy:opening-capital-reclassification:" } },
          { generationKey: { startsWith: "policy:remittance-fx:" } },
        ],
      },
      select: { id: true, status: true, generationKey: true, generationFingerprint: true },
    });
    const existingPolicyByKey = new Map(existingPolicyEntries.flatMap((entry) =>
      entry.generationKey ? [[entry.generationKey, entry] as const] : [],
    ));
    const policyCandidates = policyEntries.map((entry) => {
      const existing = existingPolicyByKey.get(entry.generationKey);
      return { entry, existing, changed: !existing || existing.generationFingerprint !== entry.generationFingerprint };
    });
    const activePolicyKeys = new Set(policyEntries.map((entry) => entry.generationKey));
    const stalePolicyEntries = existingPolicyEntries.filter((entry) =>
      !entry.generationKey || !activePolicyKeys.has(entry.generationKey),
    );
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
    const protectedMatchMutation = [...candidates.filter((item) => item.changed).map((item) => item.existing), ...staleGroups]
      .find((group) => group?.entry && group.entry.status !== "draft");
    const protectedPolicyMutation = [
      ...policyCandidates.filter((item) => item.changed).map((item) => item.existing),
      ...stalePolicyEntries,
    ].find((entry) => entry && entry.status !== "draft");
    if (protectedMatchMutation || protectedPolicyMutation) {
      throw new GenerationError("来源凭证已变化，但已有提交或批准的系统抵销分录；请新建合并批次版本后重新生成", 409);
    }
    const changedCandidates = candidates.filter((item) => item.changed);
    const changedPolicyCandidates = policyCandidates.filter((item) => item.changed);
    const generatedTypes = new Set([
      ...groups.filter((group) => group.status === "matched").map((group) => group.category),
      ...policyEntries.map((entry) => entry.entryType),
    ]);
    const automaticDecisionConclusion = "当前来源未形成可入账的合并凭证";
    const automaticDecisionEvidence = "系统根据合并凭证生成结果自动记录；单边、差额或缺少外币流水的事项保留来源例外，不进入合并数";
    const automaticDecisionsChanged = (["investmentEquity", "intercompanyBalance"] as const).some((entryType) => {
      const controlKey = `elimination:${entryType}` as const;
      const current = batch.controlDecisions.find((decision) => decision.controlKey === controlKey);
      if (generatedTypes.has(entryType)) return current?.evidence.startsWith("系统根据合并凭证生成结果") ?? false;
      if (!current) return true;
      if (!current.evidence.startsWith("系统根据合并凭证生成结果")) return false;
      return current.decision !== "notApplicable"
        || current.conclusion !== automaticDecisionConclusion
        || current.evidence !== automaticDecisionEvidence;
    });
    if (changedCandidates.length === 0
      && staleGroups.length === 0
      && changedPolicyCandidates.length === 0
      && stalePolicyEntries.length === 0
      && !automaticDecisionsChanged) {
      return serviceOk({
        created: 0,
        updated: 0,
        unchanged: groups.filter((group) => group.status === "matched").length + policyEntries.length,
        exceptions: groups.filter((group) => group.status !== "matched").length,
        sourceItems: groups.reduce((sum, group) => sum + group.leftFacts.length + group.rightFacts.length, 0),
        batchRevision: batch.revision,
      });
    }
    const actorName = await resolveUserBusinessActorName(command.userId);
    if (!actorName) return serviceError("当前账号缺少员工身份且不是管理员，不能生成抵销分录", 409);

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
      if (stalePolicyEntries.length > 0) {
        await tx.financeConsolidationEntry.deleteMany({
          where: { id: { in: stalePolicyEntries.map((entry) => entry.id) } },
        });
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
      for (const candidate of changedPolicyCandidates) {
        const data = {
          entryNo: candidate.entry.entryNo,
          entryType: candidate.entry.entryType,
          title: candidate.entry.title,
          description: candidate.entry.description,
          evidence: candidate.entry.evidence,
          matchDifference: candidate.entry.matchDifference,
          differenceResolution: candidate.entry.differenceResolution,
          origin: "system",
          generationKey: candidate.entry.generationKey,
          generationFingerprint: candidate.entry.generationFingerprint,
          generatedAt: new Date(),
          preparedBy: command.userId,
        };
        if (candidate.existing) {
          await tx.financeConsolidationEntryLine.deleteMany({ where: { entryId: candidate.existing.id } });
          await tx.financeConsolidationEntry.update({
            where: { id: candidate.existing.id },
            data: { ...data, lines: { create: candidate.entry.lines } },
          });
          updated += 1;
        } else {
          await tx.financeConsolidationEntry.create({
            data: { batchId: batch.id, ...data, lines: { create: candidate.entry.lines } },
          });
          created += 1;
        }
      }
      for (const entryType of ["investmentEquity", "intercompanyBalance"] as const) {
        const controlKey = `elimination:${entryType}` as const;
        const currentDecision = batch.controlDecisions.find((decision) => decision.controlKey === controlKey);
        if (generatedTypes.has(entryType)) {
          await tx.financeConsolidationControlDecision.deleteMany({
            where: {
              batchId: batch.id,
              controlKey,
              evidence: { startsWith: "系统根据合并凭证生成结果" },
            },
          });
          continue;
        }
        if (currentDecision && !currentDecision.evidence.startsWith("系统根据合并凭证生成结果")) continue;
        if (currentDecision
          && currentDecision.decision === "notApplicable"
          && currentDecision.conclusion === automaticDecisionConclusion
          && currentDecision.evidence === automaticDecisionEvidence) continue;
        const decisionData = {
          decision: "notApplicable" as const,
          conclusion: automaticDecisionConclusion,
          evidence: automaticDecisionEvidence,
          decidedBy: command.userId,
          decidedAt: new Date(),
        };
        if (currentDecision) {
          await tx.financeConsolidationControlDecision.update({
            where: { id: currentDecision.id },
            data: decisionData,
          });
        } else {
          await tx.financeConsolidationControlDecision.create({
            data: {
              batchId: batch.id,
              controlKey,
              ...decisionData,
            },
          });
        }
      }
      await appendConsolidationBatchEvent(tx, {
        batchId: batch.id,
        eventType: "mutation",
        action: "entry.generate",
        fromStatus: "draft",
        toStatus: "draft",
        note: `生成合并凭证：新增 ${created}，更新 ${updated}，来源待补 ${groups.filter((group) => group.status !== "matched").length}`,
        actorUserId: command.userId,
        actorName,
        batchRevision,
        snapshot: immutableAuditSnapshot({
          groups: groups.map((group) => ({
            generationKey: group.generationKey,
            status: group.status,
            sourceVoucherItemIds: [...group.leftFacts, ...group.rightFacts].map((fact) => fact.itemId),
          })),
          policyEntries: policyEntries.map((entry) => ({
            generationKey: entry.generationKey,
            generationFingerprint: entry.generationFingerprint,
          })),
        }),
      });
      return { created, updated, batchRevision };
    });
    return serviceOk({
      ...result,
      unchanged: candidates.filter((item) => !item.changed && item.group.status === "matched").length
        + policyCandidates.filter((item) => !item.changed).length,
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
