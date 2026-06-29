"use client";

import { createPageBody, PageSurface, createMessageSection, createPanelSection, createMetricsSection, createStatusSection } from "@workspace/core/ui";
import type { BodySurfaceSectionSpec } from "@workspace/core/ui";
import { formatCompactNullableAmount } from "../../formatters";
import { useCostSummary } from "../hooks/useFinanceCostData";
import type { CostFiltersState } from "../types";

interface Props {
  filters: CostFiltersState;
}

interface SummaryRankItem {
  name: string;
  value: number;
}

interface CostSummaryData {
  shipments?: {
    totalAmount?: number | null;
    totalReceived?: number | null;
    totalUnreceived?: number | null;
    collectionRate?: number | null;
    topCustomers?: SummaryRankItem[];
    topSalespeople?: SummaryRankItem[];
    topProducts?: SummaryRankItem[];
  };
  costStructure?: {
    totalAmount?: number | null;
    unitCost?: number | null;
  };
  salaries?: {
    totalActualSalary?: number | null;
  };
  workshop?: {
    totalWorkPoints?: number | null;
  };
  grossProfit?: number | null;
  grossMargin?: number | null;
}

export default function CostSummary({ filters }: Props) {
  const sections = useCostSummarySections(filters);
  return <PageSurface kind="standard" embedded body={createPageBody(sections)} />;
}

export function useCostSummarySections(filters: CostFiltersState): BodySurfaceSectionSpec[] {
  const { data, loading, error } = useCostSummary(filters);
  const summary = data as CostSummaryData | null;

  const pct = (n: number | null | undefined) =>
    n == null ? "—" : `${(n * 100).toFixed(1)}%`;

  const sections: BodySurfaceSectionSpec[] = [
    ...(loading ? [createStatusSection("loading", { kind: "loading", content: "加载中..." })] : []),
    ...(error ? [createStatusSection("error", { kind: "error", content: error })] : []),
    ...(summary ? [
      createMetricsSection("summary-metrics", {
        metrics: [
          { key: "shipment", label: "发货金额", value: formatCompactNullableAmount(summary.shipments?.totalAmount) },
          { key: "received", label: "已回款", value: formatCompactNullableAmount(summary.shipments?.totalReceived) },
          { key: "unreceived", label: "未回款", value: formatCompactNullableAmount(summary.shipments?.totalUnreceived) },
          { key: "collection-rate", label: "回款率", value: pct(summary.shipments?.collectionRate) },
          { key: "cost", label: "成本总额", value: formatCompactNullableAmount(summary.costStructure?.totalAmount) },
          { key: "unit-cost", label: "单位成本", value: formatCompactNullableAmount(summary.costStructure?.unitCost) },
          { key: "gross-profit", label: "毛利", value: formatCompactNullableAmount(summary.grossProfit) },
          { key: "gross-margin", label: "毛利率", value: pct(summary.grossMargin) },
          { key: "salary", label: "销售工资总额", value: formatCompactNullableAmount(summary.salaries?.totalActualSalary) },
          { key: "workshop", label: "车间工分总额", value: formatCompactNullableAmount(summary.workshop?.totalWorkPoints) },
        ],
      }),
    ] : []),
  ];

  if (!summary) return sections;
  return [
    ...sections,
    createPanelSection("rank-cards", {
      title: "排行",
      layout: "grid",
      sections: [
        createRankPanel("top-customers", "客户发货排行", summary.shipments?.topCustomers),
        createRankPanel("top-salespeople", "业务员发货排行", summary.shipments?.topSalespeople),
        createRankPanel("top-products", "产品发货排行", summary.shipments?.topProducts),
      ],
    }),
  ];
}

function createRankPanel(key: string, title: string, items?: SummaryRankItem[]): BodySurfaceSectionSpec {
  return createPanelSection(key, {
    title,
    sections: items?.length
      ? items.map((item, idx) => createMessageSection(`${idx}-${item.name}`, {
          tone: "muted" as const,
          content: `${idx + 1}. ${item.name} ${item.value.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}`,
        }))
      : [createMessageSection("empty", {
          tone: "muted" as const,
          content: "暂无数据",
        })],
  });
}
