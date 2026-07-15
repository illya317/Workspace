import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";
import type { CreateFinanceAssetAdjustmentInput, CreateFinanceAssetCardInput, FinanceAssetKind, UpdateFinanceAssetCardInput } from "../../types/assets";

const ASSET_KINDS = new Set<FinanceAssetKind>(["fixed_asset", "intangible", "prepaid", "long_term_deferred"]);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function buildCreateFinanceAssetCardCommand(
  body: CreateFinanceAssetCardInput,
  userId: number,
): DomainValidationResult<{ input: CreateFinanceAssetCardInput; userId: number }> {
  const companyCode = text(body.companyCode);
  const assetCode = text(body.assetCode);
  const name = text(body.name);
  const assetAccountCode = text(body.assetAccountCode);
  if (!companyCode) return failCommand("公司为必填", 400, "companyCode");
  if (!assetCode) return failCommand("资产编号为必填", 400, "assetCode");
  if (!name) return failCommand("资产名称为必填", 400, "name");
  if (!ASSET_KINDS.has(body.assetKind)) return failCommand("资产类型无效", 400, "assetKind");
  if (!assetAccountCode) return failCommand("资产科目为必填", 400, "assetAccountCode");
  if (!Number.isFinite(body.originalCost) || body.originalCost < 0) return failCommand("资产原值无效", 400, "originalCost");
  const residualRate = body.residualRate ?? 0;
  if (!Number.isFinite(residualRate) || residualRate < 0 || residualRate >= 1) return failCommand("残值率无效", 400, "residualRate");
  if (body.usefulLifeMonths != null && (!Number.isInteger(body.usefulLifeMonths) || body.usefulLifeMonths <= 0)) {
    return failCommand("使用期限月数无效", 400, "usefulLifeMonths");
  }
  if (body.depreciationStartDate && !DATE_PATTERN.test(body.depreciationStartDate)) {
    return failCommand("起算日期必须为 YYYY-MM-DD", 400, "depreciationStartDate");
  }
  if (body.usefulLifeMonths && !body.depreciationStartDate) return failCommand("设置期限时必须填写起算日期", 400, "depreciationStartDate");
  return okCommand({ input: { ...body, companyCode, assetCode, name, assetAccountCode, residualRate }, userId });
}

export function buildUpdateFinanceAssetCardCommand(
  body: UpdateFinanceAssetCardInput,
  userId: number,
): DomainValidationResult<{ input: UpdateFinanceAssetCardInput; userId: number }> {
  if (!Number.isInteger(body.id) || body.id <= 0) return failCommand("资产卡片无效", 400, "id");
  if (!Number.isInteger(body.version) || body.version <= 0) return failCommand("资产版本无效", 400, "version");
  const command = buildCreateFinanceAssetCardCommand(body, userId);
  if (!command.ok) return command;
  return okCommand({ input: { ...command.data.input, id: body.id, version: body.version }, userId });
}

export function buildCreateFinanceAssetAdjustmentCommand(
  body: CreateFinanceAssetAdjustmentInput,
  userId: number,
): DomainValidationResult<{ input: CreateFinanceAssetAdjustmentInput; userId: number }> {
  const companyCode = text(body.companyCode);
  const accountCode = text(body.accountCode);
  const reason = text(body.reason);
  if (!companyCode) return failCommand("公司为必填", 400, "companyCode");
  if (!Number.isInteger(body.year) || body.year < 2000 || body.year > 2100) return failCommand("年度无效", 400, "year");
  if (!Number.isInteger(body.month) || body.month < 1 || body.month > 12) return failCommand("月份无效", 400, "month");
  if (!accountCode) return failCommand("累计折旧/摊销科目为必填", 400, "accountCode");
  if (!Number.isFinite(body.amount) || body.amount === 0) return failCommand("调整金额不能为 0", 400, "amount");
  if (!reason) return failCommand("调整原因必填", 400, "reason");
  return okCommand({ input: { ...body, companyCode, accountCode, reason }, userId });
}

export function buildRecalculateFinanceAssetPeriodCommand(body: { companyCode: string; year: number; month: number }) {
  const companyCode = text(body.companyCode);
  if (!companyCode) return failCommand("公司为必填", 400, "companyCode");
  if (!Number.isInteger(body.year) || body.year < 2000 || body.year > 2100) return failCommand("年度无效", 400, "year");
  if (!Number.isInteger(body.month) || body.month < 1 || body.month > 12) return failCommand("月份无效", 400, "month");
  return okCommand({ companyCode, year: body.year, month: body.month });
}
