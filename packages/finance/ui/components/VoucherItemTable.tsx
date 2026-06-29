"use client";

import type { DataSurfaceColumnSpec } from "@workspace/core/ui";
import { formatFinanceAmount } from "../formatters";

interface VoucherItem {
  id: number;
  account?: { code: string; name: string } | null;
  debit: number;
  credit: number;
  description: string | null;
  relatedEntity?: string | null;
}

export interface VoucherItemRow extends VoucherItem {
  _idx?: number;
}

export function getBaseItemColumns(): DataSurfaceColumnSpec<VoucherItemRow>[] {
  return [
    {
      key: "seq",
      label: "序号",
      required: true,
      cell: (row) => <span className="text-gray-500">{(row._idx ?? 0) + 1}</span>,
    },
    {
      key: "accountCode",
      label: "科目编码",
      required: true,
      font: "mono",
      cell: (row) => row.account?.code || "-",
    },
    {
      key: "accountName",
      label: "科目名称",
      required: true,

      cell: (row) => row.account?.name || "-",
    },
    {
      key: "description",
      label: "摘要",

      cell: (row) => row.description || "-",
    },
    {
      key: "debit",
      label: "借方",
      align: "right",

      cell: (row) => (row.debit > 0 ? formatFinanceAmount(row.debit) : ""),
    },
    {
      key: "credit",
      label: "贷方",
      align: "right",

      cell: (row) => (row.credit > 0 ? formatFinanceAmount(row.credit) : ""),
    },
    {
      key: "relatedEntity",
      label: "关联实体",
      tone: "muted",
      defaultVisible: false,
      cell: (row) => row.relatedEntity || "-",
    },
  ];
}

export type { VoucherItem };
