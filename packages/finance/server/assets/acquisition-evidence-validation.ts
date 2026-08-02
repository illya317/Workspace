import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";
import type { ConfirmFinanceAssetAcquisitionEvidenceInput } from "../../types/assets";
import { dateInFinanceClosePeriod } from "./period-scope";
import { findAssetAcquisitionContext } from "./reference-adapter";
import { moneyEquals, moneyIsZero, moneyToCents, voucherItemsMatchHeaderExact } from "./money-cents";
import type {
  FinanceAssetAcquisitionContext,
  FinanceAssetAcquisitionEvidenceConfirmCommand,
} from "./close-validation-types";

type AcquisitionValidationDependencies = {
  findAcquisitionContext?: (input: ConfirmFinanceAssetAcquisitionEvidenceInput) => Promise<FinanceAssetAcquisitionContext>;
};

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

export async function buildConfirmFinanceAssetAcquisitionEvidenceCommand(
  body: ConfirmFinanceAssetAcquisitionEvidenceInput,
  userId: number,
  dependencies: AcquisitionValidationDependencies = {},
): Promise<DomainValidationResult<FinanceAssetAcquisitionEvidenceConfirmCommand>> {
  const companyCode = text(body.companyCode);
  const voucherNo = text(body.voucherNo);
  const evidenceRef = text(body.evidenceRef);
  if (!companyCode) return failCommand("公司为必填", 400, "companyCode");
  if (!Number.isInteger(body.year) || body.year < 2000 || body.year > 2100) return failCommand("年度无效", 400, "year");
  if (!Number.isInteger(body.month) || body.month < 1 || body.month > 12) return failCommand("月份无效", 400, "month");
  if (!Number.isInteger(body.assetId) || body.assetId <= 0) return failCommand("资产卡片无效", 400, "assetId");
  if (!Number.isInteger(body.assetVersion) || body.assetVersion <= 0) return failCommand("资产版本无效", 400, "assetVersion");
  if (!voucherNo) return failCommand("取得凭证号为必填", 400, "voucherNo");
  if (!evidenceRef) return failCommand("取得证据引用为必填", 400, "evidenceRef");
  const normalized = { ...body, companyCode, voucherNo, evidenceRef };
  const context = await (dependencies.findAcquisitionContext ?? findAssetAcquisitionContext)(normalized);
  if (!context.company || context.company.code !== companyCode) return failCommand("公司不存在", 400, "companyCode");
  if (!context.period) return failCommand("会计期间不存在", 400, "month");
  if (context.period.isClosed) return failCommand("会计期间已关闭，不能确认资产取得证据", 409, "month");
  if (!context.asset || context.asset.companyCode !== companyCode || context.asset.companyId !== context.company.id) {
    return failCommand("资产卡片不存在或公司归属不一致", 400, "assetId");
  }
  if (context.asset.version !== body.assetVersion) return failCommand("资产卡片已被其他人修改，请刷新后重试", 409, "assetVersion");
  if (context.asset.status !== "active") return failCommand("仅使用中的资产可以确认取得证据", 409, "assetId");
  if (!dateInFinanceClosePeriod(context.asset.acquisitionDate, normalized)) return failCommand("资产取得日期不属于所选会计期间", 400, "assetId");
  if (context.existingEvidenceId != null) return failCommand("资产取得证据已确认，不能重复绑定", 409, "assetId");
  if (!context.policy
    || context.asset.assetAccountCode !== context.policy.assetAccountCode
    || context.asset.assetAccountId !== context.policy.assetAccountId) {
    return failCommand("资产科目快照与当前公司年度分类政策不一致", 409, "assetId");
  }
  const voucher = context.voucher;
  if (!voucher || voucher.status !== "posted" || voucher.companyCode !== companyCode || voucher.periodId !== context.period.id) {
    return failCommand("取得凭证不存在、未过账或不属于当前公司期间", 400, "voucherNo");
  }
  const amount = Math.round((context.asset.originalCost + Number.EPSILON) * 100) / 100;
  if (moneyToCents(amount) <= 0 || !moneyEquals(voucher.totalDebit, amount) || !moneyEquals(voucher.totalCredit, amount)
    || voucher.items.length !== 2 || !voucherItemsMatchHeaderExact(voucher)) {
    return failCommand("必须使用整张借贷总额等于资产原值的两行专用取得凭证", 400, "voucherNo");
  }
  const candidates = voucher.items.filter((item) => item.accountCode === context.policy!.assetAccountCode
    && moneyEquals(item.debit, amount) && moneyIsZero(item.credit));
  if (candidates.length !== 1) return failCommand("取得凭证必须包含唯一的资产政策科目借方原值分录", 400, "voucherNo");
  const voucherItem = candidates[0]!;
  const counterparty = voucher.items.find((item) => item.id !== voucherItem.id)!;
  if (!moneyIsZero(counterparty.debit) || !moneyEquals(counterparty.credit, amount)) {
    return failCommand("取得凭证对方分录必须为同额贷方，且不得夹带其他事实", 400, "voucherNo");
  }
  if (context.occupiedVoucherItemIds.includes(voucherItem.id)) return failCommand("取得凭证明细已被其他资产占用", 409, "voucherNo");
  return okCommand({ input: normalized, userId, companyId: context.company.id, periodId: context.period.id, voucherItemId: voucherItem.id, amount });
}
