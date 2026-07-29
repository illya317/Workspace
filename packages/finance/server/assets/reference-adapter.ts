import { prisma } from "@workspace/platform/server/prisma";

import type { FinanceAssetKind } from "../../types/assets";
import type {
  FinanceAssetAccountReference,
  FinanceAssetCategoryReference,
  FinanceAssetImpairmentContext,
  FinanceAssetImpairmentVoucherReference,
  FinanceAssetAcquisitionContext,
  FinanceAssetDisposalContext,
  FinanceAssetPeriodVoucherLinkContext,
} from "./validation";
import type { ConfirmFinanceAssetAcquisitionEvidenceInput, ConfirmFinanceAssetDisposalInput, LinkFinanceAssetPeriodVoucherInput } from "../../types/assets";
import { resolveFinanceAssetCategoryPolicy } from "./account-policy-resolver";
import { financeClosePeriodBounds } from "./period-scope";

export function findAssetPolicyAccounts(input: { ids: number[]; companyCode: string; year: number }) {
  return prisma.financeAccount.findMany({
    where: { id: { in: input.ids }, companyCode: input.companyCode, year: input.year, isActive: true },
    select: { id: true, code: true, name: true, category: true },
  });
}

export async function findAssetCategory(input: {
  id: number;
  companyCode: string;
  accountYear: number;
}): Promise<FinanceAssetCategoryReference | null> {
  try {
    const resolved = await resolveFinanceAssetCategoryPolicy(prisma, {
      categoryId: input.id,
      companyCode: input.companyCode,
      fiscalYear: input.accountYear,
    });
    return {
      ...resolved.category,
      assetAccount: resolved.assetAccount as FinanceAssetAccountReference,
      accumulatedAccount: resolved.accumulatedAccount,
      expenseAccount: resolved.expenseAccount,
      defaultUsefulLifeMonths: resolved.defaultUsefulLifeMonths,
      defaultResidualRate: resolved.defaultResidualRate,
      defaultMethod: resolved.defaultMethod,
      usefulLifeMode: resolved.usefulLifeMode,
      minimumUsefulLifeMonths: resolved.minimumUsefulLifeMonths,
      maximumUsefulLifeMonths: resolved.maximumUsefulLifeMonths,
      reviewRequired: resolved.reviewRequired,
    };
  } catch {
    return null;
  }
}

export async function findAssetPolicyCategory(input: { id: number }) {
  const category = await prisma.financeAssetCategory.findFirst({
    where: { id: input.id, isActive: true, reviewStatus: "confirmed" },
    select: { id: true, assetKind: true, depreciable: true },
  });
  return category ? { id: category.id, assetKind: category.assetKind as FinanceAssetKind, depreciable: category.depreciable } : null;
}

export async function findAssetImpairmentContext(input: {
  companyCode: string;
  year: number;
  month: number;
}): Promise<FinanceAssetImpairmentContext | null> {
  const period = await prisma.financePeriod.findUnique({
    where: { companyCode_year_month: input },
    select: { id: true, isClosed: true },
  });
  if (!period) return null;
  const { end } = financeClosePeriodBounds(input);
  const cards = await prisma.financeAssetCard.findMany({
    where: {
      companyCode: input.companyCode,
      OR: [{ acquisitionDate: null }, { acquisitionDate: { lte: end } }],
    },
    select: {
      id: true,
      version: true,
      status: true,
      categoryId: true,
      acquisitionDate: true,
      depreciationStartDate: true,
      originalCost: true,
      residualRate: true,
      usefulLifeMonths: true,
      method: true,
      assetAccountCode: true,
      assetAccountId: true,
      accumulatedAccountCode: true,
      accumulatedAccountId: true,
      openingAsOfDate: true,
      initializationMode: true,
      openingImpairmentAmount: true,
      openingNetBookValue: true,
      cutoverDate: true,
      remainingUsefulLifeMonthsAtCutover: true,
      cutoverResidualValue: true,
      cutoverAllocationStatus: true,
      cutoverReconciliationFingerprint: true,
      disposal: { select: { disposalDate: true, status: true } },
    },
    orderBy: { id: "asc" },
  });
  const scopedCards = cards.filter((card) => !card.disposal || card.disposal.status !== "confirmed" || card.disposal.disposalDate > end);
  const policies = await Promise.all([...new Set(scopedCards.map((card) => card.categoryId))].map(async (categoryId) => {
    try {
      const policy = await resolveFinanceAssetCategoryPolicy(prisma, { companyCode: input.companyCode, fiscalYear: input.year, categoryId });
      return {
        categoryId,
        assetAccountCode: policy.assetAccount.code,
        assetAccountId: policy.assetAccount.id,
        accumulatedAccountCode: policy.accumulatedAccount?.code ?? null,
        accumulatedAccountId: policy.accumulatedAccount?.id ?? null,
        impairmentLossAccountCode: policy.impairmentLossAccount?.code ?? null,
        impairmentAllowanceAccountCode: policy.impairmentAllowanceAccount?.code ?? null,
      };
    } catch {
      return {
        categoryId,
        assetAccountCode: null,
        assetAccountId: null,
        accumulatedAccountCode: null,
        accumulatedAccountId: null,
        impairmentLossAccountCode: null,
        impairmentAllowanceAccountCode: null,
      };
    }
  }));
  return { period, cards: scopedCards, policies };
}

export async function findAssetImpairmentVoucher(input: {
  companyCode: string;
  periodId: number;
  voucherNo: string;
}): Promise<FinanceAssetImpairmentVoucherReference | null> {
  const voucher = await prisma.financeVoucher.findUnique({
    where: {
      voucherNo_companyCode_periodId: {
        voucherNo: input.voucherNo,
        companyCode: input.companyCode,
        periodId: input.periodId,
      },
    },
    select: {
      id: true, voucherNo: true, periodId: true, companyCode: true, status: true, totalDebit: true, totalCredit: true,
      items: { select: { id: true, debit: true, credit: true, account: { select: { code: true } } } },
    },
  });
  return voucher ? {
    ...voucher,
    items: voucher.items.map((item) => ({ id: item.id, accountCode: item.account.code, debit: item.debit, credit: item.credit })),
  } : null;
}

export async function findAssetAcquisitionContext(
  input: ConfirmFinanceAssetAcquisitionEvidenceInput,
): Promise<FinanceAssetAcquisitionContext> {
  const [period, company, assetRow, existingEvidence, occupiedEvidence] = await Promise.all([
    prisma.financePeriod.findUnique({
      where: { companyCode_year_month: { companyCode: input.companyCode, year: input.year, month: input.month } },
      select: { id: true, isClosed: true },
    }),
    prisma.company.findUnique({ where: { code: input.companyCode }, select: { id: true, code: true } }),
    prisma.financeAssetCard.findUnique({
      where: { id: input.assetId },
      select: {
        id: true, companyCode: true, companyId: true, version: true, status: true, acquisitionDate: true,
        categoryId: true, originalCost: true, assetAccountCode: true, assetAccountId: true,
      },
    }),
    prisma.financeAssetAcquisitionEvidence.findUnique({ where: { assetId: input.assetId }, select: { id: true } }),
    prisma.financeAssetAcquisitionEvidence.findMany({ where: { voucherItemId: { not: null } }, select: { voucherItemId: true } }),
  ]);
  const voucher = period ? await findAssetImpairmentVoucher({ companyCode: input.companyCode, periodId: period.id, voucherNo: input.voucherNo }) : null;
  let policy: FinanceAssetAcquisitionContext["policy"] = null;
  if (assetRow) {
    try {
      const resolved = await resolveFinanceAssetCategoryPolicy(prisma, {
        companyCode: input.companyCode,
        fiscalYear: input.year,
        categoryId: assetRow.categoryId,
      });
      policy = { assetAccountCode: resolved.assetAccount.code, assetAccountId: resolved.assetAccount.id };
    } catch { /* missing policy blocks acquisition evidence confirmation */ }
  }
  return {
    period,
    company,
    asset: assetRow ? { ...assetRow, originalCost: Number(assetRow.originalCost) } : null,
    existingEvidenceId: existingEvidence?.id ?? null,
    voucher,
    policy,
    occupiedVoucherItemIds: occupiedEvidence.flatMap((row) => row.voucherItemId ?? []),
  };
}

export async function findAssetDisposalContext(input: ConfirmFinanceAssetDisposalInput): Promise<FinanceAssetDisposalContext> {
  const period = await prisma.financePeriod.findUnique({
    where: { companyCode_year_month: { companyCode: input.companyCode, year: input.year, month: input.month } },
    select: { id: true, isClosed: true },
  });
  const [assetRow, existingDisposal, voucher, occupiedDisposals] = await Promise.all([
    prisma.financeAssetCard.findUnique({ where: { id: input.assetId }, select: {
      id: true, companyCode: true, version: true, status: true, acquisitionDate: true, categoryId: true, assetCode: true,
      originalCost: true, assetAccountCode: true, assetAccountId: true, accumulatedAccountCode: true, accumulatedAccountId: true,
      openingAccumulatedAmount: true, openingAsOfDate: true,
    } }),
    prisma.financeAssetDisposal.findUnique({ where: { assetId: input.assetId }, select: { id: true } }),
    period ? findAssetImpairmentVoucher({ companyCode: input.companyCode, periodId: period.id, voucherNo: input.voucherNo }) : null,
    prisma.financeAssetDisposal.findMany({ select: { assetVoucherItemId: true, accumulatedVoucherItemId: true, impairmentAllowanceVoucherItemId: true, proceedsVoucherItemId: true, gainLossVoucherItemId: true } }),
  ]);
  const asset = assetRow ? { ...assetRow, originalCost: Number(assetRow.originalCost), openingAccumulatedAmount: Number(assetRow.openingAccumulatedAmount) } : null;
  let policy: FinanceAssetDisposalContext["policy"] = null;
  if (asset) {
    try {
      const resolved = await resolveFinanceAssetCategoryPolicy(prisma, { companyCode: input.companyCode, fiscalYear: input.year, categoryId: asset.categoryId });
      policy = {
        assetAccountCode: resolved.assetAccount.code,
        assetAccountId: resolved.assetAccount.id,
        accumulatedAccountCode: resolved.accumulatedAccount?.code ?? null,
        accumulatedAccountId: resolved.accumulatedAccount?.id ?? null,
        impairmentAllowanceAccountCode: resolved.impairmentAllowanceAccount?.code ?? null,
        disposalGainLossAccountCode: resolved.disposalGainLossAccount?.code ?? null,
      };
    } catch { /* missing policy blocks disposal validation */ }
  }
  const priorWhere = { OR: [{ year: { lt: input.year } }, { year: input.year, month: { lt: input.month } }] };
  const [priorEntries, priorAdjustments, priorImpairments, currentEntries, currentAdjustments] = asset && period ? await Promise.all([
    prisma.financeAssetPeriodEntry.findMany({ where: { assetId: asset.id, period: priorWhere }, select: { assetId: true, normalAmount: true, status: true, period: { select: { id: true, endDate: true } }, voucher: replayVoucherSelect } }),
    prisma.financeAssetAdjustment.findMany({ where: { companyCode: input.companyCode, period: priorWhere }, select: { assetId: true, amount: true, status: true, period: { select: { id: true, endDate: true } }, voucher: replayVoucherSelect } }),
    prisma.financeAssetImpairmentAllocation.findMany({ where: { assetId: asset.id, assessment: { period: priorWhere } }, select: { assetId: true, amount: true, assessment: { select: { status: true, period: { select: { id: true, endDate: true } }, voucher: replayVoucherSelect } } } }),
    prisma.financeAssetPeriodEntry.findMany({ where: { assetId: asset.id, periodId: period.id }, select: { assetId: true, normalAmount: true, status: true, voucher: replayVoucherSelect } }),
    prisma.financeAssetAdjustment.findMany({ where: { assetId: asset.id, companyCode: input.companyCode, periodId: period.id }, select: { assetId: true, amount: true, status: true, voucher: replayVoucherSelect } }),
  ]) : [[], [], [], [], []];
  return {
    period,
    asset,
    existingDisposalId: existingDisposal?.id ?? null,
    voucher,
    policy,
    priorEntries: priorEntries.map((row) => ({ assetId: row.assetId, normalAmount: Number(row.normalAmount), status: row.status, periodId: row.period.id, periodEndDate: row.period.endDate, voucher: normalizeReplayVoucher(row.voucher) })),
    priorAdjustments: priorAdjustments.map((row) => ({ assetId: row.assetId, amount: Number(row.amount), status: row.status, periodId: row.period.id, periodEndDate: row.period.endDate, voucher: normalizeReplayVoucher(row.voucher) })),
    priorImpairments: priorImpairments.map((row) => ({ assetId: row.assetId, amount: Number(row.amount), status: row.assessment.status, periodId: row.assessment.period.id, periodEndDate: row.assessment.period.endDate, voucher: normalizeReplayVoucher(row.assessment.voucher) })),
    currentEntries: currentEntries.map((row) => ({ assetId: row.assetId, normalAmount: Number(row.normalAmount), status: row.status, voucher: normalizeReplayVoucher(row.voucher) })),
    currentAdjustments: currentAdjustments.map((row) => ({ assetId: row.assetId, amount: Number(row.amount), status: row.status, voucher: normalizeReplayVoucher(row.voucher) })),
    occupiedVoucherItemIds: occupiedDisposals.flatMap((row) => [row.assetVoucherItemId, row.accumulatedVoucherItemId, row.impairmentAllowanceVoucherItemId, row.proceedsVoucherItemId, row.gainLossVoucherItemId]).filter((id): id is number => id != null),
  };
}

const replayVoucherSelect = {
  select: {
    id: true, status: true, companyCode: true, periodId: true, totalDebit: true, totalCredit: true,
    items: { select: { debit: true, credit: true, account: { select: { code: true } } } },
  },
} as const;

function normalizeReplayVoucher(voucher: { id: number; status: string; companyCode: string; periodId: number; totalDebit: number; totalCredit: number; items: Array<{ debit: number; credit: number; account: { code: string } }> } | null) {
  return voucher ? { ...voucher, items: voucher.items.map((item) => ({ accountCode: item.account.code, debit: item.debit, credit: item.credit })) } : null;
}

export async function findAssetPeriodVoucherLinkContext(input: LinkFinanceAssetPeriodVoucherInput): Promise<FinanceAssetPeriodVoucherLinkContext> {
  const period = await prisma.financePeriod.findUnique({
    where: { companyCode_year_month: { companyCode: input.companyCode, year: input.year, month: input.month } },
    select: { id: true, isClosed: true },
  });
  if (!period) return { period: null, voucher: null, entries: [], adjustments: [] };
  const [voucher, entries, adjustments] = await Promise.all([
    prisma.financeVoucher.findUnique({
      where: { voucherNo_companyCode_periodId: { voucherNo: input.voucherNo, companyCode: input.companyCode, periodId: period.id } },
      select: {
        id: true, voucherNo: true, periodId: true, companyCode: true, status: true, totalDebit: true, totalCredit: true,
        items: { select: { debit: true, credit: true, account: { select: { code: true } } } },
      },
    }),
    prisma.financeAssetPeriodEntry.findMany({
      where: { periodId: period.id, asset: { companyCode: input.companyCode } },
      select: {
        id: true, assetId: true, voucherId: true, status: true, normalAmount: true,
        asset: { select: { categoryId: true, assetAccountCode: true, assetAccountId: true, accumulatedAccountCode: true, accumulatedAccountId: true } },
      },
    }),
    prisma.financeAssetAdjustment.findMany({
      where: { periodId: period.id, companyCode: input.companyCode },
      select: { id: true, assetId: true, voucherId: true, status: true, accountCode: true, amount: true, asset: { select: { categoryId: true } } },
    }),
  ]);
  const policies = new Map<number, Awaited<ReturnType<typeof resolveFinanceAssetCategoryPolicy>> | null>();
  const categoryIds = [...new Set([
    ...entries.map((entry) => entry.asset.categoryId),
    ...adjustments.flatMap((row) => row.asset?.categoryId ?? []),
  ])];
  await Promise.all(categoryIds.map(async (categoryId) => {
    try {
      policies.set(categoryId, await resolveFinanceAssetCategoryPolicy(prisma, { companyCode: input.companyCode, fiscalYear: input.year, categoryId }));
    } catch {
      policies.set(categoryId, null);
    }
  }));
  return {
    period,
    voucher: voucher ? {
      ...voucher,
      items: voucher.items.map((item) => ({ accountCode: item.account.code, debit: item.debit, credit: item.credit })),
    } : null,
    entries: entries.map((entry) => {
      const policy = policies.get(entry.asset.categoryId) ?? null;
      const snapshotMatches = Boolean(policy
        && entry.asset.assetAccountCode === policy.assetAccount.code
        && entry.asset.assetAccountId === policy.assetAccount.id
        && entry.asset.accumulatedAccountCode === (policy.accumulatedAccount?.code ?? null)
        && entry.asset.accumulatedAccountId === (policy.accumulatedAccount?.id ?? null));
      return {
        id: entry.id,
        assetId: entry.assetId,
        voucherId: entry.voucherId,
        status: entry.status,
        accountCode: policy?.accumulatedAccount?.code ?? policy?.assetAccount.code ?? entry.asset.accumulatedAccountCode ?? entry.asset.assetAccountCode,
        expenseAccountCode: policy?.expenseAccount?.code ?? "",
        amount: Number(entry.normalAmount),
        policyIssue: snapshotMatches && policy?.expenseAccount
          ? null
          : "资产卡片科目快照或折旧摊销费用科目与当前公司年度分类政策不一致，请先完成重分类或政策复核",
      };
    }),
    adjustments: adjustments.map((row) => {
      const policy = row.asset ? policies.get(row.asset.categoryId) ?? null : null;
      return {
        id: row.id,
        assetId: row.assetId,
        voucherId: row.voucherId,
        status: row.status,
        accountCode: row.accountCode,
        expenseAccountCode: policy?.expenseAccount?.code ?? null,
        amount: Number(row.amount),
        policyIssue: row.status !== "confirmed" || (row.assetId != null && policy?.expenseAccount)
          ? null
          : "已确认折旧摊销调整未分配到具体资产或缺少当前年度费用科目政策",
      };
    }),
  };
}
