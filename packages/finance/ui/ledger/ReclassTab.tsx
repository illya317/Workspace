"use client";

import { workspacePath } from "@workspace/core/routing";
import {
  PageSurface,
  createMessageSection,
  createMetricsSection,
  createPageBody,
  createPageTableSection,
  createStatusSection,
  useFeedback,
} from "@workspace/core/ui";
import type { BodySurfaceSectionSpec, PageSurfaceTabBarSpec, SurfaceToolbarItems } from "@workspace/core/ui";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { ReclassEntry, ReclassWorkbenchSummary } from "../../server/schedules/reclassify";
import { useFinanceFilterToolbarItems } from "../components/FinanceFilters";
import { formatFinanceAmount } from "../formatters";
import {
  createReclassWorkbenchColumns,
  filterReclassEntries,
  type ReclassTargetOption,
  type ReclassWorkbenchFilter,
} from "./reclassWorkbench";
import { useCSV, usePageDraft } from "@workspace/core/hooks";

const EMPTY_SUMMARY: ReclassWorkbenchSummary = {
  total: 0,
  attention: 0,
  processed: 0,
  exempt: 0,
  attentionAmount: 0,
  processedAmount: 0,
};

export default function ReclassTab({
  canRevise,
  canExport,
  navigation,
  lifecycleBlocks = [],
}: {
  canRevise: boolean;
  canExport: boolean;
  navigation?: PageSurfaceTabBarSpec;
  lifecycleBlocks?: BodySurfaceSectionSpec[];
}) {
  const [companyFilter, setCompanyFilter] = useState("02");
  const [yearFilter, setYearFilter] = useState("2025");
  const [monthFilter, setMonthFilter] = useState("12");
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<ReclassWorkbenchFilter>("attention");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [entries, setEntries] = useState<ReclassEntry[]>([]);
  const [summary, setSummary] = useState<ReclassWorkbenchSummary>(EMPTY_SUMMARY);
  const [targetOptions, setTargetOptions] = useState<ReclassTargetOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const draft = usePageDraft<string, string>();
  const feedback = useFeedback({ unsavedChanges: draft.dirty });

  const load = useCallback(async () => {
    if (!companyFilter || !yearFilter || !monthFilter) return;
    setLoading(true);
    try {
      const query = new URLSearchParams({ companyCode: companyFilter, year: yearFilter, month: monthFilter });
      const accountQuery = new URLSearchParams({ companyCode: companyFilter, year: yearFilter, scope: "all", pageSize: "2000" });
      const [workbenchRes, accountsRes] = await Promise.all([
        fetch(workspacePath(`/api/modules/finance/ledger/schedules/reclassify?${query.toString()}`)),
        fetch(workspacePath(`/api/modules/finance/ledger/accounts?${accountQuery.toString()}`)),
      ]);
      if (!workbenchRes.ok) {
        feedback.error("重分类工作台加载失败");
        return;
      }
      const data = await workbenchRes.json();
      setEntries(data.entries ?? []);
      setSummary(data.summary ?? EMPTY_SUMMARY);
      if (accountsRes.ok) {
        const accountData = await accountsRes.json();
        const accounts = (accountData.data ?? accountData.accounts ?? []) as Array<{ code: string; name: string; isActive?: boolean }>;
        setTargetOptions(accounts.filter((account) => account.isActive !== false).map((account) => ({
          value: account.code,
          label: `${account.code} ${account.name}`,
          searchText: account.name,
        })));
      }
    } catch {
      feedback.error("网络错误");
    } finally {
      setLoading(false);
    }
  }, [companyFilter, feedback, monthFilter, yearFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [companyFilter, keyword, monthFilter, statusFilter, yearFilter]);

  const filtered = useMemo(
    () => filterReclassEntries(entries, statusFilter, keyword),
    [entries, keyword, statusFilter],
  );
  const filterOptions = useMemo(() => {
    const attention = entries.filter((row) => row.status === "pending" || row.status === "configured").length;
    const processed = entries.filter((row) => row.status === "approved" || row.status === "adjusted").length;
    const exempt = entries.filter((row) => row.status === "exempt" || row.status === "rejected").length;
    return [
      { value: "attention", label: `待处理 ${attention}` },
      { value: "processed", label: `已重分类 ${processed}` },
      { value: "exempt", label: `无需重分类 ${exempt}` },
      { value: "all", label: `全部 ${entries.length}` },
    ];
  }, [entries]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const changeScope = useCallback(async (apply: () => void) => {
    if (!await feedback.confirmLeave()) return;
    draft.cancelEdit();
    apply();
  }, [draft, feedback]);

  const saveRules = useCallback(async () => {
    if (!draft.dirty) return;
    const rowMap = new Map(entries.map((row) => [row.id, row]));
    const changes = draft.changes.flatMap((change) => {
      const row = rowMap.get(change.key);
      if (!row) return [];
      return [{
        sourceAccountCode: row.accountCode,
        abnormalSide: row.abnormalSide,
        targetAccountCode: change.value.trim() || null,
      }];
    });
    if (changes.length === 0) return;
    setSaving(true);
    try {
      const res = await fetch(workspacePath("/api/modules/finance/ledger/reclass-rules"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyCode: companyFilter, year: Number(yearFilter), changes }),
      });
      const result = await res.json().catch(() => null) as { error?: string; saved?: number; cleared?: number } | null;
      if (!res.ok) {
        feedback.error(result?.error || "规则保存失败");
        return;
      }
      draft.acceptChanges();
      feedback.success(`已保存 ${changes.length} 项重分类规则变更`);
      await load();
    } catch {
      feedback.error("网络错误");
    } finally {
      setSaving(false);
    }
  }, [companyFilter, draft, entries, feedback, load, yearFilter]);

  const columns = useMemo(() => createReclassWorkbenchColumns({
    canRevise,
    editMode: draft.editMode,
    targetOptions,
    targetValue: (row) => draft.valueFor(row.id, row.targetAccountCode ?? ""),
    onTargetChange: (row, value) => draft.setDraft(row.id, row.targetAccountCode ?? "", value),
  }), [canRevise, draft, targetOptions]);

  const exportCSV = useCSV(
    `重分类工作台_${companyFilter}_${yearFilter}${monthFilter}.csv`,
    "科目编码,科目名称,期末反向余额,判断口径,处理状态,目标科目,依据\n",
    () => filtered.map((row) => [
      row.accountCode,
      row.accountName,
      row.amount,
      row.classification,
      row.status,
      row.targetAccountCode ?? "",
      row.reason,
    ].map(csvCell).join(",")).join("\n"),
  );

  const extraToolbarItems: SurfaceToolbarItems = [
    {
      kind: "select",
      key: "reclass-status",
      label: "处理范围",
      value: statusFilter,
      options: filterOptions,
      onChange: (value: string) => setStatusFilter(value as ReclassWorkbenchFilter),
    },
    ...(canExport ? [{
      kind: "action-group" as const,
      key: "reclass-export",
      actions: [{ key: "export", kind: "download" as const, label: "导出CSV", onClick: exportCSV, disabled: filtered.length === 0 }],
    }] : []),
    ...(canRevise ? [{
      kind: "edit-group" as const,
      key: "reclass-edit",
      editMode: draft.editMode,
      dirty: draft.dirty,
      canEdit: canRevise,
      saving,
      onStartEdit: draft.startEdit,
      onSave: saveRules,
      onCancel: draft.cancelEdit,
    }] : []),
    { kind: "text", key: "reclass-count", content: `${filtered.length} 项` },
  ];
  const toolbarItems = useFinanceFilterToolbarItems({
    companyFilter,
    yearFilter,
    monthFilter,
    keyword,
    pageSize,
    onCompanyChange: (value) => { void changeScope(() => setCompanyFilter(value)); },
    onYearChange: (value) => { void changeScope(() => setYearFilter(value)); },
    onMonthChange: (value) => { void changeScope(() => setMonthFilter(value)); },
    onKeywordChange: setKeyword,
    onPageSizeChange: (value) => { setPageSize(value); setPage(1); },
    extraItems: extraToolbarItems,
  });

  return (
    <PageSurface
      kind="standard"
      tabbar={navigation}
      toolbar={{ items: toolbarItems }}
      body={createPageBody([
        ...lifecycleBlocks,
        createMetricsSection("reclass-summary", {
          metrics: [
            { key: "total", label: "当前事项", value: summary.total },
            { key: "attention", label: "待处理", value: `${summary.attention} 项 · ¥${formatFinanceAmount(summary.attentionAmount)}` },
            { key: "processed", label: "已重分类", value: `${summary.processed} 项 · ¥${formatFinanceAmount(summary.processedAmount)}` },
            { key: "exempt", label: "无需重分类", value: summary.exempt },
          ],
        }),
        createMessageSection("reclass-guidance", {
          tone: "muted",
          content: "以期末余额和辅助核算对象为判断基础；规则已配置不等于本期已重分类，只有已确认的辅助余额或人工调整才进入报表。",
        }),
        ...(loading
          ? [createStatusSection("reclass-loading", { kind: "loading", content: "加载中..." })]
          : paged.length === 0
            ? [createStatusSection("reclass-empty", { kind: "empty", content: entries.length === 0 ? "当前期间没有反向余额或重分类记录" : "当前筛选范围没有事项" })]
            : [createPageTableSection("reclass-workbench", {
                rows: paged,
                columns,
                visibleColumns: columns.map((column) => column.key),
                rowKey: (row) => row.id,
                presentation: { density: "compact" },
              })]),
      ])}
      footer={filtered.length > 0 ? { pagination: { page, totalPages, total: filtered.length, onPageChange: setPage } } : undefined}
    />
  );
}

function csvCell(value: string | number) {
  const text = String(value).replaceAll('"', '""');
  return text.includes(",") || text.includes('"') || text.includes("\n") ? `"${text}"` : text;
}
