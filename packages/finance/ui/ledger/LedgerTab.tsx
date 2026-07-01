"use client";

import { workspacePath } from "@workspace/core/routing";
import { useEffect, useState, useCallback } from "react";
import { PageSurface, createPageBody, useFeedback, type DataSurfaceColumnSpec } from "@workspace/core/ui";
import type { BodySurfaceSectionSpec, PageSurfaceNavigationSpec } from "@workspace/core/ui";
import { useFinanceFilterToolbarItems } from "../components/FinanceFilters";
import { useFinanceBalanceReconcileSection } from "../components/FinanceBalanceReconcile";
import { formatFinanceAmount } from "../formatters";

interface Period {
  id: number;
  year: number;
  month: number;
  isClosed: boolean;
}

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
  canImport,
  navigation,
  lifecycleBlocks = [],
}: {
  canImport: boolean;
  navigation?: PageSurfaceNavigationSpec;
  lifecycleBlocks?: BodySurfaceSectionSpec[];
}) {
  const [_periods, setPeriods] = useState<Period[]>([]);
  const [_selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const feedback = useFeedback();

  // 筛选
  const [companyFilter, setCompanyFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");

  useEffect(() => {
    fetch(workspacePath("/api/modules/finance/ledger/periods")).then((r) => r.json()).then((d) => {
      const list = d.periods || [];
      setPeriods(list);
      // 默认选中第一个期间
      if (list.length) {
        const first = list[0];
        if (first.companyCode) setCompanyFilter((current) => current || first.companyCode);
        setYearFilter((current) => current || String(first.year));
        setMonthFilter((current) => current || String(first.month));
      }
    });
  }, []);

  const loadBalances = useCallback(async () => {
    if (!companyFilter || !yearFilter || !monthFilter) {
      setBalances([]);
      setSelectedPeriodId(null);
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
      setSelectedPeriodId(data.periodId || null);
    }
    setLoading(false);
  }, [companyFilter, yearFilter, monthFilter, page, pageSize]);

  useEffect(() => { loadBalances(); }, [loadBalances]);

  const CATEGORIES: Record<string, string> = { asset: "资产", liability: "负债", equity: "权益", cost: "成本", revenue: "损益" };
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
    extraItems: [{
      kind: "text",
      key: "ledger-total",
      content: <span>共 {total} 条</span>,
    }],
  });
  const reconcileSection = useFinanceBalanceReconcileSection({
    enabled: canImport,
    showToast: feedback.notify,
  });

  return (
    <PageSurface kind="standard"
      navigation={navigation}
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
          ...(reconcileSection ? [reconcileSection] : []),
        ], { layout: "stack" })}
      footer={{ pagination: { page, totalPages, total, onPageChange: setPage } }}
    />
  );
}
