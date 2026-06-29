"use client";

import { useMemo, useState } from "react";
import { createPageBody, createAnalysisSection, createSectionsSection, createMessageSection, createMetricsSection, PageSurface, type DataSurfaceColumnSpec, type BodySurfaceSectionSpec } from "@workspace/core/ui";
import type { Contract } from "./useAnalyticsData";
import { computeStats, enrichContracts, filterContracts, statusLabel, type EnrichedContract } from "./contract-helpers";

type DistributionRow = {
  label: string;
  count: number;
};

export function useContractAnalyticsSections({
  contracts
}: {
  contracts: Contract[];
}): BodySurfaceSectionSpec[] {
  const [filter, setFilter] = useState<"all" | "expiring30" | "expiring90" | "expired">("all");
  const [search, setSearch] = useState("");
  const enriched = useMemo(() => enrichContracts(contracts), [contracts]);
  const stats = useMemo(() => computeStats(enriched), [enriched]);
  const filtered = useMemo(() => filterContracts(enriched, filter, search), [enriched, filter, search]);
  const distributionColumns: DataSurfaceColumnSpec<DistributionRow>[] = [
    { key: "label", label: "项目", required: true, emphasis: "medium", cell: (row) => row.label },
    { key: "count", label: "数量", required: true, align: "right", emphasis: "medium", cell: (row) => row.count },
  ];
  const columns = useMemo<DataSurfaceColumnSpec<EnrichedContract>[]>(() => [{
    key: "employeeId",
    label: "工号",
    required: true,
    font: "mono", tone: "muted",
    cell: contract => contract.employeeId
  }, {
    key: "employeeName",
    label: "姓名",
    required: true,
    emphasis: "medium",
    cell: contract => contract.employeeName
  }, {
    key: "company",
    label: "公司",
    required: true,
    tone: "muted",
    cell: contract => contract.company || "—"
  }, {
    key: "contractType",
    label: "合同类型",
    required: true,
    tone: "muted",
    cell: contract => contract.contractType || "—"
  }, {
    key: "nearestEnd",
    label: "最近到期日",
    required: true,

    cell: contract => contract.nearestEnd || "—"
  }, {
    key: "daysLeft",
    label: "剩余天数",
    required: true,
    cell: contract => {
      if (contract.daysLeft === null || Number.isNaN(contract.daysLeft)) return <span className="text-gray-400">—</span>;
      if (contract.daysLeft < 0) return <span className="font-medium text-red-600">超{Math.abs(contract.daysLeft)}天</span>;
      return <span className={`font-medium ${contract.daysLeft <= 30 ? "text-rose-600" : contract.daysLeft <= 90 ? "text-amber-600" : "text-gray-600"}`}>
            {contract.daysLeft}天
          </span>;
    }
  }, {
    key: "status",
    label: "状态",
    required: true,
    cell: contract => ({ kind: "badge", label: statusLabel(contract.status),  })
  }], []);
  return [
      createMetricsSection("stats", {
          metrics: [
            { key: "total", label: "主合同总数", value: `${stats.total} / 无固定 ${stats.permanent}` },
            { key: "expiring30", label: "30天内到期", value: stats.expiring30 },
            { key: "expiring90", label: "90天内到期", value: stats.expiring90 },
            { key: "expired", label: "已到期", value: stats.expired },
            { key: "permanent", label: "无固定期限", value: stats.permanent },
          ],
        }),
      createSectionsSection("distribution", {
        layout: "grid",
        sections: [
          createAnalysisSection("types", {
            title: "合同类型分布",
            sections: [{
              key: "type-bars",
              body: { kind: "data", data: {
                kind: "table",
                rows: stats.types.map(([label, count]) => ({ label, count })),
                columns: distributionColumns,
                visibleColumns: distributionColumns.map((column) => column.key),
                rowKey: (row) => row.label,
                                presentation: { density: "compact" },

                emptyText: "暂无数据",
              } },
            }],
          }),
          createAnalysisSection("companies", {
            title: "公司合同分布",
            sections: [{
              key: "company-bars",
              body: { kind: "data", data: {
                kind: "table",
                rows: stats.companies.map(([label, count]) => ({ label, count })),
                columns: distributionColumns,
                visibleColumns: distributionColumns.map((column) => column.key),
                rowKey: (row) => row.label,
                                presentation: { density: "compact" },

                emptyText: "暂无数据",
              } },
            }],
          }),
        ],
      }),
      createAnalysisSection("expiry", {
        title: "合同到期预警",
        toolbar: {
          items: [
            {
              kind: "option-group",
              key: "status",
              value: filter,
              onChange: (key) => setFilter(key as typeof filter),
              options: [
                { value: "all", label: "全部" },
                { value: "expiring30", label: "30天" },
                { value: "expiring90", label: "90天" },
                { value: "expired", label: "已到期" },
              ],
            },
            { kind: "search", key: "search", value: search, onChange: setSearch, placeholder: "搜索姓名、工号、公司..." },
            { kind: "text", key: "meta", content: <>{filtered.length} 人</> },
          ],
        },
        sections: [
          {
            key: "expiry-table",
            body: { kind: "data", data: {
              kind: "table",
              rows: filtered.slice(0, 100),
              columns,
              visibleColumns: columns.map(column => column.key),
              rowKey: contract => contract.id,
              emptyText: "暂无数据",
              rowState: contract => contract.status === "expired" ? "danger" : contract.status === "expiring30" ? "danger" : "normal",
            } },
          },
          ...(filtered.length > 100 ? [createMessageSection("more", {
            tone: "muted" as const,
            content: <>还有 {filtered.length - 100} 条，请使用搜索或筛选</>,
          })] : []),
        ],
      }),
    ];
}

export default function ContractAnalytics(props: { contracts: Contract[] }) {
  return <PageSurface kind="standard" body={createPageBody(useContractAnalyticsSections(props))} />;
}
