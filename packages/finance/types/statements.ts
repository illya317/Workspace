export type ConsolidationReadinessStatus = "ready" | "attention" | "blocked";
export type StatementSourceKind = "workpaper" | "system" | "missing";

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
  code: string;
  name: string;
  role: "母公司" | "子公司";
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
  status: "notStarted";
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
    status: "notConfigured";
    closingRate: null;
    historicalRateCount: 0;
    note: string;
  };
  outputs: ConsolidationReportOutput[];
  outputStatus: "blocked";
  outputMessage: string;
}
