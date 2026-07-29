import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";
import type {
  CreateFinanceAssetCardInput,
  DeleteFinanceAssetCategoryPolicyInput,
  LinkFinanceAssetPeriodVoucherInput,
  FinanceAssetKind,
  FinanceAssetUsefulLifeMode,
  UpdateFinanceAssetCardInput,
  UpdateFinanceAssetCategoryPolicyInput,
} from "../../types/assets";
import {
  findAssetCategory,
  findAssetPolicyAccounts,
  findAssetPolicyCategory,
  findAssetPeriodVoucherLinkContext,
} from "./reference-adapter";
import { assetPeriodVoucherLinkFingerprint } from "./period-scope";
import type { FinanceAssetImpairmentVoucherReference } from "./close-validation-types";
import {
  moneyEquals,
  moneyIsNegative,
  moneyIsNonZero,
  voucherItemsAreFullyConsumed,
  voucherItemsMatchHeaderExact,
} from "./money-cents";
import { FINANCE_ASSET_DEPRECIATION_METHOD, normalizeStoredFinanceAssetDepreciationMethod } from "./depreciation-method";

export * from "./acquisition-evidence-validation";
export * from "./close-validation-types";
export * from "./disposal-validation";
export * from "./impairment-validation";

const ASSET_KINDS = new Set<FinanceAssetKind>(["fixed_asset", "intangible", "prepaid", "long_term_deferred"]);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export type FinanceAssetAccountReference = { id: number; code: string; name: string };
export type FinanceAssetCategoryReference = {
  id: number;
  code: string;
  name: string;
  assetKind: FinanceAssetKind;
  assetAccount: FinanceAssetAccountReference;
  accumulatedAccount: FinanceAssetAccountReference | null;
  expenseAccount: FinanceAssetAccountReference | null;
  defaultUsefulLifeMonths: number | null;
  defaultResidualRate: number | null;
  defaultMethod: string;
  usefulLifeMode: FinanceAssetUsefulLifeMode;
  minimumUsefulLifeMonths: number | null;
  maximumUsefulLifeMonths: number | null;
  reviewRequired: boolean;
};
export type FinanceAssetCardAccountReferences = {
  asset: FinanceAssetAccountReference;
  accumulated: FinanceAssetAccountReference | null;
};
export type FinanceAssetCardCreateCommand = {
  input: CreateFinanceAssetCardInput & { idempotencyKey: string };
  userId: number;
  category: FinanceAssetCategoryReference;
  accounts: FinanceAssetCardAccountReferences;
};
export type FinanceAssetCardUpdateCommand = Omit<FinanceAssetCardCreateCommand, "input"> & { input: UpdateFinanceAssetCardInput };
export type FinanceAssetCodePreviewCommand = {
  companyCode: string;
  year: number;
  category: FinanceAssetCategoryReference;
};
export type FinanceAssetCategoryPolicyUpdateCommand = {
  input: UpdateFinanceAssetCategoryPolicyInput;
  userId: number;
  category: { id: number; assetKind: FinanceAssetKind; depreciable: boolean };
  accounts: {
    asset: FinanceAssetAccountReference;
    accumulated: FinanceAssetAccountReference | null;
    expense: FinanceAssetAccountReference | null;
    impairmentLoss: FinanceAssetAccountReference | null;
    impairmentAllowance: FinanceAssetAccountReference | null;
    disposalGainLoss: FinanceAssetAccountReference | null;
  };
};
export type FinanceAssetCategoryPolicyDeleteCommand = {
  input: DeleteFinanceAssetCategoryPolicyInput;
  userId: number;
};
export type FinanceAssetPeriodVoucherLinkContext = {
  period: { id: number; isClosed: boolean } | null;
  voucher: (FinanceAssetImpairmentVoucherReference & { items: Array<{ accountCode: string; debit: number; credit: number }> }) | null;
  entries: Array<{
    id: number;
    voucherId: number | null;
    status: string;
    assetId: number;
    accountCode: string;
    expenseAccountCode: string;
    amount: number;
    policyIssue: string | null;
  }>;
  adjustments: Array<{
    id: number;
    assetId: number | null;
    voucherId: number | null;
    status: string;
    accountCode: string;
    expenseAccountCode: string | null;
    amount: number;
    policyIssue: string | null;
  }>;
};
export type FinanceAssetPeriodVoucherLinkCommand = {
  input: LinkFinanceAssetPeriodVoucherInput;
  periodId: number;
  voucherId: number;
  entryIds: number[];
  adjustmentIds: number[];
};

type AccountLookup = (input: { ids: number[]; companyCode: string; year: number }) => Promise<FinanceAssetAccountReference[]>;
type PolicyAccountLookup = (input: { ids: number[]; companyCode: string; year: number }) => Promise<Array<FinanceAssetAccountReference & { category: string }>>;
type CategoryLookup = (input: { id: number; companyCode: string; accountYear: number }) => Promise<FinanceAssetCategoryReference | null>;
type PolicyCategoryLookup = (input: { id: number }) => Promise<{ id: number; assetKind: FinanceAssetKind; depreciable: boolean } | null>;
type AssetValidationDependencies = {
  findAccounts?: AccountLookup;
  findPolicyAccounts?: PolicyAccountLookup;
  findCategory?: CategoryLookup;
  findPolicyCategory?: PolicyCategoryLookup;
  findPeriodVoucherLinkContext?: (input: LinkFinanceAssetPeriodVoucherInput) => Promise<FinanceAssetPeriodVoucherLinkContext>;
};

export async function buildCreateFinanceAssetCardCommand(
  body: CreateFinanceAssetCardInput,
  userId: number,
  dependencies: AssetValidationDependencies = {},
): Promise<DomainValidationResult<FinanceAssetCardCreateCommand>> {
  const idempotencyKey = text(body.idempotencyKey);
  if (!UUID_PATTERN.test(idempotencyKey)) return failCommand("资产建卡请求标识无效", 400, "idempotencyKey");
  const command = await buildAssetCardBaseCommand(body, userId, dependencies);
  if (!command.ok) return command;
  return okCommand({ ...command.data, input: { ...command.data.input, idempotencyKey } });
}

async function buildAssetCardBaseCommand(
  body: CreateFinanceAssetCardInput | UpdateFinanceAssetCardInput,
  userId: number,
  dependencies: AssetValidationDependencies,
) {
  const companyCode = text(body.companyCode);
  const name = text(body.name);
  if (!companyCode) return failCommand("公司为必填", 400, "companyCode");
  if (!name) return failCommand("资产名称为必填", 400, "name");
  if (!ASSET_KINDS.has(body.assetKind)) return failCommand("资产类型无效", 400, "assetKind");
  if (!Number.isInteger(body.categoryId) || body.categoryId <= 0) return failCommand("资产分类为必填", 400, "categoryId");
  const category = await (dependencies.findCategory ?? findAssetCategory)({ id: body.categoryId, companyCode, accountYear: body.accountYear });
  if (!category) return failCommand("当前公司和年度尚未保存该资产分类的有效核算政策", 400, "categoryId");
  if (category.assetKind !== body.assetKind) return failCommand("资产分类不属于当前资产类型", 400, "categoryId");
  const policyMethod = normalizeStoredFinanceAssetDepreciationMethod(category.defaultMethod);
  if (!policyMethod) return failCommand("当前分类政策的折旧摊销方法不受支持；当前仅支持直线法", 400, "method");
  if (body.method != null && body.method !== FINANCE_ASSET_DEPRECIATION_METHOD) {
    return failCommand("当前仅支持直线法", 400, "method");
  }
  if (!Number.isFinite(body.originalCost) || body.originalCost < 0) return failCommand("资产原值无效", 400, "originalCost");
  const residualRatePercent = body.residualRatePercent ?? Math.round((category.defaultResidualRate ?? 0) * 100);
  if (!Number.isInteger(residualRatePercent) || residualRatePercent < 0 || residualRatePercent > 99) {
    return failCommand("残值率必须为 0 到 99 的整数百分比", 400, "residualRatePercent");
  }
  if (body.usefulLifeMonths != null && (!Number.isInteger(body.usefulLifeMonths) || body.usefulLifeMonths <= 0)) {
    return failCommand("使用期限月数无效", 400, "usefulLifeMonths");
  }
  if (category.usefulLifeMode === "required" && body.usefulLifeMonths == null) {
    return failCommand("当前分类必须填写使用期限", 400, "usefulLifeMonths");
  }
  if (category.usefulLifeMode === "required_or_indefinite_basis" && body.usefulLifeMonths == null && !text(body.nonAmortizationReason)) {
    return failCommand("未填写使用期限时必须说明不摊销依据", 400, "nonAmortizationReason");
  }
  if (body.usefulLifeMonths != null && category.minimumUsefulLifeMonths != null && body.usefulLifeMonths < category.minimumUsefulLifeMonths) {
    return failCommand(`当前分类的期限不得少于 ${category.minimumUsefulLifeMonths} 个月`, 400, "usefulLifeMonths");
  }
  if (body.usefulLifeMonths != null && category.maximumUsefulLifeMonths != null && body.usefulLifeMonths > category.maximumUsefulLifeMonths) {
    return failCommand(`当前分类的期限不得超过 ${category.maximumUsefulLifeMonths} 个月`, 400, "usefulLifeMonths");
  }
  if (category.reviewRequired && !text(body.note)) {
    return failCommand("当前分类要求填写复核结论", 400, "note");
  }
  if (body.depreciationStartDate && !DATE_PATTERN.test(body.depreciationStartDate)) {
    return failCommand("起算日期必须为 YYYY-MM-DD", 400, "depreciationStartDate");
  }
  if (body.usefulLifeMonths && !body.depreciationStartDate) return failCommand("设置期限时必须填写起算日期", 400, "depreciationStartDate");
  return okCommand({
    input: {
      ...body,
      companyCode,
      name,
      residualRatePercent,
      method: policyMethod,
    },
    userId,
    category,
    accounts: { asset: category.assetAccount, accumulated: category.accumulatedAccount },
  });
}

export function residualRatePercentToDecimal(residualRatePercent: number) {
  return residualRatePercent / 100;
}

export async function buildUpdateFinanceAssetCardCommand(
  body: UpdateFinanceAssetCardInput,
  userId: number,
  dependencies: AssetValidationDependencies = {},
): Promise<DomainValidationResult<FinanceAssetCardUpdateCommand>> {
  if (!Number.isInteger(body.id) || body.id <= 0) return failCommand("资产卡片无效", 400, "id");
  if (!Number.isInteger(body.version) || body.version <= 0) return failCommand("资产版本无效", 400, "version");
  const assetCode = text(body.assetCode);
  if (!assetCode) return failCommand("资产编号无效", 400, "assetCode");
  const command = await buildAssetCardBaseCommand(body, userId, dependencies);
  if (!command.ok) return command;
  return okCommand({ ...command.data, input: { ...command.data.input, assetCode, id: body.id, version: body.version } });
}

export async function buildPreviewFinanceAssetCodeCommand(
  body: { companyCode: string; year: number; categoryId: number },
  dependencies: AssetValidationDependencies = {},
): Promise<DomainValidationResult<FinanceAssetCodePreviewCommand>> {
  const companyCode = text(body.companyCode);
  if (!companyCode) return failCommand("公司为必填", 400, "companyCode");
  if (!Number.isInteger(body.year) || body.year < 2000 || body.year > 2100) return failCommand("年度无效", 400, "year");
  if (!Number.isInteger(body.categoryId) || body.categoryId <= 0) return failCommand("资产分类为必填", 400, "categoryId");
  const category = await (dependencies.findCategory ?? findAssetCategory)({ id: body.categoryId, companyCode, accountYear: body.year });
  if (!category) return failCommand("当前公司和年度尚未保存该资产分类的有效核算政策", 400, "categoryId");
  return okCommand({ companyCode, year: body.year, category });
}

export async function buildUpdateFinanceAssetCategoryPolicyCommand(
  body: UpdateFinanceAssetCategoryPolicyInput,
  userId: number,
  dependencies: AssetValidationDependencies = {},
): Promise<DomainValidationResult<FinanceAssetCategoryPolicyUpdateCommand>> {
  const companyCode = text(body.companyCode);
  const classificationRule = text(body.classificationRule);
  if (!companyCode) return failCommand("公司为必填", 400, "companyCode");
  if (!Number.isInteger(body.year) || body.year < 2000 || body.year > 2100) return failCommand("年度无效", 400, "year");
  if (!Number.isInteger(body.categoryId) || body.categoryId <= 0) return failCommand("资产分类无效", 400, "categoryId");
  if (!Number.isInteger(body.version) || body.version < 0) return failCommand("政策版本无效", 400, "version");
  if (!Number.isInteger(body.assetAccountId) || body.assetAccountId <= 0) return failCommand("资产科目为必填", 400, "assetAccountId");
  if (!classificationRule) return failCommand("分类判断为必填", 400, "classificationRule");
  if (body.defaultMethod !== "straight_line") return failCommand("当前仅支持直线法", 400, "defaultMethod");
  if (!Number.isInteger(body.defaultResidualRatePercent) || body.defaultResidualRatePercent < 0 || body.defaultResidualRatePercent > 99) {
    return failCommand("默认残值率必须为 0 到 99 的整数百分比", 400, "defaultResidualRatePercent");
  }
  const category = await (dependencies.findPolicyCategory ?? findAssetPolicyCategory)({ id: body.categoryId });
  if (!category) return failCommand("资产分类不存在、未确认或已停用", 400, "categoryId");
  if (category.assetKind !== "intangible" && body.usefulLifeMode !== "required") {
    return failCommand("只有无形资产可以在保留依据后不设置确定期限", 400, "usefulLifeMode");
  }
  const minimum = body.minimumUsefulLifeMonths ?? null;
  const maximum = body.maximumUsefulLifeMonths ?? null;
  const defaultLife = body.defaultUsefulLifeMonths ?? null;
  if (minimum != null && (!Number.isInteger(minimum) || minimum <= 0)) return failCommand("最短期限无效", 400, "minimumUsefulLifeMonths");
  if (maximum != null && (!Number.isInteger(maximum) || maximum <= 0)) return failCommand("最长期限无效", 400, "maximumUsefulLifeMonths");
  if (minimum != null && maximum != null && minimum > maximum) return failCommand("最短期限不能大于最长期限", 400, "minimumUsefulLifeMonths");
  if (category.assetKind === "prepaid" && (maximum == null || maximum > 12)) {
    return failCommand("预付及其他流动资产的最长期限不得超过 12 个月", 400, "maximumUsefulLifeMonths");
  }
  if (category.assetKind === "long_term_deferred" && (minimum == null || minimum < 13)) {
    return failCommand("长期待摊费用的最短受益期不得少于 13 个月", 400, "minimumUsefulLifeMonths");
  }
  if (defaultLife != null && minimum != null && defaultLife < minimum) return failCommand("默认期限不能小于最短期限", 400, "defaultUsefulLifeMonths");
  if (defaultLife != null && maximum != null && defaultLife > maximum) return failCommand("默认期限不能大于最长期限", 400, "defaultUsefulLifeMonths");
  const requestedIds = [...new Set([
    body.assetAccountId,
    body.accumulatedAccountId,
    body.expenseAccountId,
    body.impairmentLossAccountId,
    body.impairmentAllowanceAccountId,
    body.disposalGainLossAccountId,
  ].filter((id): id is number => Number.isInteger(id) && Number(id) > 0))];
  const rows = await (dependencies.findPolicyAccounts ?? findAssetPolicyAccounts)({ ids: requestedIds, companyCode, year: body.year });
  const byId = new Map(rows.map((row) => [row.id, row]));
  const asset = byId.get(body.assetAccountId);
  if (!asset || asset.category !== "asset") return failCommand("资产科目不是当前公司和年度的有效资产类科目", 400, "assetAccountId");
  const accumulated = body.accumulatedAccountId ? byId.get(body.accumulatedAccountId) ?? null : null;
  if (body.accumulatedAccountId && (!accumulated || accumulated.category !== "asset")) {
    return failCommand("累计折旧/摊销科目不是当前公司和年度的有效资产类科目", 400, "accumulatedAccountId");
  }
  if ((category.assetKind === "fixed_asset" || category.assetKind === "intangible") && !accumulated) {
    return failCommand("固定资产和无形资产必须配置累计折旧/摊销科目", 400, "accumulatedAccountId");
  }
  if ((category.assetKind === "prepaid" || category.assetKind === "long_term_deferred") && accumulated) {
    return failCommand("预付及长期待摊分类不配置累计折旧/摊销科目", 400, "accumulatedAccountId");
  }
  const expense = body.expenseAccountId ? byId.get(body.expenseAccountId) ?? null : null;
  if (body.expenseAccountId && (!expense || !["cost", "expense"].includes(expense.category))) {
    return failCommand("费用科目不是当前公司和年度的有效成本费用类科目", 400, "expenseAccountId");
  }
  if (category.depreciable && !expense) return failCommand("可折旧摊销分类必须配置有效费用科目", 400, "expenseAccountId");
  const impairmentLoss = body.impairmentLossAccountId ? byId.get(body.impairmentLossAccountId) ?? null : null;
  if (body.impairmentLossAccountId && (!impairmentLoss || !["cost", "expense"].includes(impairmentLoss.category))) {
    return failCommand("减值损失科目不是当前公司和年度的有效成本费用类科目", 400, "impairmentLossAccountId");
  }
  const impairmentAllowance = body.impairmentAllowanceAccountId ? byId.get(body.impairmentAllowanceAccountId) ?? null : null;
  if (body.impairmentAllowanceAccountId && (!impairmentAllowance || impairmentAllowance.category !== "asset")) {
    return failCommand("减值准备科目不是当前公司和年度的有效资产类科目", 400, "impairmentAllowanceAccountId");
  }
  if (Boolean(impairmentLoss) !== Boolean(impairmentAllowance)) {
    return failCommand("减值损失与减值准备科目必须同时配置或同时留空", 400, "impairmentLossAccountId");
  }
  const disposalGainLoss = body.disposalGainLossAccountId ? byId.get(body.disposalGainLossAccountId) ?? null : null;
  if (body.disposalGainLossAccountId && (!disposalGainLoss || !["cost", "expense"].includes(disposalGainLoss.category))) {
    return failCommand("资产处置损益科目不是当前公司和年度的有效损益类科目", 400, "disposalGainLossAccountId");
  }
  return okCommand({
    input: {
      ...body,
      companyCode,
      classificationRule,
      accumulatedAccountId: accumulated?.id ?? null,
      expenseAccountId: expense?.id ?? null,
      impairmentLossAccountId: impairmentLoss?.id ?? null,
      impairmentAllowanceAccountId: impairmentAllowance?.id ?? null,
      disposalGainLossAccountId: disposalGainLoss?.id ?? null,
      defaultUsefulLifeMonths: defaultLife,
      minimumUsefulLifeMonths: minimum,
      maximumUsefulLifeMonths: maximum,
    },
    userId,
    category,
    accounts: { asset, accumulated, expense, impairmentLoss, impairmentAllowance, disposalGainLoss },
  });
}

export function buildDeleteFinanceAssetCategoryPolicyCommand(
  body: DeleteFinanceAssetCategoryPolicyInput,
  userId: number,
): DomainValidationResult<FinanceAssetCategoryPolicyDeleteCommand> {
  const companyCode = text(body.companyCode);
  if (!companyCode) return failCommand("公司为必填", 400, "companyCode");
  if (!Number.isInteger(body.year) || body.year < 2000 || body.year > 2100) return failCommand("年度无效", 400, "year");
  if (!Number.isInteger(body.categoryId) || body.categoryId <= 0) return failCommand("资产分类无效", 400, "categoryId");
  if (!Number.isInteger(body.version) || body.version <= 0) return failCommand("政策版本无效", 400, "version");
  return okCommand({ input: { ...body, companyCode }, userId });
}

export function buildRecalculateFinanceAssetPeriodCommand(body: { companyCode: string; year: number; month: number }) {
  const companyCode = text(body.companyCode);
  if (!companyCode) return failCommand("公司为必填", 400, "companyCode");
  if (!Number.isInteger(body.year) || body.year < 2000 || body.year > 2100) return failCommand("年度无效", 400, "year");
  if (!Number.isInteger(body.month) || body.month < 1 || body.month > 12) return failCommand("月份无效", 400, "month");
  return okCommand({ companyCode, year: body.year, month: body.month });
}
export async function buildLinkFinanceAssetPeriodVoucherCommand(
  body: LinkFinanceAssetPeriodVoucherInput,
  dependencies: AssetValidationDependencies = {},
): Promise<DomainValidationResult<FinanceAssetPeriodVoucherLinkCommand>> {
  const companyCode = text(body.companyCode);
  const voucherNo = text(body.voucherNo);
  const expectedLinkFingerprint = text(body.expectedLinkFingerprint);
  if (!companyCode) return failCommand("公司为必填", 400, "companyCode");
  if (!Number.isInteger(body.year) || body.year < 2000 || body.year > 2100) return failCommand("年度无效", 400, "year");
  if (!Number.isInteger(body.month) || body.month < 1 || body.month > 12) return failCommand("月份无效", 400, "month");
  if (!voucherNo) return failCommand("折旧摊销凭证号必填", 400, "voucherNo");
  if (!/^[a-f0-9]{64}$/.test(expectedLinkFingerprint)) return failCommand("凭证关联版本无效", 400, "expectedLinkFingerprint");
  const context = await (dependencies.findPeriodVoucherLinkContext ?? findAssetPeriodVoucherLinkContext)({ ...body, companyCode, voucherNo, expectedLinkFingerprint });
  if (!context.period) return failCommand("会计期间不存在", 400, "month");
  if (context.period.isClosed) return failCommand("会计期间已关闭，不能关联折旧摊销凭证", 409, "month");
  const currentFingerprint = assetPeriodVoucherLinkFingerprint({ entries: context.entries, adjustments: context.adjustments });
  if (currentFingerprint !== expectedLinkFingerprint) return failCommand("折旧摊销凭证关联已变化，请刷新后重试", 409, "expectedLinkFingerprint");
  if (!context.voucher || context.voucher.status !== "posted") return failCommand("凭证不存在、未过账或不属于当前公司期间", 400, "voucherNo");
  if (context.entries.length === 0 && context.adjustments.filter((row) => row.status === "confirmed").length === 0) return failCommand("本期没有可关联的折旧摊销条目", 400, "month");
  const policyIssue = context.entries.find((row) => row.policyIssue)?.policyIssue
    ?? context.adjustments.find((row) => row.status === "confirmed" && row.policyIssue)?.policyIssue;
  if (policyIssue) return failCommand(policyIssue, 409, "month");
  if (context.entries.some((row) => row.voucherId != null || row.status === "posted")
    || context.adjustments.some((row) => row.status === "confirmed" && row.voucherId != null)) {
    return failCommand("本期折旧摊销已关联凭证，不能重复占用专用凭证", 409, "voucherNo");
  }

  const scheduleByAccount = new Map<string, number>();
  const expenseScheduleByAccount = new Map<string, number>();
  for (const row of context.entries) {
    addAmount(scheduleByAccount, row.accountCode, row.amount);
    addAmount(expenseScheduleByAccount, row.expenseAccountCode, row.amount);
  }
  for (const row of context.adjustments.filter((item) => item.status === "confirmed")) {
    addAmount(scheduleByAccount, row.accountCode, row.amount);
    if (row.expenseAccountCode) addAmount(expenseScheduleByAccount, row.expenseAccountCode, row.amount);
  }
  const scheduleRows = [...scheduleByAccount.entries()].filter(([, amount]) => moneyIsNonZero(amount));
  if (scheduleRows.length === 0) return failCommand("本期折旧摊销金额为零，无需关联凭证", 400, "voucherNo");
  if (scheduleRows.some(([, amount]) => moneyIsNegative(amount))) return failCommand("专用凭证暂不支持折旧摊销正负方向混合关联", 400, "voucherNo");
  const voucherByAccount = new Map<string, number>();
  const voucherDebitByAccount = new Map<string, number>();
  for (const item of context.voucher.items) addAmount(voucherByAccount, item.accountCode, item.credit - item.debit);
  for (const item of context.voucher.items) addAmount(voucherDebitByAccount, item.accountCode, item.debit - item.credit);
  if (!voucherItemsMatchHeaderExact(context.voucher)
    || !voucherItemsAreFullyConsumed(context.voucher, new Set(expenseScheduleByAccount.keys()), new Set(scheduleByAccount.keys()))) {
    return failCommand("折旧摊销凭证明细必须逐行完整归属于本期政策科目，且借贷合计必须精确等于凭证表头", 400, "voucherNo");
  }
  if (scheduleRows.some(([accountCode, amount]) => !moneyEquals(voucherByAccount.get(accountCode) ?? 0, amount))) {
    return failCommand("凭证累计折旧/摊销科目与本期台账不一致", 400, "voucherNo");
  }
  if ([...expenseScheduleByAccount].some(([accountCode, amount]) => !moneyEquals(voucherDebitByAccount.get(accountCode) ?? 0, amount))) {
    return failCommand("凭证折旧/摊销费用科目与当前公司年度分类政策不一致", 400, "voucherNo");
  }
  const scheduleTotal = scheduleRows.reduce((sum, [, amount]) => sum + amount, 0);
  if (!moneyEquals(context.voucher.totalDebit, context.voucher.totalCredit)
    || !moneyEquals(context.voucher.totalDebit, scheduleTotal)) {
    return failCommand("必须使用整张借贷总额等于本期折旧摊销金额的专用已过账凭证", 400, "voucherNo");
  }
  return okCommand({
    input: { ...body, companyCode, voucherNo, expectedLinkFingerprint },
    periodId: context.period.id,
    voucherId: context.voucher.id,
    entryIds: context.entries.map((row) => row.id),
    adjustmentIds: context.adjustments.filter((row) => row.status === "confirmed").map((row) => row.id),
  });
}

function addAmount(map: Map<string, number>, key: string, amount: number) {
  map.set(key, Math.round((((map.get(key) ?? 0) + amount) + Number.EPSILON) * 100) / 100);
}
