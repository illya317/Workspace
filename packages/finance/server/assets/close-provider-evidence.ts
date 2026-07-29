import type { AssetAccumulatedReplayInput } from "./accumulated-replay";
import type { AssetScopeCard } from "./period-scope";
import {
  moneyEquals,
  moneyIsNonZero,
  moneyIsZero,
  moneyToCents,
  voucherItemsAreFullyConsumed,
  voucherItemsMatchHeaderExact,
} from "./money-cents";

export type AssetDepreciationVoucherFact = {
  id: number;
  voucherNo: string;
  status: string;
  companyCode: string;
  periodId: number;
  totalDebit: number;
  totalCredit: number;
  items: Array<{ id: number; accountCode: string; debit: number; credit: number }>;
};

export type AssetCloseCard = AssetScopeCard & {
  companyCode: string;
  companyId: number | null;
  assetCode: string;
  name: string;
  assetKind: string;
  nonAmortizationReason: string | null;
  openingAccumulatedAmount: unknown;
  initializationMode?: string;
  openingImpairmentAmount?: unknown;
  openingNetBookValue?: unknown;
  cutoverDate?: string | null;
  remainingUsefulLifeMonthsAtCutover?: number | null;
  cutoverResidualValue?: unknown;
  cutoverAllocationStatus?: string | null;
  cutoverReconciliationFingerprint?: string | null;
  sourceFile: string | null;
  sourceRow: number | null;
  acquisitionEvidence: {
    id: number;
    companyCode: string;
    companyId: number | null;
    periodId: number;
    amount: number;
    sourceChecksum: string | null;
    evidenceRef: string;
    confirmedBy: number | null;
    confirmedAt: string;
    version: number;
    voucherItem: ({ id: number; accountCode: string; debit: number; credit: number; voucher: AssetDepreciationVoucherFact }) | null;
    importBatch: ({ id: number; companyCode: string; companyId: number | null; sourceFile: string; checksum: string; status: string }) | null;
  } | null;
  disposal: {
    id: number;
    companyCode: string;
    companyId: number | null;
    periodId: number;
    disposalDate: string;
    disposalType: string;
    proceedsAmount: number;
    reason: string;
    evidenceRef: string;
    status: string;
    confirmedBy: number;
    confirmedAt: string;
    version: number;
    voucherId: number;
    assetVoucherItemId: number | null;
    accumulatedVoucherItemId: number | null;
    impairmentAllowanceVoucherItemId: number | null;
    proceedsVoucherItemId: number | null;
    gainLossVoucherItemId: number | null;
    voucher: AssetDepreciationVoucherFact;
  } | null;
  category: { code: string; name: string; depreciable: boolean };
};

export type AssetPeriodEntryFact = {
  id: number;
  assetId: number;
  normalAmount: number;
  status: string;
  voucher: AssetDepreciationVoucherFact | null;
};

export type AssetAdjustmentFact = {
  id: number;
  assetId: number | null;
  accountCode: string;
  amount: number;
  status: string;
  voucher: AssetDepreciationVoucherFact | null;
};

type AssetPriorEntryFact = AssetAccumulatedReplayInput["priorEntries"][number];
type AssetPriorAdjustmentFact = AssetAccumulatedReplayInput["priorAdjustments"][number];
type AssetPriorImpairmentFact = AssetAccumulatedReplayInput["priorImpairments"][number];

export type AssetPolicyFact = {
  categoryId: number;
  policyId: number;
  assetAccountCode: string;
  assetAccountId: number;
  accumulatedAccountCode: string | null;
  accumulatedAccountId: number | null;
  expenseAccountCode: string | null;
  impairmentLossAccountCode: string | null;
  impairmentAllowanceAccountCode: string | null;
  disposalGainLossAccountCode: string | null;
};

export type AssetImpairmentFact = {
  id: number;
  conclusion: string;
  basis: string;
  evidenceRef: string;
  impairmentAmount: number;
  assetScopeFingerprint: string;
  assetCount: number;
  calculationBasisFingerprint: string;
  status: string;
  version: number;
  voucher: AssetDepreciationVoucherFact | null;
  allocations: Array<{ assetId: number; amount: number }>;
};

export type AssetMovementCloseFacts = {
  period: { id: number } | null;
  cards: AssetCloseCard[];
  policies: AssetPolicyFact[];
  applicabilityEstablished: boolean;
  assetGlBalance: number;
  entries: AssetPeriodEntryFact[];
  adjustments: AssetAdjustmentFact[];
  priorEntries: AssetPriorEntryFact[];
  priorAdjustments: AssetPriorAdjustmentFact[];
  priorImpairments: AssetPriorImpairmentFact[];
};

export type AssetDepreciationCloseFacts = AssetMovementCloseFacts & {
  ledgerByAccount: Array<{ accountCode: string; amount: number }>;
};

export type AssetImpairmentCloseFacts = {
  period: { id: number } | null;
  cards: AssetCloseCard[];
  assessment: AssetImpairmentFact | null;
  entries: AssetPeriodEntryFact[];
  adjustments: AssetAdjustmentFact[];
  priorEntries: AssetPriorEntryFact[];
  priorAdjustments: AssetPriorAdjustmentFact[];
  priorImpairments: AssetPriorImpairmentFact[];
  policies: AssetPolicyFact[];
};

const money = (value: unknown) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export function postedVoucherInScope(voucher: { status: string; companyCode: string; periodId: number } | null, periodId: number, companyCode: string) {
  return Boolean(voucher && voucher.status === "posted" && voucher.periodId === periodId && voucher.companyCode === companyCode);
}

export function resolveConfirmedDisposalDate(card: AssetCloseCard) {
  return card.disposal?.status === "confirmed" ? card.disposal.disposalDate : null;
}

export function acquisitionEvidenceSummary(evidence: NonNullable<AssetCloseCard["acquisitionEvidence"]>) {
  return {
    id: evidence.id,
    companyCode: evidence.companyCode,
    companyId: evidence.companyId,
    periodId: evidence.periodId,
    amount: money(evidence.amount),
    sourceChecksum: evidence.sourceChecksum,
    evidenceRef: evidence.evidenceRef,
    confirmedBy: evidence.confirmedBy,
    confirmedAt: evidence.confirmedAt,
    version: evidence.version,
    voucherItem: evidence.voucherItem ? {
      id: evidence.voucherItem.id,
      accountCode: evidence.voucherItem.accountCode,
      debit: money(evidence.voucherItem.debit),
      credit: money(evidence.voucherItem.credit),
      voucher: fullVoucherSummary(evidence.voucherItem.voucher),
    } : null,
    importBatch: evidence.importBatch,
  };
}

export function disposalVoucherMatches(input: {
  card: AssetCloseCard;
  disposal: NonNullable<AssetCloseCard["disposal"]>;
  policy: AssetPolicyFact;
  accumulated: number;
  impairment: number;
  gainLoss: number;
  periodId: number;
  companyCode: string;
}) {
  const { card, disposal, policy } = input;
  const voucher = disposal.voucher;
  if (disposal.periodId !== input.periodId || !postedVoucherInScope(voucher, input.periodId, input.companyCode)
    || !moneyEquals(voucher.totalDebit, voucher.totalCredit) || !voucherItemsMatchTotals(voucher)) return false;
  const roles = [
    { required: true, id: disposal.assetVoucherItemId },
    { required: moneyIsNonZero(input.accumulated), id: disposal.accumulatedVoucherItemId },
    { required: moneyIsNonZero(input.impairment), id: disposal.impairmentAllowanceVoucherItemId },
    { required: moneyIsNonZero(disposal.proceedsAmount), id: disposal.proceedsVoucherItemId },
    { required: moneyIsNonZero(input.gainLoss), id: disposal.gainLossVoucherItemId },
  ];
  if (roles.some((role) => role.required !== (role.id != null))) return false;
  const expectedIds = roles.flatMap((role) => role.id == null ? [] : [role.id]);
  if (new Set(expectedIds).size !== expectedIds.length
    || new Set(voucher.items.map((item) => item.id)).size !== voucher.items.length
    || voucher.items.length !== expectedIds.length) return false;
  const byId = new Map(voucher.items.map((item) => [item.id, item]));
  const assetItem = disposal.assetVoucherItemId ? byId.get(disposal.assetVoucherItemId) : null;
  const accumulatedItem = disposal.accumulatedVoucherItemId ? byId.get(disposal.accumulatedVoucherItemId) : null;
  const allowanceItem = disposal.impairmentAllowanceVoucherItemId ? byId.get(disposal.impairmentAllowanceVoucherItemId) : null;
  const proceedsItem = disposal.proceedsVoucherItemId ? byId.get(disposal.proceedsVoucherItemId) : null;
  const gainLossItem = disposal.gainLossVoucherItemId ? byId.get(disposal.gainLossVoucherItemId) : null;
  if (!assetItem || assetItem.accountCode !== policy.assetAccountCode || !moneyEquals(assetItem.credit, card.originalCost) || !moneyIsZero(assetItem.debit)) return false;
  if (moneyIsNonZero(input.accumulated) && (!accumulatedItem || !policy.accumulatedAccountCode || accumulatedItem.accountCode !== policy.accumulatedAccountCode || !moneyEquals(accumulatedItem.debit, input.accumulated) || !moneyIsZero(accumulatedItem.credit))) return false;
  if (moneyIsNonZero(input.impairment) && (!allowanceItem || !policy.impairmentAllowanceAccountCode || allowanceItem.accountCode !== policy.impairmentAllowanceAccountCode || !moneyEquals(allowanceItem.debit, input.impairment) || !moneyIsZero(allowanceItem.credit))) return false;
  if (moneyIsNonZero(disposal.proceedsAmount) && (!proceedsItem || !moneyEquals(proceedsItem.debit, disposal.proceedsAmount) || !moneyIsZero(proceedsItem.credit))) return false;
  if (moneyIsNonZero(input.gainLoss) && (!gainLossItem || !policy.disposalGainLossAccountCode || gainLossItem.accountCode !== policy.disposalGainLossAccountCode || !disposalGainLossLineMatches(gainLossItem, input.gainLoss))) return false;
  return true;
}

export function impairmentVoucherMatches(
  voucher: AssetImpairmentFact["voucher"],
  periodId: number,
  companyCode: string,
  amount: number,
  allocations: AssetImpairmentFact["allocations"],
  cards: AssetCloseCard[],
  policies: AssetPolicyFact[],
) {
  if (!voucher || !postedVoucherInScope(voucher, periodId, companyCode)
    || !moneyEquals(voucher.totalDebit, voucher.totalCredit)
    || !moneyEquals(voucher.totalDebit, amount)) return false;
  const cardById = new Map(cards.map((card) => [card.id, card]));
  const policyByCategory = new Map(policies.map((policy) => [policy.categoryId, policy]));
  const expectedDebit = new Map<string, number>();
  const expectedCredit = new Map<string, number>();
  for (const allocation of allocations) {
    const card = cardById.get(allocation.assetId);
    const policy = card ? policyByCategory.get(card.categoryId) : null;
    if (!policy?.impairmentLossAccountCode || !policy.impairmentAllowanceAccountCode) return false;
    accumulateAmount(expectedDebit, policy.impairmentLossAccountCode, allocation.amount);
    accumulateAmount(expectedCredit, policy.impairmentAllowanceAccountCode, allocation.amount);
  }
  const actualDebit = new Map<string, number>();
  const actualCredit = new Map<string, number>();
  for (const item of voucher.items) {
    accumulateAmount(actualDebit, item.accountCode, item.debit);
    accumulateAmount(actualCredit, item.accountCode, item.credit);
  }
  const expectedAccounts = new Set([...expectedDebit.keys(), ...expectedCredit.keys()]);
  if (voucher.items.some((item) => !expectedAccounts.has(item.accountCode))) return false;
  if (!voucherItemsMatchHeaderExact(voucher)
    || !voucherItemsAreFullyConsumed(voucher, new Set(expectedDebit.keys()), new Set(expectedCredit.keys()))) return false;
  return [...expectedDebit].every(([code, value]) => moneyEquals(actualDebit.get(code) ?? 0, value) && moneyIsZero(actualCredit.get(code) ?? 0))
    && [...expectedCredit].every(([code, value]) => moneyEquals(actualCredit.get(code) ?? 0, value) && moneyIsZero(actualDebit.get(code) ?? 0));
}

export function scopedVoucherSummary(voucher: { id: number; status: string; companyCode: string; periodId: number }) {
  return { voucherId: voucher.id, status: voucher.status, companyCode: voucher.companyCode, periodId: voucher.periodId };
}

export function fullVoucherSummary(voucher: AssetDepreciationVoucherFact) {
  return {
    ...scopedVoucherSummary(voucher),
    totalDebit: money(voucher.totalDebit),
    totalCredit: money(voucher.totalCredit),
    items: voucher.items.map((item) => ({ id: item.id, accountCode: item.accountCode, debit: money(item.debit), credit: money(item.credit) }))
      .sort((left, right) => left.id - right.id),
  };
}

export function voucherItemsMatchTotals(voucher: AssetDepreciationVoucherFact) {
  return voucherItemsMatchHeaderExact(voucher);
}

export function uniqueDepreciationVouchers(vouchers: Array<AssetDepreciationVoucherFact | null>) {
  const byId = new Map(vouchers.flatMap((voucher) => voucher ? [[voucher.id, voucher] as const] : []));
  return [...byId.values()].map((voucher) => ({
    ...scopedVoucherSummary(voucher), totalDebit: money(voucher.totalDebit), totalCredit: money(voucher.totalCredit),
    items: voucher.items.map((item) => ({ accountCode: item.accountCode, debit: money(item.debit), credit: money(item.credit) }))
      .sort((left, right) => left.accountCode.localeCompare(right.accountCode) || left.debit - right.debit || left.credit - right.credit),
  })).sort((left, right) => left.voucherId - right.voucherId);
}

export function impairmentVoucherSummary(voucher: NonNullable<AssetImpairmentFact["voucher"]>) {
  return {
    ...scopedVoucherSummary(voucher),
    totalDebit: money(voucher.totalDebit),
    totalCredit: money(voucher.totalCredit),
    items: voucher.items.map((item) => ({ id: item.id, accountCode: item.accountCode, debit: money(item.debit), credit: money(item.credit) }))
      .sort((left, right) => left.id - right.id || left.accountCode.localeCompare(right.accountCode) || left.debit - right.debit || left.credit - right.credit),
  };
}

export function policySnapshotMatches(card: AssetCloseCard, policy: AssetPolicyFact) {
  return card.assetAccountCode === policy.assetAccountCode
    && card.assetAccountId === policy.assetAccountId
    && card.accumulatedAccountCode === policy.accumulatedAccountCode
    && card.accumulatedAccountId === policy.accumulatedAccountId;
}

export function relevantPolicies(cards: AssetCloseCard[], policies: AssetPolicyFact[]) {
  const categoryIds = new Set(cards.map((card) => card.categoryId));
  return policies.filter((policy) => categoryIds.has(policy.categoryId)).sort((left, right) => left.policyId - right.policyId);
}

export function accumulateAmount(map: Map<string, number>, key: string, amount: number) {
  map.set(key, money((map.get(key) ?? 0) + amount));
}

function disposalGainLossLineMatches(item: AssetDepreciationVoucherFact["items"][number], gainLoss: number) {
  const cents = moneyToCents(gainLoss);
  return cents > 0
    ? moneyEquals(item.debit, gainLoss) && moneyIsZero(item.credit)
    : moneyIsZero(item.debit) && moneyToCents(item.credit) === -cents;
}
