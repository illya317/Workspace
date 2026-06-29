"use client";

import { workspacePath } from "@workspace/core/routing";
import { useEffect, useState, useMemo } from "react";
import { createPageBody, PageSurface, createBlockSurfaceBlock, createPageTableBlock, useFeedback } from "@workspace/core/ui";
import type { PageSurfaceBlockSpec, PageSurfaceNavigationSpec, SurfaceToolbarItems } from "@workspace/core/ui";
import { useFinanceFilterToolbarItems } from "../components/FinanceFilters";
import { getBaseItemColumns, type VoucherItemRow } from "../components/VoucherItemTable";
import { useReclassResults } from "./useReclassResults";
import ReclassReviewView from "../components/ReclassReviewView";
import { getVoucherColumns } from "./VoucherColumns";
import type { Voucher, VoucherResponse } from "@workspace/finance/types";

// ─── Component ───────────────────────────────────────────

export default function VoucherTab({
  canWrite,
  navigation,
  lifecycleBlocks = [],
}: {
  canWrite: boolean;
  navigation?: PageSurfaceNavigationSpec;
  lifecycleBlocks?: PageSurfaceBlockSpec[];
}) {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyFilter, setCompanyFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [expandedVoucherId, setExpandedVoucherId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const { error, notify } = useFeedback();
  const { allItems, handleReview, handleGenerate, adjustModal } =
    useReclassResults(companyFilter, yearFilter, monthFilter, notify);
  const [viewMode, setViewMode] = useState<"vouchers" | "reclass">("vouchers");
  const [keyword, setKeyword] = useState("");
  const [reclassStatus, setReclassStatus] = useState("adjusted");
  const voucherColumns = useMemo(() => getVoucherColumns(expandedVoucherId), [expandedVoucherId]);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(
    () => voucherColumns.filter((c) => c.required || c.defaultVisible).map((c) => c.key)
  );

  // 选好公司+年+月后台静默生成重分类结果
  useEffect(() => {
    if (companyFilter && yearFilter && monthFilter) handleGenerate(true);
  }, [companyFilter, handleGenerate, monthFilter, yearFilter]);

  const reclassCounts = useMemo(() => {
    const unconfigured = allItems.filter((r) => r.kind === "normal").length;
    const configured = allItems.filter((r) => r.kind === "approved").length;
    const adjusted = allItems.filter((r) => r.kind === "adjusted").length;
    return { total: allItems.length, unconfigured, configured, adjusted };
  }, [allItems]);

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
  const extraToolbarItems: SurfaceToolbarItems = [
    ...(canWrite ? [{
      kind: "action-group" as const,
      key: "reclass-actions",
      section: "action" as const,
      actions: [{
        key: "toggle-reclass",
        kind: "reclass" as const,
        label: "重分类",
        variant: viewMode === "reclass" ? "primary" as const : "secondary" as const,
        onClick: () => setViewMode(viewMode === "reclass" ? "vouchers" : "reclass"),
      }],
    }] : []),
    ...(canWrite && viewMode === "reclass" ? [{
      kind: "select" as const,
      key: "reclass-status",
      section: "filter" as const,
      label: "状态",
      value: reclassStatus,
      onChange: setReclassStatus,
      options: [
        { value: "adjusted", label: `已调整 ${reclassCounts.adjusted}` },
        { value: "configured", label: `已配置 ${reclassCounts.configured}` },
        { value: "unconfigured", label: `未配置 ${reclassCounts.unconfigured}` },
        { value: "all", label: `全部 ${reclassCounts.total}` },
      ],
    }] : []),
  ];
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
    columns: viewMode === "reclass" ? undefined : voucherColumns,
    visibleColumns: viewMode === "reclass" ? undefined : visibleColumns,
    onColumnsChange: viewMode === "reclass" ? undefined : setVisibleColumns,
    extraItems: extraToolbarItems,
  });

  return (
    <PageSurface
      kind="list"
      navigation={navigation}
      toolbar={{ items: toolbarItems }}
      body={{
        blocks: viewMode === "reclass"
          ? [
              ...lifecycleBlocks,
              createBlockSurfaceBlock("voucher-reclass-content", {
                kind: "content",
                content: (
                  <>
                    {companyFilter && yearFilter && monthFilter ? (
                      <ReclassReviewView
                        items={allItems}
                        canWrite={canWrite}
                        statusFilter={reclassStatus}
                        onReview={handleReview}
                        companyCode={companyFilter}
                        year={yearFilter}
                      />
                    ) : (
                      <p className="py-8 text-center text-sm text-gray-400">请选择公司、年度和月份以配置重分类规则</p>
                    )}
                    {adjustModal}
                  </>
                ),
              }),
            ]
          : [
              ...lifecycleBlocks,
              {
                kind: "data",
                key: "vouchers",
                surface: {
                  kind: "table",
                  framed: true,

                  rows: vouchers,
                  columns: voucherColumns,
                  visibleColumns,
                  loading,
                  emptyText: "暂无凭证",
                  rowKey: (v: Voucher) => v.id,
                  onRowClick: (v: Voucher) =>
                    setExpandedVoucherId((prev) => (prev === v.id ? null : v.id)),
                  expandedRowKey: expandedVoucherId,
                  expandedRowContent: (v: Voucher) => <VoucherItemsPreview voucher={v} columns={itemColumns} />,
                },
              },
              createBlockSurfaceBlock("voucher-adjust-modal", {
                kind: "content",
                content: adjustModal,
              }),
            ],
      }}
      footer={viewMode === "reclass" ? undefined : { pagination: { page, totalPages, total, onPageChange: setPage } }}
    />
  );
}

function VoucherItemsPreview({
  voucher,
  columns,
}: {
  voucher: Voucher;
  columns: ReturnType<typeof getBaseItemColumns>;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-white">
      <PageSurface
        kind="list"
        embedded
        body={createPageBody([
          createPageTableBlock("voucher-items", {
            rows: voucher.items.map((item: VoucherItemRow, index: number) => ({ ...item, _idx: index, _voucherNo: voucher.voucherNo })),
            columns,
            visibleColumns: columns.map((column) => column.key),
            rowKey: (row: VoucherItemRow) => `item-${row.id}`,
          }),
        ])}
      />
    </div>
  );
}
