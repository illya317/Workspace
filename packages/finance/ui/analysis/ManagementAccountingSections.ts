import {
  createAnalysisSection,
  createListSection,
  createMessageSection,
  createMetricsSection,
  createPageTableSection,
  createSectionsSection,
  type BodySurfaceSectionSpec,
  type PageSurfaceTabBarItemSpec,
} from "@workspace/core/ui";
import type { FundFlowAnalysis, ManagementAnalysis, ManagementRiskFinding } from "@workspace/finance/types";
import { formatFinanceAmount } from "../formatters";
import { activityColumns, balanceSignalColumns, ledgerChannelColumns } from "./fund-flow-columns";
import {
  budgetVarianceColumns,
  cashScenarioColumns,
  coverageColumns,
  expenseColumns,
  managementCompanyColumns,
  namedAmountColumns,
  performanceColumns,
  workingCapitalColumns,
} from "./management-analysis-columns";

export type ManagementAccountingView = "overview" | "cash" | "budget" | "profitability" | "investment" | "performance";

export const managementAccountingTabs: PageSurfaceTabBarItemSpec[] = [
  { key: "overview", label: "管理总览" },
  { key: "cash", label: "资金与营运" },
  { key: "budget", label: "预算与预测" },
  { key: "profitability", label: "盈利与成本" },
  { key: "investment", label: "投融资" },
  { key: "performance", label: "绩效与风险" },
];

function percent(value: number | null) {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

function ratio(value: number | null) {
  return value === null ? "—" : value.toFixed(2);
}

function days(value: number | null) {
  return value === null ? "—" : `${value.toFixed(1)} 天`;
}

function signed(value: number) {
  return {
    kind: "text" as const,
    value: `${value > 0 ? "+" : ""}${formatFinanceAmount(value)}`,
    tone: value < -0.005 ? "danger" as const : value > 0.005 ? "success" as const : "default" as const,
    emphasis: "medium" as const,
  };
}

function riskValue(risk: ManagementRiskFinding) {
  if (risk.value === undefined || risk.value === null) return null;
  if (risk.format === "percent") return percent(risk.value);
  if (risk.format === "ratio") return ratio(risk.value);
  return formatFinanceAmount(risk.value);
}

function riskList(data: ManagementAnalysis, key: string) {
  return createListSection(key, {
    presentation: "cards",
    items: data.risks.map((risk) => ({
      key: risk.key,
      title: risk.title,
      description: `${risk.description}${riskValue(risk) ? ` 当前值：${riskValue(risk)}` : ""}`,
      tone: risk.level === "critical" ? "danger" : risk.level === "warning" ? "warning" : "default",
      badges: [{
        key: "level",
        label: risk.level === "critical" ? "高风险" : risk.level === "warning" ? "需关注" : "信息",
        tone: risk.level === "critical" ? "danger" : risk.level === "warning" ? "warning" : "info",
      }],
    })),
  });
}

export function buildManagementOverviewSections(data: ManagementAnalysis): BodySurfaceSectionSpec[] {
  const criticalCount = data.risks.filter((risk) => risk.level === "critical").length;
  return [
    createMessageSection("management-accounting-definition", {
      content: `当前口径：${data.scope.label} · ${data.scope.periodLabel}。管理会计在法定报表基础上连接经营、预算、成本、投融资、绩效和风险；多公司金额为未抵销管理汇总。`,
    }),
    createMetricsSection("management-overview-metrics", {
      metrics: [
        { key: "revenue", label: "营业收入", value: formatFinanceAmount(data.profitability.revenue) },
        { key: "net-profit", label: "净利润", value: signed(data.profitability.netProfit) },
        { key: "operating-cash", label: "经营现金净额", value: signed(data.capital.operatingCashFlow) },
        { key: "ending-cash", label: "期末货币资金", value: formatFinanceAmount(data.workingCapital.components.find((row) => row.key === "cash")?.closing ?? 0) },
        { key: "working-capital", label: "净营运资金", value: signed(data.workingCapital.netWorkingCapital) },
        { key: "risk", label: "高风险 / 全部发现", value: `${criticalCount} / ${data.risks.length}` },
      ],
    }),
    createAnalysisSection("management-diagnosis", {
      title: "当前管理诊断",
      sections: [riskList(data, "management-diagnosis-list")],
    }),
    createAnalysisSection("management-company-comparison", {
      title: "母子公司经营与偿债对比",
      sections: [createPageTableSection("management-company-table", {
        rows: data.companies,
        columns: managementCompanyColumns,
        visibleColumns: managementCompanyColumns.map((column) => column.key),
        rowKey: (row) => row.code,
        presentation: { density: "compact" },
      })],
    }),
    createAnalysisSection("management-capability-coverage", {
      title: "管理会计七领域覆盖",
      sections: [createPageTableSection("management-capability-table", {
        rows: data.coverage,
        columns: coverageColumns,
        visibleColumns: coverageColumns.map((column) => column.key),
        rowKey: (row) => row.key,
        presentation: { density: "compact" },
      })],
    }),
  ];
}

export function buildWorkingCapitalSections(data: ManagementAnalysis): BodySurfaceSectionSpec[] {
  return [
    createMetricsSection("working-capital-metrics", {
      metrics: [
        { key: "current-assets", label: "流动资产", value: formatFinanceAmount(data.workingCapital.currentAssets) },
        { key: "current-liabilities", label: "流动负债", value: formatFinanceAmount(data.workingCapital.currentLiabilities) },
        { key: "net-working-capital", label: "净营运资金", value: signed(data.workingCapital.netWorkingCapital) },
        { key: "current-ratio", label: "流动比率", value: ratio(data.workingCapital.currentRatio) },
        { key: "quick-ratio", label: "速动比率", value: ratio(data.workingCapital.quickRatio) },
        { key: "cash-ratio", label: "现金比率", value: ratio(data.workingCapital.cashRatio) },
      ],
    }),
    createAnalysisSection("working-capital-components", {
      title: "营运资金占用与来源",
      sections: [createPageTableSection("working-capital-table", {
        rows: data.workingCapital.components,
        columns: workingCapitalColumns,
        visibleColumns: workingCapitalColumns.map((column) => column.key),
        rowKey: (row) => row.key,
        presentation: { density: "compact" },
      })],
    }),
    createMetricsSection("working-capital-efficiency", {
      metrics: [
        { key: "receivable-days", label: "应收周转天数", value: days(data.workingCapital.receivableDays) },
        { key: "inventory-days", label: "存货周转天数", value: days(data.workingCapital.inventoryDays) },
        { key: "payable-days", label: "应付周转天数", value: days(data.workingCapital.payableDays) },
      ],
    }),
  ];
}

export function buildBudgetForecastSections(data: ManagementAnalysis): BodySurfaceSectionSpec[] {
  const benchmarkLabel = data.budget.mode === "budget" ? "累计预算" : data.scope.comparisonLabel;
  return [
    createMessageSection("budget-control-basis", {
      tone: data.budget.hasBudget ? "success" : "warning",
      content: data.budget.hasBudget
        ? `当前按有效预算“${data.budget.versionName}”计算累计执行；正偏差表示实际高于预算。`
        : `当前库没有生效预算版本，页面自动采用${data.scope.comparisonLabel}作为滚动控制基线；这不是预算完成率。`,
    }),
    createMetricsSection("budget-control-metrics", {
      metrics: [
        { key: "actual", label: "本期成本费用实际", value: formatFinanceAmount(data.budget.actualAmount) },
        { key: "benchmark", label: benchmarkLabel, value: formatFinanceAmount(data.budget.planAmount ?? data.budget.benchmarkAmount ?? 0) },
        { key: "variance", label: "实际－基准", value: signed(data.budget.variance) },
        { key: "variance-rate", label: "偏差率", value: percent(data.budget.varianceRate) },
        { key: "execution", label: "预算执行率", value: percent(data.budget.executionRate) },
        { key: "mapping", label: "预算科目映射", value: data.budget.hasBudget ? `${data.budget.mappedRows} / ${data.budget.totalRows}` : "待预算版本" },
      ],
    }),
    createAnalysisSection("budget-variance-analysis", {
      title: data.budget.hasBudget ? "预算执行差异" : "实际费用同比控制",
      sections: [createPageTableSection("budget-variance-table", {
        rows: data.budget.rows,
        columns: budgetVarianceColumns,
        visibleColumns: budgetVarianceColumns.map((column) => column.key),
        rowKey: (row) => row.key,
        presentation: { density: "compact" },
      })],
    }),
    createAnalysisSection("cash-run-rate-forecast", {
      title: "13周现金运行率情景",
      sections: [
        createMessageSection("cash-run-rate-basis", {
          tone: "muted",
          content: "以截至当前月份的现金流入/流出平均运行率外推约13周；未接入客户回款日、供应商付款日和融资到期日，因此是管理情景，不是资金排程。",
        }),
        createPageTableSection("cash-run-rate-table", {
          rows: data.cashScenarios,
          columns: cashScenarioColumns,
          visibleColumns: cashScenarioColumns.map((column) => column.key),
          rowKey: (row) => row.key,
          presentation: { density: "compact" },
        }),
      ],
    }),
  ];
}

export function buildProfitabilityCostSections(data: ManagementAnalysis): BodySurfaceSectionSpec[] {
  const shipmentCoverage = data.operations.shipmentMonths.length ? data.operations.shipmentMonths.join("、") : "无";
  const costCoverage = data.operations.costMonths.length ? data.operations.costMonths.join("、") : "无";
  return [
    createMetricsSection("profitability-metrics", {
      metrics: [
        { key: "revenue", label: "法定营业收入", value: formatFinanceAmount(data.profitability.revenue) },
        { key: "gross-profit", label: "报表口径毛利", value: signed(data.profitability.grossProfit) },
        { key: "gross-margin", label: "毛利率", value: percent(data.profitability.grossMargin) },
        { key: "period-expenses", label: "期间费用及税金", value: formatFinanceAmount(data.profitability.periodExpenses) },
        { key: "operating-profit", label: "营业利润", value: signed(data.profitability.operatingProfit) },
        { key: "net-profit", label: "净利润", value: signed(data.profitability.netProfit) },
      ],
    }),
    createAnalysisSection("expense-structure", {
      title: "成本费用结构与同比",
      sections: [
        {
          key: "expense-structure-chart",
          body: { kind: "visualization", visualization: { kind: "chart", chart: { visual: {
            kind: "barChart",
            title: "本期成本费用结构",
            bars: data.expenseStructure.map((row) => ({ key: row.key, label: row.label, value: row.amount, valueLabel: formatFinanceAmount(row.amount), tone: "amber" })),
          } } } },
        },
        createPageTableSection("expense-structure-table", {
          rows: data.expenseStructure,
          columns: expenseColumns,
          visibleColumns: expenseColumns.map((column) => column.key),
          rowKey: (row) => row.key,
          presentation: { density: "compact" },
        }),
      ],
    }),
    createMessageSection("operational-reconciliation-warning", {
      tone: "warning",
      content: `成本业务子账未分配公司：发货仅覆盖${shipmentCoverage}月，成本覆盖${costCoverage}月；发货额与法定营业收入相差 ${formatFinanceAmount(data.operations.shipmentRevenueGap)}。以下用于业务结构分析，不据此计算审计口径毛利。`,
    }),
    createMetricsSection("operational-metrics", {
      metrics: [
        { key: "shipment", label: "业务发货额", value: formatFinanceAmount(data.operations.shipmentAmount) },
        { key: "received", label: "已回款", value: formatFinanceAmount(data.operations.receivedAmount) },
        { key: "unreceived", label: "未回款", value: formatFinanceAmount(data.operations.unreceivedAmount) },
        { key: "collection", label: "回款率", value: percent(data.operations.collectionRate) },
        { key: "cost", label: "业务成本事实", value: formatFinanceAmount(data.operations.costAmount) },
        { key: "gap", label: "发货－法定收入", value: signed(data.operations.shipmentRevenueGap) },
      ],
    }),
    createSectionsSection("operational-rankings", {
      layout: "grid",
      sections: [
        createAnalysisSection("top-products", {
          title: "发货产品 Top 10",
          sections: [createPageTableSection("top-products-table", { rows: data.operations.topProducts, columns: namedAmountColumns, visibleColumns: namedAmountColumns.map((column) => column.key), rowKey: (row) => row.name, presentation: { density: "compact" }, emptyText: "本期没有发货数据" })],
        }),
        createAnalysisSection("top-customers", {
          title: "客户发货 Top 10",
          sections: [createPageTableSection("top-customers-table", { rows: data.operations.topCustomers, columns: namedAmountColumns, visibleColumns: namedAmountColumns.map((column) => column.key), rowKey: (row) => row.name, presentation: { density: "compact" }, emptyText: "本期没有客户数据" })],
        }),
        createAnalysisSection("cost-categories", {
          title: "成本类别结构",
          sections: [createPageTableSection("cost-categories-table", { rows: data.operations.costCategories, columns: namedAmountColumns, visibleColumns: namedAmountColumns.map((column) => column.key), rowKey: (row) => row.name, presentation: { density: "compact" }, emptyText: "本期没有成本构成数据" })],
        }),
        createAnalysisSection("cost-products", {
          title: "产品成本 Top 10",
          sections: [createPageTableSection("cost-products-table", { rows: data.operations.topCostProducts, columns: namedAmountColumns, visibleColumns: namedAmountColumns.map((column) => column.key), rowKey: (row) => row.name, presentation: { density: "compact" }, emptyText: "本期没有产品成本数据" })],
        }),
      ],
    }),
  ];
}

export function buildInvestmentSections(fundFlow: FundFlowAnalysis, data: ManagementAnalysis): BodySurfaceSectionSpec[] {
  const activityRows = fundFlow.activities.filter((row) => row.key !== "operating");
  const signals = fundFlow.balanceSignals.filter((row) => ["interestBearingDebt", "unitPayables", "shareholderCapital"].includes(row.key));
  const ledgerChannels = fundFlow.ledgerChannels.filter((row) => ["borrowing", "shareholder", "unitSettlement", "investment"].includes(row.key));
  return [
    createMetricsSection("capital-structure-metrics", {
      metrics: [
        { key: "assets", label: "总资产", value: formatFinanceAmount(data.capital.totalAssets) },
        { key: "liabilities", label: "总负债", value: formatFinanceAmount(data.capital.totalLiabilities) },
        { key: "equity", label: "所有者权益", value: signed(data.capital.totalEquity) },
        { key: "leverage", label: "资产负债率", value: percent(data.capital.assetLiabilityRatio) },
        { key: "interest-debt", label: "正式有息借款", value: formatFinanceAmount(data.capital.interestBearingDebt) },
        { key: "other-payables", label: "其他应付款", value: formatFinanceAmount(data.capital.otherPayables) },
      ],
    }),
    createMetricsSection("investment-cash-metrics", {
      metrics: [
        { key: "investing-in", label: "投资现金流入", value: formatFinanceAmount(data.capital.investingInflow) },
        { key: "investing-out", label: "投资现金流出", value: formatFinanceAmount(data.capital.investingOutflow) },
        { key: "financing-in", label: "筹资现金流入", value: formatFinanceAmount(data.capital.financingInflow) },
        { key: "financing-out", label: "筹资现金流出", value: formatFinanceAmount(data.capital.financingOutflow) },
        { key: "capex", label: "资本性支出现金", value: formatFinanceAmount(data.capital.capitalExpenditure) },
        { key: "free-cash", label: "自由现金流", value: signed(data.capital.freeCashFlow) },
      ],
    }),
    createAnalysisSection("investment-financing-activities", {
      title: "投资与筹资活动",
      sections: [createPageTableSection("investment-financing-table", {
        rows: activityRows,
        columns: activityColumns,
        visibleColumns: activityColumns.map((column) => column.key),
        rowKey: (row) => row.key,
        presentation: { density: "compact" },
      })],
    }),
    createSectionsSection("capital-evidence", {
      layout: "stack",
      sections: [
        createAnalysisSection("capital-balance-signals", {
          title: "资本与往来余额信号",
          sections: [createPageTableSection("capital-balance-table", { rows: signals, columns: balanceSignalColumns, visibleColumns: balanceSignalColumns.map((column) => column.key), rowKey: (row) => row.key, presentation: { density: "compact" } })],
        }),
        createAnalysisSection("capital-ledger-channels", {
          title: "现金流水融资/投资渠道",
          sections: [createPageTableSection("capital-ledger-table", { rows: ledgerChannels, columns: ledgerChannelColumns, visibleColumns: ledgerChannelColumns.map((column) => column.key), rowKey: (row) => `${row.direction}-${row.key}`, presentation: { density: "compact" }, emptyText: "本期没有可识别渠道" })],
        }),
      ],
    }),
    createMessageSection("investment-boundary", {
      tone: "muted",
      content: "当前可评价资本结构、资金渠道和自由现金流；NPV、IRR、资本成本、融资利率/期限和投后评价仍需项目现金流与融资合同，不从总账余额猜测。",
    }),
  ];
}

export function buildPerformanceRiskSections(data: ManagementAnalysis): BodySurfaceSectionSpec[] {
  return [
    createAnalysisSection("performance-kpis", {
      title: "公司级绩效指标",
      sections: [createPageTableSection("performance-kpi-table", {
        rows: data.performance,
        columns: performanceColumns,
        visibleColumns: performanceColumns.map((column) => column.key),
        rowKey: (row) => row.key,
        presentation: { density: "compact" },
      })],
    }),
    createAnalysisSection("risk-findings", {
      title: "风险发现与管理动作",
      sections: [riskList(data, "risk-findings-list")],
    }),
    createAnalysisSection("management-data-coverage", {
      title: "数据覆盖与不可越过的口径边界",
      sections: [
        createPageTableSection("management-data-coverage-table", {
          rows: data.coverage,
          columns: coverageColumns,
          visibleColumns: coverageColumns.map((column) => column.key),
          rowKey: (row) => row.key,
          presentation: { density: "compact" },
        }),
        createListSection("management-warning-list", {
          density: "compact",
          items: data.warnings.map((warning, index) => ({ key: index, title: warning, tone: "warning" })),
        }),
      ],
    }),
  ];
}
