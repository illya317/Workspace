export type FinanceAssetKind = "fixed_asset" | "intangible" | "prepaid" | "long_term_deferred";

export type FinanceAssetCardDto = {
  id: number;
  companyCode: string;
  assetCode: string;
  name: string;
  assetKind: FinanceAssetKind;
  category: string | null;
  assetAccountCode: string;
  accumulatedAccountCode: string | null;
  acquisitionDate: string | null;
  depreciationStartDate: string | null;
  originalCost: number;
  residualRate: number;
  usefulLifeMonths: number | null;
  method: string;
  openingAccumulatedAmount: number;
  status: string;
  nonAmortizationReason: string | null;
  note: string | null;
  sourceSheet: string | null;
  sourceRow: number | null;
  grossCost: number;
  waivedCost: number;
  capitalizedCost: number;
};

export type FinanceAssetPeriodRowDto = {
  assetId: number;
  assetCode: string;
  name: string;
  assetKind: FinanceAssetKind;
  accountCode: string;
  depreciationStartDate: string | null;
  originalCost: number;
  normalAmount: number;
  adjustmentAmount: number;
  periodAmount: number;
  status: string;
  voucherNo: string | null;
};

export type FinanceAssetAdjustmentDto = {
  id: number;
  assetId: number | null;
  assetName: string | null;
  accountCode: string;
  amount: number;
  reason: string;
  status: string;
  voucherNo: string | null;
  sourceSheet: string | null;
  sourceRow: number | null;
  createdAt: string;
};

export type FinanceAssetReconciliationDto = {
  accountCode: string;
  scheduleAmount: number;
  voucherAmount: number;
  ledgerAmount: number;
  voucherDifference: number;
  ledgerDifference: number;
  status: "matched" | "difference";
};

export type FinanceAssetWorkspaceDto = {
  scope: { companyCode: string; year: number; month: number; periodId: number | null; isClosed: boolean };
  cards: FinanceAssetCardDto[];
  periodRows: FinanceAssetPeriodRowDto[];
  adjustments: FinanceAssetAdjustmentDto[];
  reconciliation: FinanceAssetReconciliationDto[];
  metrics: {
    normalAmount: number;
    adjustmentAmount: number;
    periodAmount: number;
    voucherAmount: number;
    ledgerAmount: number;
    difference: number;
  };
};

export type CreateFinanceAssetCardInput = {
  companyCode: string;
  assetCode: string;
  name: string;
  assetKind: FinanceAssetKind;
  category?: string | null;
  assetAccountCode: string;
  accumulatedAccountCode?: string | null;
  acquisitionDate?: string | null;
  depreciationStartDate?: string | null;
  originalCost: number;
  residualRate?: number;
  usefulLifeMonths?: number | null;
  method?: string;
  openingAccumulatedAmount?: number;
  openingAsOfDate?: string | null;
  nonAmortizationReason?: string | null;
  note?: string | null;
};

export type CreateFinanceAssetAdjustmentInput = {
  companyCode: string;
  year: number;
  month: number;
  assetId?: number | null;
  accountCode: string;
  amount: number;
  reason: string;
};
