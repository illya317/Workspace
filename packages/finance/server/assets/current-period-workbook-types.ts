import type { FinanceAssetKind } from "../../types/assets";

export type AssetWorkbookScope = {
  sourceFile: string;
  companyCode: string;
  year: number;
  month: number;
};

export type AssetSourceEvidence = {
  sourceFile: string;
  sourceSheet: string;
  sourceRow: number;
  sourceRange: string;
  sourceKey: string;
  sourceCurrentLabel?: string;
  sourceAccumulatedLabel?: string;
  sourceAccountHint?: string;
  sourceVoucherReference?: string;
};

export type ParsedCurrentPeriodAsset = AssetSourceEvidence & {
  legacySynthetic?: true;
  assetCode: string;
  name: string;
  assetKind: FinanceAssetKind;
  categoryCandidate: string;
  sourceCategory?: string;
  acquisitionDate?: string;
  depreciationStartDate?: string;
  depreciationStartEvidence?: "source_field" | "source_used_months_and_cutoff";
  depreciationStartSourceRange?: string;
  originalCost: number;
  residualRate?: number;
  usefulLifeMonths?: number;
  usefulLifeEvidence?: "source_field" | "source_formula" | "source_term" | "implied_amount_ratio";
  openingAccumulatedAmount: number;
  openingAsOfDate: string;
  closingNetAmount: number;
  currentDepreciation?: number;
  accumulatedDepreciation?: number;
  currentAmortization?: number;
  accumulatedAmortization?: number;
  currentAllocation?: number;
  accumulatedAllocation?: number;
  note?: string;
};

export type ParsedAssetCostEvidence = AssetSourceEvidence & {
  supplier?: string;
  amount: number;
  treatment: "included" | "excluded_from_source_total" | "unresolved";
  reason?: string;
};

export type AssetWorkbookControl = {
  key: string;
  sourceSheet: string;
  sourceRange?: string;
  expected?: number;
  actual?: number;
  difference?: number;
  status: "pass" | "fail" | "missing";
  note?: string;
};

export type AssetWorkbookBlocker = {
  code: string;
  message: string;
  sourceSheet: string;
  sourceRange?: string;
  note?: string;
};

export type ParsedAssetWorkbook = {
  scope: AssetWorkbookScope;
  workbookCompanyLabels: string[];
  periodEvidence: Array<{ sourceSheet: string; sourceRange: string; year?: number; month?: number; raw: string }>;
  assets: ParsedCurrentPeriodAsset[];
  renovationCostEvidence: ParsedAssetCostEvidence[];
  controls: AssetWorkbookControl[];
  blockers: AssetWorkbookBlocker[];
  warnings: AssetWorkbookBlocker[];
  readyForImport: boolean;
};

export function currentPeriodAmount(asset: ParsedCurrentPeriodAsset) {
  return asset.currentDepreciation ?? asset.currentAmortization ?? asset.currentAllocation ?? 0;
}
