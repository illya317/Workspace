export interface ConsolidationAdjustmentVoucherSource {
  voucherItemId: number | null;
  sourceKind: "voucher" | "openingBalance" | "translationCalculation";
  voucherNo: string;
  voucherDate: string;
  accountCode: string;
  accountName: string;
  description: string | null;
  direction: "借" | "贷";
  amount: number;
  currencyCode: string;
  consolidationAmountCny?: number;
  transactionRate?: number;
  rateDate?: string;
  rateSource?: string;
}

export interface ConsolidationAdjustmentComparison {
  key: string;
  entryId: number | null;
  category: "investment" | "intercompany" | "reclassification" | "translation";
  title: string;
  entrySummary: string;
  leftCompany: string;
  leftAccount: string;
  leftDirection: "借" | "贷" | "—";
  leftAmount: number;
  leftCurrencyCode: string | null;
  leftSources: ConsolidationAdjustmentVoucherSource[];
  leftHistoricalSourceCount: number;
  rightCompany: string;
  rightAccount: string;
  rightDirection: "借" | "贷" | "—";
  rightAmount: number;
  rightCurrencyCode: string | null;
  rightSources: ConsolidationAdjustmentVoucherSource[];
  rightHistoricalSourceCount: number;
  displayPeriodLabel: string;
  sourceDisplayNote: string;
  difference: number;
  differenceCurrencyCode: string | null;
  status: "equal" | "difference" | "missingCounterpart" | "unresolved" | "pendingCalculation";
  reviewStatus: "pending" | "approved" | "returned" | "exception" | "calculated" | "informational";
  matchingRule: string;
  treatmentKind:
    | "eliminate"
    | "reconcile"
    | "translateToCny"
    | "allocateNonControllingInterest"
    | "translateAndAllocateNonControllingInterest"
    | "confirmOpeningEquitySource"
    | "translationOci";
  treatmentLabel: string;
  treatmentDetail: string;
  targetLineCode?: string | null;
  targetLineLabel?: string | null;
  ownershipShareRatio?: number | null;
}

export interface ReviewConsolidationEntryInput {
  expectedRevision: number;
  note?: string | null;
}
