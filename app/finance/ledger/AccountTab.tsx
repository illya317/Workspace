"use client";

import { useEffect, useState } from "react";
import Toast from "@/app/components/Toast";
import { useToast } from "@/app/hooks/useToast";
import { getDefaultVisibleColumns } from "@/app/components/DataTable";
import FilterField from "@/app/components/FilterField";
import AccountTable, { type Account, ACCOUNT_COLUMNS } from "../components/AccountTable";
import ReclassCandidateList from "../components/ReclassCandidateList";
import FinanceFilters from "../components/FinanceFilters";
import Pagination from "../components/Pagination";

// Account type and column definitions from shared AccountTable

export default function AccountTab({ canWrite }: { canWrite: boolean }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyFilter, setCompanyFilter] = useState("");
  const [levelFilter, setLevelFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [scope, setScope] = useState("");
  const [reclassMode, setReclassMode] = useState(false);
  const [extraField, setExtraField] = useState<"level" | "scope">("scope");
  const [extraValue, setExtraValue] = useState("");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(
    () => getDefaultVisibleColumns(ACCOUNT_COLUMNS)
  );
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
        onCompanyChange={(v) => { setCompanyFilter(v); setPage(1); }}
        onYearChange={(v) => { setYearFilter(v); setPage(1); }}
        onLevelChange={(v) => { setLevelFilter(v); setPage(1); }}
        onKeywordChange={(v) => { setKeyword(v); setPage(1); }}
        onPageSizeChange={(v) => { setPageSize(v); setPage(1); }}
        columns={ACCOUNT_COLUMNS}
        visibleColumns={visibleColumns}
        onColumnsChange={setVisibleColumns}
        showMonth={false} showLevel={false}
        extra={
          <>
            <FilterField
              fields={[
                { key: "level", label: "层级" },
                { key: "scope", label: "类型" },
              ]}
              valueOptions={{
                level: [{ value: "", label: "全部" }, { value: "1", label: "1级" }, { value: "2", label: "2级" }, { value: "3", label: "3级" }, { value: "4", label: "4级" }, { value: "5", label: "5级" }],
                scope: [{ value: "", label: "全部" }, { value: "mapped", label: "集团" }, { value: "unmapped", label: "独有" }, { value: "inactive", label: "未启用" }],
              }}
              fieldKey={extraField}
              onFieldKeyChange={(k) => {
                setLevelFilter(""); setScope("");
                setExtraField(k as typeof extraField); setExtraValue(""); setPage(1);
              }}
              value={extraValue}
              onValueChange={(v) => {
                if (extraField === "level") setLevelFilter(v);
                else setScope(v);
                setExtraValue(v); setPage(1);
              }}
            />
            {canWrite && (
              <button
                onClick={() => setReclassMode(!reclassMode)}
                className={`rounded border px-2 py-1 text-xs transition-colors ${
                  reclassMode
                    ? "bg-emerald-600 text-white border-emerald-600"
                    : "border-gray-300 text-gray-600 hover:bg-gray-50"
                }`}
              >
                重分类配置
              </button>
            )}
          </>
        }
      />

      {reclassMode ? (
        companyFilter && yearFilter ? (
          <ReclassCandidateList companyCode={companyFilter} year={yearFilter} keyword={keyword} scope={scope} canWrite={canWrite} />
        ) : (
          <p className="py-8 text-center text-sm text-gray-400">请选择公司和年份以配置重分类规则</p>
        )
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg bg-white shadow-sm">
            <AccountTable accounts={accounts} loading={loading} visibleColumns={visibleColumns} />
          </div>
          <Pagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} />
        </>
      )}

      <Toast message={toast?.message || ""} type={toast?.type} show={!!toast} onClose={closeToast} />
    </div>
  );
}
