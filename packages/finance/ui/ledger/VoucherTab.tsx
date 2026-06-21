"use client";

import { workspacePath } from "@workspace/core/routing";
import { useEffect, useState, useMemo } from "react";
import Toast from "@workspace/core/ui/Toast";
import { useToast } from "@workspace/core/hooks";
import { ActionButton, DataTable, getDefaultVisibleColumns, PanelCard } from "@workspace/core/ui";
import FinanceFilters from "../components/FinanceFilters";
import { Pagination } from "@workspace/core/ui";
import { BASE_ITEM_COLUMNS, type VoucherItemRow } from "../components/VoucherItemTable";
import { useReclassResults } from "./useReclassResults";
import ReclassReviewView from "../components/ReclassReviewView";
import { getVoucherColumns } from "./VoucherColumns";
import StatusToggle from "@workspace/core/ui/StatusToggle";
import type { Voucher, VoucherResponse } from "@workspace/finance/types";

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
  const { allItems, handleReview, handleGenerate, adjustModal } =
    useReclassResults(companyFilter, yearFilter, monthFilter, showToast);
  const [viewMode, setViewMode] = useState<"vouchers" | "reclass">("vouchers");
  const [keyword, setKeyword] = useState("");
  const [reclassStatus, setReclassStatus] = useState("adjusted");
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
    const unconfigured = allItems.filter((r) => r.kind === "normal").length;
    const configured = allItems.filter((r) => r.kind === "approved").length;
    const adjusted = allItems.filter((r) => r.kind === "adjusted").length;
    return { total: allItems.length, unconfigured, configured, adjusted };
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
        const res = await fetch(workspacePath(`/api/modules/finance/vouchers?${params.toString()}`), { signal: ctrl.signal });
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
      } catch (e: unknown) {
        const err = e as Error;
        if (err.name === "AbortError") return;
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
                <ActionButton
                  onClick={() => setViewMode(viewMode === "reclass" ? "vouchers" : "reclass")}
                  variant={viewMode === "reclass" ? "primary" : "secondary"}
                >
                  重分类
                </ActionButton>
                {viewMode === "reclass" && (
                  <StatusToggle
                    tabs={[
                      { key: "adjusted", label: "已调整", count: reclassCounts.adjusted },
                      { key: "configured", label: "已配置", count: reclassCounts.configured },
                      { key: "unconfigured", label: "未配置", count: reclassCounts.unconfigured },
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
        <PanelCard bodyClassName="overflow-x-auto">
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
              <div className="rounded-md border border-slate-200 bg-white">
                <DataTable
                  rows={v.items.map((it, i) => ({ ...it, _idx: i, _voucherNo: v.voucherNo }))}
                  columns={itemColumns}
                  visibleColumns={itemColumns.map((c) => c.key)}
                  rowKey={(r: VoucherItemRow) => `item-${r.id}`}
                />
              </div>
            )}
          />
        </PanelCard>
      )}
      {viewMode !== "reclass" && (
        <Pagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} />
      )}
      <Toast message={toast?.message || ""} type={toast?.type} show={!!toast} onClose={closeToast} />
      {adjustModal}
    </div>
  );
}
