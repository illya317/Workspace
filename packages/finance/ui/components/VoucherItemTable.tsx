"use client";

import type { DataTableColumn } from "@workspace/core/ui/DataTable";
import { getDefaultVisibleColumns } from "@workspace/core/ui/DataTable";
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

export const BASE_ITEM_COLUMNS: DataTableColumn<VoucherItemRow>[] = [
  {
    key: "seq",
    label: "序号",
    required: true,
    render: (row) => <span className="text-gray-500">{(row._idx ?? 0) + 1}</span>,
  },
  {
    key: "accountCode",
    label: "科目编码",
    required: true,
    cellClassName: "font-mono text-gray-600",
    render: (row) => row.account?.code || "-",
  },
  {
    key: "accountName",
    label: "科目名称",
    required: true,
    className: "text-gray-700",
    render: (row) => row.account?.name || "-",
  },
  {
    key: "description",
    label: "摘要",
    className: "text-gray-600",
    render: (row) => row.description || "-",
  },
  {
    key: "debit",
    label: "借方",
    className: "text-right text-gray-700",
    headerClassName: "text-right",
    render: (row) => (row.debit > 0 ? formatFinanceAmount(row.debit) : ""),
  },
  {
    key: "credit",
    label: "贷方",
    className: "text-right text-gray-700",
    headerClassName: "text-right",
    render: (row) => (row.credit > 0 ? formatFinanceAmount(row.credit) : ""),
  },
  {
    key: "relatedEntity",
    label: "关联实体",
    className: "text-gray-500",
    defaultVisible: false,
    render: (row) => row.relatedEntity || "-",
  },
];

export { getDefaultVisibleColumns };
export type { VoucherItem };
