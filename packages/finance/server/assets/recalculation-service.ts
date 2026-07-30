import { Prisma, prisma } from "@workspace/platform/server/prisma";
import { buildRecalculateFinanceAssetPeriodCommand } from "../domain/asset-validation";
import { calculateFinanceAssetPeriod } from "./calculator";
import { replayAssetAccumulatedAmounts } from "./accumulated-replay";
import { listFinanceAssetWorkspace } from "./service";
import { requireStoredFinanceAssetDepreciationMethod } from "./depreciation-method";
import { FINANCE_ASSET_LEGACY_CUTOVER_MODE } from "./legacy-cutover";

const money = (value: unknown) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export type FinanceAssetRecalculationDependencies = {
  database: Pick<typeof prisma, "$transaction">;
  listWorkspace: typeof listFinanceAssetWorkspace;
};

const defaultFinanceAssetRecalculationDependencies: FinanceAssetRecalculationDependencies = {
  database: prisma,
  listWorkspace: listFinanceAssetWorkspace,
};

export async function recalculateFinanceAssetPeriod(
  scope: { companyCode: string; year: number; month: number },
  overrides: Partial<FinanceAssetRecalculationDependencies> = {},
) {
  const dependencies = { ...defaultFinanceAssetRecalculationDependencies, ...overrides };
  const command = buildRecalculateFinanceAssetPeriodCommand(scope);
  if (!command.ok) throw new Error(command.issue.message);
  scope = command.data;
  await dependencies.database.$transaction(async (tx) => {
    const period = await tx.financePeriod.findUnique({ where: { companyCode_year_month: scope } });
    if (!period) throw new Error("会计期间不存在");
    if (period.isClosed) throw new Error("会计期间已关闭，不能重新计算；请通过总账凭证和前期差错流程更正");
    const cards = await tx.financeAssetCard.findMany({
      where: {
        companyCode: scope.companyCode,
        AND: [
          { OR: [{ usefulLifeMonths: { not: null } }, { initializationMode: FINANCE_ASSET_LEGACY_CUTOVER_MODE }] },
        ],
        OR: [
          { status: "active" },
          { status: "disposed", disposal: { disposalDate: { gte: period.startDate }, status: "confirmed" } },
        ],
      },
      include: { disposal: { select: { disposalDate: true, status: true } } },
      orderBy: { id: "asc" },
    });
    const assetIds = cards.map((card) => card.id);
    const [priorEntries, priorAdjustments, priorImpairments, currentEntries] = await Promise.all([
      tx.financeAssetPeriodEntry.findMany({
        where: { assetId: { in: assetIds }, period: { OR: [{ year: { lt: scope.year } }, { year: scope.year, month: { lt: scope.month } }] } },
        select: { assetId: true, normalAmount: true, status: true, period: { select: { id: true, endDate: true } }, voucher: { select: { id: true, status: true, companyCode: true, periodId: true, totalDebit: true, totalCredit: true, items: { select: { debit: true, credit: true, account: { select: { code: true } } } } } } },
      }),
      tx.financeAssetAdjustment.findMany({
        where: { companyCode: scope.companyCode, period: { OR: [{ year: { lt: scope.year } }, { year: scope.year, month: { lt: scope.month } }] } },
        select: { assetId: true, amount: true, status: true, period: { select: { id: true, endDate: true } }, voucher: { select: { id: true, status: true, companyCode: true, periodId: true, totalDebit: true, totalCredit: true, items: { select: { debit: true, credit: true, account: { select: { code: true } } } } } } },
      }),
      tx.financeAssetImpairmentAllocation.findMany({
        where: {
          assetId: { in: assetIds },
          assessment: { period: { OR: [{ year: { lt: scope.year } }, { year: scope.year, month: { lt: scope.month } }] } },
        },
        select: { assetId: true, amount: true, assessment: { select: { status: true, period: { select: { id: true, endDate: true } }, voucher: { select: { id: true, status: true, companyCode: true, periodId: true, totalDebit: true, totalCredit: true, items: { select: { debit: true, credit: true, account: { select: { code: true } } } } } } } } },
      }),
      tx.financeAssetPeriodEntry.findMany({
        where: { periodId: period.id, assetId: { in: assetIds } },
        select: { id: true, assetId: true, status: true, voucherId: true },
      }),
    ]);
    const currentByAsset = new Map(currentEntries.map((entry) => [entry.assetId, entry]));
    for (const card of cards) {
      if (card.initializationMode === FINANCE_ASSET_LEGACY_CUTOVER_MODE && card.cutoverDate && period.endDate <= card.cutoverDate) {
        if (currentByAsset.has(card.id)) throw new Error(`资产 ${card.assetCode} 的切点期间不得保留折旧摊销条目`);
        continue;
      }
      if (card.initializationMode === FINANCE_ASSET_LEGACY_CUTOVER_MODE && card.cutoverAllocationStatus !== "allocated") {
        if (currentByAsset.has(card.id)) throw new Error(`资产 ${card.assetCode} 的切点余额待分配，必须先清理已有折旧摊销条目`);
        continue;
      }
      if (!card.depreciationStartDate) {
        throw new Error(`资产 ${card.assetCode} 缺少折旧摊销起算日期，不能静默跳过重算`);
      }
      requireStoredFinanceAssetDepreciationMethod(card.method, `资产 ${card.assetCode}`);
      const existing = currentByAsset.get(card.id);
      if (existing && (existing.status === "posted" || existing.voucherId != null)) {
        throw new Error(`资产 ${card.assetCode} 的本期折旧摊销已过账，不能覆盖重算；请通过调整事项处理`);
      }
      const replay = replayAssetAccumulatedAmounts({
        assetId: card.id,
        companyCode: scope.companyCode,
        openingAccumulatedAmount: card.openingAccumulatedAmount,
        openingImpairmentAmount: card.openingImpairmentAmount,
        openingIncludesImpairment: card.initializationMode === FINANCE_ASSET_LEGACY_CUTOVER_MODE,
        openingAsOfDate: card.openingAsOfDate,
        priorEntries: priorEntries.map((row) => ({ ...row, periodId: row.period.id, periodEndDate: row.period.endDate, voucher: replayVoucher(row.voucher) })),
        priorAdjustments: priorAdjustments.map((row) => ({ ...row, periodId: row.period.id, periodEndDate: row.period.endDate, voucher: replayVoucher(row.voucher) })),
        priorImpairments: priorImpairments.map((row) => ({ ...row, status: row.assessment.status, periodId: row.assessment.period.id, periodEndDate: row.assessment.period.endDate, voucher: replayVoucher(row.assessment.voucher) })),
      });
      if (replay.blockers.length) throw new Error(`资产 ${card.assetCode} 累计金额无法重放：${replay.blockers.join("；")}`);
      const result = calculateFinanceAssetPeriod({
        originalCost: money(card.originalCost),
        residualRate: Number(card.residualRate),
        usefulLifeMonths: card.usefulLifeMonths!,
        accumulatedBefore: replay.accumulatedBefore,
        impairmentBefore: replay.impairmentBefore,
        depreciationStartDate: card.depreciationStartDate!,
        year: scope.year,
        month: scope.month,
        assetKind: card.assetKind as "fixed_asset" | "intangible" | "prepaid" | "long_term_deferred",
        disposalDate: card.disposal?.status === "confirmed" ? card.disposal.disposalDate : null,
        initializationMode: card.initializationMode as "standard" | "legacy_cutover",
        legacyCutover: card.initializationMode === FINANCE_ASSET_LEGACY_CUTOVER_MODE ? {
          originalCost: money(card.originalCost),
          openingAccumulatedAmount: money(card.openingAccumulatedAmount),
          openingImpairmentAmount: money(card.openingImpairmentAmount),
          openingNetBookValue: money(card.openingNetBookValue),
          cutoverDate: card.cutoverDate!,
          remainingUsefulLifeMonthsAtCutover: card.remainingUsefulLifeMonthsAtCutover!,
          cutoverResidualValue: money(card.cutoverResidualValue),
        } : undefined,
      });
      if (result.lifecycleBlocker) throw new Error(`资产 ${card.assetCode} 的处置月终止摊销口径缺失，请先记录明确调整`);
      await tx.financeAssetPeriodEntry.upsert({
        where: { assetId_periodId: { assetId: card.id, periodId: period.id } },
        create: { assetId: card.id, periodId: period.id, normalAmount: result.periodAmount, status: "calculated", calculationVersion: calculationVersion(card.initializationMode) },
        update: { normalAmount: result.periodAmount, status: "calculated", voucherId: null, calculationVersion: calculationVersion(card.initializationMode) },
      });
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return dependencies.listWorkspace(scope);
}

function calculationVersion(initializationMode: string) {
  return initializationMode === FINANCE_ASSET_LEGACY_CUTOVER_MODE
    ? "legacy-cutover-remaining-value-v1"
    : "straight-line-v1";
}

function replayVoucher(voucher: { id: number; status: string; companyCode: string; periodId: number; totalDebit: number; totalCredit: number; items: Array<{ debit: number; credit: number; account: { code: string } }> } | null) {
  return voucher ? { ...voucher, items: voucher.items.map((item) => ({ accountCode: item.account.code, debit: item.debit, credit: item.credit })) } : null;
}
