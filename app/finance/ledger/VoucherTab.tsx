"use client";

import { useEffect, useState, useMemo } from "react";
import Toast from "@/app/components/Toast";
import { useToast } from "@/app/hooks/useToast";
import DataTable, { type DataTableColumn } from "@/app/components/DataTable";
import FinanceFilters from "../components/FinanceFilters";
import Pagination from "../components/Pagination";
import { BASE_ITEM_COLUMNS } from "../components/VoucherItemTable";
import type { VoucherItemRow } from "../components/VoucherItemTable";
import { useReclassResults } from "./useReclassResults";
import { buildReclassItemColumns } from "./reclassItemColumns";
import ReclassReviewView from "../components/ReclassReviewView";

// ─── Types ───────────────────────────────────────────────

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

// ─── Lookups ─────────────────────────────────────────────

const COMPANIES: Record<string, string> = {
  "01": "丰华生物", "02": "丰华天力通", "03": "丰华悦通",
  "04": "丰华制药", "05": "加拿大", "06": "上海悦通",
};

// ─── Formatting ──────────────────────────────────────────

const fmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
  const { reclassMap, handleReview, generating, handleGenerate, setAdjustItem, adjustModal } =
    useReclassResults(companyFilter, yearFilter, monthFilter, showToast);
  const [viewMode, setViewMode] = useState<"vouchers" | "reclass">("vouchers");
  const [reclassStatusFilter, setReclassStatusFilter] = useState("pending");

  const itemColumns = useMemo(() => {
    const cols = [...BASE_ITEM_COLUMNS];
    if (viewMode === "reclass")
      cols.push(...buildReclassItemColumns(reclassMap, canWrite, handleReview, setAdjustItem));
    return cols;
  }, [reclassMap, canWrite, handleReview, viewMode, setAdjustItem]);

  // ── Voucher main table columns ──
  const voucherColumns = useMemo<DataTableColumn<Voucher>[]>(
    () => [
      {
        key: "voucherNo",
        label: "凭证号",
        required: true,
        render: (v) => (
          <span className="font-mono text-gray-700">{v.voucherNo}</span>
        ),
      },
      {
        key: "date",
        label: "日期",
        required: true,
        render: (v) => <span className="text-gray-600">{v.date}</span>,
      },
      {
        key: "companyCode",
        label: "公司",
        required: true,
        render: (v) => (
          <span className="text-gray-600">
            {v.companyCode ? COMPANIES[v.companyCode] || v.companyCode : "-"}
          </span>
        ),
      },
      {
        key: "period",
        label: "期间",
        required: true,
        render: (v) => (
          <span className="text-gray-600">
            {v.period ? `${v.period.year}年${v.period.month}月` : "-"}
          </span>
        ),
      },
      {
        key: "description",
        label: "摘要",
        required: true,
        render: (v) => (
          <span className="text-gray-700 max-w-xs truncate block" title={v.description}>
            {v.description}
          </span>
        ),
      },
      {
        key: "totalDebit",
        label: "借方",
        required: true,
        className: "text-right text-gray-700",
        headerClassName: "text-right",
        render: (v) => fmt(v.items.reduce((s, it) => s + it.debit, 0)),
      },
      {
        key: "totalCredit",
        label: "贷方",
        required: true,
        className: "text-right text-gray-700",
        headerClassName: "text-right",
        render: (v) => fmt(v.items.reduce((s, it) => s + it.credit, 0)),
      },
      {
        key: "expand",
        label: "分录",
        required: true,
        render: (v) => (
          <span className="text-emerald-600 text-xs">
            {expandedVoucherId === v.id ? "收起" : `展开 (${v.items.length}条)`}
          </span>
        ),
      },
    ],
    [expandedVoucherId],
  );

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
            {companyFilter && yearFilter && monthFilter && (
              <div className="flex items-center gap-1 rounded-md border border-gray-200 p-0.5">
                {(["vouchers", "reclass"] as const).map((k) => (
                  <button
                    key={k}
                    onClick={() => setViewMode(k)}
                    className={`rounded px-2 py-0.5 text-[11px] ${
                      viewMode === k
                        ? "bg-emerald-600 text-white"
                        : "text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    {k === "vouchers" ? "凭证" : "重分类审核"}
                  </button>
                ))}
              </div>
            )}
            {canWrite && companyFilter && yearFilter && monthFilter && (
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="rounded bg-emerald-600 px-3 py-1 text-xs text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {generating ? "生成中..." : "生成重分类结果"}
              </button>
            )}
          </div>
        }
      />

      {viewMode === "reclass" ? (
        <ReclassReviewView
          items={Array.from(reclassMap.values())}
          canWrite={canWrite}
          statusFilter={reclassStatusFilter}
          onStatusFilter={setReclassStatusFilter}
          onReview={handleReview}
        />
      ) : (
        <div className="overflow-x-auto rounded-lg bg-white shadow-sm">
          <DataTable
            rows={vouchers}
            columns={voucherColumns}
            visibleColumns={voucherColumns.map((c) => c.key)}
            loading={loading}
            emptyText="暂无凭证"
            rowKey={(v) => v.id}
            onRowClick={(v) =>
              setExpandedVoucherId((prev) => (prev === v.id ? null : v.id))
            }
            expandedRowKey={expandedVoucherId}
            renderExpandedRow={(v) => (
              <div className="rounded border border-gray-200 bg-white">
                <DataTable
                  rows={v.items.map((it, i) => ({ ...it, _idx: i }))}
                  columns={itemColumns}
                  visibleColumns={itemColumns.map((c) => c.key)}
                  rowKey={(r: VoucherItemRow) => r.id}
                />
              </div>
            )}
          />
        </div>
      )}
      {viewMode !== "reclass" && (
        <Pagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} />
      )}
      <Toast message={toast?.message || ""} type={toast?.type} show={!!toast} onClose={closeToast} />
      {adjustModal}
    </div>
  );
}
