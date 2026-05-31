"use client";

import type { DataTableColumn } from "@/app/components/DataTable";
import type { Voucher } from "./types";

const COMPANIES: Record<string, string> = {
  "01": "丰华生物", "02": "丰华天力通", "03": "丰华悦通",
  "04": "丰华制药", "05": "加拿大", "06": "上海悦通",
};

const fmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function getVoucherColumns(
  expandedVoucherId: number | null,
): DataTableColumn<Voucher>[] {
  return [
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
  ];
}
