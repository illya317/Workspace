"use client";

import { useEffect, useState } from "react";
import Toast from "@/app/components/Toast";
import { useToast } from "@/app/hooks/useToast";
import AccountCreateModal from "../components/AccountCreateModal";
import AccountTable from "../components/AccountTable";
import FinanceFilters from "../components/FinanceFilters";
import Pagination from "../components/Pagination";

interface Account {
  id: number;
  code: string;
  name: string;
  category: string;
  parentId: number | null;
  balanceDirection: string;
  isActive: boolean;
  sortOrder: number;
  companyCode: string | null;
  mnemonicCode: string | null;
  currency: string | null;
  groupSubjectCode: string | null;
  subjectLevel: number | null;
  year: number | null;
  parent: { code: string; name: string } | null;
}

export default function AccountTab() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyFilter, setCompanyFilter] = useState("");
  const [levelFilter, setLevelFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [scope, setScope] = useState<"all" | "mapped" | "unmapped" | "inactive">("all");
  const [keyword, setKeyword] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const { toast, showToast, closeToast } = useToast();

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (companyFilter) params.set("companyCode", companyFilter);
    if (levelFilter) params.set("subjectLevel", levelFilter);
    if (yearFilter) params.set("year", yearFilter);
    if (keyword) params.set("keyword", keyword);
    params.set("scope", scope);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));

    try {
      const res = await fetch(`/api/finance/accounts?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setAccounts(data.data || data.accounts || []);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 1);
      }
    } catch {
      showToast("网络错误", "error");
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyFilter, levelFilter, yearFilter, scope, keyword, page, pageSize]);

  async function handleCreate(data: Record<string, unknown>) {
    const res = await fetch("/api/finance/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      showToast("创建成功");
      setModalOpen(false);
      load();
    } else {
      const err = await res.json().catch(() => ({ error: "创建失败" }));
      showToast(err.error || "创建失败", "error");
    }
  }

  const _levels = [...new Set(accounts.map((a) => a.subjectLevel).filter(Boolean))].sort((a, b) => (a || 0) - (b || 0));
  void _levels;

  return (
    <div className="space-y-4">
      <FinanceFilters
        companyFilter={companyFilter}
        yearFilter={yearFilter}
        pageSize={pageSize}
        onCompanyChange={(v) => { setCompanyFilter(v); setPage(1); }}
        onYearChange={(v) => { setYearFilter(v); setPage(1); }}
        onPageSizeChange={(v) => { setPageSize(v); setPage(1); }}
        showMonth={false}
        extra={
          <>
            <button
              onClick={() => setModalOpen(true)}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              新增科目
            </button>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">层级</label>
              <select
                value={levelFilter}
                onChange={(e) => { setLevelFilter(e.target.value); setPage(1); }}
                className="rounded border border-gray-300 px-2 py-1 text-xs focus:border-emerald-400 focus:outline-none"
              >
                <option value="">全部层级</option>
                {[1, 2, 3, 4, 5].map((l) => (
                  <option key={l} value={l}>{l}级</option>
                ))}
              </select>
            </div>
            <input
              value={keyword}
              onChange={(e) => { setKeyword(e.target.value); setPage(1); }}
              placeholder="搜索编码/名称..."
              className="rounded border border-gray-300 px-2 py-1.5 text-xs w-44 focus:border-emerald-400 focus:outline-none"
            />
            <div className="flex items-center gap-1 rounded-md border border-gray-200 p-0.5">
              {[
                { key: "all", label: "全部科目" },
                { key: "mapped", label: "集团科目" },
                { key: "unmapped", label: "独有科目" },
                { key: "inactive", label: "未启用" },
              ].map((s) => (
                <button
                  key={s.key}
                  onClick={() => { setScope(s.key as "mapped" | "all" | "unmapped" | "inactive"); setPage(1); }}
                  className={`rounded px-2.5 py-1 text-xs transition-colors ${
                    scope === s.key
                      ? "bg-emerald-600 text-white"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <span className="ml-auto text-xs text-gray-400">
              共 {total} 条
            </span>
          </>
        }
      />

      {/* Table */}
      <div className="overflow-x-auto rounded-lg bg-white shadow-sm">
        <AccountTable accounts={accounts} loading={loading} />
      </div>

      <Pagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} />

      <AccountCreateModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={handleCreate}
      />
      <Toast message={toast?.message || ""} type={toast?.type} show={!!toast} onClose={closeToast} />
    </div>
  );
}
