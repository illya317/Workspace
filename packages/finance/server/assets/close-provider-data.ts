import { prisma } from "@workspace/platform/server/prisma";
import type { FinanceCloseProvider, FinanceCloseProviderInspection, FinanceCloseScope } from "../../types/close";
import { resolveFinanceAssetCategoryPolicy } from "./account-policy-resolver";
import { financeClosePeriodBounds } from "./period-scope";
import type { AssetCloseCard, AssetDepreciationCloseFacts, AssetImpairmentCloseFacts, AssetMovementCloseFacts, AssetPolicyFact } from "./close-provider-evidence";

const money = (value: unknown) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
type Inspect<T> = (scope: FinanceCloseScope, facts: T) => FinanceCloseProviderInspection;

export function buildFinanceAssetCloseProviders(inspect: {
  movement: Inspect<AssetMovementCloseFacts>;
  depreciation: Inspect<AssetDepreciationCloseFacts>;
  impairment: Inspect<AssetImpairmentCloseFacts>;
}) {
  const movement: FinanceCloseProvider = { inspectPeriodClose: async (scope) => {
    const [period, cards] = await Promise.all([periodFor(scope), loadPeriodEndCards(scope)]);
    const [entries, adjustments, priorEntries, priorAdjustments, priorImpairments] = period ? await Promise.all([
      loadCurrentEntries(scope, period.id), loadCurrentAdjustments(scope, period.id), loadPriorEntries(scope), loadPriorAdjustments(scope), loadPriorImpairments(scope),
    ]) : [[], [], [], [], []];
    return inspect.movement(scope, { period, cards, ...await loadAssetApplicability(scope, period?.id ?? null, cards), entries, adjustments, priorEntries, priorAdjustments, priorImpairments });
  } };
  const depreciation: FinanceCloseProvider = { inspectPeriodClose: async (scope) => {
    const period = await periodFor(scope);
    const cards = await loadPeriodEndCards(scope);
    const applicability = await loadAssetApplicability(scope, period?.id ?? null, cards);
    if (!period) return inspect.depreciation(scope, { period, cards, ...applicability, entries: [], adjustments: [], priorEntries: [], priorAdjustments: [], priorImpairments: [], ledgerByAccount: [] });
    const accountCodes = [...new Set(applicability.policies.map((policy) => policy.accumulatedAccountCode ?? policy.assetAccountCode))];
    const accountCodeFilters = accountCodes.map((code) => ({ code: { startsWith: code } }));
    const [entries, adjustments, priorEntries, priorAdjustments, priorImpairments, balances, ledgerVouchers] = await Promise.all([
      loadCurrentEntries(scope, period.id), loadCurrentAdjustments(scope, period.id), loadPriorEntries(scope), loadPriorAdjustments(scope), loadPriorImpairments(scope),
      prisma.financeAccountBalance.findMany({ where: { periodId: period.id, companyCode: scope.companyCode, account: { code: { in: accountCodes } } }, select: { currentDebit: true, currentCredit: true, account: { select: { code: true } } } }),
      prisma.financeVoucher.findMany({ where: { periodId: period.id, companyCode: scope.companyCode, status: "posted", items: { some: { account: { OR: accountCodeFilters } } } }, select: { id: true }, orderBy: { id: "asc" } }),
    ]);
    return inspect.depreciation(scope, { period, cards, ...applicability, entries, adjustments, priorEntries, priorAdjustments, priorImpairments, ledgerByAccount: balances.map((row) => ({ accountCode: row.account.code, amount: money(row.currentCredit - row.currentDebit) })), ledgerVoucherIds: ledgerVouchers.map((row) => row.id) });
  } };
  const impairment: FinanceCloseProvider = { inspectPeriodClose: async (scope) => {
    const period = await periodFor(scope);
    const { end } = financeClosePeriodBounds(scope);
    const cards = (await loadPeriodEndCards(scope)).filter((card) => !card.disposal || card.disposal.status !== "confirmed" || card.disposal.disposalDate > end);
    const policies = await resolveClosePolicies(scope, cards);
    if (!period) return inspect.impairment(scope, { period, cards, policies, assessment: null, entries: [], adjustments: [], priorEntries: [], priorAdjustments: [], priorImpairments: [] });
    const [assessment, entries, adjustments, priorEntries, priorAdjustments, priorImpairments] = await Promise.all([
      prisma.financeAssetImpairmentAssessment.findUnique({ where: { companyCode_periodId: { companyCode: scope.companyCode, periodId: period.id } }, select: { id: true, conclusion: true, basis: true, evidenceRef: true, impairmentAmount: true, assetScopeFingerprint: true, calculationBasisFingerprint: true, assetCount: true, status: true, version: true, allocations: { select: { assetId: true, amount: true }, orderBy: { assetId: "asc" } }, voucher: { select: { id: true, voucherNo: true, status: true, companyCode: true, periodId: true, totalDebit: true, totalCredit: true, items: { select: { id: true, debit: true, credit: true, account: { select: { code: true } } } } } } } }),
      loadCurrentEntries(scope, period.id), loadCurrentAdjustments(scope, period.id), loadPriorEntries(scope), loadPriorAdjustments(scope), loadPriorImpairments(scope),
    ]);
    return inspect.impairment(scope, { period, cards, policies, assessment: assessment ? { ...assessment, impairmentAmount: money(assessment.impairmentAmount), allocations: assessment.allocations.map((row) => ({ assetId: row.assetId, amount: money(row.amount) })), voucher: depreciationVoucher(assessment.voucher) } : null, entries, adjustments, priorEntries, priorAdjustments, priorImpairments });
  } };
  return { movement, depreciation, impairment };
}

function periodFor(scope: FinanceCloseScope) {
  return prisma.financePeriod.findUnique({ where: { companyCode_year_month: scope }, select: { id: true, sourceClosed: true } });
}

async function resolveClosePolicies(scope: FinanceCloseScope, cards: Array<{ categoryId: number }>) {
  const valid: AssetPolicyFact[] = [];
  for (const categoryId of [...new Set(cards.map((card) => card.categoryId))].sort((left, right) => left - right)) {
    try {
      const policy = await resolveFinanceAssetCategoryPolicy(prisma, { companyCode: scope.companyCode, fiscalYear: scope.year, categoryId });
      valid.push({
        categoryId,
        policyId: policy.policyId,
        assetAccountCode: policy.assetAccount.code,
        assetAccountId: policy.assetAccount.id,
        accumulatedAccountCode: policy.accumulatedAccount?.code ?? null,
        accumulatedAccountId: policy.accumulatedAccount?.id ?? null,
        expenseAccountCode: policy.expenseAccount?.code ?? null,
        impairmentLossAccountCode: policy.impairmentLossAccount?.code ?? null,
        impairmentAllowanceAccountCode: policy.impairmentAllowanceAccount?.code ?? null,
        disposalGainLossAccountCode: policy.disposalGainLossAccount?.code ?? null,
      });
    } catch { /* invalid explicit policy stays absent and blocks inspection */ }
  }
  return valid;
}

async function loadPeriodEndCards(scope: FinanceCloseScope): Promise<AssetCloseCard[]> {
  const { end } = financeClosePeriodBounds(scope);
  const cards = await prisma.financeAssetCard.findMany({
    where: { companyCode: scope.companyCode, OR: [{ acquisitionDate: null }, { acquisitionDate: { lte: end } }] },
    include: {
      category: { select: { code: true, name: true, depreciable: true } },
      acquisitionEvidence: {
        select: {
          id: true, companyCode: true, companyId: true, periodId: true, amount: true, sourceChecksum: true,
          evidenceRef: true, confirmedBy: true, confirmedAt: true, version: true,
          voucherItem: { select: { id: true, debit: true, credit: true, account: { select: { code: true } }, voucher: { select: { id: true, voucherNo: true, status: true, companyCode: true, periodId: true, totalDebit: true, totalCredit: true, items: { select: { id: true, debit: true, credit: true, account: { select: { code: true } } } } } } } },
          importBatch: { select: { id: true, companyCode: true, companyId: true, sourceFile: true, checksum: true, status: true } },
        },
      },
      disposal: { select: {
        id: true, companyCode: true, companyId: true, periodId: true, disposalDate: true, disposalType: true,
        proceedsAmount: true, reason: true, evidenceRef: true, status: true, confirmedBy: true, confirmedAt: true, version: true, voucherId: true,
        assetVoucherItemId: true, accumulatedVoucherItemId: true, impairmentAllowanceVoucherItemId: true, proceedsVoucherItemId: true, gainLossVoucherItemId: true,
        voucher: { select: { id: true, voucherNo: true, status: true, companyCode: true, periodId: true, totalDebit: true, totalCredit: true, items: { select: { id: true, debit: true, credit: true, account: { select: { code: true } } } } } },
      } },
    },
    orderBy: { id: "asc" },
  });
  return cards.map((card) => ({
    ...card,
    originalCost: Number(card.originalCost),
    acquisitionEvidence: card.acquisitionEvidence ? {
      ...card.acquisitionEvidence,
      amount: money(card.acquisitionEvidence.amount),
      confirmedAt: card.acquisitionEvidence.confirmedAt.toISOString(),
      voucherItem: card.acquisitionEvidence.voucherItem ? {
        id: card.acquisitionEvidence.voucherItem.id,
        accountCode: card.acquisitionEvidence.voucherItem.account.code,
        debit: money(card.acquisitionEvidence.voucherItem.debit),
        credit: money(card.acquisitionEvidence.voucherItem.credit),
        voucher: depreciationVoucher(card.acquisitionEvidence.voucherItem.voucher)!,
      } : null,
    } : null,
    disposal: card.disposal ? {
      ...card.disposal,
      proceedsAmount: money(card.disposal.proceedsAmount),
      confirmedAt: card.disposal.confirmedAt.toISOString(),
      voucher: depreciationVoucher(card.disposal.voucher)!,
    } : null,
  }));
}

async function loadAssetApplicability(scope: FinanceCloseScope, periodId: number | null, cards: AssetCloseCard[]) {
  const saved = await prisma.financeAssetCategoryPolicy.findMany({ where: { companyCode: scope.companyCode, year: scope.year }, select: { categoryId: true } });
  const policies = await resolveClosePolicies(scope, [...cards, ...saved]);
  const accountCodes = [...new Set(policies.flatMap((policy) => [policy.assetAccountCode, policy.accumulatedAccountCode].filter((code): code is string => Boolean(code))))];
  const balances = !periodId || accountCodes.length === 0 ? [] : await prisma.financeAccountBalance.findMany({ where: { periodId, companyCode: scope.companyCode, account: { code: { in: accountCodes } } }, select: { closingDebit: true, closingCredit: true } });
  return { policies, applicabilityEstablished: saved.length > 0 && policies.length === saved.length, assetGlBalance: money(balances.reduce((sum, row) => sum + Math.abs(row.closingDebit - row.closingCredit), 0)) };
}

async function loadCurrentEntries(scope: FinanceCloseScope, periodId: number) {
  const rows = await prisma.financeAssetPeriodEntry.findMany({ where: { periodId, asset: { companyCode: scope.companyCode } }, select: { id: true, assetId: true, normalAmount: true, status: true, voucher: { select: { id: true, voucherNo: true, status: true, companyCode: true, periodId: true, totalDebit: true, totalCredit: true, items: { select: { id: true, debit: true, credit: true, account: { select: { code: true } } } } } } }, orderBy: { id: "asc" } });
  return rows.map((row) => ({ ...row, normalAmount: money(row.normalAmount), voucher: depreciationVoucher(row.voucher) }));
}

async function loadCurrentAdjustments(scope: FinanceCloseScope, periodId: number) {
  const rows = await prisma.financeAssetAdjustment.findMany({ where: { periodId, companyCode: scope.companyCode }, select: { id: true, assetId: true, accountCode: true, amount: true, status: true, voucher: { select: { id: true, voucherNo: true, status: true, companyCode: true, periodId: true, totalDebit: true, totalCredit: true, items: { select: { id: true, debit: true, credit: true, account: { select: { code: true } } } } } } }, orderBy: { id: "asc" } });
  return rows.map((row) => ({ ...row, amount: money(row.amount), voucher: depreciationVoucher(row.voucher) }));
}

async function loadPriorEntries(scope: FinanceCloseScope) {
  const rows = await prisma.financeAssetPeriodEntry.findMany({
    where: { asset: { companyCode: scope.companyCode }, period: priorPeriodWhere(scope) },
    select: {
      assetId: true, normalAmount: true, status: true,
      period: { select: { id: true, endDate: true } },
      voucher: { select: { id: true, status: true, companyCode: true, periodId: true, totalDebit: true, totalCredit: true, items: { select: { debit: true, credit: true, account: { select: { code: true } } } } } },
    },
  });
  return rows.map((row) => ({ assetId: row.assetId, normalAmount: money(row.normalAmount), status: row.status, periodId: row.period.id, periodEndDate: row.period.endDate, voucher: replayVoucher(row.voucher) }));
}
async function loadPriorAdjustments(scope: FinanceCloseScope) {
  const rows = await prisma.financeAssetAdjustment.findMany({
    where: { companyCode: scope.companyCode, period: priorPeriodWhere(scope) },
    select: {
      assetId: true, amount: true, status: true,
      period: { select: { id: true, endDate: true } },
      voucher: { select: { id: true, status: true, companyCode: true, periodId: true, totalDebit: true, totalCredit: true, items: { select: { debit: true, credit: true, account: { select: { code: true } } } } } },
    },
  });
  return rows.map((row) => ({ assetId: row.assetId, amount: money(row.amount), status: row.status, periodId: row.period.id, periodEndDate: row.period.endDate, voucher: replayVoucher(row.voucher) }));
}
async function loadPriorImpairments(scope: FinanceCloseScope) {
  const rows = await prisma.financeAssetImpairmentAllocation.findMany({
    where: { asset: { companyCode: scope.companyCode }, assessment: { period: priorPeriodWhere(scope) } },
    select: {
      assetId: true, amount: true,
      assessment: { select: { status: true, period: { select: { id: true, endDate: true } }, voucher: { select: { id: true, status: true, companyCode: true, periodId: true, totalDebit: true, totalCredit: true, items: { select: { debit: true, credit: true, account: { select: { code: true } } } } } } } },
    },
  });
  return rows.map((row) => ({ assetId: row.assetId, amount: money(row.amount), status: row.assessment.status, periodId: row.assessment.period.id, periodEndDate: row.assessment.period.endDate, voucher: replayVoucher(row.assessment.voucher) }));
}
function priorPeriodWhere(scope: FinanceCloseScope) { return { OR: [{ year: { lt: scope.year } }, { year: scope.year, month: { lt: scope.month } }] }; }

function depreciationVoucher(voucher: { id: number; voucherNo: string; status: string; companyCode: string; periodId: number; totalDebit: number; totalCredit: number; items: Array<{ id: number; debit: number; credit: number; account: { code: string } }> } | null) {
  return voucher ? {
    id: voucher.id,
    voucherNo: voucher.voucherNo,
    status: voucher.status,
    companyCode: voucher.companyCode,
    periodId: voucher.periodId,
    totalDebit: money(voucher.totalDebit),
    totalCredit: money(voucher.totalCredit),
    items: voucher.items.map((item) => ({ id: item.id, accountCode: item.account.code, debit: money(item.debit), credit: money(item.credit) })),
  } : null;
}

function replayVoucher(voucher: { id: number; status: string; companyCode: string; periodId: number; totalDebit: number; totalCredit: number; items: Array<{ debit: number; credit: number; account: { code: string } }> } | null) {
  return voucher ? {
    id: voucher.id,
    status: voucher.status,
    companyCode: voucher.companyCode,
    periodId: voucher.periodId,
    totalDebit: money(voucher.totalDebit),
    totalCredit: money(voucher.totalCredit),
    items: voucher.items.map((item) => ({ accountCode: item.account.code, debit: money(item.debit), credit: money(item.credit) })),
  } : null;
}
