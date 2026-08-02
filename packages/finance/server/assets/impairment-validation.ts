import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";
import type { ConfirmFinanceAssetImpairmentAssessmentInput } from "../../types/assets";
import { assetScopeFingerprint, type AssetScopeCard } from "./period-scope";
import { findAssetImpairmentContext, findAssetImpairmentVoucher } from "./reference-adapter";
import type {
  FinanceAssetImpairmentAssessmentConfirmCommand,
  FinanceAssetImpairmentContext,
  FinanceAssetImpairmentVoucherReference,
} from "./close-validation-types";
import {
  moneyEquals,
  moneyIsNegative,
  moneyIsNonZero,
  moneyIsZero,
  moneyToCents,
  voucherItemsAreFullyConsumed,
  voucherItemsMatchHeaderExact,
} from "./money-cents";

type ImpairmentValidationDependencies = {
  findImpairmentContext?: (input: { companyCode: string; year: number; month: number }) => Promise<FinanceAssetImpairmentContext | null>;
  findImpairmentVoucher?: (input: { companyCode: string; periodId: number; voucherNo: string }) => Promise<FinanceAssetImpairmentVoucherReference | null>;
};

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

export async function buildConfirmFinanceAssetImpairmentAssessmentCommand(
  body: ConfirmFinanceAssetImpairmentAssessmentInput,
  userId: number,
  dependencies: ImpairmentValidationDependencies = {},
): Promise<DomainValidationResult<FinanceAssetImpairmentAssessmentConfirmCommand>> {
  const companyCode = text(body.companyCode);
  const basis = text(body.basis);
  const evidenceRef = text(body.evidenceRef);
  const voucherNo = text(body.voucherNo);
  if (!companyCode) return failCommand("公司为必填", 400, "companyCode");
  if (!Number.isInteger(body.year) || body.year < 2000 || body.year > 2100) return failCommand("年度无效", 400, "year");
  if (!Number.isInteger(body.month) || body.month < 1 || body.month > 12) return failCommand("月份无效", 400, "month");
  if (!Number.isInteger(body.version) || body.version < 0) return failCommand("减值评估版本无效", 400, "version");
  if (!["no_indication", "no_impairment", "impairment_recorded"].includes(body.conclusion)) return failCommand("减值评估结论无效", 400, "conclusion");
  if (!basis) return failCommand("减值评估依据为必填", 400, "basis");
  if (!evidenceRef) return failCommand("减值评估证据引用为必填", 400, "evidenceRef");
  if (!Number.isFinite(body.impairmentAmount) || moneyIsNegative(body.impairmentAmount)) return failCommand("减值金额无效", 400, "impairmentAmount");
  const context = await (dependencies.findImpairmentContext ?? findAssetImpairmentContext)({ companyCode, year: body.year, month: body.month });
  if (!context) return failCommand("会计期间不存在", 400, "month");
  if (context.period.isClosed) return failCommand("会计期间已关闭，不能确认减值评估", 409, "month");
  if (!assetImpairmentPolicySnapshotsMatch(context.cards, context.policies)) {
    return failCommand("资产科目快照与当前公司年度分类政策不一致", 409, "allocations");
  }

  let voucher: FinanceAssetImpairmentVoucherReference | null = null;
  if (body.conclusion === "impairment_recorded") {
    if (moneyToCents(body.impairmentAmount) <= 0) return failCommand("已确认减值时减值金额必须大于 0", 400, "impairmentAmount");
    if (!voucherNo) return failCommand("已确认减值时必须关联已过账凭证", 400, "voucherNo");
    voucher = await (dependencies.findImpairmentVoucher ?? findAssetImpairmentVoucher)({ companyCode, periodId: context.period.id, voucherNo });
    if (!voucher || voucher.status !== "posted") return failCommand("减值凭证不存在、未过账或不属于当前公司期间", 400, "voucherNo");
    if (!moneyEquals(voucher.totalDebit, voucher.totalCredit)
      || !moneyEquals(voucher.totalDebit, body.impairmentAmount)) {
      return failCommand("减值金额与已过账凭证借贷总额不一致", 400, "impairmentAmount");
    }
    const allocationIds = body.allocations.map((row) => row.assetId);
    if (body.allocations.length === 0 || new Set(allocationIds).size !== allocationIds.length) {
      return failCommand("已确认减值必须逐项分配到唯一资产", 400, "allocations");
    }
    const scopeIds = new Set(context.cards.map((card) => card.id));
    if (body.allocations.some((row) => !scopeIds.has(row.assetId) || !Number.isFinite(row.amount) || moneyToCents(row.amount) <= 0)) {
      return failCommand("减值分配包含范围外资产或无效金额", 400, "allocations");
    }
    const allocated = body.allocations.reduce((sum, row) => sum + row.amount, 0);
    if (!moneyEquals(allocated, body.impairmentAmount)) {
      return failCommand("逐项减值分配合计必须等于本期减值总额", 400, "allocations");
    }
    if (!impairmentVoucherLinesMatch(voucher, body.allocations, context.cards, context.policies)) {
      return failCommand("减值凭证分录必须完整匹配公司年度政策的减值损失借方与减值准备贷方", 400, "voucherNo");
    }
  } else if (moneyIsNonZero(body.impairmentAmount) || voucherNo || body.allocations.length > 0) {
    return failCommand("未确认减值时不得填写减值金额或凭证", 400, "impairmentAmount");
  }
  return okCommand({
    input: { ...body, companyCode, basis, evidenceRef, voucherNo: voucher?.voucherNo ?? null },
    userId,
    periodId: context.period.id,
    assetCount: context.cards.length,
    assetScopeFingerprint: assetScopeFingerprint(context.cards),
    voucher,
  });
}

export function assetImpairmentPolicySnapshotsMatch(
  cards: AssetScopeCard[],
  policies: FinanceAssetImpairmentContext["policies"],
) {
  const policyByCategory = new Map(policies.map((policy) => [policy.categoryId, policy]));
  return cards.every((card) => {
    const policy = policyByCategory.get(card.categoryId);
    return Boolean(policy
      && policy.assetAccountCode != null
      && policy.assetAccountId != null
      && card.assetAccountCode === policy.assetAccountCode
      && card.assetAccountId === policy.assetAccountId
      && card.accumulatedAccountCode === policy.accumulatedAccountCode
      && card.accumulatedAccountId === policy.accumulatedAccountId);
  });
}

export function impairmentVoucherLinesMatch(
  voucher: FinanceAssetImpairmentVoucherReference,
  allocations: Array<{ assetId: number; amount: number }>,
  cards: AssetScopeCard[],
  policies: FinanceAssetImpairmentContext["policies"],
) {
  const cardById = new Map(cards.map((card) => [card.id, card]));
  const policyByCategory = new Map(policies.map((policy) => [policy.categoryId, policy]));
  const expectedDebit = new Map<string, number>();
  const expectedCredit = new Map<string, number>();
  for (const allocation of allocations) {
    const card = cardById.get(allocation.assetId);
    const policy = card ? policyByCategory.get(card.categoryId) : null;
    if (!policy?.impairmentLossAccountCode || !policy.impairmentAllowanceAccountCode) return false;
    addAmount(expectedDebit, policy.impairmentLossAccountCode, allocation.amount);
    addAmount(expectedCredit, policy.impairmentAllowanceAccountCode, allocation.amount);
  }
  const actualDebit = new Map<string, number>();
  const actualCredit = new Map<string, number>();
  for (const item of voucher.items) {
    addAmount(actualDebit, item.accountCode, item.debit);
    addAmount(actualCredit, item.accountCode, item.credit);
  }
  const expectedAccounts = new Set([...expectedDebit.keys(), ...expectedCredit.keys()]);
  if (voucher.items.some((item) => !expectedAccounts.has(item.accountCode))) return false;
  if (!voucherItemsMatchHeaderExact(voucher)
    || !voucherItemsAreFullyConsumed(voucher, new Set(expectedDebit.keys()), new Set(expectedCredit.keys()))) return false;
  return [...expectedDebit].every(([code, value]) => moneyEquals(actualDebit.get(code) ?? 0, value) && moneyIsZero(actualCredit.get(code) ?? 0))
    && [...expectedCredit].every(([code, value]) => moneyEquals(actualCredit.get(code) ?? 0, value) && moneyIsZero(actualDebit.get(code) ?? 0));
}

function addAmount(map: Map<string, number>, key: string, amount: number) {
  map.set(key, Math.round((((map.get(key) ?? 0) + amount) + Number.EPSILON) * 100) / 100);
}
