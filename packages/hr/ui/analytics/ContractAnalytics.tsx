"use client";

import { useMemo, useState } from "react";
import { AnalysisBlock, DataTable, MetricCard, SearchInput, type DataTableColumn, getToolbarActionClassName } from "@workspace/core/ui";
import type { Contract } from "./useAnalyticsData";
import { computeStats, enrichContracts, filterContracts, statusBadge, statusLabel, type EnrichedContract } from "./contract-helpers";
export default function ContractAnalytics({
  contracts
}: {
  contracts: Contract[];
}) {
  const [filter, setFilter] = useState<"all" | "expiring30" | "expiring90" | "expired">("all");
  const [search, setSearch] = useState("");
  const enriched = useMemo(() => enrichContracts(contracts), [contracts]);
  const stats = useMemo(() => computeStats(enriched), [enriched]);
  const filtered = useMemo(() => filterContracts(enriched, filter, search), [enriched, filter, search]);
  const columns = useMemo<DataTableColumn<EnrichedContract>[]>(() => [{
    key: "employeeId",
    label: "工号",
    required: true,
    cellClassName: "font-mono text-slate-500",
    render: contract => contract.employeeId
  }, {
    key: "employeeName",
    label: "姓名",
    required: true,
    cellClassName: "font-medium",
    render: contract => contract.employeeName
  }, {
    key: "company",
    label: "公司",
    required: true,
    cellClassName: "text-slate-500",
    render: contract => contract.company || "—"
  }, {
    key: "contractType",
    label: "合同类型",
    required: true,
    cellClassName: "text-slate-500",
    render: contract => contract.contractType || "—"
  }, {
    key: "nearestEnd",
    label: "最近到期日",
    required: true,
    cellClassName: "text-slate-700",
    render: contract => contract.nearestEnd || "—"
  }, {
    key: "daysLeft",
    label: "剩余天数",
    required: true,
    render: contract => {
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
    render: contract => <span className={`text-xs px-1.5 py-0.5 rounded ${statusBadge(contract.status)}`}>
          {statusLabel(contract.status)}
        </span>
  }], []);
  return <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <MetricCard label="主合同总数" value={`${stats.total} / 无固定 ${stats.permanent}`} />
        <MetricCard label="30天内到期" value={stats.expiring30} />
        <MetricCard label="90天内到期" value={stats.expiring90} />
        <MetricCard label="已到期" value={stats.expired} />
        <MetricCard label="无固定期限" value={stats.permanent} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AnalysisBlock title="合同类型分布">
          <div className="space-y-2">
            {stats.types.map(([k, v]) => {
            const max = Math.max(...stats.types.map(([, x]) => x), 1);
            const pct = Math.round(v / max * 100);
            return <div key={k} className="flex items-center gap-3">
                  <span className="w-20 text-xs text-gray-600 truncate">{k}</span>
                  <div className="flex-1 h-5 bg-gray-100 rounded overflow-hidden">
                    <div className="h-full bg-sky-400 rounded" style={{
                  width: `${pct}%`
                }} />
                  </div>
                  <span className="w-10 text-right text-xs font-medium text-gray-700">{v}</span>
                </div>;
          })}
          </div>
        </AnalysisBlock>

        <AnalysisBlock title="公司合同分布">
          <div className="space-y-2">
            {stats.companies.map(([k, v]) => {
            const max = Math.max(...stats.companies.map(([, x]) => x), 1);
            const pct = Math.round(v / max * 100);
            return <div key={k} className="flex items-center gap-3">
                  <span className="w-20 text-xs text-gray-600 truncate">{k}</span>
                  <div className="flex-1 h-5 bg-gray-100 rounded overflow-hidden">
                    <div className="h-full bg-purple-400 rounded" style={{
                  width: `${pct}%`
                }} />
                  </div>
                  <span className="w-10 text-right text-xs font-medium text-gray-700">{v}</span>
                </div>;
          })}
          </div>
        </AnalysisBlock>
      </div>

      <AnalysisBlock title="合同到期预警" toolbar={<div className="flex flex-1 items-center gap-3">
          <div className="flex gap-1">
            {(["all", "expiring30", "expiring90", "expired"] as const).map(f => <button type="button" key={f} onClick={() => setFilter(f)} className={getToolbarActionClassName(filter === f ? "primary" : "secondary")}>
                {f === "all" ? "全部" : f === "expiring30" ? "30天" : f === "expiring90" ? "90天" : "已到期"}
              </button>)}
          </div>
          <SearchInput placeholder="搜索姓名、工号、公司..." value={search} onChange={setSearch} className="ml-auto max-w-xs" />
          <span className="text-xs text-gray-400">{filtered.length} 人</span>
          </div>}>

        <DataTable rows={filtered.slice(0, 100)} columns={columns} visibleColumns={columns.map(column => column.key)} rowKey={contract => contract.id} emptyText="暂无数据" rowClassName={contract => contract.status === "expired" ? "bg-red-50/40" : contract.status === "expiring30" ? "bg-rose-50/30" : ""} />
        {filtered.length > 100 && <p className="py-2 text-center text-xs text-gray-400">还有 {filtered.length - 100} 条，请使用搜索或筛选</p>}
      </AnalysisBlock>
    </div>;
}
