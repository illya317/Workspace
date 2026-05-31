"use client";

import { useEffect, useState, Fragment, useMemo } from "react";
import Toast from "@/app/components/Toast";
import { useToast } from "@/app/hooks/useToast";
import DataTable from "@/app/components/DataTable";
import FinanceFilters from "../components/FinanceFilters";
import Pagination from "../components/Pagination";
import { BASE_ITEM_COLUMNS } from "../components/VoucherItemTable";
import type { VoucherItemRow } from "../components/VoucherItemTable";
import { useReclassResults } from "./useReclassResults";
import { buildReclassItemColumns } from "./reclassItemColumns";

const COMPANIES: Record<string, string> = { "01": "丰华生物", "02": "丰华天力通", "03": "丰华悦通", "04": "丰华制药", "05": "加拿大", "06": "上海悦通" };

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
  relatedEntity?: string | null;
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

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
  const { reclassMap, handleReview, generating, handleGenerate } = useReclassResults(companyFilter, yearFilter, monthFilter, showToast);
  const [reclassFilter, setReclassFilter] = useState<"all" | "pending">("all");

  const itemColumns = useMemo(() => {
    const cols = [...BASE_ITEM_COLUMNS];
    if (reclassFilter === "pending") cols.push(...buildReclassItemColumns(reclassMap, canWrite, handleReview));
    return cols;
  }, [reclassMap, canWrite, handleReview, reclassFilter]);

  const filteredVouchers = reclassFilter === "pending" && reclassMap.size > 0
    ? vouchers.filter((v) => v.items.some((it) => reclassMap.get(it.id)?.status === "pending"))
    : vouchers;

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

  function toggleExpand(id: number) { setExpandedVoucherId((prev) => (prev === id ? null : id)); }

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
            {reclassMap.size > 0 && (
              <div className="flex items-center gap-1 rounded-md border border-gray-200 p-0.5">
                {(["all","pending"] as const).map((k) => (
                  <button key={k} onClick={() => setReclassFilter(k)}
                    className={`rounded px-2 py-0.5 text-[11px] ${
                      reclassFilter === k ? "bg-emerald-600 text-white" : "text-gray-600 hover:bg-gray-100"
                    }`}>{k === "all" ? "全部" : "待审核"}</button>
                ))}
              </div>
            )}
            {canWrite && companyFilter && yearFilter && monthFilter && (
              <button onClick={handleGenerate} disabled={generating} className="rounded bg-emerald-600 px-3 py-1 text-xs text-white hover:bg-emerald-700 disabled:opacity-50">
                {generating ? "生成中..." : "生成重分类结果"}</button>
            )}
            <span className="text-xs text-gray-400">共 {total} 条</span>
          </div>
        }
      />

      {/* Table */}
      <div className="overflow-x-auto rounded-lg bg-white shadow-sm">
        {loading ? (
          <p className="p-8 text-center text-gray-500">加载中...</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="border-b bg-gray-50"><tr>
              {["凭证号","日期","公司","期间","摘要"].map(h => <th key={h} className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">{h}</th>)}
              <th className="px-3 py-2 text-right font-medium text-gray-600 whitespace-nowrap">借方</th>
              <th className="px-3 py-2 text-right font-medium text-gray-600 whitespace-nowrap">贷方</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">分录</th>
            </tr></thead>
            <tbody>
              {filteredVouchers.map((v) => (
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
                    <td className="px-3 py-2 text-right text-gray-700 whitespace-nowrap">{fmt(v.totalDebit)}</td>
                    <td className="px-3 py-2 text-right text-gray-700 whitespace-nowrap">{fmt(v.totalCredit)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="text-emerald-600 text-xs">
                        {expandedVoucherId === v.id ? "收起" : `展开 (${v.items.length}条)`}
                      </span>
                    </td>
                  </tr>
                  {expandedVoucherId === v.id && (
                    <tr className="bg-gray-50">
                      <td colSpan={8} className="px-3 py-2">
                        <div className="rounded border border-gray-200 bg-white">
                          <DataTable
                            rows={v.items.map((it, i) => ({ ...it, _idx: i }))}
                            columns={itemColumns}
                            visibleColumns={itemColumns.map((c) => c.key)}
                            rowKey={(r) => r.id}
                          />
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {filteredVouchers.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-gray-400">{reclassFilter === "pending" ? "无待审核重分类凭证" : "暂无凭证"}</td></tr>
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
