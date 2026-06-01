"use client";

import { useEffect, useState, useMemo } from "react";
import Toast from "@/app/components/Toast";
import { useToast } from "@/app/hooks/useToast";
import DataTable, { getDefaultVisibleColumns } from "@/app/components/DataTable";
import FinanceFilters from "../components/FinanceFilters";
import Pagination from "../components/Pagination";
import { BASE_ITEM_COLUMNS } from "../components/VoucherItemTable";
import type { VoucherItemRow } from "../components/VoucherItemTable";
import { useReclassResults } from "./useReclassResults";
import ReclassReviewView from "../components/ReclassReviewView";
import { getVoucherColumns } from "./VoucherColumns";
import StatusToggle from "@/app/components/StatusToggle";
import type { Voucher, VoucherResponse } from "./types";

// ─── Component ───────────────────────────────────────────

export default function VoucherTab({ canWrite }: { canWrite: boolean }) {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyFilter, setCompanyFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [expandedVoucherId, setExpandedVoucherId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const { toast, showToast, closeToast } = useToast();
  const { reclassMap, allItems, handleReview, handleGenerate, adjustModal } =
    useReclassResults(companyFilter, yearFilter, monthFilter, showToast);
  const [viewMode, setViewMode] = useState<"vouchers" | "reclass">("vouchers");
  const [keyword, setKeyword] = useState("");
  const [reclassStatus, setReclassStatus] = useState("confirmed");
  const voucherColumns = useMemo(() => getVoucherColumns(expandedVoucherId), [expandedVoucherId]);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(
    () => getDefaultVisibleColumns(voucherColumns)
  );

  // 选好公司+年+月后台静默生成重分类结果
  useEffect(() => {
    if (companyFilter && yearFilter && monthFilter) handleGenerate(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyFilter, yearFilter, monthFilter]);

  const reclassCounts = useMemo(() => {
    const pending = allItems.filter((r) => r.status === "pending").length;
    return {
      total: allItems.length,
      pending,
      confirmed: allItems.length - pending,
    };
  }, [allItems]);

  const itemColumns = useMemo(() => [...BASE_ITEM_COLUMNS], []);

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
        const res = await fetch(`/api/finance/vouchers?${params.toString()}`, { signal: ctrl.signal });
        if (cancelled) return;
        if (res.ok) {
          const data: VoucherResponse = await res.json();
          if (!cancelled) {
            setVouchers(data.vouchers || []);
            setTotal(data.total || 0);
          }
        } else {
          const err = await res.json().catch(() => ({ error: "加载失败" }));
          if (!cancelled) showToast(err.error || "加载失败", "error");
        }
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        if (!cancelled) showToast("网络错误", "error");
      }
      if (!cancelled) setLoading(false);
    }

    load();

    return () => {
      cancelled = true;
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyFilter, yearFilter, monthFilter, keyword, page, pageSize]);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-4">
      <FinanceFilters
        companyFilter={companyFilter}
        yearFilter={yearFilter}
        monthFilter={monthFilter}
        keyword={keyword}
        pageSize={pageSize}
        onCompanyChange={(v) => { setCompanyFilter(v); setPage(1); }}
        onYearChange={(v) => { setYearFilter(v); setPage(1); }}
        onMonthChange={(v) => { setMonthFilter(v); setPage(1); }}
        onKeywordChange={(v) => { setKeyword(v); setPage(1); }}
        onPageSizeChange={(v) => { setPageSize(v); setPage(1); }}
        columns={viewMode === "reclass" ? undefined : voucherColumns}
        visibleColumns={viewMode === "reclass" ? undefined : visibleColumns}
        onColumnsChange={viewMode === "reclass" ? undefined : setVisibleColumns}
        extra={
          <>
            {canWrite && (
              <>
                <button
                  onClick={() => setViewMode(viewMode === "reclass" ? "vouchers" : "reclass")}
                  className={`rounded border px-2 py-1 text-xs transition-colors ${
                    viewMode === "reclass"
                      ? "bg-emerald-600 text-white border-emerald-600"
                      : "border-gray-300 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  重分类
                </button>
                {viewMode === "reclass" && (
                  <StatusToggle
                    tabs={[
                      { key: "pending", label: "待审核", count: reclassCounts.pending },
                      { key: "confirmed", label: "已通过", count: reclassCounts.confirmed },
                      { key: "all", label: "全部", count: reclassCounts.total },
                    ]}
                    active={reclassStatus}
                    onChange={setReclassStatus}
                  />
                )}
              </>
            )}
          </>
        }
      />

      {viewMode === "reclass" ? (
        companyFilter && yearFilter && monthFilter ? (
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
        )
      ) : (
        <div className="overflow-x-auto rounded-lg bg-white shadow-sm">
          <DataTable
            rows={vouchers}
            columns={voucherColumns}
            visibleColumns={visibleColumns}
            loading={loading}
            emptyText="暂无凭证"
            rowKey={(v) => v.id}
            onRowClick={(v) =>
              setExpandedVoucherId((prev) => (prev === v.id ? null : v.id))
            }
            expandedRowKey={expandedVoucherId}
            renderExpandedRow={(v) => (
              <div className="rounded border border-gray-200 bg-white">
                <DataTable
                  rows={v.items.map((it, i) => ({ ...it, _idx: i, _voucherNo: v.voucherNo }))}
                  columns={itemColumns}
                  visibleColumns={itemColumns.map((c) => c.key)}
                  rowKey={(r: VoucherItemRow) => `item-${r.id}`}
                />
              </div>
            )}
          />
        </div>
      )}
      {viewMode !== "reclass" && (
        <Pagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} />
      )}
      <Toast message={toast?.message || ""} type={toast?.type} show={!!toast} onClose={closeToast} />
      {adjustModal}
    </div>
  );
}
