export type AssetReplayVoucherFact = {
  id: number;
  status: string;
  companyCode: string;
  periodId: number;
  totalDebit: unknown;
  totalCredit: unknown;
  items: Array<{ accountCode: string; debit: unknown; credit: unknown }>;
};

export type AssetAccumulatedReplayInput = {
  assetId: number;
  companyCode: string;
  openingAccumulatedAmount: unknown;
  openingImpairmentAmount?: unknown;
  openingIncludesImpairment?: boolean;
  openingAsOfDate: string | null;
  priorEntries: Array<{ assetId: number; normalAmount: unknown; status: string; periodId: number; periodEndDate: string; voucher: AssetReplayVoucherFact | null }>;
  priorAdjustments: Array<{ assetId: number | null; amount: unknown; status: string; periodId: number; periodEndDate: string; voucher: AssetReplayVoucherFact | null }>;
  priorImpairments: Array<{ assetId: number; amount: unknown; periodId: number; periodEndDate: string; status: string; voucher: AssetReplayVoucherFact | null }>;
};

export type AssetScopeCard = {
  id: number;
  version: number;
  status: string;
  categoryId: number;
  acquisitionDate: string | null;
  depreciationStartDate: string | null;
  originalCost: unknown;
  residualRate: unknown;
  usefulLifeMonths: number | null;
  method: string;
  assetAccountCode: string;
  assetAccountId: number | null;
  accumulatedAccountCode: string | null;
  accumulatedAccountId: number | null;
  openingAsOfDate: string | null;
  initializationMode?: string;
  openingImpairmentAmount?: unknown;
  openingNetBookValue?: unknown;
  cutoverDate?: string | null;
  remainingUsefulLifeMonthsAtCutover?: number | null;
  cutoverResidualValue?: unknown;
  cutoverAllocationStatus?: string | null;
  cutoverReconciliationFingerprint?: string | null;
};
