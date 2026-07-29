import { createHash } from "node:crypto";

export type AssetScopeCard = {
  id: number;
  version: number;
  status: string;
  categoryId: number;
  acquisitionDate: string | null;
  depreciationStartDate: string | null;
  originalCost: unknown;
  residualRate: unknown;
  usefulLifeMonths: number | null;
  method: string;
  assetAccountCode: string;
  assetAccountId: number | null;
  accumulatedAccountCode: string | null;
  accumulatedAccountId: number | null;
  openingAsOfDate: string | null;
};

export function assetScopeFingerprint(cards: AssetScopeCard[]) {
  const payload = cards
    .map((card) => ({
      id: card.id,
      version: card.version,
      status: card.status,
      categoryId: card.categoryId,
      acquisitionDate: card.acquisitionDate,
      depreciationStartDate: card.depreciationStartDate,
      originalCost: Number(card.originalCost).toFixed(2),
      residualRate: Number(card.residualRate).toFixed(6),
      usefulLifeMonths: card.usefulLifeMonths,
      method: card.method,
      assetAccountCode: card.assetAccountCode,
      assetAccountId: card.assetAccountId,
      accumulatedAccountCode: card.accumulatedAccountCode,
      accumulatedAccountId: card.accumulatedAccountId,
      openingAsOfDate: card.openingAsOfDate,
    }))
    .sort((left, right) => left.id - right.id);
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function financeClosePeriodBounds(scope: { year: number; month: number }) {
  const start = `${scope.year}-${String(scope.month).padStart(2, "0")}-01`;
  const end = new Date(Date.UTC(scope.year, scope.month, 0)).toISOString().slice(0, 10);
  return { start, end };
}

export function dateInFinanceClosePeriod(value: string | null, scope: { year: number; month: number }) {
  if (!value) return false;
  const { start, end } = financeClosePeriodBounds(scope);
  return value >= start && value <= end;
}

export function assetPeriodVoucherLinkFingerprint(input: {
  entries: Array<{
    id: number;
    voucherId: number | null;
    status: string;
    accountCode: string;
    expenseAccountCode: string;
    amount: unknown;
  }>;
  adjustments: Array<{
    id: number;
    voucherId: number | null;
    status: string;
    accountCode: string;
    expenseAccountCode: string | null;
    amount: unknown;
  }>;
}) {
  const payload = {
    entries: input.entries.map((row) => ({
      id: row.id,
      voucherId: row.voucherId,
      status: row.status,
      accountCode: row.accountCode,
      expenseAccountCode: row.expenseAccountCode,
      amount: Number(row.amount).toFixed(2),
    })).sort((left, right) => left.id - right.id),
    adjustments: input.adjustments.map((row) => ({
      id: row.id,
      voucherId: row.voucherId,
      status: row.status,
      accountCode: row.accountCode,
      expenseAccountCode: row.expenseAccountCode,
      amount: Number(row.amount).toFixed(2),
    })).sort((left, right) => left.id - right.id),
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function assetImpairmentCalculationBasisFingerprint(input: {
  assets: Array<{ assetId: number; replayFingerprint: string }>;
  entries: Array<{ id: number; assetId: number; amount: unknown; status: string; voucherId: number | null }>;
  adjustments: Array<{ id: number; assetId: number | null; amount: unknown; status: string; voucherId: number | null }>;
}) {
  const payload = {
    assets: input.assets.slice().sort((left, right) => left.assetId - right.assetId),
    entries: input.entries.map((row) => ({ ...row, amount: Number(row.amount).toFixed(2) })).sort((left, right) => left.id - right.id),
    adjustments: input.adjustments.map((row) => ({ ...row, amount: Number(row.amount).toFixed(2) })).sort((left, right) => left.id - right.id),
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}
