"use client";

import { workspacePath } from "@workspace/core/routing";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageSurface, useFeedback } from "@workspace/core/ui";
import type { PageSurfaceBlockSpec, PageSurfaceNavigationSpec, SurfaceToolbarItems } from "@workspace/core/ui";
import { getAccountColumns, type Account } from "../components/AccountTable";
import ReclassConfigView from "../components/ReclassConfigView";
import { useFinanceFilterToolbarItems } from "../components/FinanceFilters";

// Account type and column definitions from shared AccountTable

export default function AccountTab({
  canWrite,
  navigation,
  lifecycleBlocks = [],
}: {
  canWrite: boolean;
  navigation?: PageSurfaceNavigationSpec;
  lifecycleBlocks?: PageSurfaceBlockSpec[];
}) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyFilter, setCompanyFilter] = useState("");
  const [levelFilter, setLevelFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [scope, setScope] = useState("");
  const [reclassMode, setReclassMode] = useState(false);
  const [reclassStats, setReclassStats] = useState({ total: 0, noRule: 0, hasRule: 0 });
  const [reclassStatus, setReclassStatus] = useState<"noRule" | "hasRule" | "all">("hasRule");
  const [extraField, setExtraField] = useState<"level" | "scope">("scope");
  const [extraValue, setExtraValue] = useState("");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const accountColumns = useMemo(() => getAccountColumns(), []);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(
    () => accountColumns.filter((c) => c.required || c.defaultVisible).map((c) => c.key)
  );
  const { error } = useFeedback();

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (companyFilter) params.set("companyCode", companyFilter);
    if (levelFilter) params.set("subjectLevel", levelFilter);
    if (yearFilter) params.set("year", yearFilter);
    if (keyword) params.set("keyword", keyword);
    params.set("scope", scope);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));

    try {
      const res = await fetch(workspacePath(`/api/modules/finance/ledger/accounts?${params.toString()}`));
      if (res.ok) {
        const data = await res.json();
        setAccounts(data.data || data.accounts || []);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 1);
      }
    } catch {
      error("网络错误");
    }
    setLoading(false);
  }, [companyFilter, error, keyword, levelFilter, page, pageSize, scope, yearFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const _levels = [...new Set(accounts.map((a) => a.subjectLevel).filter(Boolean))].sort((a, b) => (a || 0) - (b || 0));
  void _levels;
  const extraToolbarItems: SurfaceToolbarItems = [
    ...(!reclassMode ? [
      {
        kind: "select" as const,
        key: "extra-field",
        section: "filter" as const,
        label: "筛选项",
        value: extraField,
        onChange: (key: string) => {
          setLevelFilter("");
          setScope("");
          setExtraField(key as typeof extraField);
          setExtraValue("");
          setPage(1);
        },
        options: [{ value: "level", label: "层级" }, { value: "scope", label: "类型" }],
      },
      {
        kind: "select" as const,
        key: "extra-value",
        section: "filter" as const,
        label: "筛选值",
        value: extraValue,
        onChange: (value: string) => {
          if (extraField === "level") setLevelFilter(value);
          else setScope(value);
          setExtraValue(value);
          setPage(1);
        },
        options: extraField === "level"
          ? [{ value: "", label: "全部" }, { value: "1", label: "1级" }, { value: "2", label: "2级" }, { value: "3", label: "3级" }, { value: "4", label: "4级" }, { value: "5", label: "5级" }]
          : [{ value: "", label: "全部" }, { value: "mapped", label: "集团" }, { value: "unmapped", label: "独有" }, { value: "inactive", label: "未启用" }],
      },
    ] : []),
    ...(canWrite ? [{
      kind: "action-group" as const,
      key: "reclass-actions",
      section: "action" as const,
      actions: [{
        key: "toggle-reclass",
        kind: "reclass" as const,
        label: "重分类",
        variant: reclassMode ? "primary" as const : "secondary" as const,
        onClick: () => setReclassMode(!reclassMode),
      }],
    }] : []),
    ...(canWrite && reclassMode ? [{
      kind: "select" as const,
      key: "reclass-status",
      section: "filter" as const,
      label: "状态",
      value: reclassStatus,
      onChange: (key: string) => setReclassStatus(key as typeof reclassStatus),
      options: [
        { value: "hasRule", label: `已配置 ${reclassStats.hasRule}` },
        { value: "noRule", label: `未配置 ${reclassStats.noRule}` },
        { value: "all", label: `全部 ${reclassStats.total}` },
      ],
    }] : []),
  ];
  const toolbarItems = useFinanceFilterToolbarItems({
    companyFilter,
    yearFilter,
    levelFilter,
    keyword,
    pageSize,
    onCompanyChange: (v) => { setCompanyFilter(v); setPage(1); },
    onYearChange: (v) => { setYearFilter(v); setPage(1); },
    onLevelChange: (v) => { setLevelFilter(v); setPage(1); },
    onKeywordChange: (v) => { setKeyword(v); setPage(1); },
    onPageSizeChange: (v) => { setPageSize(v); setPage(1); },
    columns: reclassMode ? undefined : accountColumns,
    visibleColumns: reclassMode ? undefined : visibleColumns,
    onColumnsChange: reclassMode ? undefined : setVisibleColumns,
    showMonth: false,
    showLevel: false,
    extraItems: extraToolbarItems,
  });

  return (
    <PageSurface
      kind="list"
      navigation={navigation}
      toolbar={{ items: toolbarItems }}
      body={{
        blocks: lifecycleBlocks,
        content: reclassMode ? (
          companyFilter && yearFilter ? (
            <ReclassConfigView companyCode={companyFilter} year={yearFilter} keyword={keyword} statusFilter={reclassStatus} pageSize={pageSize} canWrite={canWrite} onStats={setReclassStats} />
          ) : (
            <p className="py-8 text-center text-sm text-gray-400">请选择公司和年份以配置重分类规则</p>
          )
        ) : undefined,
        ...(!reclassMode ? {
          layout: "single" as const,
          blocks: [
            ...lifecycleBlocks,
            {
              kind: "data" as const,
              key: "accounts",
              surface: {
                kind: "table" as const,
                framed: true,
                className: "overflow-hidden",
                bodyClassName: "overflow-x-auto",
                rows: accounts,
                columns: accountColumns,
                visibleColumns,
                loading,
                emptyText: "暂无科目数据",
                rowKey: (account: Account) => account.id,
              },
            },
          ],
        } : {}),
      }}
      footer={!reclassMode ? { pagination: { page, totalPages, total, onPageChange: setPage } } : undefined}
    />
  );
}
