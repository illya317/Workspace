import { createHash } from "node:crypto";

import {
  buildIntercompanyVoucherMatchGroups,
  buildInvestmentVoucherMatchGroups,
  intercompanyPresentationAccountCode,
  type ConsolidationVoucherMatchFact,
} from "../domain/consolidation-entry-generation";
import { prisma } from "@workspace/platform/server/prisma";
import { buildFixedBalanceAssignments } from "./config/fixed-balance-definition";
import type { ConsolidationBatchRow } from "./consolidation-dto";
import { resolveMappedLineCode } from "./shared/mapping-resolver";

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function reportPayloadLines(value: unknown): Record<string, unknown>[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const envelope = value as Record<string, unknown>;
  const payloadValue = envelope.payload ?? envelope;
  if (!payloadValue || typeof payloadValue !== "object" || Array.isArray(payloadValue)) return [];
  const payload = payloadValue as Record<string, unknown>;
  return [payload.assets, payload.liabilities, payload.equity]
    .flatMap((part) => Array.isArray(part) ? part : [])
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object" && !Array.isArray(row));
}

function periodEndDate(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function mappedInvestmentCompanyId(
  rules: Array<{
    sourceCompanyCode: string;
    linkedCompanyId: number;
    voucherDate: string | null;
    voucherNo: string | null;
    matchText: string | null;
    priority: number;
  }>,
  item: { voucher: { companyCode: string; date: string; voucherNo: string }; description: string | null },
) {
  const matches = rules.filter((rule) => (!rule.voucherDate || rule.voucherDate === item.voucher.date)
    && (!rule.voucherNo || rule.voucherNo === item.voucher.voucherNo)
    && (!rule.matchText || item.description?.includes(rule.matchText)));
  const highestPriority = Math.max(...matches.map((rule) => rule.priority), -1);
  const companyIds = [...new Set(matches
    .filter((rule) => rule.priority === highestPriority)
    .map((rule) => rule.linkedCompanyId))];
  if (companyIds.length !== 1) return null;
  const selected = matches.find((rule) => rule.priority === highestPriority && rule.linkedCompanyId === companyIds[0]);
  return selected ? {
    companyId: selected.linkedCompanyId,
  } : null;
}

export async function loadConsolidationVoucherMatchGroups(batch: ConsolidationBatchRow) {
  const entities = batch.entities.filter((entity) => entity.isConsolidated);
  const entityByCompanyId = new Map(entities.map((entity) => [entity.companyId, entity]));
  const entityByCompanyCode = new Map(entities.map((entity) => [entity.companyCode, entity]));
  const companyIds = [...entityByCompanyId.keys()];
  const companyCodes = [...entityByCompanyCode.keys()];
  const cutoff = new Date(`${periodEndDate(batch.year, batch.month)}T00:00:00.000Z`);
  const [policyVersion, periods] = await Promise.all([
    prisma.financeAccountingPolicyVersion.findFirst({
      where: {
        status: "published",
        OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: cutoff } }],
        AND: [{ OR: [{ effectiveTo: null }, { effectiveTo: { gt: cutoff } }] }],
      },
      orderBy: { versionNo: "desc" },
      include: {
        consolidationRules: { where: { enabled: true }, include: { selectors: true } },
        revisions: { select: { groupAccountId: true, consolidationRole: true } },
        mappings: { where: { companyCode: { in: companyCodes }, groupAccountId: { not: null } }, select: { companyCode: true, localAccountCode: true, groupAccountId: true } },
      },
    }),
    prisma.financePeriod.findMany({
      where: { companyCode: { in: companyCodes }, year: batch.year, month: batch.month },
      select: { id: true, companyCode: true },
    }),
  ]);
  const roleByGroupAccountId = new Map(policyVersion?.revisions.map((revision) => [revision.groupAccountId, revision.consolidationRole]) ?? []);
  const roleByLocalAccount = new Map(policyVersion?.mappings.map((mapping) => [
    `${mapping.companyCode}:${mapping.localAccountCode}`,
    roleByGroupAccountId.get(mapping.groupAccountId!) ?? "none",
  ]) ?? []);
  const intercompanyRule = policyVersion?.consolidationRules.find((rule) => rule.ruleType === "intercompanyBalance") ?? null;
  const investmentRule = policyVersion?.consolidationRules.find((rule) => rule.ruleType === "investmentEquity") ?? null;
  const allowedRoles = (rule: typeof intercompanyRule) => new Set(rule?.selectors
    .filter((selector) => selector.selectorType === "role" && selector.consolidationRole)
    .map((selector) => selector.consolidationRole!) ?? []);
  const intercompanyRoles = allowedRoles(intercompanyRule);
  const investmentRoles = allowedRoles(investmentRule);
  const frozenLines = new Map<number, Set<string>>();
  for (const source of batch.sources) {
    if (source.reportType !== "balanceSheet") continue;
    frozenLines.set(source.entitySnapshotId, new Set(reportPayloadLines(source.reportPayload)
      .map((line) => typeof line.lineCode === "string" ? line.lineCode : null)
      .filter((line): line is string => Boolean(line))));
  }
  const [investmentCompanyRules, items, auxiliaryBalances, reclassAdjustments] = await Promise.all([
    prisma.financeVoucherCompanyMappingRule.findMany({
      where: {
        purpose: "investmentInvestee",
        sourceCompanyCode: { in: companyCodes },
        linkedCompanyId: { in: companyIds },
        isActive: true,
      },
      select: {
        sourceCompanyCode: true, linkedCompanyId: true, voucherDate: true,
        voucherNo: true, matchText: true, priority: true,
      },
      orderBy: [{ priority: "desc" }, { id: "asc" }],
    }),
    prisma.financeVoucherItem.findMany({
      where: {
        voucher: {
          companyCode: { in: companyCodes },
          date: { lte: periodEndDate(batch.year, batch.month) },
          status: "posted",
          OR: [{ sourceInvalid: false }, { sourceInvalid: null }],
        },
        OR: [
          { auxiliaryLinks: { some: { member: { linkedCompanyId: { in: companyIds } } } } },
          { account: { OR: [
            { code: { startsWith: "1511" } }, { code: { startsWith: "1512" } },
            { code: { startsWith: "4001" } }, { code: { startsWith: "4002" } },
            { code: { startsWith: "3001" } }, { code: { startsWith: "3002" } },
            { name: { contains: "长期股权投资" } }, { name: { contains: "实收资本" } },
            { name: { contains: "股本" } }, { name: { contains: "资本公积" } },
          ] } },
        ],
      },
      select: {
        id: true,
        voucherId: true,
        debit: true,
        credit: true,
        description: true,
        sourceSystem: true,
        sourceDatabase: true,
        sourceKey: true,
        importFingerprint: true,
        voucher: { select: {
          id: true, voucherNo: true, date: true, companyCode: true,
          sourceSystem: true, sourceDatabase: true, sourceKey: true,
        } },
        account: { select: { code: true, name: true } },
        auxiliaryLinks: {
          where: { member: { linkedCompanyId: { in: companyIds } } },
          select: { member: { select: { linkedCompanyId: true } } },
        },
      },
      orderBy: [{ voucher: { date: "asc" } }, { voucherId: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
    }),
    prisma.financeAuxiliaryBalance.findMany({
      where: {
        companyCode: { in: companyCodes },
        period: { year: batch.year, month: batch.month },
        members: { some: { member: { linkedCompanyId: { in: companyIds } } } },
      },
      select: {
        id: true,
        companyCode: true,
        sourceSystem: true,
        sourceDatabase: true,
        sourceKey: true,
        closingDebit: true,
        closingCredit: true,
        account: { select: { code: true, name: true, balanceDirection: true } },
        members: {
          where: { member: { linkedCompanyId: { in: companyIds } } },
          select: { member: { select: { linkedCompanyId: true } } },
        },
      },
      orderBy: [{ companyCode: "asc" }, { account: { code: "asc" } }, { id: "asc" }],
    }),
    prisma.financeBalanceReclassAdjustment.findMany({
      where: {
        periodId: { in: periods.map((period) => period.id) },
        companyCode: { in: companyCodes },
        decision: "reclassify",
        basis: "counterparty_gross",
        targetAccountCode: { not: null },
        status: { in: ["approved", "adjusted"] },
      },
      select: { companyCode: true, sourceAccountCode: true, targetAccountCode: true },
    }),
  ]);
  const investmentRulesByCompanyCode = new Map<string, typeof investmentCompanyRules>();
  for (const rule of investmentCompanyRules) {
    const rules = investmentRulesByCompanyCode.get(rule.sourceCompanyCode);
    if (rules) rules.push(rule);
    else investmentRulesByCompanyCode.set(rule.sourceCompanyCode, [rule]);
  }
  const { mappingMap } = buildFixedBalanceAssignments();
  const noScopedMapping = new Map<string, string>();
  const reclassTargetBySource = new Map(reclassAdjustments.flatMap((adjustment) => (
    adjustment.targetAccountCode
      ? [[`${adjustment.companyCode}:${adjustment.sourceAccountCode}`, adjustment.targetAccountCode] as const]
      : []
  )));
  const intercompanyFacts: ConsolidationVoucherMatchFact[] = [];
  const investmentFacts: ConsolidationVoucherMatchFact[] = [];
  for (const balance of auxiliaryBalances) {
    const entity = entityByCompanyCode.get(balance.companyCode);
    if (!entity) continue;
    const counterparties = [...new Set(balance.members
      .map((link) => link.member.linkedCompanyId)
      .filter((id): id is number => id !== null && id !== entity.companyId))];
    if (counterparties.length !== 1) continue;
    const signedAmount = Math.round((Number(balance.closingDebit) - Number(balance.closingCredit)) * 100) / 100;
    if (signedAmount === 0) continue;
    const consolidationRole = roleByLocalAccount.get(`${balance.companyCode}:${balance.account.code}`) ?? "none";
    if (!intercompanyRule || !intercompanyRoles.has(consolidationRole)) continue;
    const presentationAccountCode = intercompanyPresentationAccountCode({
      sourceAccountCode: balance.account.code,
      reclassTargetAccountCode: reclassTargetBySource.get(`${balance.companyCode}:${balance.account.code}`) ?? null,
      balanceDirection: balance.account.balanceDirection,
      signedAmount,
    });
    const mappedLine = resolveMappedLineCode(presentationAccountCode, noScopedMapping, mappingMap);
    const lineCode = mappedLine && frozenLines.get(entity.id)?.has(mappedLine) ? mappedLine : null;
    intercompanyFacts.push({
      sourceKind: "auxiliaryBalance",
      itemId: balance.id,
      voucherId: 0,
      voucherNo: "期末辅助余额",
      voucherDate: periodEndDate(batch.year, batch.month),
      companyId: entity.companyId,
      counterpartyCompanyId: counterparties[0]!,
      accountCode: balance.account.code,
      accountName: balance.account.name,
      description: null,
      lineCode,
      signedAmount,
      currencyCode: "CNY",
      sourceFingerprint: fingerprint({
        sourceKind: "auxiliaryBalance",
        balanceId: balance.id,
        sourceSystem: balance.sourceSystem,
        sourceDatabase: balance.sourceDatabase,
        sourceKey: balance.sourceKey,
        closingDebit: balance.closingDebit,
        closingCredit: balance.closingCredit,
        presentationAccountCode,
        lineCode,
        counterpartyCompanyId: counterparties[0],
      }),
    });
  }
  for (const item of items) {
    const entity = entityByCompanyCode.get(item.voucher.companyCode);
    if (!entity) continue;
    const mappedLine = resolveMappedLineCode(item.account.code, noScopedMapping, mappingMap);
    const lineCode = mappedLine && frozenLines.get(entity.id)?.has(mappedLine) ? mappedLine : null;
    const counterparties = [...new Set(item.auxiliaryLinks
      .map((link) => link.member.linkedCompanyId)
      .filter((id): id is number => id !== null && id !== entity.companyId))];
    const counterpartyCompanyId = counterparties.length === 1 ? counterparties[0]! : null;
    const fact: ConsolidationVoucherMatchFact = {
      itemId: item.id,
      voucherId: item.voucherId,
      voucherNo: item.voucher.voucherNo,
      voucherDate: item.voucher.date,
      companyId: entity.companyId,
      counterpartyCompanyId,
      accountCode: item.account.code,
      accountName: item.account.name,
      description: item.description,
      lineCode,
      signedAmount: Math.round((Number(item.debit) - Number(item.credit)) * 100) / 100,
      currencyCode: entity.functionalCurrency || "CNY",
      sourceFingerprint: fingerprint({
        itemId: item.id,
        sourceSystem: item.sourceSystem,
        sourceDatabase: item.sourceDatabase,
        sourceKey: item.sourceKey,
        importFingerprint: item.importFingerprint,
        voucherSource: [item.voucher.sourceSystem, item.voucher.sourceDatabase, item.voucher.sourceKey],
        debit: item.debit,
        credit: item.credit,
        lineCode,
        counterparties,
      }),
    };
    const consolidationRole = roleByLocalAccount.get(`${item.voucher.companyCode}:${item.account.code}`) ?? "none";
    if (investmentRule && investmentRoles.has(consolidationRole) && consolidationRole === "investmentInSubsidiary") {
      const investmentMapping = mappedInvestmentCompanyId(
        investmentRulesByCompanyCode.get(item.voucher.companyCode) ?? [],
        item,
      );
      const investmentCompanyId = investmentMapping?.companyId ?? counterpartyCompanyId;
      investmentFacts.push({
        ...fact,
        counterpartyCompanyId: investmentCompanyId,
        sourceFingerprint: fingerprint({ source: fact.sourceFingerprint, investmentCompanyId }),
        investmentRole: "investment",
      });
    }
    if (investmentRule && investmentRoles.has(consolidationRole) && ["shareCapital", "capitalReserve"].includes(consolidationRole)) {
      investmentFacts.push({ ...fact, investmentRole: "equity" });
    }
  }
  const investmentRelationships = entities.flatMap((entity) => (
    entity.directParentCompanyId
      ? [{
          investorCompanyId: entity.directParentCompanyId,
          investeeCompanyId: entity.companyId,
          shareRatio: entity.shareRatio === null ? null : Number(entity.shareRatio),
        }]
      : []
  ));
  const configured = [
    ...(intercompanyRule ? buildIntercompanyVoucherMatchGroups(intercompanyFacts).map((group) => ({
      ...group,
      matchingRule: `${intercompanyRule.name}（${intercompanyRule.ruleCode}）：${group.matchingRule}`,
      matchingVersion: `policy-${policyVersion!.versionNo}:rule-${intercompanyRule.id}:${intercompanyRule.updatedAt.toISOString()}`,
    })) : []),
    ...(investmentRule ? buildInvestmentVoucherMatchGroups(investmentFacts, investmentRelationships).map((group) => ({
      ...group,
      matchingRule: `${investmentRule.name}（${investmentRule.ruleCode}）：${group.matchingRule}`,
      matchingVersion: `policy-${policyVersion!.versionNo}:rule-${investmentRule.id}:${investmentRule.updatedAt.toISOString()}`,
    })) : []),
  ];
  return configured;
}
