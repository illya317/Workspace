"use client";

import { useEffect, useState } from "react";
import Toast from "@/app/components/Toast";
import { useToast } from "@/app/hooks/useToast";
import AccountCreateModal from "./components/AccountCreateModal";

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

const COMPANIES: Record<string, string> = {
  "01": "丰华生物",
  "02": "上海天力通",
  "03": "上海悦通",
  "04": "加拿大",
  "05": "丰华悦通",
};

const CATEGORIES: Record<string, string> = {
  asset: "资产",
  liability: "负债",
  equity: "权益",
  cost: "成本",
  revenue: "收入",
  expense: "费用",
  other: "其他",
};

export default function AccountTab() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyFilter, setCompanyFilter] = useState("");
  const [levelFilter, setLevelFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [scope, setScope] = useState<"mapped" | "all" | "unmapped">("mapped");
  const [modalOpen, setModalOpen] = useState(false);
  const { toast, showToast, closeToast } = useToast();

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (companyFilter) params.set("companyCode", companyFilter);
    if (levelFilter) params.set("subjectLevel", levelFilter);
    if (yearFilter) params.set("year", yearFilter);
    params.set("scope", scope);

    const res = await fetch(`/api/finance/accounts?${params.toString()}`);
    if (res.ok) {
      const data = await res.json();
      setAccounts(data.accounts || []);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyFilter, levelFilter, yearFilter, scope]);

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
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-gray-800">会计科目</h2>
        <button
          onClick={() => setModalOpen(true)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          新增科目
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg bg-white p-3 shadow-sm">
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">公司</label>
          <select
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-xs focus:border-emerald-400 focus:outline-none"
          >
            <option value="">全部公司</option>
            {Object.entries(COMPANIES).map(([code, name]) => (
              <option key={code} value={code}>{name}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">层级</label>
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-xs focus:border-emerald-400 focus:outline-none"
          >
            <option value="">全部层级</option>
            {[1, 2, 3, 4, 5].map((l) => (
              <option key={l} value={l}>{l}级</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">年度</label>
          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-xs focus:border-emerald-400 focus:outline-none"
          >
            <option value="">全部年度</option>
            {[2024, 2025, 2026].map((y) => (
              <option key={y} value={y}>{y}年</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1 rounded-md border border-gray-200 p-0.5">
          {[
            { key: "mapped", label: "集团科目" },
            { key: "all", label: "全部科目" },
            { key: "unmapped", label: "独有科目" },
          ].map((s) => (
            <button
              key={s.key}
              onClick={() => setScope(s.key as "mapped" | "all" | "unmapped")}
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
          共 {accounts.length} 条
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg bg-white shadow-sm">
        {loading ? (
          <p className="p-8 text-center text-gray-500">加载中...</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="border-b bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">编码</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">名称</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">公司</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">类别</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">层级</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">余额方向</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">集团编码</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">助记码</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">币种</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">父级科目</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">状态</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((acc) => (
                <tr key={acc.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-gray-700 whitespace-nowrap">{acc.code}</td>
                  <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{acc.name}</td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                    {acc.companyCode ? COMPANIES[acc.companyCode] || acc.companyCode : "-"}
                  </td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{CATEGORIES[acc.category] || acc.category}</td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{acc.subjectLevel ?? "-"}</td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                    {acc.balanceDirection === "debit" ? "借" : "贷"}
                  </td>
                  <td className="px-3 py-2 font-mono text-gray-500 whitespace-nowrap">{acc.groupSubjectCode || "-"}</td>
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{acc.mnemonicCode || "-"}</td>
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{acc.currency || "-"}</td>
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                    {acc.parent ? `${acc.parent.code} ${acc.parent.name}` : "-"}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className={`text-xs ${acc.isActive ? "text-emerald-600" : "text-gray-400"}`}>
                      {acc.isActive ? "启用" : "停用"}
                    </span>
                  </td>
                </tr>
              ))}
              {accounts.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-3 py-8 text-center text-gray-400">
                    暂无科目数据
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <AccountCreateModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={handleCreate}
      />
      <Toast message={toast?.message || ""} type={toast?.type} show={!!toast} onClose={closeToast} />
    </div>
  );
}
