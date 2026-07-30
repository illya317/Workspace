import "server-only";

import { defineWorkspaceAnalysisReadModel } from "@workspace/platform/server/workspace-analysis-read-model";
import type {
  FundFlowActivitySummary,
  FundFlowBalanceSignal,
  FundFlowChannel,
  FundFlowCompanySummary,
  FundFlowLedgerChannel,
  FundFlowAnalysis,
  ManagementAmountBreakdown,
  ManagementBudgetVarianceRow,
  ManagementCashScenario,
  ManagementCompanyPerformance,
  ManagementDataCoverage,
  ManagementPerformanceKpi,
  ManagementRiskFinding,
  ManagementWorkingCapitalComponent,
  ManagementAnalysis,
} from "@workspace/finance/types";

export type ManagementOperationalRankingRow = {
  kind: "product" | "customer" | "costCategory" | "costProduct";
  name: string;
  value: number;
  share: number;
};
export type FinanceAnalysisScalarFactRow = {
  section: string;
  field: string;
  valueKind: "null" | "string" | "number" | "boolean";
  textValue: string | null;
  numberValue: number | null;
  booleanValue: boolean | null;
};
export type FinanceAnalysisScopeValueRow = { kind: "companyCode" | "availableYear"; textValue: string | null; numberValue: number | null };
export type FinanceAnalysisWarningRow = { index: number; message: string };
export type FinanceManagementOperationMonthRow = { kind: "shipment" | "cost"; month: number };

type ResponseFieldCoverage = { disposition: "source" | "derived" | "omit"; sourceKeys?: readonly string[]; description: string };
export const FINANCE_FUND_FLOW_TOP_LEVEL_FIELD_COVERAGE = {
  scope: { disposition: "source", sourceKeys: ["finance.analysis.fund-flow.summary-facts", "finance.analysis.fund-flow.scope-values"], description: "范围标量与公司/年度多值。" },
  metrics: { disposition: "source", sourceKeys: ["finance.analysis.fund-flow.summary-facts"], description: "资金汇总指标。" },
  activities: { disposition: "source", sourceKeys: ["finance.analysis.fund-flow.activities"], description: "资金活动行。" },
  sources: { disposition: "source", sourceKeys: ["finance.analysis.fund-flow.sources"], description: "资金来源行。" },
  uses: { disposition: "source", sourceKeys: ["finance.analysis.fund-flow.uses"], description: "资金用途行。" },
  ledgerChannels: { disposition: "source", sourceKeys: ["finance.analysis.fund-flow.ledger-channels"], description: "总账渠道行。" },
  balanceSignals: { disposition: "source", sourceKeys: ["finance.analysis.fund-flow.balance-signals"], description: "余额信号行。" },
  companies: { disposition: "source", sourceKeys: ["finance.analysis.fund-flow.companies"], description: "公司汇总行。" },
  evidence: { disposition: "source", sourceKeys: ["finance.analysis.fund-flow.summary-facts"], description: "口径证据计数及勾稽。" },
  warnings: { disposition: "source", sourceKeys: ["finance.analysis.fund-flow.warnings"], description: "口径警告。" },
} as const satisfies Readonly<Record<keyof FundFlowAnalysis, ResponseFieldCoverage>>;

export const FINANCE_MANAGEMENT_TOP_LEVEL_FIELD_COVERAGE = {
  fundFlow: { disposition: "derived", sourceKeys: ["finance.analysis.fund-flow.summary-facts", "finance.analysis.fund-flow.scope-values", "finance.analysis.fund-flow.activities", "finance.analysis.fund-flow.sources", "finance.analysis.fund-flow.uses", "finance.analysis.fund-flow.ledger-channels", "finance.analysis.fund-flow.balance-signals", "finance.analysis.fund-flow.companies", "finance.analysis.fund-flow.warnings"], description: "完整复用资金分析源族。" },
  scope: { disposition: "source", sourceKeys: ["finance.analysis.management.summary-facts", "finance.analysis.fund-flow.scope-values"], description: "管理分析范围标量；公司多值复用资金范围。" },
  profitability: { disposition: "source", sourceKeys: ["finance.analysis.management.summary-facts"], description: "盈利汇总标量。" },
  companies: { disposition: "source", sourceKeys: ["finance.analysis.management.companies"], description: "公司绩效行。" },
  expenseStructure: { disposition: "source", sourceKeys: ["finance.analysis.management.expense-structure"], description: "费用结构行。" },
  workingCapital: { disposition: "source", sourceKeys: ["finance.analysis.management.summary-facts", "finance.analysis.management.working-capital"], description: "营运资金标量与构成行。" },
  cashScenarios: { disposition: "source", sourceKeys: ["finance.analysis.management.cash-scenarios"], description: "现金情景行。" },
  budget: { disposition: "source", sourceKeys: ["finance.analysis.management.summary-facts", "finance.analysis.management.budget-variances"], description: "预算汇总标量与偏差行。" },
  operations: { disposition: "source", sourceKeys: ["finance.analysis.management.summary-facts", "finance.analysis.management.operation-months", "finance.analysis.management.operational-rankings"], description: "营运标量、覆盖月份及排行。" },
  capital: { disposition: "source", sourceKeys: ["finance.analysis.management.summary-facts"], description: "资本结构标量。" },
  performance: { disposition: "source", sourceKeys: ["finance.analysis.management.performance"], description: "绩效指标行。" },
  risks: { disposition: "source", sourceKeys: ["finance.analysis.management.risks"], description: "风险发现行。" },
  coverage: { disposition: "source", sourceKeys: ["finance.analysis.management.coverage"], description: "数据覆盖行。" },
  warnings: { disposition: "source", sourceKeys: ["finance.analysis.management.warnings"], description: "口径警告。" },
} as const satisfies Readonly<Record<keyof ManagementAnalysis, ResponseFieldCoverage>>;

const PAGE = { pageParam: "page", pageSizeParam: "pageSize", pageSize: 200, maxPages: 20 } as const;
const LIMITS = { maxRows: 4_000, maxGroups: 500, maxPageSize: 200, maxPages: 20, maxBytes: 5 * 1024 * 1024, timeoutMs: 10_000 } as const;
const SCOPES = {
  personal: { mode: "workspace", description: "沿用 finance.analysis.read；分析口径不按个人空间收窄。" },
  department: { mode: "workspace", description: "沿用 finance.analysis.read；分析口径不按部门空间收窄。" },
  project: { mode: "workspace", description: "沿用 finance.analysis.read；分析口径不按项目空间收窄。" },
} as const;
const parameters = [
  { key: "companyCodes", queryKey: "companyCodes", label: "公司编码", description: "1—10 家公司编码，以逗号分隔。", kind: "text", required: true },
  { key: "year", queryKey: "year", label: "年度", description: "会计年度。", kind: "integer", required: true },
  { key: "month", queryKey: "month", label: "月份", description: "会计月份；不传时使用年度末口径。", kind: "integer" },
] as const;
const f = (label: string, description: string, valueKind: "text" | "number" | "integer" | "currency" | "percent" | "date" | "boolean", sensitivity: "internal" | "confidential" = "internal") => ({
  classification: "field" as const, label, description, valueKind, sensitivity, exportPolicy: "allowed" as const,
});

function source<TRow extends object>(input: {
  sourceKey: string;
  label: string;
  description: string;
  apiPath: "/api/modules/finance/analysis/fund-flow" | "/api/modules/finance/analysis/management";
  rowsPath: string;
  fields: Parameters<ReturnType<typeof defineWorkspaceAnalysisReadModel<TRow>>>[0]["fields"];
}) {
  return defineWorkspaceAnalysisReadModel<TRow>()({
    sourceKey: input.sourceKey, version: 1, label: input.label, description: input.description,
    apiPath: input.apiPath, rowsPath: input.rowsPath, totalPath: `${input.rowsPath}.length`, scopes: SCOPES,
    parameters, fields: input.fields, pagination: PAGE, limits: LIMITS,
  });
}

const scalarFields = {
  section: f("对象分区", "scope、metrics、evidence 或管理汇总对象名。", "text"), field: f("字段", "对象内稳定标量字段名。", "text"),
  valueKind: f("值类型", "null、string、number 或 boolean。", "text"), textValue: f("文本值", "字符串标量值。", "text"),
  numberValue: f("数值", "数值标量值。", "number"), booleanValue: f("布尔值", "布尔标量值。", "boolean"),
} as const;
export const FINANCE_FUND_FLOW_SUMMARY_FACTS_SOURCE = source<FinanceAnalysisScalarFactRow>({ sourceKey: "finance.analysis.fund-flow.summary-facts", label: "资金分析汇总事实", description: "资金分析范围、指标和证据对象中的全部稳定标量。", apiPath: "/api/modules/finance/analysis/fund-flow", rowsPath: "scope", fields: scalarFields });
export const FINANCE_FUND_FLOW_SCOPE_VALUES_SOURCE = source<FinanceAnalysisScopeValueRow>({ sourceKey: "finance.analysis.fund-flow.scope-values", label: "资金分析范围多值", description: "资金分析所选公司编码和可用年度。", apiPath: "/api/modules/finance/analysis/fund-flow", rowsPath: "scope.companyCodes", fields: { kind: f("值类型", "companyCode 或 availableYear。", "text"), textValue: f("文本值", "公司编码。", "text"), numberValue: f("数值", "可用年度。", "integer") } });
export const FINANCE_FUND_FLOW_WARNINGS_SOURCE = source<FinanceAnalysisWarningRow>({ sourceKey: "finance.analysis.fund-flow.warnings", label: "资金分析口径警告", description: "资金分析服务给出的全部口径和质量警告。", apiPath: "/api/modules/finance/analysis/fund-flow", rowsPath: "warnings", fields: { index: f("序号", "警告顺序。", "integer"), message: f("警告", "口径或数据质量警告。", "text") } });
export const FINANCE_MANAGEMENT_SUMMARY_FACTS_SOURCE = source<FinanceAnalysisScalarFactRow>({ sourceKey: "finance.analysis.management.summary-facts", label: "管理分析汇总事实", description: "范围、盈利、营运资金、预算、营运和资本对象中的全部稳定标量。", apiPath: "/api/modules/finance/analysis/management", rowsPath: "scope", fields: scalarFields });
export const FINANCE_MANAGEMENT_OPERATION_MONTHS_SOURCE = source<FinanceManagementOperationMonthRow>({ sourceKey: "finance.analysis.management.operation-months", label: "经营数据覆盖月份", description: "发货与成本业务事实覆盖月份。", apiPath: "/api/modules/finance/analysis/management", rowsPath: "operations.shipmentMonths", fields: { kind: f("业务类型", "shipment 或 cost。", "text"), month: f("月份", "业务事实覆盖月份。", "integer") } });
export const FINANCE_MANAGEMENT_WARNINGS_SOURCE = source<FinanceAnalysisWarningRow>({ sourceKey: "finance.analysis.management.warnings", label: "管理分析口径警告", description: "管理分析服务给出的全部口径和数据限制警告。", apiPath: "/api/modules/finance/analysis/management", rowsPath: "warnings", fields: { index: f("序号", "警告顺序。", "integer"), message: f("警告", "口径或数据限制警告。", "text") } });

export const FINANCE_FUND_FLOW_ACTIVITIES_SOURCE = source<FundFlowActivitySummary>({
  sourceKey: "finance.analysis.fund-flow.activities", label: "资金活动汇总", description: "经营、投资、筹资三类现金活动汇总。", apiPath: "/api/modules/finance/analysis/fund-flow", rowsPath: "activities",
  fields: {
    key: f("活动键", "经营、投资或筹资。", "text"), label: f("活动名称", "资金活动名称。", "text"), inflow: f("流入", "活动现金流入。", "currency"),
    outflow: f("流出", "活动现金流出。", "currency"), net: f("净额", "流入减流出。", "currency"), inflowShare: f("流入占比", "占总流入比例。", "percent"),
  },
});

const fundChannelFields = {
  key: f("渠道键", "资金渠道稳定键。", "text"), label: f("渠道名称", "资金渠道名称。", "text"), activity: f("活动", "经营、投资或筹资。", "text"),
  amount: f("金额", "渠道金额。", "currency"), share: f("占比", "渠道占同方向资金比例。", "percent"),
} as const;
export const FINANCE_FUND_FLOW_SOURCES_SOURCE = source<FundFlowChannel>({ sourceKey: "finance.analysis.fund-flow.sources", label: "资金来源渠道", description: "系统识别的资金流入渠道。", apiPath: "/api/modules/finance/analysis/fund-flow", rowsPath: "sources", fields: fundChannelFields });
export const FINANCE_FUND_FLOW_USES_SOURCE = source<FundFlowChannel>({ sourceKey: "finance.analysis.fund-flow.uses", label: "资金用途渠道", description: "系统识别的资金流出渠道。", apiPath: "/api/modules/finance/analysis/fund-flow", rowsPath: "uses", fields: fundChannelFields });

export const FINANCE_FUND_FLOW_LEDGER_CHANNELS_SOURCE = source<FundFlowLedgerChannel>({
  sourceKey: "finance.analysis.fund-flow.ledger-channels", label: "总账资金渠道", description: "现金类凭证对手科目识别的资金渠道。", apiPath: "/api/modules/finance/analysis/fund-flow", rowsPath: "ledgerChannels",
  fields: { key: f("渠道键", "渠道稳定键。", "text"), label: f("渠道名称", "渠道名称。", "text"), direction: f("方向", "资金来源或用途。", "text"), amount: f("金额", "渠道金额。", "currency"), note: f("口径说明", "渠道识别口径。", "text") },
});
export const FINANCE_FUND_FLOW_BALANCE_SIGNALS_SOURCE = source<FundFlowBalanceSignal>({
  sourceKey: "finance.analysis.fund-flow.balance-signals", label: "资金余额信号", description: "科目余额形成的资金来源与占用信号。", apiPath: "/api/modules/finance/analysis/fund-flow", rowsPath: "balanceSignals",
  fields: { key: f("信号键", "信号稳定键。", "text"), label: f("信号名称", "余额信号名称。", "text"), opening: f("期初", "期初余额。", "currency"), change: f("变动", "期间余额变动。", "currency"), closing: f("期末", "期末余额。", "currency"), note: f("口径说明", "余额信号说明。", "text") },
});
export const FINANCE_FUND_FLOW_COMPANIES_SOURCE = source<FundFlowCompanySummary>({
  sourceKey: "finance.analysis.fund-flow.companies", label: "公司资金汇总", description: "逐公司现金流、余额变动与质量勾稽。", apiPath: "/api/modules/finance/analysis/fund-flow", rowsPath: "companies",
  fields: {
    code: f("公司编码", "公司编码。", "text"), name: f("公司名称", "公司名称。", "text"), role: f("公司角色", "母公司、子公司或成员公司。", "text"),
    inflow: f("流入", "现金流入。", "currency"), outflow: f("流出", "现金流出。", "currency"), netCashChange: f("现金净变动", "现金流净变动。", "currency"),
    openingCash: f("期初现金", "期初现金余额。", "currency"), endingCash: f("期末现金", "期末现金余额。", "currency"), ledgerNetCashChange: f("总账现金变动", "总账现金类科目净变动。", "currency"),
    cashFlowGap: f("勾稽差额", "现金流与总账净变动差额。", "currency"), voucherCount: f("凭证数", "期间凭证数量。", "integer"), cashLinkedVoucherCount: f("现金关联凭证数", "具备现金分配的凭证数量。", "integer"),
    quality: f("质量", "ok、warning 或 missing。", "text"),
  },
});

export const FINANCE_MANAGEMENT_COMPANIES_SOURCE = source<ManagementCompanyPerformance>({
  sourceKey: "finance.analysis.management.companies", label: "公司经营绩效", description: "逐公司盈利、现金、偿债与资本结构指标。", apiPath: "/api/modules/finance/analysis/management", rowsPath: "companies",
  fields: {
    code: f("公司编码", "公司编码。", "text"), name: f("公司名称", "公司名称。", "text"), role: f("公司角色", "母公司、子公司或成员公司。", "text"),
    revenue: f("收入", "营业收入。", "currency"), grossProfit: f("毛利", "营业毛利。", "currency"), netProfit: f("净利润", "净利润。", "currency"), netMargin: f("净利率", "净利润率。", "percent"),
    operatingCashFlow: f("经营现金流", "经营活动现金流净额。", "currency"), endingCash: f("期末现金", "期末现金余额。", "currency"), currentRatio: f("流动比率", "流动资产除以流动负债。", "number"),
    assetLiabilityRatio: f("资产负债率", "负债占资产比例。", "percent"), roe: f("ROE", "净资产收益率。", "percent"), incomeSource: f("利润来源", "利润事实来源状态。", "text"), balanceSource: f("余额来源", "余额事实来源状态。", "text"),
  },
});

const amountBreakdownFields = {
  key: f("项目键", "项目稳定键。", "text"), label: f("项目名称", "项目名称。", "text"), amount: f("金额", "本期金额。", "currency"), share: f("占比", "结构占比。", "percent"),
  priorAmount: f("上期金额", "比较期间金额。", "currency"), changeRate: f("变化率", "同比变化率。", "percent"),
} as const;
export const FINANCE_MANAGEMENT_EXPENSE_STRUCTURE_SOURCE = source<ManagementAmountBreakdown>({ sourceKey: "finance.analysis.management.expense-structure", label: "费用结构", description: "管理费用结构及同比变化。", apiPath: "/api/modules/finance/analysis/management", rowsPath: "expenseStructure", fields: amountBreakdownFields });

export const FINANCE_MANAGEMENT_WORKING_CAPITAL_SOURCE = source<ManagementWorkingCapitalComponent>({
  sourceKey: "finance.analysis.management.working-capital", label: "营运资金构成", description: "流动资产与流动负债构成及变动。", apiPath: "/api/modules/finance/analysis/management", rowsPath: "workingCapital.components",
  fields: { key: f("项目键", "营运资金项目键。", "text"), label: f("项目名称", "营运资金项目名称。", "text"), opening: f("期初", "期初金额。", "currency"), closing: f("期末", "期末金额。", "currency"), change: f("变动", "期间变动。", "currency"), kind: f("类型", "资产或负债。", "text") },
});
export const FINANCE_MANAGEMENT_CASH_SCENARIOS_SOURCE = source<ManagementCashScenario>({
  sourceKey: "finance.analysis.management.cash-scenarios", label: "现金情景", description: "13 周现金运行率情景。", apiPath: "/api/modules/finance/analysis/management", rowsPath: "cashScenarios",
  fields: { key: f("情景键", "downside、base 或 upside。", "text"), label: f("情景名称", "情景名称。", "text"), projectedCash: f("预计现金", "情景期末预计现金。", "currency"), projectedChange: f("预计变动", "预计现金变动。", "currency"), assumption: f("假设", "透明情景假设。", "text") },
});
export const FINANCE_MANAGEMENT_BUDGET_VARIANCES_SOURCE = source<ManagementBudgetVarianceRow>({
  sourceKey: "finance.analysis.management.budget-variances", label: "预算执行偏差", description: "预算或历史基线下的科目偏差。", apiPath: "/api/modules/finance/analysis/management", rowsPath: "budget.rows",
  fields: {
    key: f("项目键", "预算项目键。", "text"), label: f("项目名称", "预算项目名称。", "text"), actual: f("实际", "累计实际金额。", "currency"), plan: f("预算", "累计预算金额。", "currency"),
    benchmark: f("基线", "上年同期基线。", "currency"), variance: f("偏差", "实际减预算或基线。", "currency"), varianceRate: f("偏差率", "偏差比例。", "percent"), executionRate: f("执行率", "实际占预算比例。", "percent"),
  },
});
export const FINANCE_MANAGEMENT_PERFORMANCE_SOURCE = source<ManagementPerformanceKpi>({
  sourceKey: "finance.analysis.management.performance", label: "管理绩效 KPI", description: "增长、利润、偿债和现金 KPI。", apiPath: "/api/modules/finance/analysis/management", rowsPath: "performance",
  fields: { category: f("指标类别", "增长、盈利、效率、偿债或现金质量。", "text"), key: f("指标键", "KPI 稳定键。", "text"), label: f("指标名称", "KPI 名称。", "text"), value: f("本期值", "本期指标值。", "number"), priorValue: f("上期值", "比较期间指标值。", "number"), format: f("格式", "amount、percent、ratio 或 days。", "text"), direction: f("方向", "higher、lower 或 context。", "text"), source: f("事实来源", "指标事实来源。", "text") },
});
export const FINANCE_MANAGEMENT_RISKS_SOURCE = source<ManagementRiskFinding>({
  sourceKey: "finance.analysis.management.risks", label: "经营风险发现", description: "按既定阈值产生的经营风险发现。", apiPath: "/api/modules/finance/analysis/management", rowsPath: "risks",
  fields: { key: f("风险键", "风险规则稳定键。", "text"), level: f("风险等级", "critical、warning 或 info。", "text"), title: f("风险标题", "风险标题。", "text"), description: f("风险说明", "风险事实和判断说明。", "text"), value: f("风险值", "触发风险的指标值。", "number"), format: f("格式", "amount、percent 或 ratio。", "text") },
});
export const FINANCE_MANAGEMENT_COVERAGE_SOURCE = source<ManagementDataCoverage>({
  sourceKey: "finance.analysis.management.coverage", label: "管理分析数据覆盖", description: "管理领域事实覆盖与限制。", apiPath: "/api/modules/finance/analysis/management", rowsPath: "coverage",
  fields: { key: f("覆盖键", "覆盖检查稳定键。", "text"), domain: f("领域", "管理会计领域。", "text"), status: f("状态", "live、partial 或 missing。", "text"), evidence: f("证据", "覆盖证据。", "text"), limitation: f("限制", "当前数据限制。", "text") },
});
export const FINANCE_MANAGEMENT_OPERATIONAL_RANKINGS_SOURCE = source<ManagementOperationalRankingRow>({
  sourceKey: "finance.analysis.management.operational-rankings", label: "经营业务排行", description: "产品、客户、成本类别与成本产品排行的统一事实行。", apiPath: "/api/modules/finance/analysis/management", rowsPath: "operations",
  fields: { kind: f("排行类型", "product、customer、costCategory 或 costProduct。", "text"), name: f("名称", "业务对象名称。", "text", "confidential"), value: f("金额", "业务对象金额。", "currency"), share: f("占比", "同类业务金额占比。", "percent") },
});

export const FINANCE_WORKSPACE_ANALYSIS_DERIVED_SOURCE_REGISTRATIONS = [
  FINANCE_FUND_FLOW_SUMMARY_FACTS_SOURCE, FINANCE_FUND_FLOW_SCOPE_VALUES_SOURCE, FINANCE_FUND_FLOW_WARNINGS_SOURCE,
  FINANCE_FUND_FLOW_ACTIVITIES_SOURCE, FINANCE_FUND_FLOW_SOURCES_SOURCE, FINANCE_FUND_FLOW_USES_SOURCE,
  FINANCE_FUND_FLOW_LEDGER_CHANNELS_SOURCE, FINANCE_FUND_FLOW_BALANCE_SIGNALS_SOURCE, FINANCE_FUND_FLOW_COMPANIES_SOURCE,
  FINANCE_MANAGEMENT_COMPANIES_SOURCE, FINANCE_MANAGEMENT_EXPENSE_STRUCTURE_SOURCE, FINANCE_MANAGEMENT_WORKING_CAPITAL_SOURCE,
  FINANCE_MANAGEMENT_CASH_SCENARIOS_SOURCE, FINANCE_MANAGEMENT_BUDGET_VARIANCES_SOURCE, FINANCE_MANAGEMENT_PERFORMANCE_SOURCE,
  FINANCE_MANAGEMENT_RISKS_SOURCE, FINANCE_MANAGEMENT_COVERAGE_SOURCE, FINANCE_MANAGEMENT_OPERATIONAL_RANKINGS_SOURCE,
  FINANCE_MANAGEMENT_SUMMARY_FACTS_SOURCE, FINANCE_MANAGEMENT_OPERATION_MONTHS_SOURCE, FINANCE_MANAGEMENT_WARNINGS_SOURCE,
] as const;
