export interface ConsolidationAdjustmentVoucherSource {
  voucherItemId: number | null;
  sourceKind: "voucher" | "openingBalance";
  voucherNo: string;
  voucherDate: string;
  accountCode: string;
  accountName: string;
  description: string | null;
  direction: "借" | "贷";
  amount: number;
  currencyCode: string;
  consolidationAmountCny?: number;
}

export interface ConsolidationAdjustmentComparison {
  key: string;
  entryId: number | null;
  category: "investment" | "intercompany";
  title: string;
  entrySummary: string;
  leftCompany: string;
  leftAccount: string;
  leftDirection: "借" | "贷" | "—";
  leftAmount: number;
  leftSources: ConsolidationAdjustmentVoucherSource[];
  leftHistoricalSourceCount: number;
  rightCompany: string;
  rightAccount: string;
  rightDirection: "借" | "贷" | "—";
  rightAmount: number;
  rightSources: ConsolidationAdjustmentVoucherSource[];
  rightHistoricalSourceCount: number;
  displayPeriodLabel: string;
  sourceDisplayNote: string;
  difference: number;
  status: "equal" | "difference" | "missingCounterpart" | "unresolved";
  reviewStatus: "pending" | "approved" | "returned" | "exception";
  matchingRule: string;
}

export interface ReviewConsolidationEntryInput {
  expectedRevision: number;
  note?: string | null;
}
