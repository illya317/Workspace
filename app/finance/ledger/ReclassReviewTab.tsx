"use client";

import { useEffect, useState } from "react";
import Toast from "@/app/components/Toast";
import { useToast } from "@/app/hooks/useToast";
import FinanceFilters from "../components/FinanceFilters";
import Pagination from "../components/Pagination";
import ReclassResultTable from "../components/ReclassResultTable";
import ReclassReviewModal from "../components/ReclassReviewModal";
import type { ReclassResultRow } from "@/server/services/finance/ledger/reclass-results/types";

const STATUS_OPTIONS = [
  { key: "pending", label: "待审核" },
  { key: "approved", label: "已通过" },
  { key: "adjusted", label: "已调整" },
  { key: "rejected", label: "已驳回" },
  { key: "all", label: "全部" },
];

export default function ReclassReviewTab({ canWrite }: { canWrite: boolean }) {
  const [items, setItems] = useState<ReclassResultRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [companyFilter, setCompanyFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("pending");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [adjustItem, setAdjustItem] = useState<ReclassResultRow | null>(null);
  const { toast, showToast, closeToast } = useToast();

  async function load() {
    if (!companyFilter || !yearFilter || !monthFilter) {
      setItems([]); setTotal(0); return;
    }
    setLoading(true);

    try {
      // 1. Resolve periodId
      const pRes = await fetch(
        `/api/finance/reclass-results/lookup-period?companyCode=${companyFilter}&year=${yearFilter}&month=${monthFilter}`,
      );
      const { periodId } = await pRes.json();
      if (!periodId) { setItems([]); setTotal(0); setLoading(false); return; }

      // 2. Fetch results
      const params = new URLSearchParams();
      params.set("periodId", String(periodId));
      params.set("status", statusFilter);
      if (keyword) params.set("keyword", keyword);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));

      const res = await fetch(`/api/finance/reclass-results?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
        setTotal(data.total || 0);
        setTotalPages(Math.ceil((data.total || 0) / pageSize));
      }
    } catch {
      showToast("网络错误", "error");
    }
    setLoading(false);
  }

  useEffect(() => { load(); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [companyFilter, yearFilter, monthFilter, statusFilter, keyword, page, pageSize]);

  // ─── Actions ──────────────────────────────────────────

  function removeFromList(id: number) {
    if (statusFilter === "pending") {
      setItems((prev) => prev.filter((r) => r.id !== id));
      setTotal((t) => t - 1);
    } else {
      load(); // reload to reflect status change
    }
  }

  async function doPatch(id: number, body: Record<string, unknown>) {
    const res = await fetch(`/api/finance/reclass-results/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "操作失败" }));
      showToast(err.error || "操作失败", "error");
      return false;
    }
    return true;
  }

  async function handleApprove(id: number) {
    if (await doPatch(id, { action: "approve" })) {
      removeFromList(id); showToast("已通过");
    }
  }

  async function handleReject(id: number) {
    if (!confirm("确定驳回该条目？")) return;
    if (await doPatch(id, { action: "reject" })) {
      removeFromList(id); showToast("已驳回");
    }
  }

  async function handleAdjust(id: number, targetAccount: string, amount: number, note: string) {
    if (await doPatch(id, { action: "adjust", targetAccount, amount, note: note || undefined })) {
      removeFromList(id); showToast("已调整");
    }
  }

  // ─── Render ───────────────────────────────────────────

  return (
    <div className="space-y-4">
      <FinanceFilters
        companyFilter={companyFilter} yearFilter={yearFilter} monthFilter={monthFilter}
        keyword={keyword} pageSize={pageSize} total={total}
        onCompanyChange={(v) => { setCompanyFilter(v); setPage(1); }}
        onYearChange={(v) => { setYearFilter(v); setPage(1); }}
        onMonthChange={(v) => { setMonthFilter(v); setPage(1); }}
        onKeywordChange={(v) => { setKeyword(v); setPage(1); }}
        onPageSizeChange={(v) => { setPageSize(v); setPage(1); }}
        showMonth showSearch
        extra={
          <div className="flex items-center gap-1 rounded-md border border-gray-200 p-0.5">
            {STATUS_OPTIONS.map((s) => (
              <button key={s.key} onClick={() => { setStatusFilter(s.key); setPage(1); }}
                className={`rounded px-2 py-0.5 text-[11px] transition-colors ${
                  statusFilter === s.key ? "bg-emerald-600 text-white" : "text-gray-600 hover:bg-gray-100"
                }`}>{s.label}</button>
            ))}
          </div>
        }
      />

      <div className="overflow-x-auto rounded-lg bg-white shadow-sm">
        <ReclassResultTable
          items={items} loading={loading} canWrite={canWrite}
          onApprove={handleApprove} onReject={handleReject}
          onAdjust={(item) => setAdjustItem(item)}
        />
      </div>

      <Pagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} />

      <ReclassReviewModal
        item={adjustItem} open={!!adjustItem}
        onClose={() => setAdjustItem(null)} onSubmit={handleAdjust}
      />

      <Toast message={toast?.message || ""} type={toast?.type} show={!!toast} onClose={closeToast} />
    </div>
  );
}
