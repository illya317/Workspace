export type ManagementFactSource = "ledger" | "operational" | "budget" | "derived" | "missing";
export type ManagementRiskLevel = "critical" | "warning" | "info";

export interface ManagementAnalysisScope {
  companyCodes: string[];
  label: string;
  year: number;
  month: number;
  periodLabel: string;
  aggregation: "single" | "uneliminated";
  comparisonLabel: string;
}

export interface ManagementProfitabilitySummary {
  revenue: number;
  operatingCost: number;
  grossProfit: number;
  grossMargin: number | null;
  periodExpenses: number;
  operatingProfit: number;
  totalProfit: number;
  netProfit: number;
  netMargin: number | null;
  priorRevenue: number;
  priorNetProfit: number;
  revenueChangeRate: number | null;
  netProfitChange: number;
}

export interface ManagementCompanyPerformance {
  code: string;
  name: string;
  role: "母公司" | "子公司" | "成员公司";
  revenue: number;
  grossProfit: number;
  netProfit: number;
  netMargin: number | null;
  operatingCashFlow: number;
  endingCash: number;
  currentRatio: number | null;
  assetLiabilityRatio: number | null;
  roe: number | null;
  incomeSource: ManagementFactSource;
  balanceSource: ManagementFactSource;
}

export interface ManagementAmountBreakdown {
  key: string;
  label: string;
  amount: number;
  share: number;
  priorAmount?: number;
  changeRate?: number | null;
}

export interface ManagementWorkingCapitalComponent {
  key: string;
  label: string;
  opening: number;
  closing: number;
  change: number;
  kind: "asset" | "liability";
}

export interface ManagementWorkingCapital {
  currentAssets: number;
  currentLiabilities: number;
  netWorkingCapital: number;
  currentRatio: number | null;
  quickRatio: number | null;
  cashRatio: number | null;
  receivableDays: number | null;
  inventoryDays: number | null;
  payableDays: number | null;
  components: ManagementWorkingCapitalComponent[];
}

export interface ManagementCashScenario {
  key: "downside" | "base" | "upside";
  label: string;
  projectedCash: number;
  projectedChange: number;
  assumption: string;
}

export interface ManagementBudgetVarianceRow {
  key: string;
  label: string;
  actual: number;
  plan: number | null;
  benchmark: number | null;
  variance: number;
  varianceRate: number | null;
  executionRate: number | null;
}

export interface ManagementBudgetControl {
  mode: "budget" | "historical";
  hasBudget: boolean;
  versionName: string | null;
  planAmount: number | null;
  actualAmount: number;
  benchmarkAmount: number | null;
  variance: number;
  varianceRate: number | null;
  executionRate: number | null;
  mappedRows: number;
  totalRows: number;
  rows: ManagementBudgetVarianceRow[];
}

export interface ManagementNamedAmount {
  name: string;
  value: number;
  share: number;
}

export interface ManagementOperationalAnalysis {
  companyAssignment: "unassigned";
  shipmentMonths: number[];
  costMonths: number[];
  shipmentAmount: number;
  receivedAmount: number;
  unreceivedAmount: number;
  collectionRate: number | null;
  costAmount: number;
  statutoryRevenue: number;
  shipmentRevenueGap: number;
  topProducts: ManagementNamedAmount[];
  topCustomers: ManagementNamedAmount[];
  costCategories: ManagementNamedAmount[];
  topCostProducts: ManagementNamedAmount[];
}

export interface ManagementCapitalAnalysis {
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  interestBearingDebt: number;
  otherPayables: number;
  paidInCapital: number;
  capitalReserve: number;
  assetLiabilityRatio: number | null;
  debtToEquity: number | null;
  investingInflow: number;
  investingOutflow: number;
  financingInflow: number;
  financingOutflow: number;
  capitalExpenditure: number;
  operatingCashFlow: number;
  freeCashFlow: number;
}

export interface ManagementPerformanceKpi {
  key: string;
  label: string;
  value: number | null;
  priorValue: number | null;
  format: "amount" | "percent" | "ratio" | "days";
  direction: "higher" | "lower" | "context";
  source: ManagementFactSource;
}

export interface ManagementRiskFinding {
  key: string;
  level: ManagementRiskLevel;
  title: string;
  description: string;
  value?: number | null;
  format?: "amount" | "percent" | "ratio";
}

export interface ManagementDataCoverage {
  key: string;
  domain: string;
  status: "live" | "partial" | "missing";
  evidence: string;
  limitation: string;
}

export interface ManagementAnalysis {
  fundFlow: FundFlowAnalysis;
  scope: ManagementAnalysisScope;
  profitability: ManagementProfitabilitySummary;
  companies: ManagementCompanyPerformance[];
  expenseStructure: ManagementAmountBreakdown[];
  workingCapital: ManagementWorkingCapital;
  cashScenarios: ManagementCashScenario[];
  budget: ManagementBudgetControl;
  operations: ManagementOperationalAnalysis;
  capital: ManagementCapitalAnalysis;
  performance: ManagementPerformanceKpi[];
  risks: ManagementRiskFinding[];
  coverage: ManagementDataCoverage[];
  warnings: string[];
}
import type { FundFlowAnalysis } from "./fund-flow";
