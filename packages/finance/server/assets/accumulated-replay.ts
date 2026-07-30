import { createHash } from "node:crypto";
import { moneyEquals, moneyIsNegative, moneyIsNonZero, voucherItemsMatchHeaderExact } from "./money-cents";

export type AssetAccumulatedReplayInput = {
  assetId: number;
  companyCode: string;
  openingAccumulatedAmount: unknown;
  openingImpairmentAmount?: unknown;
  openingIncludesImpairment?: boolean;
  openingAsOfDate: string | null;
  priorEntries: Array<{ assetId: number; normalAmount: unknown; status: string; periodId: number; periodEndDate: string; voucher: AssetReplayVoucherFact | null }>;
  priorAdjustments: Array<{ assetId: number | null; amount: unknown; status: string; periodId: number; periodEndDate: string; voucher: AssetReplayVoucherFact | null }>;
  priorImpairments: Array<{ assetId: number; amount: unknown; periodId: number; periodEndDate: string; status: string; voucher: AssetReplayVoucherFact | null }>;
};

export type AssetReplayVoucherFact = {
  id: number;
  status: string;
  companyCode: string;
  periodId: number;
  totalDebit: unknown;
  totalCredit: unknown;
  items: Array<{ accountCode: string; debit: unknown; credit: unknown }>;
};

export type AssetAccumulatedReplayResult = {
  accumulatedBefore: number;
  impairmentBefore: number;
  basisFingerprint: string;
  blockers: string[];
};

const money = (value: unknown) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

/** Replays only governed facts after the opening balance cut-off. */
export function replayAssetAccumulatedAmounts(input: AssetAccumulatedReplayInput): AssetAccumulatedReplayResult {
  const opening = money(input.openingAccumulatedAmount);
  const openingImpairment = money(input.openingImpairmentAmount ?? 0);
  const blockers: string[] = [];
  if (moneyIsNonZero(opening) && !input.openingAsOfDate) {
    blockers.push("期初累计金额缺少截止日期，无法排除历史条目重复累计");
  }
  const afterOpening = (periodEndDate: string) => !input.openingAsOfDate || periodEndDate > input.openingAsOfDate;
  let accumulatedBefore = opening;
  for (const entry of input.priorEntries) {
    if (entry.assetId !== input.assetId || !afterOpening(entry.periodEndDate)) continue;
    if (moneyIsNonZero(entry.normalAmount) && entry.status !== "posted") {
      blockers.push(`历史折旧摊销条目状态 ${entry.status} 未过账`);
    }
    if (moneyIsNonZero(entry.normalAmount) && !assetReplayVoucherIsControlled(entry.voucher, input.companyCode, entry.periodId)) {
      blockers.push("历史折旧摊销条目缺少同公司同期间的已过账凭证事实");
    }
    accumulatedBefore = money(accumulatedBefore + money(entry.normalAmount));
  }
  for (const adjustment of input.priorAdjustments) {
    if (!afterOpening(adjustment.periodEndDate)) continue;
    if (adjustment.assetId == null) {
      if (adjustment.status === "confirmed" && moneyIsNonZero(adjustment.amount)) blockers.push("历史折旧摊销调整未分配到具体资产，无法重放累计金额");
      continue;
    }
    if (adjustment.assetId !== input.assetId) continue;
    if (adjustment.status === "confirmed") {
      if (moneyIsNonZero(adjustment.amount) && !assetReplayVoucherIsControlled(adjustment.voucher, input.companyCode, adjustment.periodId)) {
        blockers.push("历史折旧摊销调整缺少同公司同期间的已过账凭证事实");
      }
      accumulatedBefore = money(accumulatedBefore + money(adjustment.amount));
    }
    else if (adjustment.status !== "reversed") blockers.push(`历史折旧摊销调整状态 ${adjustment.status} 未确认`);
  }
  const relevantImpairments = input.priorImpairments.filter((row) => row.assetId === input.assetId
    && (!input.openingIncludesImpairment || afterOpening(row.periodEndDate)));
  for (const impairment of relevantImpairments) {
    if (impairment.status !== "confirmed" || moneyIsNonZero(impairment.amount) && !assetReplayVoucherIsControlled(impairment.voucher, input.companyCode, impairment.periodId)) {
      blockers.push("历史资产减值缺少已确认评估或同公司同期间的已过账凭证事实");
    }
  }
  const impairmentBefore = money(openingImpairment + relevantImpairments
    .filter((row) => row.assetId === input.assetId)
    .reduce((sum, row) => sum + money(row.amount), 0));
  if (moneyIsNegative(accumulatedBefore) || moneyIsNegative(impairmentBefore)) blockers.push("历史累计折旧摊销或减值金额为负，无法重放");
  const basisPayload = {
    assetId: input.assetId,
    openingAccumulatedAmount: money(input.openingAccumulatedAmount),
    openingImpairmentAmount: openingImpairment,
    openingIncludesImpairment: Boolean(input.openingIncludesImpairment),
    openingAsOfDate: input.openingAsOfDate,
    priorEntries: canonicalRows(input.priorEntries.filter((row) => row.assetId === input.assetId && afterOpening(row.periodEndDate))
      .map((row) => ({ amount: money(row.normalAmount), status: row.status, periodId: row.periodId, periodEndDate: row.periodEndDate, voucher: voucherFingerprintFact(row.voucher) }))),
    priorAdjustments: canonicalRows(input.priorAdjustments.filter((row) => (row.assetId == null || row.assetId === input.assetId) && afterOpening(row.periodEndDate))
      .map((row) => ({ assetId: row.assetId, amount: money(row.amount), status: row.status, periodId: row.periodId, periodEndDate: row.periodEndDate, voucher: voucherFingerprintFact(row.voucher) }))),
    priorImpairments: canonicalRows(input.priorImpairments.filter((row) => row.assetId === input.assetId)
      .map((row) => ({ amount: money(row.amount), status: row.status, periodId: row.periodId, periodEndDate: row.periodEndDate, voucher: voucherFingerprintFact(row.voucher) }))),
  };
  return {
    accumulatedBefore: money(Math.max(0, accumulatedBefore)),
    impairmentBefore: money(Math.max(0, impairmentBefore)),
    blockers: [...new Set(blockers)].sort((left, right) => left.localeCompare(right)),
    basisFingerprint: createHash("sha256").update(JSON.stringify(basisPayload)).digest("hex"),
  };
}

export function assetReplayVoucherIsControlled(voucher: AssetReplayVoucherFact | null, companyCode: string, periodId: number) {
  if (!voucher || voucher.status !== "posted" || voucher.companyCode !== companyCode || voucher.periodId !== periodId) return false;
  return moneyEquals(voucher.totalDebit, voucher.totalCredit)
    && voucherItemsMatchHeaderExact(voucher);
}

function voucherFingerprintFact(voucher: AssetReplayVoucherFact | null) {
  return voucher ? {
    id: voucher.id,
    status: voucher.status,
    companyCode: voucher.companyCode,
    periodId: voucher.periodId,
    totalDebit: money(voucher.totalDebit),
    totalCredit: money(voucher.totalCredit),
    items: voucher.items.map((item) => ({ accountCode: item.accountCode, debit: money(item.debit), credit: money(item.credit) }))
      .sort((left, right) => left.accountCode.localeCompare(right.accountCode) || left.debit - right.debit || left.credit - right.credit),
  } : null;
}

function canonicalRows<T>(rows: T[]): T[] {
  return rows.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}
