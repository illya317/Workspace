import type { FinanceAssetDepreciationMethod } from "../../types/assets";

export const FINANCE_ASSET_DEPRECIATION_METHOD: FinanceAssetDepreciationMethod = "straight_line";

export function normalizeStoredFinanceAssetDepreciationMethod(value: unknown): FinanceAssetDepreciationMethod | null {
  return value === FINANCE_ASSET_DEPRECIATION_METHOD ? FINANCE_ASSET_DEPRECIATION_METHOD : null;
}

export function requireStoredFinanceAssetDepreciationMethod(value: unknown, subject: string): FinanceAssetDepreciationMethod {
  const method = normalizeStoredFinanceAssetDepreciationMethod(value);
  if (!method) throw new Error(`${subject}的折旧摊销方法 ${String(value ?? "")} 不受支持；当前仅支持直线法`);
  return method;
}
