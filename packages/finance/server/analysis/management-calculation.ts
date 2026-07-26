import type {
  ManagementCashScenario,
  ManagementPerformanceKpi,
  ManagementProfitabilitySummary,
  ManagementRiskFinding,
  ManagementWorkingCapital,
} from "@workspace/finance/types";

export type AmountMap = Record<string, number>;

export function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export function safeRatio(numerator: number, denominator: number) {
  return Math.abs(denominator) > 0.005 ? numerator / denominator : null;
}

export function changeRate(current: number, previous: number) {
  return Math.abs(previous) > 0.005 ? (current - previous) / Math.abs(previous) : null;
}

function amount(map: AmountMap, key: string) {
  return map[key] ?? 0;
}

export function summarizeProfitability(
  current: AmountMap,
  previous: AmountMap,
): ManagementProfitabilitySummary {
  const revenue = amount(current, "revenue");
  const operatingCost = amount(current, "cost");
  const grossProfit = roundMoney(revenue - operatingCost);
  const periodExpenses = roundMoney(
    amount(current, "sales") + amount(current, "admin")
      + amount(current, "rd") + amount(current, "finance") + amount(current, "tax"),
  );
  const netProfit = amount(current, "netProfit");
  const priorRevenue = amount(previous, "revenue");
  const priorNetProfit = amount(previous, "netProfit");
  return {
    revenue: roundMoney(revenue),
    operatingCost: roundMoney(operatingCost),
    grossProfit,
    grossMargin: safeRatio(grossProfit, revenue),
    periodExpenses,
    operatingProfit: roundMoney(amount(current, "operatingProfit")),
    totalProfit: roundMoney(amount(current, "totalProfit")),
    netProfit: roundMoney(netProfit),
    netMargin: safeRatio(netProfit, revenue),
    priorRevenue: roundMoney(priorRevenue),
    priorNetProfit: roundMoney(priorNetProfit),
    revenueChangeRate: changeRate(revenue, priorRevenue),
    netProfitChange: roundMoney(netProfit - priorNetProfit),
  };
}

function aggregateBalance(map: AmountMap, keys: string[]) {
  return roundMoney(keys.reduce((sum, key) => sum + amount(map, key), 0));
}

export function buildWorkingCapital(
  current: AmountMap,
  previous: AmountMap,
  revenue: number,
  operatingCost: number,
  elapsedDays: number,
): ManagementWorkingCapital {
  const cash = amount(current, "cash");
  const receivables = aggregateBalance(current, ["notesReceivable", "receivable"]);
  const priorReceivables = aggregateBalance(previous, ["notesReceivable", "receivable"]);
  const inventory = amount(current, "inventory");
  const priorInventory = amount(previous, "inventory");
  const prepayments = amount(current, "prepaid");
  const otherReceivables = amount(current, "otherReceivableNet");
  const payables = aggregateBalance(current, ["notesPayable", "payables"]);
  const priorPayables = aggregateBalance(previous, ["notesPayable", "payables"]);
  const customerAdvances = amount(current, "advanceReceipts");
  const otherPayables = amount(current, "otherPayables");
  const currentAssets = amount(current, "totalCurrentAssets");
  const currentLiabilities = amount(current, "totalCurrentLiabilities");
  const average = (currentValue: number, priorValue: number) => (currentValue + priorValue) / 2;
  const components = [
    ["cash", "货币资金", amount(previous, "cash"), cash, "asset"],
    ["receivables", "应收票据及账款", priorReceivables, receivables, "asset"],
    ["inventory", "存货", priorInventory, inventory, "asset"],
    ["prepayments", "预付款项", amount(previous, "prepaid"), prepayments, "asset"],
    ["otherReceivables", "其他应收款", amount(previous, "otherReceivableNet"), otherReceivables, "asset"],
    ["payables", "应付票据及账款", priorPayables, payables, "liability"],
    ["customerAdvances", "预收/合同负债", amount(previous, "advanceReceipts"), customerAdvances, "liability"],
    ["otherPayables", "其他应付款", amount(previous, "otherPayables"), otherPayables, "liability"],
  ] as const;
  return {
    currentAssets: roundMoney(currentAssets),
    currentLiabilities: roundMoney(currentLiabilities),
    netWorkingCapital: roundMoney(currentAssets - currentLiabilities),
    currentRatio: safeRatio(currentAssets, currentLiabilities),
    quickRatio: safeRatio(currentAssets - inventory - prepayments, currentLiabilities),
    cashRatio: safeRatio(cash, currentLiabilities),
    receivableDays: safeRatio(average(receivables, priorReceivables) * elapsedDays, revenue),
    inventoryDays: safeRatio(average(inventory, priorInventory) * elapsedDays, operatingCost),
    payableDays: safeRatio(average(payables, priorPayables) * elapsedDays, operatingCost),
    components: components.map(([key, label, opening, closing, kind]) => ({
      key,
      label,
      opening: roundMoney(opening),
      closing: roundMoney(closing),
      change: roundMoney(closing - opening),
      kind,
    })),
  };
}

export function buildCashScenarios(input: {
  endingCash: number;
  inflow: number;
  outflow: number;
  elapsedMonths: number;
}): ManagementCashScenario[] {
  const months = Math.max(1, input.elapsedMonths);
  const projectionMonths = 3;
  const project = (inflowFactor: number, outflowFactor: number) => {
    const change = ((input.inflow * inflowFactor) - (input.outflow * outflowFactor)) / months * projectionMonths;
    return { change: roundMoney(change), cash: roundMoney(input.endingCash + change) };
  };
  const downside = project(0.9, 1.05);
  const base = project(1, 1);
  const upside = project(1.05, 1);
  return [
    { key: "downside", label: "压力情景", projectedCash: downside.cash, projectedChange: downside.change, assumption: "近期开支节奏延续，流入下降10%、流出上升5%" },
    { key: "base", label: "基准情景", projectedCash: base.cash, projectedChange: base.change, assumption: "按本年截至当前月份的平均净现金流外推13周" },
    { key: "upside", label: "改善情景", projectedCash: upside.cash, projectedChange: upside.change, assumption: "流出节奏不变、流入提高5%" },
  ];
}

export function buildPerformanceKpis(input: {
  revenue: number;
  priorRevenue: number;
  netProfit: number;
  priorNetProfit: number;
  totalAssets: number;
  priorAssets: number;
  totalEquity: number;
  priorEquity: number;
  totalLiabilities: number;
  currentRatio: number | null;
  operatingCashFlow: number;
  freeCashFlow: number;
}): ManagementPerformanceKpi[] {
  const averageAssets = (input.totalAssets + input.priorAssets) / 2;
  const averageEquity = (input.totalEquity + input.priorEquity) / 2;
  return [
    { key: "revenue-growth", label: "营业收入增长率", value: changeRate(input.revenue, input.priorRevenue), priorValue: null, format: "percent", direction: "higher", source: "ledger" },
    { key: "net-profit", label: "净利润", value: input.netProfit, priorValue: input.priorNetProfit, format: "amount", direction: "higher", source: "ledger" },
    { key: "roa", label: "总资产收益率", value: safeRatio(input.netProfit, averageAssets), priorValue: null, format: "percent", direction: "higher", source: "derived" },
    { key: "roe", label: "净资产收益率", value: averageEquity > 0 ? safeRatio(input.netProfit, averageEquity) : null, priorValue: null, format: "percent", direction: "higher", source: "derived" },
    { key: "asset-liability", label: "资产负债率", value: safeRatio(input.totalLiabilities, input.totalAssets), priorValue: null, format: "percent", direction: "lower", source: "derived" },
    { key: "current-ratio", label: "流动比率", value: input.currentRatio, priorValue: null, format: "ratio", direction: "higher", source: "derived" },
    { key: "operating-cash", label: "经营现金净额", value: input.operatingCashFlow, priorValue: null, format: "amount", direction: "higher", source: "ledger" },
    { key: "free-cash", label: "自由现金流", value: input.freeCashFlow, priorValue: null, format: "amount", direction: "higher", source: "derived" },
  ];
}

export function buildRiskFindings(input: {
  netProfit: number;
  operatingCashFlow: number;
  totalEquity: number;
  currentRatio: number | null;
  projectedStressCash: number;
  shipmentRevenueGap: number;
  statutoryRevenue: number;
  hasBudget: boolean;
}): ManagementRiskFinding[] {
  const findings: ManagementRiskFinding[] = [];
  if (input.totalEquity < 0) findings.push({ key: "negative-equity", level: "critical", title: "净资产为负", description: "所选公司管理汇总的所有者权益为负，需要逐公司评估持续经营、债务和资本补充方案。", value: input.totalEquity, format: "amount" });
  if (input.currentRatio !== null && input.currentRatio < 1) findings.push({ key: "liquidity", level: "critical", title: "流动资产不足以覆盖流动负债", description: "流动比率低于1，短期偿债依赖新增融资、关联方支持或经营回款。", value: input.currentRatio, format: "ratio" });
  if (input.netProfit < 0) findings.push({ key: "loss", level: "warning", title: "本期经营亏损", description: "净利润为负，应结合费用结构、业务收入完整性和持续投入项目拆解亏损来源。", value: input.netProfit, format: "amount" });
  if (input.operatingCashFlow < 0) findings.push({ key: "operating-cash", level: "warning", title: "经营现金净流出", description: "经营活动不能自我覆盖，资金缺口需要由筹资或存量现金补充。", value: input.operatingCashFlow, format: "amount" });
  if (input.projectedStressCash < 0) findings.push({ key: "cash-stress", level: "critical", title: "13周压力情景出现现金缺口", description: "该情景基于历史运行率，不含明确到期日；仍应尽快补齐回款、付款和融资计划。", value: input.projectedStressCash, format: "amount" });
  const gapMateriality = Math.abs(input.shipmentRevenueGap) > Math.max(100_000, Math.abs(input.statutoryRevenue) * 0.1);
  if (gapMateriality) findings.push({ key: "revenue-reconciliation", level: "warning", title: "业务发货与法定收入未勾稽", description: "成本模块发货额未分配到公司，且与利润表营业收入差异重大；不得直接作为审计口径收入或毛利。", value: input.shipmentRevenueGap, format: "amount" });
  if (!input.hasBudget) findings.push({ key: "budget-missing", level: "info", title: "没有生效预算版本", description: "当前以本期实际对比上年同期作为滚动基线；导入并激活预算后将自动切换为预算执行分析。" });
  return findings;
}
