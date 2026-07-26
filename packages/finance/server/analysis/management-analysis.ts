import type {
  ManagementAnalysis,
  ManagementAmountBreakdown,
  ManagementBudgetControl,
  ManagementBudgetVarianceRow,
  ManagementCompanyPerformance,
  ManagementNamedAmount,
} from "@workspace/finance/types";
import {
  buildCashScenarios,
  buildPerformanceKpis,
  buildRiskFindings,
  buildWorkingCapital,
  changeRate,
  roundMoney,
  safeRatio,
  summarizeProfitability,
  type AmountMap,
} from "./management-calculation";
import { getFundFlowAnalysis, type FundFlowAnalysisInput } from "./fund-flow-analysis";
import {
  loadBudgetFacts,
  loadCompanyStatementFacts,
  loadOperationalFacts,
  type CompanyStatementFacts,
} from "./management-facts";

function sumMaps(maps: AmountMap[]) {
  const result: AmountMap = {};
  for (const map of maps) {
    for (const [key, value] of Object.entries(map)) result[key] = (result[key] ?? 0) + value;
  }
  return Object.fromEntries(Object.entries(result).map(([key, value]) => [key, roundMoney(value)]));
}

function value(map: AmountMap, key: string) {
  return map[key] ?? 0;
}

function breakdown(
  current: AmountMap,
  previous: AmountMap,
  definitions: Array<[string, string]>,
): ManagementAmountBreakdown[] {
  const total = definitions.reduce((sum, [key]) => sum + Math.abs(value(current, key)), 0);
  return definitions.map(([key, label]) => ({
    key,
    label,
    amount: roundMoney(value(current, key)),
    share: total > 0 ? Math.abs(value(current, key)) / total : 0,
    priorAmount: roundMoney(value(previous, key)),
    changeRate: changeRate(value(current, key), value(previous, key)),
  })).sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
}

function toNamedAmounts(rows: Array<{ key: string; amount: number }>, total: number): ManagementNamedAmount[] {
  return rows.slice(0, 10).map((row) => ({
    name: row.key,
    value: row.amount,
    share: total > 0 ? row.amount / total : 0,
  }));
}

const EXPENSE_DEFINITIONS: Array<[string, string]> = [
  ["cost", "营业成本"],
  ["tax", "税金及附加"],
  ["sales", "销售费用"],
  ["admin", "管理费用"],
  ["rd", "研发费用"],
  ["finance", "财务费用"],
];

function historicalBudgetControl(current: AmountMap, previous: AmountMap): ManagementBudgetControl {
  const rows: ManagementBudgetVarianceRow[] = EXPENSE_DEFINITIONS.map(([key, label]) => {
    const actual = value(current, key);
    const benchmark = value(previous, key);
    return {
      key,
      label,
      actual: roundMoney(actual),
      plan: null,
      benchmark: roundMoney(benchmark),
      variance: roundMoney(actual - benchmark),
      varianceRate: changeRate(actual, benchmark),
      executionRate: null,
    };
  });
  const actualAmount = rows.reduce((sum, row) => sum + row.actual, 0);
  const benchmarkAmount = rows.reduce((sum, row) => sum + (row.benchmark ?? 0), 0);
  return {
    mode: "historical",
    hasBudget: false,
    versionName: null,
    planAmount: null,
    actualAmount: roundMoney(actualAmount),
    benchmarkAmount: roundMoney(benchmarkAmount),
    variance: roundMoney(actualAmount - benchmarkAmount),
    varianceRate: changeRate(actualAmount, benchmarkAmount),
    executionRate: null,
    mappedRows: 0,
    totalRows: 0,
    rows,
  };
}

function activeBudgetControl(facts: NonNullable<Awaited<ReturnType<typeof loadBudgetFacts>>>): ManagementBudgetControl {
  const rows = facts.rows.map((row) => ({
    key: row.name,
    label: row.name,
    actual: row.actual,
    plan: row.plan,
    benchmark: null,
    variance: roundMoney(row.actual - row.plan),
    varianceRate: changeRate(row.actual, row.plan),
    executionRate: safeRatio(row.actual, row.plan),
  })).sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));
  const planAmount = rows.reduce((sum, row) => sum + (row.plan ?? 0), 0);
  const actualAmount = rows.reduce((sum, row) => sum + row.actual, 0);
  return {
    mode: "budget",
    hasBudget: true,
    versionName: facts.version.name,
    planAmount: roundMoney(planAmount),
    actualAmount: roundMoney(actualAmount),
    benchmarkAmount: null,
    variance: roundMoney(actualAmount - planAmount),
    varianceRate: changeRate(actualAmount, planAmount),
    executionRate: safeRatio(actualAmount, planAmount),
    mappedRows: facts.mappedRows,
    totalRows: facts.totalRows,
    rows,
  };
}

function companyRows(
  fundFlow: Awaited<ReturnType<typeof getFundFlowAnalysis>>,
  facts: CompanyStatementFacts[],
): ManagementCompanyPerformance[] {
  return fundFlow.companies.map((company, index) => {
    const row = facts[index]!;
    const profit = summarizeProfitability(row.income, row.priorIncome);
    const assets = value(row.balance, "totalAssets");
    const liabilities = value(row.balance, "totalLiabilities");
    const equity = value(row.balance, "totalEquity");
    const averageEquity = (equity + value(row.priorBalance, "totalEquity")) / 2;
    return {
      code: company.code,
      name: company.name,
      role: company.role,
      revenue: profit.revenue,
      grossProfit: profit.grossProfit,
      netProfit: profit.netProfit,
      netMargin: profit.netMargin,
      operatingCashFlow: roundMoney(value(row.cashFlow, "operatingNet")),
      endingCash: company.endingCash,
      currentRatio: safeRatio(value(row.balance, "totalCurrentAssets"), value(row.balance, "totalCurrentLiabilities")),
      assetLiabilityRatio: safeRatio(liabilities, assets),
      roe: averageEquity > 0 ? safeRatio(profit.netProfit, averageEquity) : null,
      incomeSource: row.incomeSource,
      balanceSource: row.balanceSource,
    };
  });
}

export async function getManagementAnalysis(input: FundFlowAnalysisInput): Promise<ManagementAnalysis> {
  const fundFlow = await getFundFlowAnalysis(input);
  const { companyCodes, year, month } = fundFlow.scope;
  const [statementFacts, operational, budgetFacts] = await Promise.all([
    Promise.all(companyCodes.map((code) => loadCompanyStatementFacts(code, year, month))),
    loadOperationalFacts(year, month),
    loadBudgetFacts(companyCodes, year, month),
  ]);
  const income = sumMaps(statementFacts.map((row) => row.income));
  const priorIncome = sumMaps(statementFacts.map((row) => row.priorIncome));
  const balance = sumMaps(statementFacts.map((row) => row.balance));
  const priorBalance = sumMaps(statementFacts.map((row) => row.priorBalance));
  const profitability = summarizeProfitability(income, priorIncome);
  const workingCapital = buildWorkingCapital(
    balance,
    priorBalance,
    profitability.revenue,
    profitability.operatingCost,
    Math.round(365 * month / 12),
  );
  const cashScenarios = buildCashScenarios({
    endingCash: fundFlow.metrics.endingCash,
    inflow: fundFlow.metrics.inflow,
    outflow: fundFlow.metrics.outflow,
    elapsedMonths: month,
  });
  const budget = budgetFacts ? activeBudgetControl(budgetFacts) : historicalBudgetControl(income, priorIncome);
  const operations = {
    companyAssignment: "unassigned" as const,
    shipmentMonths: operational.shipmentMonths,
    costMonths: operational.costMonths,
    shipmentAmount: operational.shipmentAmount,
    receivedAmount: operational.receivedAmount,
    unreceivedAmount: roundMoney(operational.shipmentAmount - operational.receivedAmount),
    collectionRate: safeRatio(operational.receivedAmount, operational.shipmentAmount),
    costAmount: operational.costAmount,
    statutoryRevenue: profitability.revenue,
    shipmentRevenueGap: roundMoney(operational.shipmentAmount - profitability.revenue),
    topProducts: toNamedAmounts(operational.topProducts, operational.shipmentAmount),
    topCustomers: toNamedAmounts(operational.topCustomers, operational.shipmentAmount),
    costCategories: toNamedAmounts(operational.costCategories, operational.costAmount),
    topCostProducts: toNamedAmounts(operational.topCostProducts, operational.costAmount),
  };
  const investing = fundFlow.activities.find((row) => row.key === "investing")!;
  const financing = fundFlow.activities.find((row) => row.key === "financing")!;
  const operating = fundFlow.activities.find((row) => row.key === "operating")!;
  const capitalExpenditure = fundFlow.uses.find((row) => row.key === "fixedAssetPurchase")?.amount ?? 0;
  const totalAssets = value(balance, "totalAssets");
  const totalLiabilities = value(balance, "totalLiabilities");
  const totalEquity = value(balance, "totalEquity");
  const capital = {
    totalAssets,
    totalLiabilities,
    totalEquity,
    interestBearingDebt: roundMoney(value(balance, "shortTermLoans") + value(balance, "longTermLoans") + value(balance, "bondsPayable")),
    otherPayables: roundMoney(value(balance, "otherPayables")),
    paidInCapital: roundMoney(value(balance, "paidInCapital")),
    capitalReserve: roundMoney(value(balance, "capitalReserve")),
    assetLiabilityRatio: safeRatio(totalLiabilities, totalAssets),
    debtToEquity: totalEquity > 0 ? safeRatio(totalLiabilities, totalEquity) : null,
    investingInflow: investing.inflow,
    investingOutflow: investing.outflow,
    financingInflow: financing.inflow,
    financingOutflow: financing.outflow,
    capitalExpenditure: roundMoney(capitalExpenditure),
    operatingCashFlow: operating.net,
    freeCashFlow: roundMoney(operating.net - capitalExpenditure),
  };
  const performance = buildPerformanceKpis({
    revenue: profitability.revenue,
    priorRevenue: profitability.priorRevenue,
    netProfit: profitability.netProfit,
    priorNetProfit: profitability.priorNetProfit,
    totalAssets,
    priorAssets: value(priorBalance, "totalAssets"),
    totalEquity,
    priorEquity: value(priorBalance, "totalEquity"),
    totalLiabilities,
    currentRatio: workingCapital.currentRatio,
    operatingCashFlow: operating.net,
    freeCashFlow: capital.freeCashFlow,
  });
  const risks = buildRiskFindings({
    netProfit: profitability.netProfit,
    operatingCashFlow: operating.net,
    totalEquity,
    currentRatio: workingCapital.currentRatio,
    projectedStressCash: cashScenarios.find((row) => row.key === "downside")!.projectedCash,
    shipmentRevenueGap: operations.shipmentRevenueGap,
    statutoryRevenue: profitability.revenue,
    hasBudget: budget.hasBudget,
  });
  const sourceWarnings = statementFacts.flatMap((row, index) => {
    const company = fundFlow.companies[index]!;
    const messages: string[] = [];
    if (row.incomeSource === "ledger") messages.push(`${company.name}：利润表按已记账凭证方向发生额计算管理口径。`);
    if (row.balanceSource === "ledger") messages.push(`${company.name}：资产负债表按期末科目余额计算管理口径，未包含报表重分类。`);
    if (row.priorIncomeSource === "missing" || row.priorBalanceSource === "missing") messages.push(`${company.name}：${year - 1}年同期比较事实不完整，同比和平均资产/权益指标仅作数据缺口提示。`);
    return messages;
  });
  const operationalCoverage = `发货覆盖${operational.shipmentMonths.length ? operational.shipmentMonths.join("、") : "无"}月，成本覆盖${operational.costMonths.length ? operational.costMonths.join("、") : "无"}月`;
  return {
    fundFlow,
    scope: {
      companyCodes,
      label: fundFlow.scope.label,
      year,
      month,
      periodLabel: fundFlow.scope.periodLabel,
      aggregation: fundFlow.scope.aggregation,
      comparisonLabel: `${year - 1}年同期`,
    },
    profitability,
    companies: companyRows(fundFlow, statementFacts),
    expenseStructure: breakdown(income, priorIncome, EXPENSE_DEFINITIONS),
    workingCapital,
    cashScenarios,
    budget,
    operations,
    capital,
    performance,
    risks,
    coverage: [
      { key: "strategy", domain: "战略管理", status: "partial", evidence: "三表经营基线与关键风险已形成", limitation: "尚无战略目标、价值驱动因子和目标责任人模型" },
      { key: "budget", domain: "预算管理", status: budget.hasBudget ? "live" : "partial", evidence: budget.hasBudget ? `${budget.versionName}执行分析` : "实际对上年同期滚动基线", limitation: budget.hasBudget ? "责任中心实际数仍受总账维度限制" : "未导入并激活预算版本" },
      { key: "cost", domain: "成本管理", status: operational.costAmount > 0 ? "partial" : "missing", evidence: operationalCoverage, limitation: "业务成本未编码到公司，且尚未与总账/收入勾稽" },
      { key: "operations", domain: "营运管理", status: "live", evidence: "现金来源用途、营运资金与13周运行率情景", limitation: "未接入应收应付到期日，情景不等于排程预测" },
      { key: "investment", domain: "投融资管理", status: "partial", evidence: "投资/筹资现金流、资本结构与自由现金流", limitation: "缺项目现金流、融资期限利率与资本成本" },
      { key: "performance", domain: "绩效管理", status: "partial", evidence: "公司级增长、利润、ROA/ROE、现金和偿债指标", limitation: "缺目标值、责任中心和非财务指标" },
      { key: "risk", domain: "风险管理", status: "live", evidence: `${risks.length}项基于阈值和勾稽的当前发现`, limitation: "阈值为管理预警，不替代审计、法务或持续经营判断" },
    ],
    warnings: [
      ...fundFlow.warnings,
      ...sourceWarnings,
      `成本业务数据未分配到具体公司；${operationalCoverage}，不得与所选单家公司法定口径直接相加。`,
    ],
  };
}
