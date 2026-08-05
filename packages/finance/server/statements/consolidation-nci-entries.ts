import { createHash } from "node:crypto";

import type { ConsolidationBatchSnapshot } from "@workspace/finance/types";
import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";
import { prisma } from "@workspace/platform/server/prisma";

import { resolveFinanceAccountingPolicyVersionAt } from "../ledger/group-accounts/policy-version-service";
import {
  monthOpeningEquityAmounts,
  openingEquityAmounts,
  translatedEquityAmounts,
} from "./consolidation-nci-equity-components";
import { translateSourceLines } from "./consolidated-output-translation";
import { buildConsolidationPreviewPackage } from "./consolidation-replay";
type PeriodBasis = "current" | "comparative";
type StatementType = "balanceSheet" | "incomeStatement";

export interface NonControllingInterestEntryLine {
  lineNo: number;
  entitySnapshotId: number;
  companyId: number;
  companyCode: string;
  statementType: StatementType;
  lineCode: string;
  groupAccountId?: number;
  accountCode: string;
  debit: number;
  credit: number;
  currencyCode: "CNY";
  periodBasis: PeriodBasis;
  note: string;
  matchSide: null;
  sourceKind: "workpaper";
  sourceId: string;
  sourceFingerprint: string;
  sourceAmount: number;
  sourceCurrency: string;
  counterpartyEntitySnapshotId: number;
  counterpartyCompanyId: number;
}

export interface NonControllingInterestGroupAccounts {
  balanceSheet: {
    groupAccountId: number;
    accountCode: string;
  };
  incomeStatement: {
    groupAccountId: number;
    accountCode: string;
  };
}

const NCI_GROUP_ACCOUNT_CODES = {
  balanceSheet: "410401",
  incomeStatement: "4103",
} as const;

async function loadNonControllingInterestGroupAccounts(
  year: number,
  month: number,
): Promise<DomainValidationResult<NonControllingInterestGroupAccounts>> {
  const effectiveAt = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  const policyVersion = await resolveFinanceAccountingPolicyVersionAt(effectiveAt);
  const revisions = await prisma.financeGroupAccountRevision.findMany({
    where: {
      policyVersionId: policyVersion.id,
      isActive: true,
      reviewStatus: { not: "pending_delete" },
      code: { in: Object.values(NCI_GROUP_ACCOUNT_CODES) },
    },
    select: { groupAccountId: true, code: true },
  });
  const revisionByCode = new Map(revisions.map((revision) => [revision.code, revision]));
  const missing = Object.values(NCI_GROUP_ACCOUNT_CODES).filter((code) => !revisionByCode.has(code));
  if (missing.length > 0) {
    return failCommand(
      `${policyVersion.name} 缺少少数股东分配所需集团科目：${missing.join("、")}`,
      409,
      "groupAccounts",
    );
  }
  const balanceSheet = revisionByCode.get(NCI_GROUP_ACCOUNT_CODES.balanceSheet)!;
  const incomeStatement = revisionByCode.get(NCI_GROUP_ACCOUNT_CODES.incomeStatement)!;
  return okCommand({
    balanceSheet: {
      groupAccountId: balanceSheet.groupAccountId,
      accountCode: balanceSheet.code,
    },
    incomeStatement: {
      groupAccountId: incomeStatement.groupAccountId,
      accountCode: incomeStatement.code,
    },
  });
}

export async function buildNonControllingInterestEntriesForBatch(
  batch: ConsolidationBatchSnapshot,
): Promise<DomainValidationResult<NonControllingInterestEntryCandidate[]>> {
  const groupAccounts = await loadNonControllingInterestGroupAccounts(batch.year, batch.month);
  if (!groupAccounts.ok) return groupAccounts;
  return buildNonControllingInterestEntries(batch, groupAccounts.data);
}

export interface NonControllingInterestEntryCandidate {
  documentType: "allocation";
  postingLevel: "30";
  entryType: "nonControllingInterest";
  title: string;
  description: string;
  evidence: string;
  matchDifference: 0;
  differenceResolution: string;
  generationKey: string;
  postingDate: string;
  generationFingerprint: string;
  lines: NonControllingInterestEntryLine[];
}

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function money(value: number) {
  return Math.sign(value) * Math.round((Math.abs(value) + Number.EPSILON) * 100) / 100;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function monthlyNetProfits(
  batch: ConsolidationBatchSnapshot,
  entitySnapshotId: number,
  functionalCurrency: string,
  periodBasis: PeriodBasis,
) {
  const source = batch.sources.find((item) => (
    item.entitySnapshotId === entitySnapshotId && item.reportType === "incomeStatement"
  ));
  const envelope = record(source?.reportPayload);
  const facts = record(envelope?.translationFacts);
  const monthlyFlows = record(facts?.monthlyFlows);
  const rows = monthlyFlows?.[periodBasis];
  if (!Array.isArray(rows) || rows.length === 0) {
    return failCommand("少数股东损益缺少逐月利润表快照，请刷新合并来源后重新生成", 409, "monthlyFlows");
  }
  const currency = functionalCurrency.trim().toUpperCase();
  const rateByPeriodEnd = new Map(batch.exchangeRates.flatMap((rate) => rate.applications
    .filter((application) => (
      application.applicationType === "flowAverage"
      && application.periodBasis === periodBasis
      && application.entitySnapshotId === entitySnapshotId
    ))
    .map((application) => [application.targetDate, rate.rate] as const)));
  const result: Array<{ periodEnd: string; sourceAmount: number; translatedAmount: number }> = [];
  for (const value of rows) {
    const row = record(value);
    if (typeof row?.periodEnd !== "string" || !Array.isArray(row.lines)) {
      return failCommand("少数股东损益逐月利润表快照格式无效", 409, "monthlyFlows");
    }
    const netProfit = row.lines.map(record).find((line) => line?.lineCode === "netProfit");
    const sourceAmount = Number(netProfit?.amount);
    if (!Number.isFinite(sourceAmount)) {
      return failCommand(`${row.periodEnd.slice(0, 7)} 月利润表缺少净利润`, 409, "monthlyFlows");
    }
    const rate = currency === "CNY" || currency === "RMB" || currency === "人民币"
      ? 1
      : rateByPeriodEnd.get(row.periodEnd);
    if (!rate) return failCommand(`${row.periodEnd.slice(0, 7)} 月缺少利润表平均汇率`, 409, "rateApplications");
    result.push({ periodEnd: row.periodEnd, sourceAmount, translatedAmount: money(sourceAmount * rate) });
  }
  return okCommand(result.sort((left, right) => left.periodEnd.localeCompare(right.periodEnd)));
}

function translatedNetProfitTotals(
  batch: ConsolidationBatchSnapshot,
  entitySnapshotId: number,
  functionalCurrency: string,
) {
  const source = batch.sources.find((item) => (
    item.entitySnapshotId === entitySnapshotId && item.reportType === "incomeStatement"
  ));
  const envelope = record(source?.reportPayload);
  const payload = record(envelope?.payload ?? envelope);
  const rows = Array.isArray(payload?.lines) ? payload.lines : [];
  if (!source || rows.length === 0) return failCommand("少数股东损益缺少冻结利润表", 409, "sources");
  const translated = translateSourceLines(
    buildConsolidationPreviewPackage(batch), entitySnapshotId, functionalCurrency,
    "incomeStatement", source.reportPayload, rows, batch.priorReferences,
  );
  if (!translated.ok) return translated;
  const netProfit = translated.data.find((line) => line.lineCode === "netProfit");
  return netProfit
    ? okCommand({ current: netProfit.amount, comparative: netProfit.previousAmount })
    : failCommand("少数股东损益缺少净利润报表行", 409, "sources");
}

function creditSideAmounts(delta: number) {
  return delta >= 0
    ? { debit: 0, credit: money(delta) }
    : { debit: money(Math.abs(delta)), credit: 0 };
}

export function buildNonControllingInterestEntries(
  batch: ConsolidationBatchSnapshot,
  groupAccounts: NonControllingInterestGroupAccounts,
): DomainValidationResult<NonControllingInterestEntryCandidate[]> {
  const entityByCompanyId = new Map(batch.entities.map((entity) => [entity.companyId, entity]));
  const entries: NonControllingInterestEntryCandidate[] = [];
  for (const entity of batch.entities) {
    const shareRatio = entity.shareRatio;
    if (entity.role !== "subsidiary" || !entity.isConsolidated
      || shareRatio === null || shareRatio <= 0 || shareRatio >= 1) continue;
    const parent = entity.directParentCompanyId
      ? entityByCompanyId.get(entity.directParentCompanyId)
      : null;
    if (!parent) return failCommand(`${entity.companyName} 缺少冻结的直接母公司，不能分配少数股东权益`, 409, "entities");
    const functionalCurrency = entity.functionalCurrency?.trim();
    if (!functionalCurrency) return failCommand(`${entity.companyName} 缺少冻结的本位币`, 409, "functionalCurrency");
    const currentProfits = monthlyNetProfits(batch, entity.id, functionalCurrency, "current");
    if (!currentProfits.ok) return currentProfits;
    const comparativeProfits = monthlyNetProfits(batch, entity.id, functionalCurrency, "comparative");
    if (!comparativeProfits.ok) return comparativeProfits;
    const translatedTotals = translatedNetProfitTotals(batch, entity.id, functionalCurrency);
    if (!translatedTotals.ok) return translatedTotals;
    const minorityRatio = 1 - shareRatio;
    const monthlyProfits: Array<{
      periodEnd: string;
      sourceAmount: number;
      translatedAmount: number;
      periodBasis: PeriodBasis;
      minorityAmount: number;
      roundingAdjustment: number;
    }> = [
      ...currentProfits.data.map((profit) => ({
        ...profit,
        periodBasis: "current" as const,
        minorityAmount: money(profit.translatedAmount * minorityRatio),
        roundingAdjustment: 0,
      })),
      ...comparativeProfits.data.map((profit) => ({
        ...profit,
        periodBasis: "comparative" as const,
        minorityAmount: money(profit.translatedAmount * minorityRatio),
        roundingAdjustment: 0,
      })),
    ];
    for (const periodBasis of ["current", "comparative"] as const) {
      const basisProfits = monthlyProfits.filter((profit) => profit.periodBasis === periodBasis);
      const last = basisProfits.at(-1);
      if (!last) continue;
      const target = money(translatedTotals.data[periodBasis] * minorityRatio);
      const allocated = money(basisProfits.reduce((sum, profit) => sum + profit.minorityAmount, 0));
      last.roundingAdjustment = money(target - allocated);
      last.minorityAmount = money(last.minorityAmount + last.roundingAdjustment);
    }
    const currentEquity = translatedEquityAmounts(batch, entity.id, functionalCurrency);
    if (!currentEquity) {
      return failCommand(`${entity.companyName} 缺少可折算的资产负债表权益组成，不能生成少数股东权益变动`, 409, "sources");
    }
    const monthOpening = monthOpeningEquityAmounts(batch, entity.companyId);
    const ociOpening = monthOpening.size > 0 ? monthOpening : openingEquityAmounts(batch, entity);
    const currentOci = money(currentEquity.get("otherComprehensiveIncome")?.amount ?? 0);
    const openingOci = money(ociOpening.get("otherComprehensiveIncome") ?? 0);
    const minorityOci = money((currentOci - openingOci) * minorityRatio);
    if (monthlyProfits.every((profit) => profit.minorityAmount === 0) && minorityOci === 0) continue;
    const generationKeyPrefix = `policy:nci:${parent.companyId}:${entity.companyId}`;
    const sourceFingerprint = fingerprint({
      version: "natural-month-profit-and-oci-attribution-v6",
      entitySnapshotId: entity.id,
      parentEntitySnapshotId: parent.id,
      shareRatio,
      minorityRatio,
      functionalCurrency,
      monthlyProfits,
      oci: { currentOci, openingOci, minorityOci, basis: monthOpening.size > 0 ? "monthOpening" : "cutoverOpening" },
      groupAccounts,
    });
    const commonEvidence = `${parent.companyName} 直接持股 ${(shareRatio * 100).toFixed(2)}%；少数股东比例 ${(minorityRatio * 100).toFixed(2)}%`;
    const pushEntry = (
      suffix: string,
      postingDate: string,
      title: string,
      description: string,
      evidence: string,
      differenceResolution: string,
      lines: NonControllingInterestEntryLine[],
    ) => {
      if (lines.length === 0) return;
      const generationKey = `${generationKeyPrefix}:${suffix}`;
      entries.push({
        documentType: "allocation",
        postingLevel: "30",
        entryType: "nonControllingInterest",
        title,
        description,
        evidence,
        matchDifference: 0,
        differenceResolution,
        generationKey,
        postingDate,
        generationFingerprint: fingerprint({ generationKey, postingDate, sourceFingerprint, lines }),
        lines,
      });
    };
    const profitPair = (
      periodBasis: PeriodBasis,
      amount: number,
      label: string,
      sourceKey: string,
    ): NonControllingInterestEntryLine[] => {
      if (amount === 0) return [];
      const common = {
        entitySnapshotId: entity.id,
        companyId: entity.companyId,
        companyCode: entity.companyCode,
        currencyCode: "CNY" as const,
        periodBasis,
        matchSide: null,
        sourceKind: "workpaper" as const,
        sourceFingerprint,
        sourceAmount: Math.abs(amount),
        sourceCurrency: "CNY" as const,
        counterpartyEntitySnapshotId: parent.id,
        counterpartyCompanyId: parent.companyId,
      };
      const incomeAccount = groupAccounts.incomeStatement;
      const balanceAccount = groupAccounts.balanceSheet;
      const incomeLines: NonControllingInterestEntryLine[] = [{
        lineNo: 1,
        ...common,
        statementType: "incomeStatement",
        groupAccountId: incomeAccount.groupAccountId,
        accountCode: incomeAccount.accountCode,
        lineCode: "netProfitAttributableToNci",
        ...creditSideAmounts(amount),
        note: `${label}：${(minorityRatio * 100).toFixed(2)}% 少数股东份额`,
        sourceId: `${generationKeyPrefix}:${sourceKey}:allocated`,
      }, {
        lineNo: 2,
        ...common,
        statementType: "incomeStatement",
        groupAccountId: incomeAccount.groupAccountId,
        accountCode: incomeAccount.accountCode,
        lineCode: "netProfitAttributableToParent",
        ...creditSideAmounts(-amount),
        note: `${label}：转出至少数股东归属`,
        sourceId: `${generationKeyPrefix}:${sourceKey}:income-counterpart`,
      }];
      if (periodBasis === "comparative") return incomeLines;
      return [...incomeLines, {
        lineNo: 3,
        ...common,
        statementType: "balanceSheet",
        groupAccountId: balanceAccount.groupAccountId,
        accountCode: balanceAccount.accountCode,
        lineCode: "nonControllingInterests",
        ...creditSideAmounts(amount),
        note: `${label}：计入少数股东权益连续变动`,
        sourceId: `${generationKeyPrefix}:${sourceKey}:equity-movement`,
      }, {
        lineNo: 4,
        ...common,
        statementType: "balanceSheet",
        groupAccountId: balanceAccount.groupAccountId,
        accountCode: balanceAccount.accountCode,
        lineCode: "undistributedProfit",
        ...creditSideAmounts(-amount),
        note: `${label}：从归母未分配利润转出少数股东份额`,
        sourceId: `${generationKeyPrefix}:${sourceKey}:equity-counterpart`,
      }];
    };
    for (const profit of monthlyProfits) {
      const monthKey = profit.periodEnd.slice(0, 7);
      const basisKey = profit.periodBasis === "comparative" ? "comparative:" : "";
      pushEntry(
        `profit:${basisKey}${monthKey}`,
        profit.periodEnd,
        `${entity.companyName} ${monthKey} 少数股东损益分配`,
        "按该自然月净利润及适用月平均汇率生成；本年累计由各月已批准凭证汇总。",
        `${commonEvidence}；该月折算净利润 ${profit.translatedAmount.toFixed(2)} 元；少数股东损益 ${profit.minorityAmount.toFixed(2)} 元${profit.roundingAdjustment === 0 ? "" : `（含累计舍入调整 ${profit.roundingAdjustment.toFixed(2)} 元）`}。`,
        "该月凭证只归属于其业务月份，不生成以前月份累计凭证",
        profitPair(profit.periodBasis, profit.minorityAmount, `${monthKey} 净利润分配`, `profit:${basisKey}${monthKey}`),
      );
    }
    if (minorityOci !== 0) {
      const periodEnd = new Date(Date.UTC(batch.year, batch.month, 0)).toISOString().slice(0, 10);
      const monthKey = periodEnd.slice(0, 7);
      const common = {
        entitySnapshotId: entity.id,
        companyId: entity.companyId,
        companyCode: entity.companyCode,
        statementType: "balanceSheet" as const,
        currencyCode: "CNY" as const,
        periodBasis: "current" as const,
        matchSide: null,
        sourceKind: "workpaper" as const,
        sourceFingerprint,
        sourceAmount: Math.abs(minorityOci),
        sourceCurrency: "CNY" as const,
        counterpartyEntitySnapshotId: parent.id,
        counterpartyCompanyId: parent.companyId,
      };
      pushEntry(
        `oci:${monthKey}`,
        periodEnd,
        `${entity.companyName} ${monthKey} 少数股东其他综合收益分配`,
        monthOpening.size > 0
          ? "按本期末与上月已锁定折算权益的其他综合收益差额生成。"
          : "首次并表按切换日期初与本期末折算权益的其他综合收益累计差额生成；后续月份改按上月已锁定数滚动。",
        `${commonEvidence}；其他综合收益折算金额 ${openingOci.toFixed(2)} → ${currentOci.toFixed(2)}；少数股东应占变动 ${minorityOci.toFixed(2)} 元。`,
        monthOpening.size > 0
          ? "本月其他综合收益变动逐项计入少数股东权益"
          : "首次切换日至本期末累计变动，未用期末净资产反推",
        [{
          lineNo: 1,
          ...common,
          lineCode: "otherComprehensiveIncome",
          accountCode: "4003/4005",
          ...creditSideAmounts(-minorityOci),
          note: `${monthKey} 其他综合收益：转出少数股东份额`,
          sourceId: `${generationKeyPrefix}:oci:${monthKey}:component`,
        }, {
          lineNo: 2,
          ...common,
          groupAccountId: groupAccounts.balanceSheet.groupAccountId,
          lineCode: "nonControllingInterests",
          accountCode: groupAccounts.balanceSheet.accountCode,
          ...creditSideAmounts(minorityOci),
          note: `${monthKey} 其他综合收益：计入少数股东权益连续变动`,
          sourceId: `${generationKeyPrefix}:nci:oci:${monthKey}:equity-movement`,
        }],
      );
    }
  }
  return okCommand(entries);
}
