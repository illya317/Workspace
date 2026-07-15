export type ConsolidationReadinessStatus = "ready" | "attention" | "blocked";
export type StatementSourceKind = "workpaper" | "system" | "missing";
export type StatementExchangeRateKind = "closing" | "historicalInvestment" | "average";
export type StatementExchangeRateStatus = "draft" | "verified";

export interface ConsolidationPeriodOption {
  year: number;
  month: number;
  label: string;
}

export interface ConsolidationCompanyRef {
  code: string;
  name: string;
  fullName: string | null;
}

export interface StatementSourceCoverage {
  kind: StatementSourceKind;
  status: "submitted" | "draft" | "available" | "missing";
  label: string;
  detail: string;
  lineCount: number;
  sourcedLineCount: number;
  manualLineCount: number;
  importedLineCount: number;
  formulaLineCount: number;
}

export interface ConsolidationEntityCoverage {
  relationId: number | null;
  code: string;
  name: string;
  role: "母公司" | "子公司";
  parentCode: string | null;
  parentName: string | null;
  shareRatio: number | null;
  balanceSheet: StatementSourceCoverage;
  incomeStatement: StatementSourceCoverage;
  cashFlow: StatementSourceCoverage;
  status: ConsolidationReadinessStatus;
}

export interface ConsolidationReadinessCheck {
  key: string;
  label: string;
  status: ConsolidationReadinessStatus;
  detail: string;
}

export interface ConsolidationEliminationPackage {
  key: string;
  label: string;
  description: string;
  workpaper: "investmentEquity" | "balancesTransactions" | "cashFlow" | "tax";
  requiredEvidence: string;
  reviewCheck: string;
  status: "notStarted" | "sourceReady";
}

export interface StatementExchangeRateSnapshot {
  id: number;
  version: number;
  baseCurrency: string;
  quoteCurrency: string;
  rateKind: StatementExchangeRateKind;
  rateDate: string;
  rate: number;
  sourceName: string;
  sourceField: string;
  sourceUrl: string;
  publishedAt: string | null;
  capturedAt: string;
  status: StatementExchangeRateStatus;
  note: string | null;
  updatedBy: number | null;
  verifiedBy: number | null;
  verifiedAt: string | null;
}

export interface StatementExchangeRateInput {
  baseCurrency: "CAD";
  quoteCurrency: "CNY";
  rateKind: StatementExchangeRateKind;
  rateDate: string;
  rate: number;
  sourceUrl: string;
  publishedAt?: string | null;
  status: StatementExchangeRateStatus;
  note?: string | null;
}

export interface ConsolidationInvestmentEvidence {
  id: number;
  companyCode: string;
  voucherNo: string;
  voucherDate: string;
  description: string;
  accountCode: string;
  bookedAmountCny: number;
  currencyCode: string | null;
  originalAmount: number | null;
  transactionRate: number | null;
  rateStatus: "recorded" | "missingOriginalCurrency" | "missingRate";
}

export interface ConsolidationReportOutput {
  key: "balanceSheet" | "incomeStatement" | "cashFlow";
  label: string;
  status: "unpublished";
  description: string;
}

export interface ConsolidationOverview {
  scope: {
    parent: ConsolidationCompanyRef | null;
    year: number;
    month: number;
    periodLabel: string;
    availablePeriods: ConsolidationPeriodOption[];
  };
  metrics: {
    entityCount: number;
    coveredSources: number;
    totalSources: number;
    submittedWorkpapers: number;
    blockerCount: number;
  };
  entities: ConsolidationEntityCoverage[];
  checks: ConsolidationReadinessCheck[];
  eliminations: ConsolidationEliminationPackage[];
  fxPolicy: {
    pair: "CAD/CNY";
    sourceName: "中国银行外汇牌价";
    sourceField: "中行折算价";
    unit: "人民币/100外币";
    sourceUrl: string;
    status: "notConfigured" | "partiallyConfigured" | "ready";
    periodEndDate: string;
    closingRate: StatementExchangeRateSnapshot | null;
    historicalRateCount: number;
    rates: StatementExchangeRateSnapshot[];
    investmentEvidence: ConsolidationInvestmentEvidence[];
    missingInvestmentRateCount: number;
    canadaSourceStatementsReady: boolean;
    note: string;
  };
  outputs: ConsolidationReportOutput[];
  outputStatus: "blocked";
  outputMessage: string;
}
