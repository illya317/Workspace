"use client";

import { workspacePath } from "@workspace/core/routing";
import {
  PageSurface,
  createPageBody,
  createPageTableSection,
  createStatusSection,
  type BodySurfaceSectionSpec,
  type DataSurfaceColumnSpec,
  type PageSurfaceTabBarSpec,
} from "@workspace/core/ui";
import type {
  FinanceCounterpartyBalanceCategory,
  FinanceCounterpartyBalanceResponse,
  FinanceCounterpartyBalanceRow,
} from "../../types/ledger";
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { useFinanceFilterToolbarItems } from "../components/FinanceFilters";
import { formatFinanceAmount } from "../formatters";
import type { FinanceLedgerDefaultScope } from "./defaultScope";
import { useLedgerExportAction } from "./useLedgerExportAction";

const CATEGORY_LABELS: Record<FinanceCounterpartyBalanceCategory, {
  name: string;
  empty: string;
}> = {
  ar: { name: "客户名称", empty: "当前期间没有应收账款明细" },
  ap: { name: "供应商名称", empty: "当前期间没有应付账款明细" },
  otherAr: { name: "往来对象名称", empty: "当前期间没有其他应收款明细" },
  otherAp: { name: "往来对象名称", empty: "当前期间没有其他应付款明细" },
};

const EMPTY_RESPONSE: FinanceCounterpartyBalanceResponse = {
  data: [],
  total: 0,
  page: 1,
  pageSize: 50,
  totalPages: 1,
  totals: {
    openingDebit: 0,
    openingCredit: 0,
    currentDebit: 0,
    currentCredit: 0,
    closingDebit: 0,
    closingCredit: 0,
  },
};

export default function CounterpartyBalanceTab({
  canExport,
  category,
  defaultScope,
  navigation,
  lifecycleBlocks = [],
}: {
  canExport: boolean;
  category: FinanceCounterpartyBalanceCategory;
  defaultScope: FinanceLedgerDefaultScope | null;
  navigation?: PageSurfaceTabBarSpec;
  lifecycleBlocks?: BodySurfaceSectionSpec[];
}) {
  const [companyCode, setCompanyCode] = useState(defaultScope?.companyCode ?? "");
  const [year, setYear] = useState(String(defaultScope?.year ?? ""));
  const [month, setMonth] = useState(String(defaultScope?.month ?? ""));
  const [keyword, setKeyword] = useState("");
  const deferredKeyword = useDeferredValue(keyword);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [result, setResult] = useState<FinanceCounterpartyBalanceResponse>(EMPTY_RESPONSE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!companyCode || !year || !month) {
      setResult({ ...EMPTY_RESPONSE, page, pageSize });
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({
        companyCode,
        year,
        month,
        category,
        page: String(page),
        pageSize: String(pageSize),
      });
      if (deferredKeyword.trim()) query.set("keyword", deferredKeyword.trim());
      const response = await fetch(workspacePath(
        `/api/modules/finance/ledger/counterparty-balances?${query.toString()}`,
      ));
      const data = await response.json().catch(() => null) as FinanceCounterpartyBalanceResponse | { error?: string } | null;
      if (!response.ok) throw new Error(data && "error" in data ? data.error : `加载失败 (${response.status})`);
      setResult(data as FinanceCounterpartyBalanceResponse);
    } catch (caught) {
      setResult({ ...EMPTY_RESPONSE, page, pageSize });
      setError(caught instanceof Error ? caught.message : "应收应付余额加载失败");
    } finally {
      setLoading(false);
    }
  }, [category, companyCode, deferredKeyword, month, page, pageSize, year]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(1); }, [category]);

  const labels = CATEGORY_LABELS[category];
  const exportLabel = { ar: "应收", ap: "应付", otherAr: "其他应收", otherAp: "其他应付" }[category];
  const exportAction = useLedgerExportAction({
    canExport,
    view: "counterparty",
    companyCode,
    year,
    month,
    keyword: deferredKeyword,
    category,
    disabled: !companyCode || !year || !month,
    fallbackFilename: `${companyCode}-${year}.${month.padStart(2, "0")}-${exportLabel}.xlsx`,
  });
  const columns = useMemo<DataSurfaceColumnSpec<FinanceCounterpartyBalanceRow>[]>(() => [
    {
      key: "counterpartyName",
      label: labels.name,
      required: true,
      cell: (row) => row.counterpartyName,
    },
    amountColumn("openingDebit", "期初借方"),
    amountColumn("openingCredit", "期初贷方"),
    amountColumn("currentDebit", "本期借方"),
    amountColumn("currentCredit", "本期贷方"),
    amountColumn("closingDebit", "期末借方"),
    amountColumn("closingCredit", "期末贷方"),
  ], [labels.name]);
  const toolbarItems = useFinanceFilterToolbarItems({
    companyFilter: companyCode,
    yearFilter: year,
    monthFilter: month,
    keyword,
    pageSize,
    onCompanyChange: (value) => { setCompanyCode(value); setPage(1); },
    onYearChange: (value) => { setYear(value); setPage(1); },
    onMonthChange: (value) => { setMonth(value); setPage(1); },
    onKeywordChange: (value) => { setKeyword(value); setPage(1); },
    onPageSizeChange: (value) => { setPageSize(value); setPage(1); },
    extraItems: [
      ...(exportAction ? [exportAction] : []),
      { kind: "text", key: "counterparty-total", content: `共 ${result.total} 项` },
    ],
  });
  const sections: BodySurfaceSectionSpec[] = [
    ...lifecycleBlocks,
    ...(error ? [createStatusSection("counterparty-error", { kind: "error", content: error })] : []),
    ...(!error ? [createPageTableSection("counterparty-balances", {
      rows: result.data,
      columns,
      visibleColumns: columns.map((column) => column.key),
      rowKey: (row) => row.id,
      loading,
      emptyText: companyCode && year && month ? labels.empty : "请选择公司和会计期间",
      presentation: { density: "compact" },
      scroll: { x: true },
    })] : []),
  ];

  return <PageSurface
    kind="standard"
    tabbar={navigation}
    toolbar={{ items: toolbarItems }}
    body={createPageBody(sections)}
    footer={result.total > 0 ? {
      pagination: {
        page: result.page,
        totalPages: result.totalPages,
        total: result.total,
        onPageChange: setPage,
      },
    } : undefined}
  />;
}

function amountColumn(
  key: "openingDebit" | "openingCredit" | "currentDebit" | "currentCredit" | "closingDebit" | "closingCredit",
  label: string,
): DataSurfaceColumnSpec<FinanceCounterpartyBalanceRow> {
  return { key, label, required: true, align: "right", cell: (row) => formatCounterpartyAmount(row[key]) };
}

function formatCounterpartyAmount(value: number) {
  return value === 0 ? "0" : formatFinanceAmount(value);
}
