import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";
import type { ConfirmFinanceAssetDisposalInput } from "../../types/assets";
import { assetReplayVoucherIsControlled, replayAssetAccumulatedAmounts } from "./accumulated-replay";
import type { FinanceAssetDisposalConfirmCommand, FinanceAssetDisposalContext, FinanceAssetImpairmentVoucherReference } from "./close-validation-types";
import { dateInFinanceClosePeriod } from "./period-scope";
import { findAssetDisposalContext } from "./reference-adapter";
import { moneyEquals, moneyIsNegative, moneyIsNonZero, moneyIsZero, moneyToCents, voucherItemsMatchHeaderExact } from "./money-cents";

type DisposalValidationDependencies = {
  findDisposalContext?: (input: ConfirmFinanceAssetDisposalInput) => Promise<FinanceAssetDisposalContext>;
};

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

export async function buildConfirmFinanceAssetDisposalCommand(
  body: ConfirmFinanceAssetDisposalInput,
  userId: number,
  dependencies: DisposalValidationDependencies = {},
): Promise<DomainValidationResult<FinanceAssetDisposalConfirmCommand>> {
  const companyCode = text(body.companyCode);
  const reason = text(body.reason);
  const evidenceRef = text(body.evidenceRef);
  const voucherNo = text(body.voucherNo);
  if (!companyCode) return failCommand("公司为必填", 400, "companyCode");
  if (!Number.isInteger(body.year) || body.year < 2000 || body.year > 2100) return failCommand("年度无效", 400, "year");
  if (!Number.isInteger(body.month) || body.month < 1 || body.month > 12) return failCommand("月份无效", 400, "month");
  if (!Number.isInteger(body.assetId) || body.assetId <= 0) return failCommand("资产卡片无效", 400, "assetId");
  if (!Number.isInteger(body.assetVersion) || body.assetVersion <= 0) return failCommand("资产版本无效", 400, "assetVersion");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.disposalDate) || !dateInFinanceClosePeriod(body.disposalDate, body)) return failCommand("处置日期必须属于当前会计期间", 400, "disposalDate");
  if (!["sold", "scrapped", "retired", "other"].includes(body.disposalType)) return failCommand("处置类型无效", 400, "disposalType");
  if (!Number.isFinite(body.proceedsAmount) || moneyIsNegative(body.proceedsAmount)) return failCommand("处置收入无效", 400, "proceedsAmount");
  if (!reason) return failCommand("处置原因必填", 400, "reason");
  if (!evidenceRef) return failCommand("处置证据引用必填", 400, "evidenceRef");
  if (!voucherNo) return failCommand("处置凭证号必填", 400, "voucherNo");
  const context = await (dependencies.findDisposalContext ?? findAssetDisposalContext)({ ...body, companyCode, reason, evidenceRef, voucherNo });
  if (!context.period) return failCommand("会计期间不存在", 400, "month");
  if (context.period.isClosed) return failCommand("会计期间已关闭，不能确认资产处置", 409, "month");
  const periodId = context.period.id;
  if (!context.asset || context.asset.companyCode !== companyCode) return failCommand("资产卡片不存在或不属于当前公司", 400, "assetId");
  if (context.asset.version !== body.assetVersion) return failCommand("资产卡片已被其他人修改，请刷新后重试", 409, "assetVersion");
  if (context.asset.status !== "active") return failCommand("只有使用中的资产可以确认处置", 409, "assetId");
  if (context.asset.acquisitionDate && body.disposalDate < context.asset.acquisitionDate) return failCommand("处置日期不能早于取得日期", 400, "disposalDate");
  if (context.existingDisposalId) return failCommand("资产已存在已确认处置事实", 409, "assetId");
  if (!context.voucher || context.voucher.status !== "posted") return failCommand("处置凭证不存在、未过账或不属于当前公司期间", 400, "voucherNo");
  if (!context.policy) return failCommand("当前公司年度资产分类政策无法解析，不能确认处置", 409, "assetId");
  if (context.asset.assetAccountCode !== context.policy.assetAccountCode
    || context.asset.assetAccountId !== context.policy.assetAccountId
    || context.asset.accumulatedAccountCode !== context.policy.accumulatedAccountCode
    || context.asset.accumulatedAccountId !== context.policy.accumulatedAccountId) {
    return failCommand("资产科目快照与当前公司年度分类政策不一致", 409, "assetId");
  }
  const replay = replayAssetAccumulatedAmounts({
    assetId: context.asset.id,
    companyCode,
    openingAccumulatedAmount: context.asset.openingAccumulatedAmount,
    openingAsOfDate: context.asset.openingAsOfDate,
    priorEntries: context.priorEntries,
    priorAdjustments: context.priorAdjustments,
    priorImpairments: context.priorImpairments,
  });
  if (replay.blockers.length) return failCommand(`资产累计金额无法重放：${replay.blockers.join("；")}`, 409, "assetId");
  if (context.currentEntries.some((row) => row.assetId === context.asset!.id && moneyIsNonZero(row.normalAmount)
    && (row.status !== "posted" || !assetReplayVoucherIsControlled(row.voucher, companyCode, periodId)))) {
    return failCommand("本期折旧摊销尚未通过同公司同期间的完整已过账凭证，不能确认处置", 409, "assetId");
  }
  if (context.currentAdjustments.some((row) => row.assetId === context.asset!.id && row.status === "confirmed" && moneyIsNonZero(row.amount)
    && !assetReplayVoucherIsControlled(row.voucher, companyCode, periodId))) {
    return failCommand("本期折旧摊销调整尚未通过同公司同期间的完整已过账凭证，不能确认处置", 409, "assetId");
  }
  const currentAccumulated = context.currentEntries.filter((row) => row.assetId === context.asset!.id).reduce((sum, row) => sum + row.normalAmount, 0)
    + context.currentAdjustments.filter((row) => row.assetId === context.asset!.id && row.status === "confirmed").reduce((sum, row) => sum + row.amount, 0);
  const accumulated = Math.round((replay.accumulatedBefore + currentAccumulated + Number.EPSILON) * 100) / 100;
  const gainLoss = Math.round((context.asset.originalCost - accumulated - replay.impairmentBefore - body.proceedsAmount + Number.EPSILON) * 100) / 100;
  const voucherItems = resolveDisposalVoucherItems({ voucher: context.voucher, policy: context.policy, originalCost: context.asset.originalCost, accumulated, impairment: replay.impairmentBefore, proceeds: body.proceedsAmount, gainLoss, occupiedVoucherItemIds: context.occupiedVoucherItemIds });
  if (!voucherItems) return failCommand("处置凭证必须以唯一分录完整满足原值、累计金额、减值、收入和损益恒等式，且分录不得被其他处置复用", 400, "voucherNo");
  return okCommand({ input: { ...body, companyCode, reason, evidenceRef, voucherNo }, userId, periodId, voucherId: context.voucher.id, voucherItems });
}

function resolveDisposalVoucherItems(input: {
  voucher: FinanceAssetImpairmentVoucherReference;
  policy: NonNullable<FinanceAssetDisposalContext["policy"]>;
  originalCost: number;
  accumulated: number;
  impairment: number;
  proceeds: number;
  gainLoss: number;
  occupiedVoucherItemIds: number[];
}) {
  if (!moneyEquals(input.voucher.totalDebit, input.voucher.totalCredit) || !voucherItemsMatchHeaderExact(input.voucher)) return null;
  const previouslyOccupied = new Set(input.occupiedVoucherItemIds);
  if (input.voucher.items.some((item) => previouslyOccupied.has(item.id))) return null;
  const occupied = new Set<number>();
  const findUnique = (predicate: (item: FinanceAssetImpairmentVoucherReference["items"][number]) => boolean) => {
    const rows = input.voucher.items.filter((item) => !occupied.has(item.id) && predicate(item));
    return rows.length === 1 ? rows[0]! : null;
  };
  const asset = findUnique((item) => item.accountCode === input.policy.assetAccountCode
    && moneyEquals(item.credit, input.originalCost) && moneyIsZero(item.debit));
  if (!asset) return null;
  occupied.add(asset.id);
  const accumulated = moneyIsZero(input.accumulated) ? null : input.policy.accumulatedAccountCode
    ? findUnique((item) => item.accountCode === input.policy.accumulatedAccountCode
      && moneyEquals(item.debit, input.accumulated) && moneyIsZero(item.credit)) : null;
  if (moneyIsNonZero(input.accumulated) && !accumulated) return null;
  if (accumulated) occupied.add(accumulated.id);
  const allowance = moneyIsZero(input.impairment) ? null : input.policy.impairmentAllowanceAccountCode
    ? findUnique((item) => item.accountCode === input.policy.impairmentAllowanceAccountCode
      && moneyEquals(item.debit, input.impairment) && moneyIsZero(item.credit)) : null;
  if (moneyIsNonZero(input.impairment) && !allowance) return null;
  if (allowance) occupied.add(allowance.id);
  const gainLoss = moneyIsZero(input.gainLoss) ? null : input.policy.disposalGainLossAccountCode
    ? findUnique((item) => item.accountCode === input.policy.disposalGainLossAccountCode && disposalGainLossLineMatches(item, input.gainLoss)) : null;
  if (moneyIsNonZero(input.gainLoss) && !gainLoss) return null;
  if (gainLoss) occupied.add(gainLoss.id);
  const proceeds = moneyIsZero(input.proceeds) ? null : findUnique((item) => moneyEquals(item.debit, input.proceeds) && moneyIsZero(item.credit));
  if (moneyIsNonZero(input.proceeds) && !proceeds) return null;
  if (proceeds) occupied.add(proceeds.id);
  if (occupied.size !== input.voucher.items.length) return null;
  return { assetVoucherItemId: asset.id, accumulatedVoucherItemId: accumulated?.id ?? null, impairmentAllowanceVoucherItemId: allowance?.id ?? null, proceedsVoucherItemId: proceeds?.id ?? null, gainLossVoucherItemId: gainLoss?.id ?? null };
}

function disposalGainLossLineMatches(
  item: FinanceAssetImpairmentVoucherReference["items"][number],
  gainLoss: number,
) {
  const cents = moneyToCents(gainLoss);
  return cents > 0
    ? moneyEquals(item.debit, gainLoss) && moneyIsZero(item.credit)
    : moneyIsZero(item.debit) && moneyToCents(item.credit) === -cents;
}
