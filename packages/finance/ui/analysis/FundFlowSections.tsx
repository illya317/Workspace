import {
  createAnalysisSection,
  createListSection,
  createMessageSection,
  createMetricsSection,
  createPageTableSection,
  createSectionsSection,
  type BodySurfaceSectionSpec,
} from "@workspace/core/ui";
import type { FundFlowAnalysis } from "@workspace/finance/types";
import { formatFinanceAmount } from "../formatters";
import {
  activityColumns,
  balanceSignalColumns,
  companyColumns,
  flowChannelColumns,
  ledgerChannelColumns,
} from "./fund-flow-columns";

function percent(value: number | null) {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

function signedAmount(value: number) {
  return {
    kind: "text" as const,
    value: `${value > 0 ? "+" : ""}${formatFinanceAmount(value)}`,
    tone: value < -0.005 ? "danger" as const : value > 0.005 ? "success" as const : "default" as const,
    emphasis: "medium" as const,
  };
}

function dataQualitySection(data: FundFlowAnalysis): BodySurfaceSectionSpec[] {
  if (data.warnings.length === 0) return [];
  return [createAnalysisSection("fund-flow-quality", {
    title: "口径与数据质量",
    sections: [createListSection("fund-flow-warning-list", {
      density: "compact",
      items: data.warnings.map((warning, index) => ({
        key: index,
        title: warning,
        tone: "warning",
      })),
    })],
  })];
}

function cashFlowSections(data: FundFlowAnalysis): BodySurfaceSectionSpec[] {
  return [
    createAnalysisSection("cash-activities", {
      title: "现金活动结构",
      sections: [
        {
          key: "cash-activity-chart",
          body: { kind: "visualization", visualization: { kind: "chart", chart: { visual: {
            kind: "groupedBarChart",
            title: "经营 / 投资 / 筹资流入与流出",
            groups: data.activities.map((row) => ({
              key: row.key,
              label: row.label,
              bars: [
                { key: "inflow", label: "流入", value: row.inflow, valueLabel: formatFinanceAmount(row.inflow), tone: "emerald" },
                { key: "outflow", label: "流出", value: row.outflow, valueLabel: formatFinanceAmount(row.outflow), tone: "amber" },
              ],
            })),
            legend: [
              { key: "inflow", label: "流入", tone: "emerald" },
              { key: "outflow", label: "流出", tone: "amber" },
            ],
          } } } },
        },
        createPageTableSection("cash-activity-table", {
          rows: data.activities,
          columns: activityColumns,
          visibleColumns: activityColumns.map((column) => column.key),
          rowKey: (row) => row.key,
          presentation: { density: "compact" },
        }),
      ],
    }),
    createSectionsSection("cash-source-use", {
      layout: "grid",
      sections: [
        createAnalysisSection("cash-sources", {
          title: "资金从哪里来",
          sections: [createPageTableSection("cash-source-table", {
            rows: data.sources,
            columns: flowChannelColumns,
            visibleColumns: flowChannelColumns.map((column) => column.key),
            rowKey: (row) => row.key,
            presentation: { density: "compact" },
            emptyText: "本期没有现金流入明细",
          })],
        }),
        createAnalysisSection("cash-uses", {
          title: "资金花到哪里",
          sections: [createPageTableSection("cash-use-table", {
            rows: data.uses,
            columns: flowChannelColumns,
            visibleColumns: flowChannelColumns.map((column) => column.key),
            rowKey: (row) => row.key,
            presentation: { density: "compact" },
            emptyText: "本期没有现金流出明细",
          })],
        }),
      ],
    }),
  ];
}

function evidenceSections(data: FundFlowAnalysis): BodySurfaceSectionSpec[] {
  return [
    createAnalysisSection("ledger-channels", {
      title: "流水对手科目拆解",
      sections: [
        createMessageSection("ledger-channel-basis", {
          tone: "muted",
          content: "按现金类科目（1001/1002/1012）净流入或净流出的非现金对手科目归类；可识别借款、客户预收、股东投入、单位往来等渠道，但复杂凭证和关联方性质仍需辅助核算复核。",
        }),
        createPageTableSection("ledger-channel-table", {
          rows: data.ledgerChannels,
          columns: ledgerChannelColumns,
          visibleColumns: ledgerChannelColumns.map((column) => column.key),
          rowKey: (row) => `${row.direction}-${row.key}`,
          presentation: { density: "compact" },
        }),
      ],
    }),
    createAnalysisSection("balance-signals", {
      title: "科目余额资金信号",
      sections: [createPageTableSection("balance-signal-table", {
        rows: data.balanceSignals,
        columns: balanceSignalColumns,
        visibleColumns: balanceSignalColumns.map((column) => column.key),
        rowKey: (row) => row.key,
        presentation: { density: "compact" },
      })],
    }),
    createAnalysisSection("company-comparison", {
      title: "母子公司对比",
      sections: [
        createPageTableSection("company-comparison-table", {
          rows: data.companies,
          columns: companyColumns,
          visibleColumns: companyColumns.map((column) => column.key),
          rowKey: (row) => row.code,
          presentation: { density: "compact" },
        }),
        createMetricsSection("evidence-counts", {
          metrics: [
            { key: "workpapers", label: "现金流底稿", value: `${data.evidence.workpaperCount} 份` },
            { key: "vouchers", label: "记账凭证", value: data.evidence.voucherCount.toLocaleString("zh-CN") },
            { key: "voucher-items", label: "凭证明细", value: data.evidence.voucherItemCount.toLocaleString("zh-CN") },
            { key: "cash-linked", label: "现金相关凭证", value: data.evidence.cashLinkedVoucherCount.toLocaleString("zh-CN") },
            { key: "ledger-net", label: "现金流水净变动", value: signedAmount(data.evidence.ledgerNetCashChange) },
            { key: "balance-net", label: "余额净变动", value: signedAmount(data.evidence.balanceNetCashChange) },
          ],
        }),
      ],
    }),
  ];
}

export function buildFundFlowSections(data: FundFlowAnalysis): BodySurfaceSectionSpec[] {
  return [
    createMessageSection("fund-flow-definition", {
      content: `现金流量表回答现金进出；本页进一步回答来源、用途、责任公司、科目证据和数据风险。当前口径：${data.scope.label} · ${data.scope.periodLabel}。`,
    }),
    createMetricsSection("fund-flow-metrics", {
      metrics: [
        { key: "inflow", label: "资金流入", value: formatFinanceAmount(data.metrics.inflow) },
        { key: "outflow", label: "资金流出", value: formatFinanceAmount(data.metrics.outflow) },
        { key: "net", label: "净现金变动", value: signedAmount(data.metrics.netCashChange) },
        { key: "ending", label: "期末货币资金", value: formatFinanceAmount(data.metrics.endingCash) },
        { key: "financing-share", label: "筹资流入占比", value: percent(data.metrics.financingInflowShare) },
        { key: "operating-coverage", label: "经营流入覆盖", value: percent(data.metrics.operatingCoverage) },
      ],
    }),
    ...dataQualitySection(data),
    ...cashFlowSections(data),
    ...evidenceSections(data),
  ];
}
