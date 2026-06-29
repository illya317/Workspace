"use client";

import { workspacePath } from "@workspace/core/routing";
import { useCallback, useEffect, useState } from "react";
import { PageSurface, createPageBody, createPageDataSection, createPageTableSection, type DataSurfaceColumnSpec } from "@workspace/core/ui";
import type { PageSurfaceSectionSpec, PageSurfaceNavigationSpec, SurfaceToolbarItems } from "@workspace/core/ui";
import { useFinanceFilterToolbarItems } from "../components/FinanceFilters";
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
export default function ReclassTab({
  navigation,
  lifecycleBlocks = [],
}: {
  navigation?: PageSurfaceNavigationSpec;
  lifecycleBlocks?: PageSurfaceSectionSpec[];
}) {
  const [companyFilter, setCompanyFilter] = useState("02");
  const [yearFilter, setYearFilter] = useState("2025");
  const [monthFilter, setMonthFilter] = useState("12");
  const [entries, setEntries] = useState<ReclassEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    if (!companyFilter || !yearFilter || !monthFilter) return;
    setLoading(true);
    const res = await fetch(workspacePath(`/api/modules/finance/ledger/schedules/reclassify?companyCode=${companyFilter}&year=${yearFilter}&month=${monthFilter}`));
    if (res.ok) setEntries((await res.json()).entries || []);
    setLoading(false);
  }, [companyFilter, monthFilter, yearFilter]);

  useEffect(() => {
    load();
  }, [load]);
  const sideLabel = (s: string) => s === "asset" ? "资产→负债" : "负债→资产";
  const columns: DataSurfaceColumnSpec<ReclassEntry>[] = [{
    key: "accountCode",
    label: "科目编码",
    required: true,
    font: "mono",
    cell: entry => entry.accountCode
  }, {
    key: "accountName",
    label: "科目名称",
    required: true,

    cell: entry => entry.accountName
  }, {
    key: "direction",
    label: "方向",
    required: true,
    cell: entry => <span className={`rounded px-1.5 py-0.5 text-xs ${entry.fromSide === "asset" ? "bg-orange-50 text-orange-600" : "bg-blue-50 text-blue-600"}`}>
          {sideLabel(entry.fromSide)}
        </span>
  }, {
    key: "closingDebit",
    label: "借方余额",
    required: true,
    align: "right",

    cell: entry => formatFinanceAmount(entry.closingDebit)
  }, {
    key: "closingCredit",
    label: "贷方余额",
    required: true,
    align: "right",

    cell: entry => formatFinanceAmount(entry.closingCredit)
  }, {
    key: "netAmount",
    label: "净额",
    required: true,
    align: "right",
     emphasis: "medium",
    cell: entry => formatFinanceAmount(Math.abs(entry.netAmount))
  }, {
    key: "reason",
    label: "说明",
    required: true,
    tone: "muted", wrap: "truncate",
    cell: entry => <span title={entry.reason}>{entry.reason}</span>
  }];
  const exportCSV = useCSV(`重分类_${companyFilter}_${yearFilter}${monthFilter}.csv`, "科目编码,科目名称,方向,借方余额,贷方余额,净额,说明\n", () => entries.map(e => `"${e.accountCode}","${e.accountName}","${sideLabel(e.fromSide)}",${e.closingDebit},${e.closingCredit},${Math.abs(e.netAmount)},"${e.reason}"`).join("\n"));
  const extraToolbarItems: SurfaceToolbarItems = [
    {
      kind: "action-group",
      key: "reclass-export",
      section: "action",
      actions: [{ key: "export", kind: "download", label: "导出CSV", onClick: exportCSV, disabled: entries.length === 0 }],
    },
    {
      kind: "text",
      key: "reclass-count",
      section: "meta",
      content: <span className="text-xs text-gray-400">{entries.length} 项</span>,
    },
  ];
  const toolbarItems = useFinanceFilterToolbarItems({
    companyFilter,
    yearFilter,
    monthFilter,
    onCompanyChange: setCompanyFilter,
    onYearChange: setYearFilter,
    onMonthChange: setMonthFilter,
    showPageSize: false,
    extraItems: extraToolbarItems,
  });
  return (
    <PageSurface kind="standard"
      navigation={navigation}
      toolbar={{ items: toolbarItems }}
      body={createPageBody([
          ...lifecycleBlocks,
          ...(loading
            ? [createPageDataSection("reclass-loading", { kind: "records", records: [], empty: "加载中..." })]
            : entries.length === 0
              ? [createPageDataSection("reclass-empty", { kind: "records", records: [], empty: "未发现需重分类的科目" })]
              : [createPageTableSection("reclass-entries", {
                framed: true,


                rows: entries,
                columns,
                visibleColumns: columns.map(column => column.key),
                rowKey: entry => entry.accountCode,
              })]),
        ])}
    />
  );
}
