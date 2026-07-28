"use client";

import { workspacePath } from "@workspace/core/routing";
import { useEffect, useState, useMemo } from "react";
import { createPageBody, PageSurface, useFeedback } from "@workspace/core/ui";
import type { BodySurfaceSectionSpec, DataSurfaceCellSpec, DataSurfaceColumnSpec, PageSurfaceTabBarSpec } from "@workspace/core/ui";
import { useFinanceFilterToolbarItems } from "../components/FinanceFilters";
import { getBaseItemColumns, getGroupItemColumns, type VoucherItemRow } from "../components/VoucherItemTable";
import { getVoucherColumns } from "./VoucherColumns";
import type { FinanceGroupVoucherDocumentType, Voucher, VoucherResponse } from "@workspace/finance/types";
import { useCompanyOptions } from "@workspace/platform/hooks";
import type { FinanceLedgerDefaultScope } from "./defaultScope";
import { cashFlowAllocationsForItem } from "./voucherCashFlow";
import { useLedgerExportAction } from "./useLedgerExportAction";
import { GROUP_VOUCHER_DOCUMENT_TYPE_OPTIONS } from "./groupVoucherDocumentTypes";

// ─── Component ───────────────────────────────────────────

export default function VoucherTab({
  canExport,
  defaultScope,
  voucherKind,
  navigation,
  lifecycleBlocks = [],
}: {
  canExport: boolean;
  defaultScope: FinanceLedgerDefaultScope | null;
  voucherKind: "standard" | "group";
  navigation?: PageSurfaceTabBarSpec;
  lifecycleBlocks?: BodySurfaceSectionSpec[];
}) {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyFilter, setCompanyFilter] = useState(voucherKind === "standard" ? defaultScope?.companyCode ?? "" : "");
  const [yearFilter, setYearFilter] = useState(defaultScope ? String(defaultScope.year) : "");
  const [monthFilter, setMonthFilter] = useState(defaultScope ? String(defaultScope.month) : "");
  const [expandedVoucherId, setExpandedVoucherId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const { error } = useFeedback();
  const [keyword, setKeyword] = useState("");
  const [documentType, setDocumentType] = useState("");
  const [origin, setOrigin] = useState("");
  const companyOptions = useCompanyOptions(false);
  const companyNameByCode = useMemo(() => new Map(companyOptions.map((option) => [option.value, option.label])), [companyOptions]);
  useEffect(() => {
    setCompanyFilter(voucherKind === "standard" ? defaultScope?.companyCode ?? "" : "");
    setDocumentType("");
    setOrigin("");
    setPage(1);
    setExpandedVoucherId(null);
  }, [defaultScope?.companyCode, voucherKind]);
  const voucherColumns = useMemo(() => getVoucherColumns(expandedVoucherId, companyNameByCode, {
    group: voucherKind === "group",
  }), [companyNameByCode, expandedVoucherId, voucherKind]);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(
    () => voucherColumns.filter((c) => c.required || c.defaultVisible).map((c) => c.key)
  );
  useEffect(() => {
    setVisibleColumns(voucherColumns.filter((column) => column.required || column.defaultVisible).map((column) => column.key));
  }, [voucherColumns]);

  const itemColumns = useMemo(() => voucherKind === "group" ? getGroupItemColumns() : getBaseItemColumns(), [voucherKind]);
  const exportAction = useLedgerExportAction({
    canExport,
    view: "vouchers",
    companyCode: companyFilter,
    year: yearFilter,
    month: monthFilter,
    keyword,
    voucherKind,
    documentType: voucherKind === "group" && documentType
      ? documentType as FinanceGroupVoucherDocumentType
      : undefined,
    origin: voucherKind === "group" && origin ? origin as "manual" | "system" : undefined,
    fallbackFilename: voucherKind === "group"
      ? `${yearFilter || "全部年度"}${monthFilter ? `.${monthFilter.padStart(2, "0")}` : ""}-合并明细.xlsx`
      : `${companyNameByCode.get(companyFilter) || companyFilter || "全部公司"}-${yearFilter || "全部年度"}${monthFilter ? `.${monthFilter.padStart(2, "0")}` : ""}-凭证明细.xlsx`,
  });

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
      params.set("voucherKind", voucherKind);
      if (voucherKind === "group" && documentType) params.set("documentType", documentType);
      if (voucherKind === "group" && origin) params.set("origin", origin);
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
          if (!cancelled) {
            setVouchers([]);
            setTotal(0);
            error(err.error || "加载失败");
          }
        }
      } catch (e: unknown) {
        const err = e as Error;
        if (err.name === "AbortError") return;
        if (!cancelled) {
          setVouchers([]);
          setTotal(0);
          error("网络错误");
        }
      }
      if (!cancelled) setLoading(false);
    }

    load();

    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [companyFilter, documentType, error, keyword, monthFilter, origin, page, pageSize, voucherKind, yearFilter]);

  const totalPages = Math.ceil(total / pageSize);
  const toolbarItems = useFinanceFilterToolbarItems({
    companyFilter,
    yearFilter,
    monthFilter,
    keyword,
    pageSize,
    onCompanyChange: voucherKind === "standard"
      ? (v) => { setCompanyFilter(v); setPage(1); }
      : undefined,
    onYearChange: (v) => { setYearFilter(v); setPage(1); },
    onMonthChange: (v) => { setMonthFilter(v); setPage(1); },
    onKeywordChange: (v) => { setKeyword(v); setPage(1); },
    onPageSizeChange: (v) => { setPageSize(v); setPage(1); },
    columns: voucherKind === "standard" ? voucherColumns : undefined,
    visibleColumns: voucherKind === "standard" ? visibleColumns : undefined,
    onColumnsChange: voucherKind === "standard" ? setVisibleColumns : undefined,
    allowPeriodWithoutCompany: voucherKind === "group",
    extraItems: [
      ...(voucherKind === "group" ? [
        {
          kind: "select" as const,
          key: "group-document-type",
          label: "凭证类别",
          value: documentType,
          options: GROUP_VOUCHER_DOCUMENT_TYPE_OPTIONS,
          onChange: (value: string) => { setDocumentType(value); setPage(1); },
        },
        {
          kind: "select" as const,
          key: "group-origin",
          label: "生成方式",
          value: origin,
          options: [
            { value: "", label: "全部方式" },
            { value: "manual", label: "人工编制" },
            { value: "system", label: "规则生成" },
          ],
          onChange: (value: string) => { setOrigin(value); setPage(1); },
        },
      ] : []),
      ...(exportAction ? [exportAction] : []),
    ],
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
            onRowClick: (v: Voucher) => setExpandedVoucherId((prev) => (prev === v.id ? null : v.id)),
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
      rows: voucher.items.map((item: VoucherItemRow, index: number) => ({
        ...item,
        _idx: index,
        sourceDate: voucher.voucherKind === "group" ? item.sourceDate ?? null : voucher.date,
        cashFlowAllocations: cashFlowAllocationsForItem(item.id, voucher.cashFlowAllocations ?? []),
      })),
      columns,
      visibleColumns: columns.map((column) => column.key),
      rowKey: (row: VoucherItemRow) => `item-${row.id}`,
      presentation: { density: "compact" },
    },
  };
}
