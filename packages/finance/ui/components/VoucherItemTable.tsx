"use client";

import type { DataSurfaceColumnSpec } from "@workspace/core/ui";
import type { VoucherCashFlowAllocation } from "@workspace/finance/types";
import { formatFinanceAmount } from "../formatters";
import { formatVoucherCashFlowDetail } from "../ledger/voucherCashFlow";

interface VoucherItem {
  id: number;
  account?: { code: string; name: string } | null;
  debit: number;
  credit: number;
  description: string | null;
  relatedEntity?: string | null;
  cashFlowAllocations?: VoucherCashFlowAllocation[];
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
      cell: (row) => ({ kind: "text", value: (row._idx ?? 0) + 1, tone: "muted" }),
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
      key: "cashFlowDetail",
      label: "现金流明细",
      required: true,
      wrap: "wrap",
      cell: (row) => ({
        kind: "text",
        value: formatVoucherCashFlowDetail(row.cashFlowAllocations ?? []),
        tone: row.cashFlowAllocations?.length ? "default" : "muted",
        wrap: "wrap",
      }),
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
