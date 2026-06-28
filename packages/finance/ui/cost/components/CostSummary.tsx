"use client";

import { createPageBody, PageSurface, createMessageBlock, createPanelBlock, createPageDataBlock } from "@workspace/core/ui";
import type { PageSurfaceBlockSpec } from "@workspace/core/ui";
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
  const { data, loading, error } = useCostSummary(filters);
  const summary = data as CostSummaryData | null;

  const pct = (n: number | null | undefined) =>
    n == null ? "—" : `${(n * 100).toFixed(1)}%`;

  const blocks: PageSurfaceBlockSpec[] = [
    ...(loading ? [createPageDataBlock("loading", { kind: "records", records: [], empty: "加载中..." })] : []),
    ...(error ? [createPageDataBlock("error", { kind: "records", records: [], empty: error })] : []),
    ...(summary ? [
      createPageDataBlock("summary-metrics", {
        kind: "metrics",
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

  return (
    <div className="space-y-4">
      <PageSurface kind="analysis" embedded body={createPageBody(blocks)} />
      {summary && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <RankCard title="客户发货排行" items={summary.shipments?.topCustomers} />
          <RankCard title="业务员发货排行" items={summary.shipments?.topSalespeople} />
          <RankCard title="产品发货排行" items={summary.shipments?.topProducts} />
        </div>
      )}
    </div>
  );
}

function RankCard({
  title,
  items,
}: {
  title: string;
  items?: SummaryRankItem[];
}) {
  return (
    <PageSurface
      kind="analysis"
      embedded
      body={createPageBody([createPanelBlock(title, {
        title,
        blocks: items?.length
          ? items.map((item, idx) => createMessageBlock(`${idx}-${item.name}`, {
              tone: "muted" as const,
              content: `${idx + 1}. ${item.name} ${item.value.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}`,
            }))
          : [createMessageBlock("empty", {
              tone: "muted" as const,
              content: "暂无数据",
            })],
      })])}
    />
  );
}
