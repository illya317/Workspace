"use client";

import { useCSV } from "@workspace/core/hooks";
import { workspacePath } from "@workspace/core/routing";
import {
  PageSurface,
  createPageBody,
  createPageTableSection,
  createStatusSection,
  useFeedback,
} from "@workspace/core/ui";
import type { BodySurfaceSectionSpec, PageSurfaceTabBarSpec, SurfaceToolbarItems } from "@workspace/core/ui";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { ReclassEntry } from "@workspace/finance/types";
import { useFinanceFilterToolbarItems } from "../components/FinanceFilters";
import type { FinanceLedgerDefaultScope } from "./defaultScope";
import {
  createReclassWorkbenchColumns,
  filterReclassEntries,
  type ReclassWorkbenchFilter,
} from "./reclassWorkbench";

export default function ReclassTab({
  canExport,
  defaultScope,
  navigation,
  lifecycleBlocks = [],
}: {
  canExport: boolean;
  defaultScope: FinanceLedgerDefaultScope | null;
  navigation?: PageSurfaceTabBarSpec;
  lifecycleBlocks?: BodySurfaceSectionSpec[];
}) {
  const [companyFilter, setCompanyFilter] = useState(defaultScope?.companyCode ?? "");
  const [yearFilter, setYearFilter] = useState(defaultScope ? String(defaultScope.year) : "");
  const [monthFilter, setMonthFilter] = useState(defaultScope ? String(defaultScope.month) : "");
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<ReclassWorkbenchFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [entries, setEntries] = useState<ReclassEntry[]>([]);
  const [adjustmentsLoading, setAdjustmentsLoading] = useState(false);
  const feedback = useFeedback();

  const loadAdjustments = useCallback(async () => {
    if (!companyFilter || !yearFilter || !monthFilter) {
      setEntries([]);
      return;
    }
    setAdjustmentsLoading(true);
    try {
      const query = new URLSearchParams({ companyCode: companyFilter, year: yearFilter, month: monthFilter });
      const response = await fetch(workspacePath(`/api/modules/finance/ledger/schedules/reclassify?${query.toString()}`));
      if (!response.ok) {
        feedback.error("重分类明细加载失败");
        return;
      }
      const data = await response.json() as {
        entries?: ReclassEntry[];
      };
      setEntries(data.entries ?? []);
    } catch {
      feedback.error("网络错误");
    } finally {
      setAdjustmentsLoading(false);
    }
  }, [companyFilter, feedback, monthFilter, yearFilter]);

  useEffect(() => { void loadAdjustments(); }, [loadAdjustments]);
  useEffect(() => { setPage(1); }, [companyFilter, keyword, monthFilter, statusFilter, yearFilter]);

  const filtered = useMemo(() => filterReclassEntries(entries, statusFilter, keyword), [entries, keyword, statusFilter]);
  const filterOptions = useMemo(() => {
    const pending = entries.filter((row) => row.status === "pending").length;
    const automatic = entries.filter((row) => row.status === "automatic").length;
    const manual = entries.filter((row) => row.status === "manual").length;
    const noProcess = entries.filter((row) => row.status === "no_process").length;
    const historical = entries.filter((row) => row.status === "historical").length;
    return [
      { value: "all", label: `全部 ${entries.length}` },
      { value: "pending", label: `待处理 ${pending}` },
      { value: "automatic", label: `自动分类 ${automatic}` },
      { value: "manual", label: `人工分类 ${manual}` },
      { value: "no_process", label: `无需处理 ${noProcess}` },
      { value: "historical", label: `历史记录 ${historical}` },
    ];
  }, [entries]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const adjustmentColumns = useMemo(() => createReclassWorkbenchColumns(), []);

  const exportCSV = useCSV(
    `重分类明细_${companyFilter}_${yearFilter}${monthFilter}.csv`,
    "科目编码,科目名称,报表应用或候选金额,当前反向余额,是否过期,判断口径,处理状态,目标科目\n",
    () => filtered.map((row) => [
      row.accountCode,
      row.accountName,
      row.amount,
      row.currentAbnormalAmount ?? "",
      row.stale ? "待复核" : "",
      row.classification,
      row.status,
      row.targetAccountCode ?? "",
    ].map(csvCell).join(",")).join("\n"),
  );

  const extraToolbarItems: SurfaceToolbarItems = [
    {
      kind: "select",
      key: "reclass-status",
      label: "分类方式",
      value: statusFilter,
      options: filterOptions,
      onChange: (value: string) => setStatusFilter(value as ReclassWorkbenchFilter),
    },
    ...(canExport ? [{
      kind: "action-group" as const,
      key: "reclass-export",
      actions: [{ key: "export", kind: "download" as const, label: "导出CSV", onClick: exportCSV, disabled: filtered.length === 0 }],
    }] : []),
    { kind: "text", key: "reclass-count", content: `${filtered.length} 项` },
  ];
  const toolbarItems = useFinanceFilterToolbarItems({
    companyFilter,
    yearFilter,
    monthFilter,
    keyword,
    pageSize,
    onCompanyChange: setCompanyFilter,
    onYearChange: setYearFilter,
    onMonthChange: setMonthFilter,
    onKeywordChange: setKeyword,
    onPageSizeChange: (value) => { setPageSize(value); setPage(1); },
    showCompanyYear: true,
    showMonth: true,
    showPageSize: true,
    extraItems: extraToolbarItems,
  });

  const adjustmentSections = [
    ...(adjustmentsLoading
      ? [createStatusSection("reclass-loading", { kind: "loading", content: "加载中..." })]
      : paged.length === 0
        ? [createStatusSection("reclass-empty", { kind: "empty", content: entries.length === 0 ? "当前期间没有反向期末余额或凭证调整记录" : "当前筛选范围没有事项" })]
        : [createPageTableSection("reclass-detail", {
            rows: paged,
            columns: adjustmentColumns,
            visibleColumns: adjustmentColumns.map((column) => column.key),
            rowKey: (row) => row.id,
            presentation: { density: "compact" },
          })]),
  ];

  return (
    <PageSurface
      kind="standard"
      tabbar={navigation}
      toolbar={{ items: toolbarItems }}
      body={createPageBody([...lifecycleBlocks, ...adjustmentSections])}
      footer={filtered.length > 0
        ? { pagination: { page, totalPages, total: filtered.length, onPageChange: setPage } }
        : undefined}
    />
  );
}

function csvCell(value: string | number) {
  const text = String(value).replaceAll('"', '""');
  return text.includes(",") || text.includes('"') || text.includes("\n") ? `"${text}"` : text;
}
