import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";
import type { FinanceAssetKind } from "../../types/assets";

const ASSET_KINDS = new Set<FinanceAssetKind>([
  "fixed_asset",
  "intangible",
  "prepaid",
  "long_term_deferred",
]);

export type FinanceAssetPeriodReplayPreviewRowInput = {
  sourceKey: string;
  assetKind: FinanceAssetKind;
  originalCost: number;
  residualRate: number;
  usefulLifeMonths: number | null;
  acquisitionDate: string;
  depreciationStartDate?: string | null;
  openingAccumulatedAmount: number;
  openingImpairmentAmount?: number;
  openingAsOfDate: string;
  nonAmortizationReason?: string | null;
  sourcePeriodAmountControl: number;
  sourceClosingNetControl: number;
};

export type FinanceAssetPeriodReplayPreviewInput = {
  companyCode: string;
  year: number;
  month: number;
  rows: FinanceAssetPeriodReplayPreviewRowInput[];
};

export type FinanceAssetPeriodReplayPreviewCommand = {
  companyCode: string;
  year: number;
  month: number;
  rows: Array<FinanceAssetPeriodReplayPreviewRowInput & {
    acquisitionDate: string;
    depreciationStartDate: string | null;
    openingImpairmentAmount: number;
    nonAmortizationReason: string | null;
  }>;
};

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const nullableText = (value: unknown) => text(value) || null;

export function buildFinanceAssetPeriodReplayPreviewCommand(
  input: FinanceAssetPeriodReplayPreviewInput,
): DomainValidationResult<FinanceAssetPeriodReplayPreviewCommand> {
  const companyCode = text(input.companyCode);
  if (!companyCode) return failCommand("公司为必填", 400, "companyCode");
  if (!Number.isInteger(input.year) || input.year < 2000 || input.year > 2100) {
    return failCommand("年度无效", 400, "year");
  }
  if (!Number.isInteger(input.month) || input.month < 1 || input.month > 12) {
    return failCommand("月份无效", 400, "month");
  }
  if (!Array.isArray(input.rows) || input.rows.length === 0 || input.rows.length > 10000) {
    return failCommand("资产预览明细必须为 1 到 10000 行", 400, "rows");
  }

  const rows: FinanceAssetPeriodReplayPreviewCommand["rows"] = [];
  for (const [index, row] of input.rows.entries()) {
    const field = (name: string) => `rows.${index}.${name}`;
    const sourceKey = text(row.sourceKey);
    if (!sourceKey) return failCommand("来源键为必填", 400, field("sourceKey"));
    if (!ASSET_KINDS.has(row.assetKind)) return failCommand("资产类型无效", 400, field("assetKind"));
    if (!finiteNonNegative(row.originalCost)) return failCommand("资产原值无效", 400, field("originalCost"));
    if (!Number.isFinite(row.residualRate) || row.residualRate < 0 || row.residualRate >= 1) {
      return failCommand("残值率必须为 0（含）到 1（不含）的小数", 400, field("residualRate"));
    }
    if (row.usefulLifeMonths != null && (!Number.isInteger(row.usefulLifeMonths) || row.usefulLifeMonths <= 0)) {
      return failCommand("使用期限月数无效", 400, field("usefulLifeMonths"));
    }
    if (!finiteNonNegative(row.openingAccumulatedAmount)) {
      return failCommand("期初累计金额无效", 400, field("openingAccumulatedAmount"));
    }
    const openingImpairmentAmount = row.openingImpairmentAmount ?? 0;
    if (!finiteNonNegative(openingImpairmentAmount)) {
      return failCommand("期初减值金额无效", 400, field("openingImpairmentAmount"));
    }
    if (!Number.isFinite(row.sourcePeriodAmountControl)) {
      return failCommand("来源本期金额控制值无效", 400, field("sourcePeriodAmountControl"));
    }
    if (!Number.isFinite(row.sourceClosingNetControl)) {
      return failCommand("来源期末净值控制值无效", 400, field("sourceClosingNetControl"));
    }
    rows.push({
      ...row,
      sourceKey,
      acquisitionDate: text(row.acquisitionDate),
      depreciationStartDate: nullableText(row.depreciationStartDate),
      openingImpairmentAmount,
      nonAmortizationReason: nullableText(row.nonAmortizationReason),
    });
  }
  return okCommand({ companyCode, year: input.year, month: input.month, rows });
}

function finiteNonNegative(value: number) {
  return Number.isFinite(value) && value >= 0;
}
