"use client";

import type { DataSurfaceColumnSpec } from "@workspace/core/ui";
import type { Voucher } from "@workspace/finance/types";
import { formatFinanceAmount } from "../formatters";

export function getVoucherColumns(
  expandedVoucherId: number | null,
  companyNameByCode: ReadonlyMap<string, string> = new Map(),
): DataSurfaceColumnSpec<Voucher>[] {
  return [
    {
      key: "voucherNo",
      label: "凭证号",
      required: true,
      cell: (v) => ({ kind: "text", value: v.voucherNo, font: "mono" }),
    },
    {
      key: "date",
      label: "日期",
      required: true,
      cell: (v) => ({ kind: "text", value: v.date, tone: "muted" }),
    },
    {
      key: "companyCode",
      label: "公司",
      cell: (v) => ({ kind: "text", value: v.companyCode ? companyNameByCode.get(v.companyCode) || v.companyCode : "-", tone: "muted" }),
    },
    {
      key: "period",
      label: "期间",
      cell: (v) => ({ kind: "text", value: v.period ? `${v.period.year}年${v.period.month}月` : "-", tone: "muted" }),
    },
    {
      key: "description",
      label: "摘要",
      defaultVisible: true,
      cell: (v) => ({ kind: "text", value: v.description, wrap: "truncate" }),
    },
    {
      key: "totalDebit",
      label: "借方",
      required: true,
      align: "right",

      cell: (v) => formatFinanceAmount(v.items.reduce((s, it) => s + it.debit, 0)),
    },
    {
      key: "totalCredit",
      label: "贷方",
      required: true,
      align: "right",

      cell: (v) => formatFinanceAmount(v.items.reduce((s, it) => s + it.credit, 0)),
    },
    {
      key: "expand",
      label: "分录",
      required: true,
      cell: (v) => ({ kind: "disclosure", label: `${v.items.length}条`, expanded: expandedVoucherId === v.id }),
    },
  ];
}
