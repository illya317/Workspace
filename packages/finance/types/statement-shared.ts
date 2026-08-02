export type StatementReportType = "balanceSheet" | "incomeStatement" | "cashFlow";

export type ConsolidationEntryType =
  | "groupAdjustment"
  | "investmentEquity"
  | "reclassification"
  | "nonControllingInterest"
  | "intercompanyBalance"
  | "internalTrading"
  | "internalLongTermAsset"
  | "incomeDividend"
  | "cashFlow";

export type FinanceGroupVoucherDocumentType =
  | "groupAdjustment"
  | "elimination"
  | "reclassification"
  | "allocation";
