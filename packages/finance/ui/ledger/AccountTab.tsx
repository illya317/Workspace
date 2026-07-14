"use client";

import { workspacePath } from "@workspace/core/routing";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageSurface, createPageDataSection, useFeedback } from "@workspace/core/ui";
import type { BodySurfaceSectionSpec, PageSurfaceTabBarSpec, SurfaceToolbarItems } from "@workspace/core/ui";
import { getAccountColumns, type Account } from "../components/AccountTable";
import { useFinanceFilterToolbarItems } from "../components/FinanceFilters";
import { useCompanyOptions } from "@workspace/platform/hooks";

// Account type and column definitions from shared AccountTable

export default function AccountTab({
  navigation,
  lifecycleBlocks = [],
}: {
  navigation?: PageSurfaceTabBarSpec;
  lifecycleBlocks?: BodySurfaceSectionSpec[];
}) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyFilter, setCompanyFilter] = useState("");
  const [levelFilter, setLevelFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [scope, setScope] = useState("");
  const [extraField, setExtraField] = useState<"level" | "scope">("scope");
  const [extraValue, setExtraValue] = useState("");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const companyOptions = useCompanyOptions(false);
  const companyNameByCode = useMemo(() => new Map(companyOptions.map((option) => [option.value, option.label])), [companyOptions]);
  const accountColumns = useMemo(() => getAccountColumns(companyNameByCode), [companyNameByCode]);
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
    params.set("scope", scope || "all");
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
    {
      kind: "grouped-select" as const,
      key: "extra-filter",
      value: `${extraField}:${extraValue}`,
      groups: [
        { key: "level", label: "层级", options: [{ value: "level:", label: "全部" }, { value: "level:1", label: "1级" }, { value: "level:2", label: "2级" }, { value: "level:3", label: "3级" }, { value: "level:4", label: "4级" }, { value: "level:5", label: "5级" }] },
        { key: "scope", label: "类型", options: [{ value: "scope:", label: "全部" }, { value: "scope:mapped", label: "集团" }, { value: "scope:unmapped", label: "独有" }, { value: "scope:inactive", label: "未启用" }] },
      ],
      groupLabel: "筛选项",
      optionLabel: "筛选值",
      onChange: (selection: string) => {
        const [nextField, ...valueParts] = selection.split(":");
        const nextValue = valueParts.join(":");
        const field = nextField as typeof extraField;
        setExtraField(field);
        setExtraValue(nextValue);
        setLevelFilter(field === "level" ? nextValue : "");
        setScope(field === "scope" ? nextValue : "");
        setPage(1);
      },
    },
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
    columns: accountColumns,
    visibleColumns,
    onColumnsChange: setVisibleColumns,
    showMonth: false,
    showLevel: false,
    extraItems: extraToolbarItems,
  });

  return (
    <PageSurface kind="standard"
      tabbar={navigation}
      toolbar={{ items: toolbarItems }}
      body={{
        kind: "section",
        layout: "stack",
        sections: [
          ...lifecycleBlocks,
          createPageDataSection("accounts", {
            kind: "table",
            rows: accounts,
            columns: accountColumns,
            visibleColumns,
            loading,
            emptyText: "暂无科目数据",
            rowKey: (account: Account) => account.id,
          }),
        ],
      }}
      footer={{ pagination: { page, totalPages, total, onPageChange: setPage } }}
    />
  );
}
