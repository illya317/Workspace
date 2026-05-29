"use client";

import { useEffect, useState, Fragment } from "react";
import Toast from "@/app/components/Toast";
import { useToast } from "@/app/hooks/useToast";

const COMPANIES: Record<string, string> = {
  "01": "丰华生物",
  "02": "上海天力通",
  "03": "上海悦通",
  "04": "加拿大",
  "05": "丰华悦通",
};

interface Account {
  id: number;
  code: string;
  name: string;
}

interface VoucherItem {
  id: number;
  accountId: number;
  account: Account;
  debit: number;
  credit: number;
  description: string;
  sortOrder: number;
}

interface Period {
  id: number;
  year: number;
  month: number;
}

interface Voucher {
  id: number;
  voucherNo: string;
  date: string;
  periodId: number;
  period: Period;
  description: string;
  totalDebit: number;
  totalCredit: number;
  status: string;
  companyCode: string | null;
  items: VoucherItem[];
}

interface VoucherResponse {
  vouchers: Voucher[];
  total: number;
  page: number;
  pageSize: number;
}

export default function VoucherTab() {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyFilter, setCompanyFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [expandedVoucherId, setExpandedVoucherId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const { toast, showToast, closeToast } = useToast();

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (companyFilter) params.set("companyCode", companyFilter);
    if (yearFilter) params.set("year", yearFilter);
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
  }, [companyFilter, yearFilter, page, pageSize]);

  const totalPages = Math.ceil(total / pageSize);

  function toggleExpand(id: number) {
    setExpandedVoucherId((prev) => (prev === id ? null : id));
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-gray-800">记账凭证</h2>
        <span className="text-xs text-gray-400">共 {total} 条</span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg bg-white p-3 shadow-sm">
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">公司</label>
          <select
            value={companyFilter}
            onChange={(e) => {
              setCompanyFilter(e.target.value);
              setPage(1);
            }}
            className="rounded border border-gray-300 px-2 py-1 text-xs focus:border-emerald-400 focus:outline-none"
          >
            <option value="">全部公司</option>
            {Object.entries(COMPANIES).map(([code, name]) => (
              <option key={code} value={code}>{name}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">年度</label>
          <select
            value={yearFilter}
            onChange={(e) => {
              setYearFilter(e.target.value);
              setPage(1);
            }}
            className="rounded border border-gray-300 px-2 py-1 text-xs focus:border-emerald-400 focus:outline-none"
          >
            <option value="">全部年度</option>
            {[2024, 2025, 2026].map((y) => (
              <option key={y} value={y}>{y}年</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">每页</label>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
            className="rounded border border-gray-300 px-2 py-1 text-xs focus:border-emerald-400 focus:outline-none"
          >
            {[20, 50, 100].map((s) => (
              <option key={s} value={s}>{s}条</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg bg-white shadow-sm">
        {loading ? (
          <p className="p-8 text-center text-gray-500">加载中...</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="border-b bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">凭证号</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">日期</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">公司</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">期间</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">摘要</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600 whitespace-nowrap">借方</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600 whitespace-nowrap">贷方</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">状态</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">分录</th>
              </tr>
            </thead>
            <tbody>
              {vouchers.map((v) => (
                <Fragment key={v.id}>
                  <tr
                    className="border-b last:border-0 hover:bg-gray-50 cursor-pointer"
                    onClick={() => toggleExpand(v.id)}
                  >
                    <td className="px-3 py-2 font-mono text-gray-700 whitespace-nowrap">{v.voucherNo}</td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{v.date}</td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                      {v.companyCode ? COMPANIES[v.companyCode] || v.companyCode : "-"}
                    </td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                      {v.period ? `${v.period.year}年${v.period.month}月` : "-"}
                    </td>
                    <td className="px-3 py-2 text-gray-700 max-w-xs truncate" title={v.description}>
                      {v.description}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-700 whitespace-nowrap">{v.totalDebit.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right text-gray-700 whitespace-nowrap">{v.totalCredit.toFixed(2)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${v.status === "posted" ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>
                        {v.status === "posted" ? "已过账" : "草稿"}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="text-emerald-600 text-xs">
                        {expandedVoucherId === v.id ? "收起" : `展开 (${v.items.length}条)`}
                      </span>
                    </td>
                  </tr>
                  {expandedVoucherId === v.id && (
                    <tr className="bg-gray-50">
                      <td colSpan={9} className="px-3 py-2">
                        <div className="rounded border border-gray-200 bg-white">
                          <table className="w-full text-xs">
                            <thead className="border-b bg-gray-100">
                              <tr>
                                <th className="px-3 py-1.5 text-left font-medium text-gray-500">序号</th>
                                <th className="px-3 py-1.5 text-left font-medium text-gray-500">科目编码</th>
                                <th className="px-3 py-1.5 text-left font-medium text-gray-500">科目名称</th>
                                <th className="px-3 py-1.5 text-left font-medium text-gray-500">摘要</th>
                                <th className="px-3 py-1.5 text-right font-medium text-gray-500">借方</th>
                                <th className="px-3 py-1.5 text-right font-medium text-gray-500">贷方</th>
                              </tr>
                            </thead>
                            <tbody>
                              {v.items.map((item, idx) => (
                                <tr key={item.id} className="border-b last:border-0">
                                  <td className="px-3 py-1.5 text-gray-500">{idx + 1}</td>
                                  <td className="px-3 py-1.5 font-mono text-gray-600">{item.account?.code || "-"}</td>
                                  <td className="px-3 py-1.5 text-gray-700">{item.account?.name || "-"}</td>
                                  <td className="px-3 py-1.5 text-gray-600">{item.description || "-"}</td>
                                  <td className="px-3 py-1.5 text-right text-gray-700">{item.debit > 0 ? item.debit.toFixed(2) : ""}</td>
                                  <td className="px-3 py-1.5 text-right text-gray-700">{item.credit > 0 ? item.credit.toFixed(2) : ""}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {vouchers.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-gray-400">
                    暂无凭证
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between rounded-lg bg-white p-3 shadow-sm">
          <span className="text-xs text-gray-500">
            第 {page} / {totalPages} 页，共 {total} 条
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(1)}
              disabled={page <= 1}
              className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-40"
            >
              首页
            </button>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-40"
            >
              上一页
            </button>
            <span className="px-2 text-xs text-gray-600">{page}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-40"
            >
              下一页
            </button>
            <button
              onClick={() => setPage(totalPages)}
              disabled={page >= totalPages}
              className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-40"
            >
              末页
            </button>
          </div>
        </div>
      )}

      <Toast message={toast?.message || ""} type={toast?.type} show={!!toast} onClose={closeToast} />
    </div>
  );
}
