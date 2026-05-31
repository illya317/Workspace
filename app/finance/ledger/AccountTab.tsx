"use client";

import { useEffect, useState } from "react";
import Toast from "@/app/components/Toast";
import { useToast } from "@/app/hooks/useToast";
import ColumnToggle, { type ColumnDef } from "@/app/components/ColumnToggle";
import AccountCreateModal from "../components/AccountCreateModal";
import AccountTable from "../components/AccountTable";
import FinanceFilters from "../components/FinanceFilters";
import Pagination from "../components/Pagination";
import ReclassCandidateList from "../components/ReclassCandidateList";

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
  reclassTargetCode?: string | null;
}

const ACCOUNT_COLUMNS: ColumnDef[] = [
  { key: "code", label: "编码", required: true },
  { key: "name", label: "名称", required: true },
  { key: "companyCode", label: "公司" },
  { key: "category", label: "类别" },
  { key: "subjectLevel", label: "层级" },
  { key: "balanceDirection", label: "余额方向" },
  { key: "groupSubjectCode", label: "集团编码" },
  { key: "mnemonicCode", label: "助记码" },
  { key: "currency", label: "币种" },
  { key: "parent", label: "父级科目" },
  { key: "isActive", label: "状态" },
  { key: "reclassTargetCode", label: "重分类目标" },
];

const DEFAULT_VISIBLE = ACCOUNT_COLUMNS
  .filter((c) => c.required || c.key !== "reclassTargetCode")
  .map((c) => c.key);

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
  const [visibleColumns, setVisibleColumns] = useState<string[]>(DEFAULT_VISIBLE);
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

  async function handleUpdateReclassTargetCode(id: number, value: string) {
    const res = await fetch(`/api/finance/accounts/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reclassTargetCode: value }),
    });
    if (res.ok) {
      setAccounts((prev) =>
        prev.map((a) => (a.id === id ? { ...a, reclassTargetCode: value || null } : a))
      );
    } else {
      showToast("更新失败", "error");
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
              onUpdateReclassTargetCode={canWrite ? handleUpdateReclassTargetCode : undefined}
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
