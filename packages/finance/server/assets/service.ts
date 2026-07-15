import { prisma } from "@workspace/platform/server/prisma";
import type {
  CreateFinanceAssetAdjustmentInput,
  CreateFinanceAssetCardInput,
  FinanceAssetCardDto,
  FinanceAssetKind,
  FinanceAssetWorkspaceDto,
} from "../../types/assets";
import { calculateStraightLinePeriod } from "./calculator";
import { buildCreateFinanceAssetAdjustmentCommand, buildCreateFinanceAssetCardCommand, buildRecalculateFinanceAssetPeriodCommand } from "../domain/asset-validation";

const money = (value: unknown) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export async function createFinanceAssetCard(input: CreateFinanceAssetCardInput, userId: number) {
  const command = buildCreateFinanceAssetCardCommand(input, userId);
  if (!command.ok) throw new Error(command.issue.message);
  input = command.data.input;
  return prisma.financeAssetCard.create({
    data: {
      ...input,
      category: input.category || null,
      accumulatedAccountCode: input.accumulatedAccountCode || null,
      acquisitionDate: input.acquisitionDate || null,
      depreciationStartDate: input.depreciationStartDate || null,
      residualRate: input.residualRate ?? 0,
      usefulLifeMonths: input.usefulLifeMonths ?? null,
      method: input.method || "straight_line",
      openingAccumulatedAmount: input.openingAccumulatedAmount ?? 0,
      openingAsOfDate: input.openingAsOfDate || null,
      nonAmortizationReason: input.nonAmortizationReason || null,
      note: input.note || null,
      editedBy: userId,
    },
  });
}

export async function createFinanceAssetAdjustment(input: CreateFinanceAssetAdjustmentInput, userId: number) {
  const command = buildCreateFinanceAssetAdjustmentCommand(input, userId);
  if (!command.ok) throw new Error(command.issue.message);
  input = command.data.input;
  const period = await prisma.financePeriod.findUnique({
    where: { companyCode_year_month: { companyCode: input.companyCode, year: input.year, month: input.month } },
    select: { id: true },
  });
  if (!period) throw new Error("会计期间不存在");
  if (input.assetId) {
    const asset = await prisma.financeAssetCard.findFirst({ where: { id: input.assetId, companyCode: input.companyCode }, select: { id: true } });
    if (!asset) throw new Error("资产卡片不存在或不属于当前公司");
  }
  return prisma.financeAssetAdjustment.create({
    data: {
      companyCode: input.companyCode,
      periodId: period.id,
      assetId: input.assetId || null,
      accountCode: input.accountCode,
      amount: input.amount,
      reason: input.reason,
      status: "confirmed",
      createdBy: userId,
    },
  });
}

function toCardDto(card: Awaited<ReturnType<typeof loadCards>>[number]): FinanceAssetCardDto {
  const gross = card.costLines.length > 0 ? card.costLines.reduce((sum, line) => sum + money(line.amount), 0) : money(card.originalCost);
  const waived = card.costLines.filter((line) => line.treatment === "waived").reduce((sum, line) => sum + money(line.amount), 0);
  return {
    id: card.id,
    companyCode: card.companyCode,
    assetCode: card.assetCode,
    name: card.name,
    assetKind: card.assetKind as FinanceAssetKind,
    category: card.category,
    assetAccountCode: card.assetAccountCode,
    accumulatedAccountCode: card.accumulatedAccountCode,
    acquisitionDate: card.acquisitionDate,
    depreciationStartDate: card.depreciationStartDate,
    originalCost: money(card.originalCost),
    residualRate: Number(card.residualRate),
    usefulLifeMonths: card.usefulLifeMonths,
    method: card.method,
    openingAccumulatedAmount: money(card.openingAccumulatedAmount),
    status: card.status,
    nonAmortizationReason: card.nonAmortizationReason,
    note: card.note,
    sourceSheet: card.sourceSheet,
    sourceRow: card.sourceRow,
    grossCost: money(gross),
    waivedCost: money(waived),
    capitalizedCost: money(gross - waived),
  };
}

function loadCards(companyCode: string) {
  return prisma.financeAssetCard.findMany({
    where: { companyCode },
    include: { costLines: { orderBy: { sourceRow: "asc" } } },
    orderBy: [{ status: "asc" }, { assetCode: "asc" }],
  });
}

export async function listFinanceAssetWorkspace(scope: { companyCode: string; year: number; month: number }): Promise<FinanceAssetWorkspaceDto> {
  const period = await prisma.financePeriod.findUnique({
    where: { companyCode_year_month: scope },
    select: { id: true, isClosed: true },
  });
  const cards = await loadCards(scope.companyCode);
  if (!period) return emptyWorkspace(scope, cards.map(toCardDto));
  const [entries, adjustments] = await Promise.all([
    prisma.financeAssetPeriodEntry.findMany({
      where: { periodId: period.id, asset: { companyCode: scope.companyCode } },
      include: { asset: true, voucher: { select: { voucherNo: true } } },
      orderBy: { asset: { assetCode: "asc" } },
    }),
    prisma.financeAssetAdjustment.findMany({
      where: { periodId: period.id, companyCode: scope.companyCode },
      include: { asset: { select: { name: true } }, voucher: { select: { voucherNo: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const confirmedAdjustments = adjustments.filter((item) => item.status === "confirmed");
  const adjustmentByAsset = new Map<number, number>();
  for (const item of confirmedAdjustments) {
    if (item.assetId) adjustmentByAsset.set(item.assetId, money((adjustmentByAsset.get(item.assetId) ?? 0) + money(item.amount)));
  }
  const periodRows = entries.map((entry) => {
    const normalAmount = money(entry.normalAmount);
    const adjustmentAmount = adjustmentByAsset.get(entry.assetId) ?? 0;
    return {
      assetId: entry.assetId,
      assetCode: entry.asset.assetCode,
      name: entry.asset.name,
      assetKind: entry.asset.assetKind as FinanceAssetKind,
      accountCode: entry.asset.accumulatedAccountCode || entry.asset.assetAccountCode,
      depreciationStartDate: entry.asset.depreciationStartDate,
      originalCost: money(entry.asset.originalCost),
      normalAmount,
      adjustmentAmount,
      periodAmount: money(normalAmount + adjustmentAmount),
      status: entry.status,
      voucherNo: entry.voucher?.voucherNo ?? null,
    };
  });
  const reconciliation = await buildReconciliation(period.id, scope.companyCode, entries, confirmedAdjustments);
  const normalAmount = money(entries.reduce((sum, item) => sum + money(item.normalAmount), 0));
  const adjustmentAmount = money(confirmedAdjustments.reduce((sum, item) => sum + money(item.amount), 0));
  const voucherAmount = money(reconciliation.reduce((sum, item) => sum + item.voucherAmount, 0));
  const ledgerAmount = money(reconciliation.reduce((sum, item) => sum + item.ledgerAmount, 0));
  return {
    scope: { ...scope, periodId: period.id, isClosed: period.isClosed },
    cards: cards.map(toCardDto),
    periodRows,
    adjustments: adjustments.map((item) => ({
      id: item.id,
      assetId: item.assetId,
      assetName: item.asset?.name ?? null,
      accountCode: item.accountCode,
      amount: money(item.amount),
      reason: item.reason,
      status: item.status,
      voucherNo: item.voucher?.voucherNo ?? null,
      sourceSheet: item.sourceSheet,
      sourceRow: item.sourceRow,
      createdAt: item.createdAt.toISOString(),
    })),
    reconciliation,
    metrics: {
      normalAmount,
      adjustmentAmount,
      periodAmount: money(normalAmount + adjustmentAmount),
      voucherAmount,
      ledgerAmount,
      difference: money(normalAmount + adjustmentAmount - voucherAmount),
    },
  };
}

async function buildReconciliation(periodId: number, companyCode: string, entries: Array<{ normalAmount: unknown; voucherId: number | null; asset: { accumulatedAccountCode: string | null; assetAccountCode: string } }>, adjustments: Array<{ amount: unknown; voucherId: number | null; accountCode: string }>) {
  const scheduleByAccount = new Map<string, number>();
  for (const item of entries) add(scheduleByAccount, item.asset.accumulatedAccountCode || item.asset.assetAccountCode, money(item.normalAmount));
  for (const item of adjustments) add(scheduleByAccount, item.accountCode, money(item.amount));
  const accountCodes = [...scheduleByAccount.keys()];
  const voucherIds = [...new Set([...entries, ...adjustments].map((item) => item.voucherId).filter((id): id is number => Boolean(id)))];
  const [voucherItems, balances] = await Promise.all([
    voucherIds.length === 0 ? [] : prisma.financeVoucherItem.findMany({
      where: { voucherId: { in: voucherIds }, account: { companyCode, code: { in: accountCodes } } },
      include: { account: { select: { code: true } } },
    }),
    prisma.financeAccountBalance.findMany({
      where: { periodId, account: { companyCode, code: { in: accountCodes } } },
      include: { account: { select: { code: true } } },
    }),
  ]);
  const voucherByAccount = new Map<string, number>();
  for (const item of voucherItems) add(voucherByAccount, item.account.code, money(item.credit) - money(item.debit));
  const ledgerByAccount = new Map<string, number>();
  for (const item of balances) add(ledgerByAccount, item.account.code, money(item.currentCredit));
  return accountCodes.map((accountCode) => {
    const scheduleAmount = money(scheduleByAccount.get(accountCode) ?? 0);
    const voucherAmount = money(voucherByAccount.get(accountCode) ?? 0);
    const ledgerAmount = money(ledgerByAccount.get(accountCode) ?? 0);
    const voucherDifference = money(scheduleAmount - voucherAmount);
    const ledgerDifference = money(scheduleAmount - ledgerAmount);
    return { accountCode, scheduleAmount, voucherAmount, ledgerAmount, voucherDifference, ledgerDifference, status: voucherDifference === 0 && ledgerDifference === 0 ? "matched" as const : "difference" as const };
  });
}

function add(map: Map<string, number>, key: string, value: number) {
  map.set(key, money((map.get(key) ?? 0) + value));
}

function emptyWorkspace(scope: { companyCode: string; year: number; month: number }, cards: FinanceAssetCardDto[]): FinanceAssetWorkspaceDto {
  return { scope: { ...scope, periodId: null, isClosed: false }, cards, periodRows: [], adjustments: [], reconciliation: [], metrics: { normalAmount: 0, adjustmentAmount: 0, periodAmount: 0, voucherAmount: 0, ledgerAmount: 0, difference: 0 } };
}

export async function recalculateFinanceAssetPeriod(scope: { companyCode: string; year: number; month: number }) {
  const command = buildRecalculateFinanceAssetPeriodCommand(scope);
  if (!command.ok) throw new Error(command.issue.message);
  scope = command.data;
  const period = await prisma.financePeriod.findUnique({ where: { companyCode_year_month: scope } });
  if (!period) throw new Error("会计期间不存在");
  if (period.isClosed) throw new Error("会计期间已关闭，不能重新计算；请使用调整事项");
  const cards = await prisma.financeAssetCard.findMany({ where: { companyCode: scope.companyCode, status: "active", usefulLifeMonths: { not: null }, depreciationStartDate: { not: null } } });
  const priorEntries = await prisma.financeAssetPeriodEntry.findMany({
    where: { assetId: { in: cards.map((card) => card.id) }, period: { OR: [{ year: { lt: scope.year } }, { year: scope.year, month: { lt: scope.month } }] } },
    select: { assetId: true, normalAmount: true },
  });
  const accumulated = new Map<number, number>();
  for (const item of priorEntries) accumulated.set(item.assetId, money((accumulated.get(item.assetId) ?? 0) + money(item.normalAmount)));
  await prisma.$transaction(cards.map((card) => {
    const result = calculateStraightLinePeriod({
      originalCost: money(card.originalCost),
      residualRate: Number(card.residualRate),
      usefulLifeMonths: card.usefulLifeMonths!,
      accumulatedBefore: money(card.openingAccumulatedAmount) + (accumulated.get(card.id) ?? 0),
      depreciationStartDate: card.depreciationStartDate!,
      year: scope.year,
      month: scope.month,
    });
    return prisma.financeAssetPeriodEntry.upsert({
      where: { assetId_periodId: { assetId: card.id, periodId: period.id } },
      create: { assetId: card.id, periodId: period.id, normalAmount: result.periodAmount, status: "calculated" },
      update: { normalAmount: result.periodAmount, status: "calculated", voucherId: null },
    });
  }));
  return listFinanceAssetWorkspace(scope);
}
