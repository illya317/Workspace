import { createHash } from "node:crypto";

import type { ConsolidationBatchSnapshot } from "@workspace/finance/types";
import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";
import { prisma } from "@workspace/platform/server/prisma";

import { cnyPerForeignUnit } from "./consolidation-frozen-rates";
import { resolveFinanceAccountingPolicyVersionAt } from "../ledger/group-accounts/policy-versions";

type PeriodBasis = "current" | "comparative";
type StatementType = "balanceSheet" | "incomeStatement";

export interface NonControllingInterestEntryLine {
  lineNo: number;
  entitySnapshotId: number;
  companyId: number;
  companyCode: string;
  statementType: StatementType;
  lineCode: string;
  groupAccountId: number;
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
  generationFingerprint: string;
  lines: NonControllingInterestEntryLine[];
}

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function reportLine(
  batch: ConsolidationBatchSnapshot,
  entitySnapshotId: number,
  reportType: StatementType,
  lineCode: string,
) {
  const source = batch.sources.find((item) => (
    item.entitySnapshotId === entitySnapshotId && item.reportType === reportType
  ));
  const envelope = record(source?.reportPayload);
  const payload = record(envelope?.payload ?? envelope);
  const rows = reportType === "balanceSheet"
    ? [payload?.assets, payload?.liabilities, payload?.equity].flatMap((part) => Array.isArray(part) ? part : [])
    : Array.isArray(payload?.lines) ? payload.lines : [];
  const line = rows.map(record).find((item) => item?.lineCode === lineCode);
  const amount = Number(line?.amount);
  const previousAmount = Number(line?.previousAmount);
  return Number.isFinite(amount) && Number.isFinite(previousAmount)
    ? { amount: money(amount), previousAmount: money(previousAmount) }
    : null;
}

function appliedClosingRate(
  batch: ConsolidationBatchSnapshot,
  entitySnapshotId: number,
  functionalCurrency: string,
  periodBasis: PeriodBasis,
): DomainValidationResult<number> {
  if (["CNY", "RMB", "人民币"].includes(functionalCurrency.toUpperCase())) return okCommand(1);
  if (functionalCurrency.toUpperCase() !== "CAD") {
    return failCommand(`暂不支持 ${functionalCurrency} 本位币的少数股东分配`, 409, "functionalCurrency");
  }
  const matches = batch.exchangeRates.flatMap((rate) => rate.applications
    .filter((application) => (
      application.applicationType === "closing"
      && application.periodBasis === periodBasis
      && application.entitySnapshotId === entitySnapshotId
    ))
    .map(() => rate));
  if (matches.length !== 1) {
    return failCommand(
      `CAD 实体 ${entitySnapshotId} 缺少唯一的${periodBasis === "current" ? "本期" : "比较期"}期末汇率，不能分配少数股东权益`,
      409,
      "rateApplications",
    );
  }
  return cnyPerForeignUnit(matches[0]!);
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
    const equity = reportLine(batch, entity.id, "balanceSheet", "totalEquity");
    const profit = reportLine(batch, entity.id, "incomeStatement", "netProfit");
    if (!equity || !profit) {
      return failCommand(`${entity.companyName} 缺少所有者权益合计或净利润来源行，不能分配少数股东权益`, 409, "sources");
    }
    const currentRate = appliedClosingRate(batch, entity.id, functionalCurrency, "current");
    if (!currentRate.ok) return currentRate;
    const comparativeRate = appliedClosingRate(batch, entity.id, functionalCurrency, "comparative");
    if (!comparativeRate.ok) return comparativeRate;
    const minorityRatio = 1 - shareRatio;
    const amounts = {
      currentEquity: money(equity.amount * currentRate.data * minorityRatio),
      comparativeEquity: money(equity.previousAmount * comparativeRate.data * minorityRatio),
      currentProfit: money(profit.amount * currentRate.data * minorityRatio),
      comparativeProfit: money(profit.previousAmount * comparativeRate.data * minorityRatio),
    };
    if (Object.values(amounts).every((amount) => amount === 0)) continue;
    const generationKey = `policy:nci:${parent.companyId}:${entity.companyId}`;
    const sourceFingerprint = fingerprint({
      version: "proportionate-net-assets-v2",
      entitySnapshotId: entity.id,
      parentEntitySnapshotId: parent.id,
      shareRatio,
      minorityRatio,
      functionalCurrency,
      equity,
      profit,
      currentRate: currentRate.data,
      comparativeRate: comparativeRate.data,
      amounts,
      groupAccounts,
    });
    let lineNo = 1;
    const lines: NonControllingInterestEntryLine[] = [];
    const appendPair = (
      statementType: StatementType,
      periodBasis: PeriodBasis,
      allocatedLineCode: string,
      counterpartLineCode: string,
      amount: number,
      label: string,
    ) => {
      if (amount === 0) return;
      const groupAccount = groupAccounts[statementType];
      const common = {
        entitySnapshotId: entity.id,
        companyId: entity.companyId,
        companyCode: entity.companyCode,
        statementType,
        groupAccountId: groupAccount.groupAccountId,
        accountCode: groupAccount.accountCode,
        currencyCode: "CNY" as const,
        periodBasis,
        matchSide: null,
        sourceKind: "workpaper" as const,
        sourceFingerprint,
        sourceAmount: Math.abs(amount),
        sourceCurrency: functionalCurrency,
        counterpartyEntitySnapshotId: parent.id,
        counterpartyCompanyId: parent.companyId,
      };
      lines.push({
        lineNo: lineNo++,
        ...common,
        lineCode: allocatedLineCode,
        ...creditSideAmounts(amount),
        note: `${label}：${(minorityRatio * 100).toFixed(2)}% 少数股东份额`,
        sourceId: `${generationKey}:${statementType}:${periodBasis}:allocated`,
      }, {
        lineNo: lineNo++,
        ...common,
        lineCode: counterpartLineCode,
        ...creditSideAmounts(-amount),
        note: `${label}：转出至少数股东归属`,
        sourceId: `${generationKey}:${statementType}:${periodBasis}:counterpart`,
      });
    };
    appendPair("balanceSheet", "current", "nonControllingInterests", "undistributedProfit", amounts.currentEquity, "期末净资产分配");
    appendPair("balanceSheet", "comparative", "nonControllingInterests", "undistributedProfit", amounts.comparativeEquity, "比较期净资产分配");
    appendPair("incomeStatement", "current", "netProfitAttributableToNci", "netProfitAttributableToParent", amounts.currentProfit, "本期净利润分配");
    appendPair("incomeStatement", "comparative", "netProfitAttributableToNci", "netProfitAttributableToParent", amounts.comparativeProfit, "比较期净利润分配");
    entries.push({
      documentType: "allocation",
      postingLevel: "30",
      entryType: "nonControllingInterest",
      title: `${entity.companyName} 少数股东权益及损益分配`,
      description: "按批次冻结的直接持股比例，以折算后净资产和净利润为基础分配少数股东权益及损益。",
      evidence: `${parent.companyName} 直接持股 ${(shareRatio * 100).toFixed(2)}%；少数股东比例 ${(minorityRatio * 100).toFixed(2)}%；期末净资产份额 ${amounts.currentEquity.toFixed(2)} 元；本期净利润份额 ${amounts.currentProfit.toFixed(2)} 元。`,
      matchDifference: 0,
      differenceResolution: "比例净资产法分配，合并净资产和净利润总额不变",
      generationKey,
      generationFingerprint: fingerprint({ generationKey, sourceFingerprint, lines }),
      lines,
    });
  }
  return okCommand(entries);
}
