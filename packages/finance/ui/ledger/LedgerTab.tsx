"use client";

import { workspacePath } from "@workspace/core/routing";
import { useEffect, useState, useCallback } from "react";
import { PageSurface, createPageBody, type DataSurfaceColumnSpec } from "@workspace/core/ui";
import type { BodySurfaceSectionSpec, PageSurfaceTabBarSpec } from "@workspace/core/ui";
import { useFinanceFilterToolbarItems } from "../components/FinanceFilters";
import { formatFinanceAmount } from "../formatters";
import type { FinanceLedgerDefaultScope } from "./defaultScope";
import { useLedgerExportAction } from "./useLedgerExportAction";

interface Balance {
  id: number;
  account: { code: string; name: string; category: string; balanceDirection: string };
  openingDebit: number;
  openingCredit: number;
  currentDebit: number;
  currentCredit: number;
  closingDebit: number;
  closingCredit: number;
}

export default function LedgerTab({
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
  const [balances, setBalances] = useState<Balance[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  // 筛选
  const [companyFilter, setCompanyFilter] = useState(defaultScope?.companyCode ?? "");
  const [yearFilter, setYearFilter] = useState(defaultScope ? String(defaultScope.year) : "");
  const [monthFilter, setMonthFilter] = useState(defaultScope ? String(defaultScope.month) : "");
  const exportAction = useLedgerExportAction({
    canExport,
    view: "balances",
    companyCode: companyFilter,
    year: yearFilter,
    month: monthFilter,
    disabled: !companyFilter || !yearFilter || !monthFilter,
    fallbackFilename: `${companyFilter}-${yearFilter}.${monthFilter.padStart(2, "0")}-余额表.xlsx`,
  });

  const loadBalances = useCallback(async () => {
    if (!companyFilter || !yearFilter || !monthFilter) {
      setBalances([]);
      setTotal(0);
      setTotalPages(1);
      return;
    }
    setLoading(true);
    const params = new URLSearchParams();
    params.set("companyCode", companyFilter);
    params.set("year", yearFilter);
    params.set("month", monthFilter);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    const res = await fetch(workspacePath(`/api/modules/finance/ledger/balances?${params.toString()}`));
    if (res.ok) {
      const data = await res.json();
      setBalances(data.data || data.balances || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    }
    setLoading(false);
  }, [companyFilter, yearFilter, monthFilter, page, pageSize]);

  useEffect(() => { loadBalances(); }, [loadBalances]);

  const CATEGORIES: Record<string, string> = { asset: "资产", liability: "负债", common: "共同", equity: "权益", cost: "成本", revenue: "损益" };
  const columns: DataSurfaceColumnSpec<Balance>[] = [
    {
      key: "accountCode",
      label: "科目编码",
      required: true,
      font: "mono",
      cell: (balance) => balance.account.code,
    },
    {
      key: "accountName",
      label: "科目名称",
      required: true,

      cell: (balance) => balance.account.name,
    },
    {
      key: "category",
      label: "类别",
      required: true,

      cell: (balance) => CATEGORIES[balance.account.category] ?? balance.account.category,
    },
    {
      key: "openingDebit",
      label: "期初借方",
      required: true,
      align: "right",

      cell: (balance) => formatFinanceAmount(balance.openingDebit),
    },
    {
      key: "openingCredit",
      label: "期初贷方",
      required: true,
      align: "right",

      cell: (balance) => formatFinanceAmount(balance.openingCredit),
    },
    {
      key: "currentDebit",
      label: "本期借方",
      required: true,
      align: "right",

      cell: (balance) => formatFinanceAmount(balance.currentDebit),
    },
    {
      key: "currentCredit",
      label: "本期贷方",
      required: true,
      align: "right",

      cell: (balance) => formatFinanceAmount(balance.currentCredit),
    },
    {
      key: "closingDebit",
      label: "期末借方",
      required: true,
      align: "right",

      cell: (balance) => formatFinanceAmount(balance.closingDebit),
    },
    {
      key: "closingCredit",
      label: "期末贷方",
      required: true,
      align: "right",

      cell: (balance) => formatFinanceAmount(balance.closingCredit),
    },
  ];
  const toolbarItems = useFinanceFilterToolbarItems({
    companyFilter,
    yearFilter,
    monthFilter,
    pageSize,
    onCompanyChange: (v) => { setCompanyFilter(v); setPage(1); },
    onYearChange: (v) => { setYearFilter(v); setPage(1); },
    onMonthChange: (v) => { setMonthFilter(v); setPage(1); },
    onPageSizeChange: (v) => { setPageSize(v); setPage(1); },
    extraItems: [
      ...(exportAction ? [exportAction] : []),
      { kind: "text", key: "ledger-total", content: `共 ${total} 条` },
    ],
  });
  return (
    <PageSurface kind="standard"
      tabbar={navigation}
      toolbar={{ items: toolbarItems }}
      body={createPageBody([
          ...lifecycleBlocks,
          {
            key: "balances",
            body: { kind: "data", data: {
              kind: "table",


              rows: balances,
              columns,
              visibleColumns: columns.map((column) => column.key),
              loading,
              emptyText: "暂无余额数据，请先录入凭证并计算余额",
              rowKey: (balance: Balance) => balance.id,
            } },
          },
        ], { layout: "stack" })}
      footer={{ pagination: { page, totalPages, total, onPageChange: setPage } }}
    />
  );
}
