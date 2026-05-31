"use client";

import { useEffect, useState } from "react";
import Toast from "@/app/components/Toast";
import { useToast } from "@/app/hooks/useToast";
import FinanceFilters from "../components/FinanceFilters";
import Pagination from "../components/Pagination";

// ─── Types ────────────────────────────────────────────────

interface Account {
  id: number;
  code: string;
  name: string;
  category: string;
  balanceDirection: string;
  reclassTargetCode: string | null;
  companyCode: string | null;
  year: number | null;
}

const CATEGORIES: Record<string, string> = {
  asset: "资产", liability: "负债", equity: "权益",
  cost: "成本", revenue: "收入", expense: "费用", other: "其他",
};

// ─── Component ────────────────────────────────────────────

export default function ReclassRulesTab({ canWrite }: { canWrite: boolean }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyFilter, setCompanyFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [scope, setScope] = useState<"withRules" | "all">("withRules");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [editId, setEditId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const { toast, showToast, closeToast } = useToast();

  async function load() {
    setLoading(true);
    // "已配置" 视图需要取全量后客户端过滤，否则服务端分页会把后面的规则漏掉
    const fetchSize = scope === "withRules" ? 2000 : pageSize;
    const params = new URLSearchParams();
    if (companyFilter) params.set("companyCode", companyFilter);
    if (yearFilter) params.set("year", yearFilter);
    params.set("page", "1");
    params.set("pageSize", String(fetchSize));

    try {
      const res = await fetch(`/api/finance/accounts?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        const all: Account[] = data.data || data.accounts || [];
        const filtered = scope === "withRules"
          ? all.filter((a) => a.reclassTargetCode)
          : all;
        // 客户端分页
        const start = (page - 1) * pageSize;
        setAccounts(filtered.slice(start, start + pageSize));
        setTotal(filtered.length);
        setTotalPages(Math.ceil(filtered.length / pageSize));
      }
    } catch {
      showToast("网络错误", "error");
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyFilter, yearFilter, scope, page, pageSize]);

  // ─── Save / Clear ──────────────────────────────────────

  async function saveRule(id: number, value: string) {
    const res = await fetch(`/api/finance/accounts/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reclassTargetCode: value || null }),
    });
    if (res.ok) {
      setAccounts((prev) =>
        prev.map((a) =>
          a.id === id
            ? { ...a, reclassTargetCode: value || null }
            : a,
        ),
      );
      if (!value) showToast("已清除规则");
    } else {
      showToast("保存失败", "error");
    }
  }

  function startEdit(account: Account) {
    if (!canWrite) return;
    setEditId(account.id);
    setEditValue(account.reclassTargetCode || "");
  }

  async function commitEdit(id: number, original: string | null) {
    const val = editValue.trim();
    setEditId(null);
    if (val !== (original || "")) {
      await saveRule(id, val);
    }
  }

  // ─── Render ─────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <FinanceFilters
        companyFilter={companyFilter}
        yearFilter={yearFilter}
        pageSize={pageSize}
        total={total}
        onCompanyChange={(v) => { setCompanyFilter(v); setPage(1); }}
        onYearChange={(v) => { setYearFilter(v); setPage(1); }}
        onPageSizeChange={(v) => { setPageSize(v); setPage(1); }}
        showMonth={false}
        extra={
          <div className="flex items-center gap-1 rounded-md border border-gray-200 p-0.5">
            {(["withRules", "all"] as const).map((s) => (
              <button key={s} onClick={() => { setScope(s); setPage(1); }}
                className={`rounded px-2 py-0.5 text-[11px] transition-colors ${
                  scope === s ? "bg-emerald-600 text-white" : "text-gray-600 hover:bg-gray-100"
                }`}>{s === "withRules" ? "已配置" : "全部科目"}</button>
            ))}
          </div>
        }
      />

      <div className="overflow-x-auto rounded-lg bg-white shadow-sm">
        {loading ? (
          <p className="p-8 text-center text-gray-500">加载中...</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="border-b bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">科目编码</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">科目名称</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">类别</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">余额方向</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">重分类目标</th>
                {canWrite && <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">操作</th>}
              </tr>
            </thead>
            <tbody>
              {accounts.map((acc) => (
                <tr key={acc.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-gray-700 whitespace-nowrap">{acc.code}</td>
                  <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{acc.name}</td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{CATEGORIES[acc.category] || acc.category}</td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{acc.balanceDirection === "debit" ? "借" : "贷"}</td>
                  <td className="px-3 py-2 font-mono whitespace-nowrap">
                    {editId === acc.id ? (
                      <input
                        autoFocus
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="w-24 rounded border border-emerald-400 px-1.5 py-0.5 text-xs text-gray-700 outline-none"
                        onKeyDown={(e) => {
                          if (e.key === "Escape") { setEditValue(acc.reclassTargetCode || ""); setEditId(null); }
                          if (e.key === "Enter") commitEdit(acc.id, acc.reclassTargetCode);
                        }}
                        onBlur={() => commitEdit(acc.id, acc.reclassTargetCode)}
                      />
                    ) : (
                      <span
                        className={`rounded px-1 py-0.5 ${
                          canWrite ? "cursor-pointer hover:bg-emerald-50" : ""
                        } ${acc.reclassTargetCode ? "text-emerald-700" : "text-gray-400"}`}
                        title={canWrite ? "点击编辑重分类目标" : undefined}
                        onClick={() => startEdit(acc)}
                      >{acc.reclassTargetCode || "—"}
                      </span>
                    )}
                  </td>
                  {canWrite && (
                    <td className="px-3 py-2 whitespace-nowrap">
                      {acc.reclassTargetCode && (
                        <button
                          onClick={async () => { if (confirm("确定清除该规则？")) await saveRule(acc.id, ""); }}
                          className="rounded px-1.5 py-0.5 text-[11px] text-red-500 hover:bg-red-50"
                        >
                          清除
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {accounts.length === 0 && (
                <tr>
                  <td colSpan={canWrite ? 6 : 5} className="px-3 py-8 text-center text-gray-400">
                    {scope === "withRules" ? "暂无已配置的重分类规则" : "暂无科目数据"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <Pagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} />

      <Toast message={toast?.message || ""} type={toast?.type} show={!!toast} onClose={closeToast} />
    </div>
  );
}
