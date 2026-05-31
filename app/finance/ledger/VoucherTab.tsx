"use client";

import { useEffect, useState, useMemo } from "react";
import Toast from "@/app/components/Toast";
import { useToast } from "@/app/hooks/useToast";
import DataTable from "@/app/components/DataTable";
import FinanceFilters from "../components/FinanceFilters";
import Pagination from "../components/Pagination";
import { BASE_ITEM_COLUMNS } from "../components/VoucherItemTable";
import type { VoucherItemRow } from "../components/VoucherItemTable";
import { useReclassResults } from "./useReclassResults";
import { buildReclassItemColumns } from "./reclassItemColumns";
import ReclassReviewView from "../components/ReclassReviewView";
import { getVoucherColumns } from "./VoucherColumns";
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
  const { reclassMap, handleReview, generating, handleGenerate, setAdjustItem, adjustModal } =
    useReclassResults(companyFilter, yearFilter, monthFilter, showToast);
  const [viewMode, setViewMode] = useState<"vouchers" | "reclass">("vouchers");
  const [reclassStatusFilter, setReclassStatusFilter] = useState("pending");

  const itemColumns = useMemo(() => {
    const cols = [...BASE_ITEM_COLUMNS];
    if (viewMode === "reclass")
      cols.push(...buildReclassItemColumns(reclassMap, canWrite, handleReview, setAdjustItem));
    return cols;
  }, [reclassMap, canWrite, handleReview, viewMode, setAdjustItem]);

  const voucherColumns = useMemo(
    () => getVoucherColumns(expandedVoucherId),
    [expandedVoucherId],
  );

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (companyFilter) params.set("companyCode", companyFilter);
    if (yearFilter) params.set("year", yearFilter);
    if (monthFilter) params.set("month", monthFilter);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));

    try {
      const res = await fetch(`/api/finance/vouchers?${params.toString()}`);
      if (res.ok) {
        const data: VoucherResponse = await res.json();
        setVouchers(data.vouchers || []);
        setTotal(data.total || 0);
      } else {
        const err = await res.json().catch(() => ({ error: "加载失败" }));
        showToast(err.error || "加载失败", "error");
      }
    } catch {
      showToast("网络错误", "error");
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyFilter, yearFilter, monthFilter, page, pageSize]);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-4">
      <FinanceFilters
        companyFilter={companyFilter}
        yearFilter={yearFilter}
        monthFilter={monthFilter}
        pageSize={pageSize}
        onCompanyChange={(v) => { setCompanyFilter(v); setPage(1); }}
        onYearChange={(v) => { setYearFilter(v); setPage(1); }}
        onMonthChange={(v) => { setMonthFilter(v); setPage(1); }}
        onPageSizeChange={(v) => { setPageSize(v); setPage(1); }}
        extra={
          <div className="ml-auto flex items-center gap-2">
            {companyFilter && yearFilter && monthFilter && (
              <div className="flex items-center gap-1 rounded-md border border-gray-200 p-0.5">
                {(["vouchers", "reclass"] as const).map((k) => (
                  <button
                    key={k}
                    onClick={() => setViewMode(k)}
                    className={`rounded px-2 py-0.5 text-[11px] ${
                      viewMode === k
                        ? "bg-emerald-600 text-white"
                        : "text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    {k === "vouchers" ? "凭证" : "重分类审核"}
                  </button>
                ))}
              </div>
            )}
            {canWrite && companyFilter && yearFilter && monthFilter && (
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="rounded bg-emerald-600 px-3 py-1 text-xs text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {generating ? "生成中..." : "生成重分类结果"}
              </button>
            )}
          </div>
        }
      />

      {viewMode === "reclass" ? (
        <ReclassReviewView
          items={Array.from(reclassMap.values())}
          canWrite={canWrite}
          statusFilter={reclassStatusFilter}
          onStatusFilter={setReclassStatusFilter}
          onReview={handleReview}
        />
      ) : (
        <div className="overflow-x-auto rounded-lg bg-white shadow-sm">
          <DataTable
            rows={vouchers}
            columns={voucherColumns}
            visibleColumns={voucherColumns.map((c) => c.key)}
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
                  rows={v.items.map((it, i) => ({ ...it, _idx: i }))}
                  columns={itemColumns}
                  visibleColumns={itemColumns.map((c) => c.key)}
                  rowKey={(r: VoucherItemRow) => r.id}
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
