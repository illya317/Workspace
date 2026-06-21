"use client";

import { workspacePath } from "@workspace/core/routing";
import { useEffect, useState } from "react";
import { ActionButton, DataTable, EmptyStateCard, PanelCard, type DataTableColumn } from "@workspace/core/ui";
import FinanceFilters from "../components/FinanceFilters";
import { useCSV } from "@workspace/core/hooks";
import { formatFinanceAmount } from "../formatters";

interface ReclassEntry {
  accountCode: string;
  accountName: string;
  fromSide: string;
  toSide: string;
  closingDebit: number;
  closingCredit: number;
  netAmount: number;
  reason: string;
}

export default function ReclassTab() {
  const [companyFilter, setCompanyFilter] = useState("02");
  const [yearFilter, setYearFilter] = useState("2025");
  const [monthFilter, setMonthFilter] = useState("12");
  const [entries, setEntries] = useState<ReclassEntry[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    if (!companyFilter || !yearFilter || !monthFilter) return;
    setLoading(true);
    const res = await fetch(workspacePath(`/api/finance/schedules/reclassify?companyCode=${companyFilter}&year=${yearFilter}&month=${monthFilter}`));
    if (res.ok) setEntries((await res.json()).entries || []);
    setLoading(false);
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [companyFilter, yearFilter, monthFilter]);

  const sideLabel = (s: string) => s === "asset" ? "资产→负债" : "负债→资产";
  const columns: DataTableColumn<ReclassEntry>[] = [
    {
      key: "accountCode",
      label: "科目编码",
      required: true,
      cellClassName: "font-mono text-slate-700",
      render: (entry) => entry.accountCode,
    },
    {
      key: "accountName",
      label: "科目名称",
      required: true,
      cellClassName: "text-slate-800",
      render: (entry) => entry.accountName,
    },
    {
      key: "direction",
      label: "方向",
      required: true,
      render: (entry) => (
        <span className={`rounded px-1.5 py-0.5 text-xs ${
          entry.fromSide === "asset" ? "bg-orange-50 text-orange-600" : "bg-blue-50 text-blue-600"
        }`}>
          {sideLabel(entry.fromSide)}
        </span>
      ),
    },
    {
      key: "closingDebit",
      label: "借方余额",
      required: true,
      headerClassName: "text-right",
      cellClassName: "text-right text-slate-600",
      render: (entry) => formatFinanceAmount(entry.closingDebit),
    },
    {
      key: "closingCredit",
      label: "贷方余额",
      required: true,
      headerClassName: "text-right",
      cellClassName: "text-right text-slate-600",
      render: (entry) => formatFinanceAmount(entry.closingCredit),
    },
    {
      key: "netAmount",
      label: "净额",
      required: true,
      headerClassName: "text-right",
      cellClassName: "text-right font-medium text-slate-800",
      render: (entry) => formatFinanceAmount(Math.abs(entry.netAmount)),
    },
    {
      key: "reason",
      label: "说明",
      required: true,
      cellClassName: "max-w-xs truncate text-slate-500",
      render: (entry) => <span title={entry.reason}>{entry.reason}</span>,
    },
  ];
  const exportCSV = useCSV(
    `重分类_${companyFilter}_${yearFilter}${monthFilter}.csv`,
    "科目编码,科目名称,方向,借方余额,贷方余额,净额,说明\n",
    () => entries.map(e =>
      `"${e.accountCode}","${e.accountName}","${sideLabel(e.fromSide)}",${e.closingDebit},${e.closingCredit},${Math.abs(e.netAmount)},"${e.reason}"`
    ).join("\n")
  );

  return (
    <div className="space-y-4">
      <FinanceFilters
        companyFilter={companyFilter}
        yearFilter={yearFilter}
        monthFilter={monthFilter}
        onCompanyChange={setCompanyFilter}
        onYearChange={setYearFilter}
        onMonthChange={setMonthFilter}
        showPageSize={false}
        extra={
          <>
            <ActionButton onClick={exportCSV} disabled={entries.length === 0} title="导出CSV">
              导出CSV
            </ActionButton>
            <span className="text-xs text-gray-400">{entries.length} 项</span>
          </>
        }
      />

      {loading ? <p className="p-8 text-center text-gray-500">加载中...</p> :
       entries.length === 0 ? (
        <EmptyStateCard>未发现需重分类的科目</EmptyStateCard>
      ) : (
        <PanelCard className="overflow-hidden" bodyClassName="overflow-x-auto">
          <DataTable
            rows={entries}
            columns={columns}
            visibleColumns={columns.map((column) => column.key)}
            rowKey={(entry) => entry.accountCode}
          />
        </PanelCard>
      )}
    </div>
  );
}
