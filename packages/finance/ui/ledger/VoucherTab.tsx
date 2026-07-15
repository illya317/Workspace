"use client";

import { workspacePath } from "@workspace/core/routing";
import { useEffect, useState, useMemo } from "react";
import { createPageBody, PageSurface, useFeedback } from "@workspace/core/ui";
import type { BodySurfaceSectionSpec, DataSurfaceCellSpec, DataSurfaceColumnSpec, PageSurfaceTabBarSpec } from "@workspace/core/ui";
import { useFinanceFilterToolbarItems } from "../components/FinanceFilters";
import { getBaseItemColumns, type VoucherItemRow } from "../components/VoucherItemTable";
import { getVoucherColumns } from "./VoucherColumns";
import type { Voucher, VoucherResponse } from "@workspace/finance/types";
import { useCompanyOptions } from "@workspace/platform/hooks";
import type { FinanceLedgerDefaultScope } from "./defaultScope";

// ─── Component ───────────────────────────────────────────

export default function VoucherTab({
  defaultScope,
  navigation,
  lifecycleBlocks = [],
}: {
  defaultScope: FinanceLedgerDefaultScope | null;
  navigation?: PageSurfaceTabBarSpec;
  lifecycleBlocks?: BodySurfaceSectionSpec[];
}) {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyFilter, setCompanyFilter] = useState(defaultScope?.companyCode ?? "");
  const [yearFilter, setYearFilter] = useState(defaultScope ? String(defaultScope.year) : "");
  const [monthFilter, setMonthFilter] = useState(defaultScope ? String(defaultScope.month) : "");
  const [expandedVoucherId, setExpandedVoucherId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const { error } = useFeedback();
  const [keyword, setKeyword] = useState("");
  const companyOptions = useCompanyOptions(false);
  const companyNameByCode = useMemo(() => new Map(companyOptions.map((option) => [option.value, option.label])), [companyOptions]);
  const voucherColumns = useMemo(() => getVoucherColumns(expandedVoucherId, companyNameByCode), [companyNameByCode, expandedVoucherId]);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(
    () => voucherColumns.filter((c) => c.required || c.defaultVisible).map((c) => c.key)
  );

  const itemColumns = useMemo(() => getBaseItemColumns(), []);

  useEffect(() => {
    const ctrl = new AbortController();
    let cancelled = false;

    async function load() {
      setLoading(true);
      const params = new URLSearchParams();
      if (companyFilter) params.set("companyCode", companyFilter);
      if (yearFilter) params.set("year", yearFilter);
      if (monthFilter) params.set("month", monthFilter);
      if (keyword) params.set("keyword", keyword);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));

      try {
        const res = await fetch(workspacePath(`/api/modules/finance/ledger/vouchers?${params.toString()}`), { signal: ctrl.signal });
        if (cancelled) return;
        if (res.ok) {
          const data: VoucherResponse = await res.json();
          if (!cancelled) {
            setVouchers(data.vouchers || []);
            setTotal(data.total || 0);
          }
        } else {
          const err = await res.json().catch(() => ({ error: "加载失败" }));
          if (!cancelled) error(err.error || "加载失败");
        }
      } catch (e: unknown) {
        const err = e as Error;
        if (err.name === "AbortError") return;
        if (!cancelled) error("网络错误");
      }
      if (!cancelled) setLoading(false);
    }

    load();

    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [companyFilter, error, keyword, monthFilter, page, pageSize, yearFilter]);

  const totalPages = Math.ceil(total / pageSize);
  const toolbarItems = useFinanceFilterToolbarItems({
    companyFilter,
    yearFilter,
    monthFilter,
    keyword,
    pageSize,
    onCompanyChange: (v) => { setCompanyFilter(v); setPage(1); },
    onYearChange: (v) => { setYearFilter(v); setPage(1); },
    onMonthChange: (v) => { setMonthFilter(v); setPage(1); },
    onKeywordChange: (v) => { setKeyword(v); setPage(1); },
    onPageSizeChange: (v) => { setPageSize(v); setPage(1); },
    columns: voucherColumns,
    visibleColumns,
    onColumnsChange: setVisibleColumns,
  });

  return (
    <PageSurface kind="standard"
      tabbar={navigation}
      toolbar={{ items: toolbarItems }}
      body={createPageBody([
        ...lifecycleBlocks,
        {
          key: "vouchers",
          body: { kind: "data", data: {
            kind: "table",
            rows: vouchers,
            columns: voucherColumns,
            visibleColumns,
            loading,
            emptyText: "暂无凭证",
            rowKey: (v: Voucher) => v.id,
            onRowClick: (v: Voucher) =>
              setExpandedVoucherId((prev) => (prev === v.id ? null : v.id)),
            expandedRowKey: expandedVoucherId,
            expandedRow: (v: Voucher) => voucherItemsPreview(v, itemColumns),
          } },
        },
      ])}
      footer={{ pagination: { page, totalPages, total, onPageChange: setPage } }}
    />
  );
}

function voucherItemsPreview(voucher: Voucher, columns: DataSurfaceColumnSpec<VoucherItemRow>[]): DataSurfaceCellSpec {
  return {
    kind: "data",
    data: {
      kind: "table",
      rows: voucher.items.map((item: VoucherItemRow, index: number) => ({ ...item, _idx: index, _voucherNo: voucher.voucherNo })),
      columns,
      visibleColumns: columns.map((column) => column.key),
      rowKey: (row: VoucherItemRow) => `item-${row.id}`,
      presentation: { density: "compact" },
    },
  };
}
