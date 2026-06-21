"use client";

import { EmptyStateCard, MetricCard, PanelCard } from "@workspace/core/ui";
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

  return (
    <div className="space-y-4">
      {loading && <EmptyStateCard compact>加载中...</EmptyStateCard>}
      {error && <EmptyStateCard compact className="border-red-100 bg-red-50 text-red-600">{error}</EmptyStateCard>}

      {summary && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Card label="发货金额" value={formatCompactNullableAmount(summary.shipments?.totalAmount)} />
            <Card label="已回款" value={formatCompactNullableAmount(summary.shipments?.totalReceived)} />
            <Card label="未回款" value={formatCompactNullableAmount(summary.shipments?.totalUnreceived)} />
            <Card label="回款率" value={pct(summary.shipments?.collectionRate)} />
            <Card label="成本总额" value={formatCompactNullableAmount(summary.costStructure?.totalAmount)} />
            <Card label="单位成本" value={formatCompactNullableAmount(summary.costStructure?.unitCost)} />
            <Card label="毛利" value={formatCompactNullableAmount(summary.grossProfit)} />
            <Card label="毛利率" value={pct(summary.grossMargin)} />
            <Card label="销售工资总额" value={formatCompactNullableAmount(summary.salaries?.totalActualSalary)} />
            <Card label="车间工分总额" value={formatCompactNullableAmount(summary.workshop?.totalWorkPoints)} />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <RankCard title="客户发货排行" items={summary.shipments?.topCustomers} />
            <RankCard title="业务员发货排行" items={summary.shipments?.topSalespeople} />
            <RankCard title="产品发货排行" items={summary.shipments?.topProducts} />
          </div>
        </>
      )}
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return <MetricCard label={label} value={value} />;
}

function RankCard({
  title,
  items,
}: {
  title: string;
  items?: { name: string; value: number }[];
}) {
  return (
    <PanelCard title={title} bodyClassName="p-4">
      {!items || items.length === 0 ? (
        <p className="text-xs text-gray-400">暂无数据</p>
      ) : (
        <ol className="space-y-2">
          {items.map((item, idx) => (
            <li key={idx} className="flex items-center justify-between text-sm">
              <span className="text-gray-600">
                {idx + 1}. {item.name}
              </span>
              <span className="font-medium text-gray-800">
                {item.value.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}
              </span>
            </li>
          ))}
        </ol>
      )}
    </PanelCard>
  );
}
