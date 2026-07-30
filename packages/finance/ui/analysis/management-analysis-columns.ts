import type { DataSurfaceColumnSpec, DataSurfaceDisplaySpec } from "@workspace/core/ui";
import type {
  ManagementAmountBreakdown,
  ManagementBudgetVarianceRow,
  ManagementCashScenario,
  ManagementCompanyPerformance,
  ManagementDataCoverage,
  ManagementNamedAmount,
  ManagementPerformanceKpi,
  ManagementWorkingCapitalComponent,
} from "@workspace/finance/types";
import { formatFinanceAmount } from "../formatters";

function money(value: number, signed = false): DataSurfaceDisplaySpec {
  return {
    kind: "text",
    value: `${signed && value > 0 ? "+" : ""}${formatFinanceAmount(value)}`,
    tone: value < -0.005 ? "danger" : signed && value > 0.005 ? "success" : "default",
    emphasis: signed && Math.abs(value) > 0.005 ? "medium" : "normal",
  };
}

function percent(value: number | null) {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

function ratio(value: number | null) {
  return value === null ? "—" : value.toFixed(2);
}

export const managementCompanyColumns: DataSurfaceColumnSpec<ManagementCompanyPerformance>[] = [
  { key: "name", label: "公司", required: true, emphasis: "medium", cell: (row) => row.name },
  { key: "role", label: "角色", required: true, cell: (row) => ({ kind: "badge", label: row.role, tone: row.role === "母公司" ? "blue" : "gray" }) },
  { key: "revenue", label: "营业收入", required: true, align: "right", cell: (row) => formatFinanceAmount(row.revenue) },
  { key: "netProfit", label: "净利润", required: true, align: "right", cell: (row) => money(row.netProfit, true) },
  { key: "operatingCash", label: "经营现金净额", required: true, align: "right", cell: (row) => money(row.operatingCashFlow, true) },
  { key: "endingCash", label: "期末现金", required: true, align: "right", cell: (row) => formatFinanceAmount(row.endingCash) },
  { key: "currentRatio", label: "流动比率", required: true, align: "right", cell: (row) => ratio(row.currentRatio) },
  { key: "leverage", label: "资产负债率", required: true, align: "right", cell: (row) => percent(row.assetLiabilityRatio) },
  { key: "source", label: "事实来源", required: true, cell: (row) => ({ kind: "badge", label: row.incomeSource === "missing" || row.balanceSource === "missing" ? "缺事实" : "ERP 系统账", tone: row.incomeSource === "missing" || row.balanceSource === "missing" ? "red" : "green" }) },
];

export const expenseColumns: DataSurfaceColumnSpec<ManagementAmountBreakdown>[] = [
  { key: "label", label: "成本费用项目", required: true, emphasis: "medium", cell: (row) => row.label },
  { key: "amount", label: "本期", required: true, align: "right", cell: (row) => formatFinanceAmount(row.amount) },
  { key: "prior", label: "上年同期", required: true, align: "right", cell: (row) => formatFinanceAmount(row.priorAmount ?? 0) },
  { key: "change", label: "同比", required: true, align: "right", cell: (row) => percent(row.changeRate ?? null) },
  { key: "share", label: "结构占比", required: true, align: "right", cell: (row) => percent(row.share) },
];

export const workingCapitalColumns: DataSurfaceColumnSpec<ManagementWorkingCapitalComponent>[] = [
  { key: "label", label: "营运资金项目", required: true, emphasis: "medium", cell: (row) => row.label },
  { key: "kind", label: "性质", required: true, cell: (row) => ({ kind: "badge", label: row.kind === "asset" ? "占用/资产" : "来源/负债", tone: row.kind === "asset" ? "blue" : "gray" }) },
  { key: "opening", label: "期初/上年末", required: true, align: "right", cell: (row) => formatFinanceAmount(row.opening) },
  { key: "closing", label: "期末", required: true, align: "right", cell: (row) => formatFinanceAmount(row.closing) },
  { key: "change", label: "变化", required: true, align: "right", cell: (row) => money(row.change, true) },
];

export const cashScenarioColumns: DataSurfaceColumnSpec<ManagementCashScenario>[] = [
  { key: "label", label: "13周情景", required: true, emphasis: "medium", cell: (row) => row.label },
  { key: "change", label: "预计现金变化", required: true, align: "right", cell: (row) => money(row.projectedChange, true) },
  { key: "cash", label: "预计期末现金", required: true, align: "right", cell: (row) => money(row.projectedCash) },
  { key: "assumption", label: "假设", required: true, tone: "muted", cell: (row) => row.assumption },
];

export const budgetVarianceColumns: DataSurfaceColumnSpec<ManagementBudgetVarianceRow>[] = [
  { key: "label", label: "费用项目", required: true, emphasis: "medium", cell: (row) => row.label },
  { key: "actual", label: "实际", required: true, align: "right", cell: (row) => formatFinanceAmount(row.actual) },
  { key: "plan", label: "预算", required: true, align: "right", cell: (row) => row.plan === null ? "—" : formatFinanceAmount(row.plan) },
  { key: "benchmark", label: "上年同期", required: true, align: "right", cell: (row) => row.benchmark === null ? "—" : formatFinanceAmount(row.benchmark) },
  { key: "variance", label: "实际－基准", required: true, align: "right", cell: (row) => money(row.variance, true) },
  { key: "rate", label: "偏差率", required: true, align: "right", cell: (row) => percent(row.varianceRate) },
  { key: "execution", label: "执行率", required: true, align: "right", cell: (row) => percent(row.executionRate) },
];

export const namedAmountColumns: DataSurfaceColumnSpec<ManagementNamedAmount>[] = [
  { key: "name", label: "名称", required: true, emphasis: "medium", cell: (row) => row.name },
  { key: "value", label: "金额", required: true, align: "right", cell: (row) => formatFinanceAmount(row.value) },
  { key: "share", label: "占比", required: true, align: "right", cell: (row) => percent(row.share) },
];

function kpiValue(row: ManagementPerformanceKpi, value: number | null) {
  if (value === null) return "—";
  if (row.format === "amount") return formatFinanceAmount(value);
  if (row.format === "percent") return percent(value);
  if (row.format === "days") return `${value.toFixed(1)} 天`;
  return value.toFixed(2);
}

export const performanceColumns: DataSurfaceColumnSpec<ManagementPerformanceKpi>[] = [
  { key: "category", label: "类别", required: true, cell: (row) => ({
    kind: "badge",
    label: row.category === "growth" ? "增长" : row.category === "profitability" ? "盈利" : row.category === "efficiency" ? "效率" : row.category === "solvency" ? "偿债" : "现金质量",
    tone: row.category === "growth" ? "blue" : row.category === "solvency" ? "amber" : row.category === "cash" ? "green" : "gray",
  }) },
  { key: "label", label: "KPI", required: true, emphasis: "medium", cell: (row) => row.label },
  { key: "value", label: "本期", required: true, align: "right", cell: (row) => kpiValue(row, row.value) },
  { key: "prior", label: "上年同期", required: true, align: "right", cell: (row) => kpiValue(row, row.priorValue) },
  { key: "direction", label: "评价方向", required: true, cell: (row) => ({ kind: "badge", label: row.direction === "higher" ? "越高越好" : row.direction === "lower" ? "越低越好" : "结合情境", tone: "gray" }) },
  { key: "source", label: "来源", required: true, cell: (row) => ({ kind: "badge", label: row.source === "derived" ? "派生" : "报表", tone: row.source === "derived" ? "gray" : "green" }) },
];

export const coverageColumns: DataSurfaceColumnSpec<ManagementDataCoverage>[] = [
  { key: "domain", label: "管理领域", required: true, emphasis: "medium", cell: (row) => row.domain },
  { key: "status", label: "状态", required: true, cell: (row) => ({ kind: "badge", label: row.status === "live" ? "已计算" : row.status === "partial" ? "部分可用" : "缺事实", tone: row.status === "live" ? "green" : row.status === "partial" ? "amber" : "red" }) },
  { key: "evidence", label: "当前产出", required: true, cell: (row) => row.evidence },
  { key: "limitation", label: "边界/下一步", required: true, tone: "muted", cell: (row) => row.limitation },
];
