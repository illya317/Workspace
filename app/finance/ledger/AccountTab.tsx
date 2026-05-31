"use client";

import { useEffect, useState } from "react";
import Toast from "@/app/components/Toast";
import { useToast } from "@/app/hooks/useToast";
import ColumnToggle from "@/app/components/ColumnToggle";
import { getDefaultVisibleColumns } from "@/app/components/DataTable";
import AccountCreateModal from "../components/AccountCreateModal";
import AccountTable, { type Account, ACCOUNT_COLUMNS } from "../components/AccountTable";
import FinanceFilters from "../components/FinanceFilters";
import Pagination from "../components/Pagination";
import ReclassCandidateList from "../components/ReclassCandidateList";

// Account type and column definitions from shared AccountTable

export default function AccountTab({ canWrite }: { canWrite: boolean }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyFilter, setCompanyFilter] = useState("");
  const [levelFilter, setLevelFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [scope, setScope] = useState<"all" | "mapped" | "unmapped" | "inactive" | "reclass">("all");
  const [keyword, setKeyword] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(
    () => getDefaultVisibleColumns(ACCOUNT_COLUMNS)
  );
  const { toast, showToast, closeToast } = useToast();

  async function load() {
    if (scope === "reclass") { setLoading(false); return; } // reclass data loaded by ReclassCandidateList
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
        levelFilter={levelFilter}
        keyword={keyword}
        pageSize={pageSize}
        total={total}
        onCompanyChange={(v) => { setCompanyFilter(v); setPage(1); }}
        onYearChange={(v) => { setYearFilter(v); setPage(1); }}
        onLevelChange={(v) => { setLevelFilter(v); setPage(1); }}
        onKeywordChange={(v) => { setKeyword(v); setPage(1); }}
        onPageSizeChange={(v) => { setPageSize(v); setPage(1); }}
        showMonth={false} showLevel
        extra={
          <>
            {canWrite && (
              <button onClick={() => setModalOpen(true)}
                className="rounded-md border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50">新增科目</button>
            )}
            <div className="flex items-center gap-1 rounded-md border border-gray-200 p-0.5">
              {[
                { key: "all", label: "全部" },
                { key: "mapped", label: "集团" },
                { key: "unmapped", label: "独有" },
                { key: "inactive", label: "未启用" },
                { key: "reclass", label: "重分类规则" },
              ].map((s) => (
                <button key={s.key}
                  onClick={() => { setScope(s.key as typeof scope); setPage(1); }}
                  className={`rounded px-2 py-0.5 text-[11px] transition-colors ${
                    scope === s.key ? "bg-emerald-600 text-white" : "text-gray-600 hover:bg-gray-100"
                  }`}>{s.label}</button>
              ))}
            </div>
          </>
        }
      />

      {/* Table / Reclass View */}
      {scope === "reclass" ? (
        companyFilter && yearFilter ? (
          <ReclassCandidateList
            companyCode={companyFilter}
            year={yearFilter}
            canWrite={canWrite}
          />
        ) : (
          <p className="py-8 text-center text-sm text-gray-400">请选择公司和年份以查看重分类规则候选</p>
        )
      ) : (
        <>
          <div className="flex items-center justify-end">
            <ColumnToggle columns={ACCOUNT_COLUMNS} visible={visibleColumns} onChange={setVisibleColumns} />
          </div>
          <div className="overflow-x-auto rounded-lg bg-white shadow-sm">
            <AccountTable
              accounts={accounts}
              loading={loading}
              visibleColumns={visibleColumns}
            />
          </div>
          <Pagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} />
        </>
      )}

      <AccountCreateModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={handleCreate}
      />
      <Toast message={toast?.message || ""} type={toast?.type} show={!!toast} onClose={closeToast} />
    </div>
  );
}
