"use client";

import type { DataTableColumn } from "@/app/components/DataTable";
import CompanyNameCell from "@/app/components/CompanyNameCell";
import type { Voucher } from "./types";

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
      render: (v) => <CompanyNameCell code={v.companyCode} />,
    },
    {
      key: "period",
      label: "期间",
      render: (v) => (
        <span className="text-gray-600">
          {v.period ? `${v.period.year}年${v.period.month}月` : "-"}
        </span>
      ),
    },
    {
      key: "description",
      label: "摘要",
      defaultVisible: true,
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
