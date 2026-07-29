import { Prisma, prisma } from "@workspace/platform/server/prisma";
import type { ConfirmFinanceAssetAcquisitionEvidenceInput, ConfirmFinanceAssetDisposalInput, LinkFinanceAssetPeriodVoucherInput } from "../../types/assets";
import type {
  FinanceAssetAcquisitionEvidenceConfirmCommand,
  FinanceAssetDisposalConfirmCommand,
  FinanceAssetImpairmentAssessmentConfirmCommand,
  FinanceAssetPeriodVoucherLinkCommand,
} from "../domain/asset-validation";
import {
  buildConfirmFinanceAssetAcquisitionEvidenceCommand,
  buildConfirmFinanceAssetDisposalCommand,
  buildConfirmFinanceAssetImpairmentAssessmentCommand,
  buildLinkFinanceAssetPeriodVoucherCommand,
  assetImpairmentPolicySnapshotsMatch,
  impairmentVoucherLinesMatch,
} from "../domain/asset-validation";
import { resolveFinanceAssetCategoryPolicy } from "./account-policy-resolver";
import { assetImpairmentCalculationBasisFingerprint, assetScopeFingerprint, financeClosePeriodBounds } from "./period-scope";
import { replayAssetAccumulatedAmounts } from "./accumulated-replay";
import { moneyEquals, moneyExceeds, moneyIsNonZero } from "./money-cents";

const money = (value: unknown) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export async function confirmFinanceAssetAcquisitionEvidence(command: FinanceAssetAcquisitionEvidenceConfirmCommand) {
  const initial = await buildConfirmFinanceAssetAcquisitionEvidenceCommand(command.input, command.userId);
  if (!initial.ok) throw new Error(initial.issue.message);
  return prisma.$transaction(async (tx) => {
    const validated = await buildConfirmFinanceAssetAcquisitionEvidenceCommand(command.input, command.userId, {
      findAcquisitionContext: (input) => loadAssetAcquisitionContext(tx, input),
    });
    if (!validated.ok) throw new Error(validated.issue.message);
    const data = validated.data;
    const locked = await tx.financeAssetCard.updateMany({
      where: {
        id: data.input.assetId,
        companyCode: data.input.companyCode,
        companyId: data.companyId,
        version: data.input.assetVersion,
        status: "active",
      },
      data: { version: { increment: 1 } },
    });
    if (locked.count !== 1) throw new Error("资产卡片已被其他人修改，请刷新后重试");
    return tx.financeAssetAcquisitionEvidence.create({
      data: {
        companyCode: data.input.companyCode,
        companyId: data.companyId,
        periodId: data.periodId,
        assetId: data.input.assetId,
        voucherItemId: data.voucherItemId,
        amount: data.amount,
        evidenceRef: data.input.evidenceRef,
        confirmedBy: data.userId,
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function confirmFinanceAssetImpairmentAssessment(command: FinanceAssetImpairmentAssessmentConfirmCommand) {
  const validated = await buildConfirmFinanceAssetImpairmentAssessmentCommand(command.input, command.userId);
  if (!validated.ok) throw new Error(validated.issue.message);
  command = validated.data;
  const input = command.input;
  const data = {
    companyCode: input.companyCode,
    periodId: command.periodId,
    conclusion: input.conclusion,
    basis: input.basis,
    evidenceRef: input.evidenceRef,
    impairmentAmount: input.impairmentAmount,
    voucherId: command.voucher?.id ?? null,
    assetScopeFingerprint: command.assetScopeFingerprint,
    assetCount: command.assetCount,
    status: "confirmed",
    assessedBy: command.userId,
    confirmedAt: new Date(),
  };
  return prisma.$transaction(async (tx) => {
    const { calculationBasisFingerprint, companyId } = await assertImpairmentAllocationBasis(tx, command);
    const persistedData = { ...data, companyId };
    if (input.version === 0) {
      const existing = await tx.financeAssetImpairmentAssessment.findUnique({
        where: { companyCode_periodId: { companyCode: input.companyCode, periodId: command.periodId } },
        select: { id: true },
      });
      if (existing) throw new Error("减值评估已被其他人确认，请刷新后重试");
      return tx.financeAssetImpairmentAssessment.create({
        data: { ...persistedData, calculationBasisFingerprint, allocations: { create: input.allocations } },
      });
    }
    const updated = await tx.financeAssetImpairmentAssessment.updateMany({
      where: { companyCode: input.companyCode, periodId: command.periodId, version: input.version },
      data: { ...persistedData, calculationBasisFingerprint, version: { increment: 1 } },
    });
    if (updated.count !== 1) throw new Error("减值评估已被其他人修改，请刷新后重试");
    const assessment = await tx.financeAssetImpairmentAssessment.findUniqueOrThrow({
      where: { companyCode_periodId: { companyCode: input.companyCode, periodId: command.periodId } },
      select: { id: true },
    });
    await tx.financeAssetImpairmentAllocation.deleteMany({ where: { assessmentId: assessment.id } });
    if (input.allocations.length) {
      await tx.financeAssetImpairmentAllocation.createMany({
        data: input.allocations.map((row) => ({ assessmentId: assessment.id, ...row })),
      });
    }
    return tx.financeAssetImpairmentAssessment.findUniqueOrThrow({ where: { id: assessment.id } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function assertImpairmentAllocationBasis(
  tx: Prisma.TransactionClient,
  command: FinanceAssetImpairmentAssessmentConfirmCommand,
) {
  const input = command.input;
  const [period, company] = await Promise.all([
    tx.financePeriod.findUnique({
      where: { companyCode_year_month: { companyCode: input.companyCode, year: input.year, month: input.month } },
      select: { id: true, isClosed: true },
    }),
    tx.company.findUnique({ where: { code: input.companyCode }, select: { id: true } }),
  ]);
  if (!company) throw new Error("公司不存在");
  if (!period || period.id !== command.periodId || period.isClosed) throw new Error("会计期间已变化，请刷新后重试");
  const { end } = financeClosePeriodBounds(input);
  const scopeCards = await tx.financeAssetCard.findMany({
    where: { companyCode: input.companyCode, OR: [{ acquisitionDate: null }, { acquisitionDate: { lte: end } }] },
    select: {
      id: true, version: true, status: true, categoryId: true, acquisitionDate: true, depreciationStartDate: true,
      originalCost: true, residualRate: true, usefulLifeMonths: true, method: true, assetAccountCode: true, assetAccountId: true,
      accumulatedAccountCode: true, accumulatedAccountId: true, openingAccumulatedAmount: true, openingAsOfDate: true,
      disposal: { select: { disposalDate: true, status: true } },
    },
    orderBy: { id: "asc" },
  });
  const cards = scopeCards.filter((card) => !card.disposal || card.disposal.status !== "confirmed" || card.disposal.disposalDate > end);
  const policies = await Promise.all([...new Set(cards.map((card) => card.categoryId))].map(async (categoryId) => {
    try {
      const policy = await resolveFinanceAssetCategoryPolicy(tx, { companyCode: input.companyCode, fiscalYear: input.year, categoryId });
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
  if (cards.length !== command.assetCount || assetScopeFingerprint(cards) !== command.assetScopeFingerprint) {
    throw new Error("资产范围已变化，请刷新后重新确认减值评估");
  }
  if (!assetImpairmentPolicySnapshotsMatch(cards, policies)) {
    throw new Error("资产科目快照与当前公司年度分类政策不一致");
  }
  if (command.voucher) {
    const voucher = await tx.financeVoucher.findUnique({
      where: { id: command.voucher.id },
      select: { id: true, voucherNo: true, status: true, companyCode: true, periodId: true, totalDebit: true, totalCredit: true, items: { select: { id: true, debit: true, credit: true, account: { select: { code: true } } } } },
    });
    const normalizedVoucher = voucher ? { ...voucher, items: voucher.items.map((item) => ({ id: item.id, accountCode: item.account.code, debit: item.debit, credit: item.credit })) } : null;
    if (!voucher || voucher.status !== "posted" || voucher.companyCode !== input.companyCode || voucher.periodId !== period.id
      || !moneyEquals(voucher.totalDebit, input.impairmentAmount) || !moneyEquals(voucher.totalDebit, voucher.totalCredit)) {
      throw new Error("减值专用凭证已变化，请刷新后重试");
    }
    if (!normalizedVoucher || !impairmentVoucherLinesMatch(normalizedVoucher, input.allocations, cards, policies)) {
      throw new Error("减值专用凭证分录或公司年度减值科目政策已变化，请刷新后重试");
    }
  }
  const assetIds = cards.map((card) => card.id);
  const [priorEntries, priorAdjustments, priorImpairments, currentEntries, currentAdjustments] = await Promise.all([
    tx.financeAssetPeriodEntry.findMany({
      where: { assetId: { in: assetIds }, period: { OR: [{ year: { lt: input.year } }, { year: input.year, month: { lt: input.month } }] } },
      select: { assetId: true, normalAmount: true, status: true, period: { select: { id: true, endDate: true } }, voucher: { select: { id: true, status: true, companyCode: true, periodId: true, totalDebit: true, totalCredit: true, items: { select: { debit: true, credit: true, account: { select: { code: true } } } } } } },
    }),
    tx.financeAssetAdjustment.findMany({
      where: { companyCode: input.companyCode, period: { OR: [{ year: { lt: input.year } }, { year: input.year, month: { lt: input.month } }] } },
      select: { assetId: true, amount: true, status: true, period: { select: { id: true, endDate: true } }, voucher: { select: { id: true, status: true, companyCode: true, periodId: true, totalDebit: true, totalCredit: true, items: { select: { debit: true, credit: true, account: { select: { code: true } } } } } } },
    }),
    tx.financeAssetImpairmentAllocation.findMany({
      where: { assetId: { in: assetIds }, assessment: { period: { OR: [{ year: { lt: input.year } }, { year: input.year, month: { lt: input.month } }] } } },
      select: { assetId: true, amount: true, assessment: { select: { status: true, period: { select: { id: true, endDate: true } }, voucher: { select: { id: true, status: true, companyCode: true, periodId: true, totalDebit: true, totalCredit: true, items: { select: { debit: true, credit: true, account: { select: { code: true } } } } } } } } },
    }),
    tx.financeAssetPeriodEntry.findMany({
      where: { assetId: { in: assetIds }, periodId: period.id },
      select: { id: true, assetId: true, normalAmount: true, status: true, voucherId: true, voucher: { select: { status: true, companyCode: true, periodId: true } } },
    }),
    tx.financeAssetAdjustment.findMany({
      where: { companyCode: input.companyCode, periodId: period.id },
      select: { id: true, assetId: true, amount: true, status: true, voucherId: true, voucher: { select: { status: true, companyCode: true, periodId: true } } },
    }),
  ]);
  const confirmedCurrentAdjustments = currentAdjustments.filter((row) => row.status === "confirmed");
  if (confirmedCurrentAdjustments.some((row) => row.assetId == null && moneyIsNonZero(row.amount))) {
    throw new Error("本期折旧摊销调整未分配到具体资产，无法确认逐项减值基础");
  }
  for (const entry of currentEntries) {
    if (moneyIsNonZero(entry.normalAmount)
      && (entry.status !== "posted" || !entry.voucher || entry.voucher.status !== "posted" || entry.voucher.companyCode !== input.companyCode || entry.voucher.periodId !== period.id)) {
      throw new Error("必须先完成本期折旧摊销专用凭证过账，再确认期末减值评估");
    }
  }
  for (const adjustment of confirmedCurrentAdjustments) {
    if (moneyIsNonZero(adjustment.amount)
      && (!adjustment.voucher || adjustment.voucher.status !== "posted" || adjustment.voucher.companyCode !== input.companyCode || adjustment.voucher.periodId !== period.id)) {
      throw new Error("必须先完成本期折旧摊销调整凭证过账，再确认期末减值评估");
    }
  }
  const currentEntryByAsset = new Map(currentEntries.map((row) => [row.assetId, money(row.normalAmount)]));
  const currentAdjustmentByAsset = new Map<number, number>();
  for (const row of confirmedCurrentAdjustments) if (row.assetId != null) currentAdjustmentByAsset.set(row.assetId, money((currentAdjustmentByAsset.get(row.assetId) ?? 0) + money(row.amount)));
  const allocationByAsset = new Map(input.allocations.map((row) => [row.assetId, row.amount]));
  const replayRows: Array<{ assetId: number; replayFingerprint: string }> = [];
  for (const card of cards) {
    const allocation = allocationByAsset.get(card.id);
    const replay = replayAssetAccumulatedAmounts({
      assetId: card.id,
      companyCode: input.companyCode,
      openingAccumulatedAmount: card.openingAccumulatedAmount,
      openingAsOfDate: card.openingAsOfDate,
      priorEntries: priorEntries.map((row) => ({ ...row, periodId: row.period.id, periodEndDate: row.period.endDate, voucher: replayVoucher(row.voucher) })),
      priorAdjustments: priorAdjustments.map((row) => ({ ...row, periodId: row.period.id, periodEndDate: row.period.endDate, voucher: replayVoucher(row.voucher) })),
      priorImpairments: priorImpairments.map((row) => ({ ...row, status: row.assessment.status, periodId: row.assessment.period.id, periodEndDate: row.assessment.period.endDate, voucher: replayVoucher(row.assessment.voucher) })),
    });
    if (replay.blockers.length) throw new Error(`资产 ${card.id} 累计金额无法重放：${replay.blockers.join("；")}`);
    replayRows.push({ assetId: card.id, replayFingerprint: replay.basisFingerprint });
    if (card.usefulLifeMonths != null && card.depreciationStartDate && card.depreciationStartDate <= end && !currentEntryByAsset.has(card.id)) {
      throw new Error(`资产 ${card.id} 尚未生成本期折旧摊销，不能确认期末减值`);
    }
    if (allocation == null) continue;
    const carryingBasis = money(Number(card.originalCost) - replay.impairmentBefore - replay.accumulatedBefore
      - (currentEntryByAsset.get(card.id) ?? 0) - (currentAdjustmentByAsset.get(card.id) ?? 0));
    if (moneyExceeds(allocation, Math.max(0, carryingBasis))) throw new Error(`资产 ${card.id} 的减值分配超过期末账面基础`);
  }
  return {
    companyId: company.id,
    calculationBasisFingerprint: assetImpairmentCalculationBasisFingerprint({
      assets: replayRows,
      entries: currentEntries.map((row) => ({ id: row.id, assetId: row.assetId, amount: row.normalAmount, status: row.status, voucherId: row.voucherId })),
      adjustments: currentAdjustments.map((row) => ({ id: row.id, assetId: row.assetId, amount: row.amount, status: row.status, voucherId: row.voucherId })),
    }),
  };
}

function replayVoucher(voucher: { id: number; status: string; companyCode: string; periodId: number; totalDebit: number; totalCredit: number; items: Array<{ debit: number; credit: number; account: { code: string } }> } | null) {
  return voucher ? { ...voucher, items: voucher.items.map((item) => ({ accountCode: item.account.code, debit: item.debit, credit: item.credit })) } : null;
}

export async function confirmFinanceAssetDisposal(command: FinanceAssetDisposalConfirmCommand) {
  const initial = await buildConfirmFinanceAssetDisposalCommand(command.input, command.userId);
  if (!initial.ok) throw new Error(initial.issue.message);
  return prisma.$transaction(async (tx) => {
    const validated = await buildConfirmFinanceAssetDisposalCommand(command.input, command.userId, {
      findDisposalContext: (input) => loadAssetDisposalContext(tx, input),
    });
    if (!validated.ok) throw new Error(validated.issue.message);
    const data = validated.data;
    const company = await tx.company.findUnique({ where: { code: data.input.companyCode }, select: { id: true } });
    if (!company) throw new Error("公司不存在");
    const updated = await tx.financeAssetCard.updateMany({
      where: { id: data.input.assetId, companyCode: data.input.companyCode, version: data.input.assetVersion, status: "active" },
      data: { status: "disposed", editedBy: data.userId, version: { increment: 1 } },
    });
    if (updated.count !== 1) throw new Error("资产卡片已被其他人修改，请刷新后重试");
    return tx.financeAssetDisposal.create({
      data: {
        companyCode: data.input.companyCode,
        companyId: company.id,
        periodId: data.periodId,
        assetId: data.input.assetId,
        disposalDate: data.input.disposalDate,
        disposalType: data.input.disposalType,
        proceedsAmount: data.input.proceedsAmount,
        reason: data.input.reason,
        evidenceRef: data.input.evidenceRef,
        voucherId: data.voucherId,
        ...data.voucherItems,
        status: "confirmed",
        confirmedBy: data.userId,
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function linkFinanceAssetPeriodVoucher(command: FinanceAssetPeriodVoucherLinkCommand) {
  const initial = await buildLinkFinanceAssetPeriodVoucherCommand(command.input);
  if (!initial.ok) throw new Error(initial.issue.message);
  return prisma.$transaction(async (tx) => {
    const validated = await buildLinkFinanceAssetPeriodVoucherCommand(command.input, {
      findPeriodVoucherLinkContext: (input) => loadAssetPeriodVoucherLinkContext(tx, input),
    });
    if (!validated.ok) throw new Error(validated.issue.message);
    const data = validated.data;
    const entryUpdate = await tx.financeAssetPeriodEntry.updateMany({
      where: { id: { in: data.entryIds }, periodId: data.periodId, status: { not: "posted" }, voucherId: null },
      data: { voucherId: data.voucherId, status: "posted" },
    });
    const adjustmentUpdate = data.adjustmentIds.length ? await tx.financeAssetAdjustment.updateMany({
      where: { id: { in: data.adjustmentIds }, periodId: data.periodId, companyCode: data.input.companyCode, status: "confirmed", voucherId: null },
      data: { voucherId: data.voucherId },
    }) : { count: 0 };
    if (entryUpdate.count !== data.entryIds.length || adjustmentUpdate.count !== data.adjustmentIds.length) {
      throw new Error("折旧摊销条目已变化，请刷新后重试");
    }
    return { voucherId: data.voucherId, entryCount: entryUpdate.count, adjustmentCount: adjustmentUpdate.count };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function loadAssetAcquisitionContext(
  tx: Prisma.TransactionClient,
  input: ConfirmFinanceAssetAcquisitionEvidenceInput,
) {
  const [period, company, assetRow, existingEvidence, occupiedEvidence] = await Promise.all([
    tx.financePeriod.findUnique({
      where: { companyCode_year_month: { companyCode: input.companyCode, year: input.year, month: input.month } },
      select: { id: true, isClosed: true },
    }),
    tx.company.findUnique({ where: { code: input.companyCode }, select: { id: true, code: true } }),
    tx.financeAssetCard.findUnique({
      where: { id: input.assetId },
      select: {
        id: true, companyCode: true, companyId: true, version: true, status: true, acquisitionDate: true,
        categoryId: true, originalCost: true, assetAccountCode: true, assetAccountId: true,
      },
    }),
    tx.financeAssetAcquisitionEvidence.findUnique({ where: { assetId: input.assetId }, select: { id: true } }),
    tx.financeAssetAcquisitionEvidence.findMany({ where: { voucherItemId: { not: null } }, select: { voucherItemId: true } }),
  ]);
  const voucherRow = period ? await tx.financeVoucher.findUnique({
    where: { voucherNo_companyCode_periodId: { voucherNo: input.voucherNo, companyCode: input.companyCode, periodId: period.id } },
    select: {
      id: true, voucherNo: true, periodId: true, companyCode: true, status: true, totalDebit: true, totalCredit: true,
      items: { select: { id: true, debit: true, credit: true, account: { select: { code: true } } } },
    },
  }) : null;
  let policy = null;
  if (assetRow) {
    try {
      const resolved = await resolveFinanceAssetCategoryPolicy(tx, {
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
    voucher: voucherRow ? {
      ...voucherRow,
      items: voucherRow.items.map((item) => ({ id: item.id, accountCode: item.account.code, debit: money(item.debit), credit: money(item.credit) })),
    } : null,
    policy,
    occupiedVoucherItemIds: occupiedEvidence.flatMap((row) => row.voucherItemId ?? []),
  };
}

async function loadAssetDisposalContext(tx: Prisma.TransactionClient, input: ConfirmFinanceAssetDisposalInput) {
  const period = await tx.financePeriod.findUnique({
    where: { companyCode_year_month: { companyCode: input.companyCode, year: input.year, month: input.month } },
    select: { id: true, isClosed: true },
  });
  const [assetRow, existingDisposal, voucherRow, occupiedDisposals] = await Promise.all([
    tx.financeAssetCard.findUnique({ where: { id: input.assetId }, select: {
      id: true, companyCode: true, version: true, status: true, acquisitionDate: true, categoryId: true, assetCode: true,
      originalCost: true, assetAccountCode: true, assetAccountId: true, accumulatedAccountCode: true, accumulatedAccountId: true,
      openingAccumulatedAmount: true, openingAsOfDate: true,
    } }),
    tx.financeAssetDisposal.findUnique({ where: { assetId: input.assetId }, select: { id: true } }),
    period ? tx.financeVoucher.findUnique({
      where: { voucherNo_companyCode_periodId: { voucherNo: input.voucherNo, companyCode: input.companyCode, periodId: period.id } },
      select: { id: true, voucherNo: true, periodId: true, companyCode: true, status: true, totalDebit: true, totalCredit: true, items: { select: { id: true, debit: true, credit: true, account: { select: { code: true } } } } },
    }) : null,
    tx.financeAssetDisposal.findMany({ select: { assetVoucherItemId: true, accumulatedVoucherItemId: true, impairmentAllowanceVoucherItemId: true, proceedsVoucherItemId: true, gainLossVoucherItemId: true } }),
  ]);
  const asset = assetRow ? { ...assetRow, originalCost: Number(assetRow.originalCost), openingAccumulatedAmount: Number(assetRow.openingAccumulatedAmount) } : null;
  const voucher = voucherRow ? { ...voucherRow, items: voucherRow.items.map((item) => ({ id: item.id, accountCode: item.account.code, debit: item.debit, credit: item.credit })) } : null;
  let policy = null;
  if (asset) {
    try {
      const resolved = await resolveFinanceAssetCategoryPolicy(tx, { companyCode: input.companyCode, fiscalYear: input.year, categoryId: asset.categoryId });
      policy = {
        assetAccountCode: resolved.assetAccount.code,
        assetAccountId: resolved.assetAccount.id,
        accumulatedAccountCode: resolved.accumulatedAccount?.code ?? null,
        accumulatedAccountId: resolved.accumulatedAccount?.id ?? null,
        impairmentAllowanceAccountCode: resolved.impairmentAllowanceAccount?.code ?? null,
        disposalGainLossAccountCode: resolved.disposalGainLossAccount?.code ?? null,
      };
    } catch { /* missing policy blocks disposal confirmation */ }
  }
  const priorWhere = { OR: [{ year: { lt: input.year } }, { year: input.year, month: { lt: input.month } }] };
  const [priorEntries, priorAdjustments, priorImpairments, currentEntries, currentAdjustments] = asset && period ? await Promise.all([
    tx.financeAssetPeriodEntry.findMany({ where: { assetId: asset.id, period: priorWhere }, select: { assetId: true, normalAmount: true, status: true, period: { select: { id: true, endDate: true } }, voucher: { select: { id: true, status: true, companyCode: true, periodId: true, totalDebit: true, totalCredit: true, items: { select: { debit: true, credit: true, account: { select: { code: true } } } } } } } }),
    tx.financeAssetAdjustment.findMany({ where: { companyCode: input.companyCode, period: priorWhere }, select: { assetId: true, amount: true, status: true, period: { select: { id: true, endDate: true } }, voucher: { select: { id: true, status: true, companyCode: true, periodId: true, totalDebit: true, totalCredit: true, items: { select: { debit: true, credit: true, account: { select: { code: true } } } } } } } }),
    tx.financeAssetImpairmentAllocation.findMany({ where: { assetId: asset.id, assessment: { period: priorWhere } }, select: { assetId: true, amount: true, assessment: { select: { status: true, period: { select: { id: true, endDate: true } }, voucher: { select: { id: true, status: true, companyCode: true, periodId: true, totalDebit: true, totalCredit: true, items: { select: { debit: true, credit: true, account: { select: { code: true } } } } } } } } } }),
    tx.financeAssetPeriodEntry.findMany({ where: { assetId: asset.id, periodId: period.id }, select: { assetId: true, normalAmount: true, status: true, voucher: { select: { id: true, status: true, companyCode: true, periodId: true, totalDebit: true, totalCredit: true, items: { select: { debit: true, credit: true, account: { select: { code: true } } } } } } } }),
    tx.financeAssetAdjustment.findMany({ where: { assetId: asset.id, companyCode: input.companyCode, periodId: period.id }, select: { assetId: true, amount: true, status: true, voucher: { select: { id: true, status: true, companyCode: true, periodId: true, totalDebit: true, totalCredit: true, items: { select: { debit: true, credit: true, account: { select: { code: true } } } } } } } }),
  ]) : [[], [], [], [], []];
  return {
    period,
    asset,
    existingDisposalId: existingDisposal?.id ?? null,
    voucher,
    policy,
    priorEntries: priorEntries.map((row) => ({ assetId: row.assetId, normalAmount: Number(row.normalAmount), status: row.status, periodId: row.period.id, periodEndDate: row.period.endDate, voucher: replayVoucher(row.voucher) })),
    priorAdjustments: priorAdjustments.map((row) => ({ assetId: row.assetId, amount: Number(row.amount), status: row.status, periodId: row.period.id, periodEndDate: row.period.endDate, voucher: replayVoucher(row.voucher) })),
    priorImpairments: priorImpairments.map((row) => ({ assetId: row.assetId, amount: Number(row.amount), status: row.assessment.status, periodId: row.assessment.period.id, periodEndDate: row.assessment.period.endDate, voucher: replayVoucher(row.assessment.voucher) })),
    currentEntries: currentEntries.map((row) => ({ assetId: row.assetId, normalAmount: Number(row.normalAmount), status: row.status, voucher: replayVoucher(row.voucher) })),
    currentAdjustments: currentAdjustments.map((row) => ({ assetId: row.assetId, amount: Number(row.amount), status: row.status, voucher: replayVoucher(row.voucher) })),
    occupiedVoucherItemIds: occupiedDisposals.flatMap((row) => [row.assetVoucherItemId, row.accumulatedVoucherItemId, row.impairmentAllowanceVoucherItemId, row.proceedsVoucherItemId, row.gainLossVoucherItemId]).filter((id): id is number => id != null),
  };
}

async function loadAssetPeriodVoucherLinkContext(tx: Prisma.TransactionClient, input: LinkFinanceAssetPeriodVoucherInput) {
  const period = await tx.financePeriod.findUnique({
    where: { companyCode_year_month: { companyCode: input.companyCode, year: input.year, month: input.month } },
    select: { id: true, isClosed: true },
  });
  if (!period) return { period: null, voucher: null, entries: [], adjustments: [] };
  const [voucher, entries, adjustments] = await Promise.all([
    tx.financeVoucher.findUnique({
      where: { voucherNo_companyCode_periodId: { voucherNo: input.voucherNo, companyCode: input.companyCode, periodId: period.id } },
      select: { id: true, voucherNo: true, periodId: true, companyCode: true, status: true, totalDebit: true, totalCredit: true, items: { select: { debit: true, credit: true, account: { select: { code: true } } } } },
    }),
    tx.financeAssetPeriodEntry.findMany({
      where: { periodId: period.id, asset: { companyCode: input.companyCode } },
      select: {
        id: true,
        assetId: true,
        voucherId: true,
        status: true,
        normalAmount: true,
        asset: { select: { categoryId: true, assetAccountCode: true, assetAccountId: true, accumulatedAccountCode: true, accumulatedAccountId: true } },
      },
    }),
    tx.financeAssetAdjustment.findMany({
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
      policies.set(categoryId, await resolveFinanceAssetCategoryPolicy(tx, { companyCode: input.companyCode, fiscalYear: input.year, categoryId }));
    } catch {
      policies.set(categoryId, null);
    }
  }));
  return {
    period,
    voucher: voucher ? { ...voucher, items: voucher.items.map((item) => ({ accountCode: item.account.code, debit: money(item.debit), credit: money(item.credit) })) } : null,
    entries: entries.map((entry) => {
      const policy = policies.get(entry.asset.categoryId) ?? null;
      const policyAccountCode = policy?.accumulatedAccount?.code ?? policy?.assetAccount.code ?? entry.asset.accumulatedAccountCode ?? entry.asset.assetAccountCode;
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
        accountCode: policyAccountCode,
        expenseAccountCode: policy?.expenseAccount?.code ?? "",
        amount: money(entry.normalAmount),
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
        amount: money(row.amount),
        policyIssue: row.status !== "confirmed" || (row.assetId != null && policy?.expenseAccount)
          ? null
          : "已确认折旧摊销调整未分配到具体资产或缺少当前年度费用科目政策",
      };
    }),
  };
}
