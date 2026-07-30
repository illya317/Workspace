"use client";

import type { DataSurfaceColumnSpec } from "@workspace/core/ui";
import type {
  Account,
  GroupVoucherBalanceCheck,
  GroupVoucherReclassificationTrace,
  GroupVoucherSourceTrace,
  VoucherCashFlowAllocation,
} from "@workspace/finance/types";
import { formatFinanceAmount } from "../formatters";
import { formatVoucherCashFlowDetail } from "../ledger/voucherCashFlow";

interface VoucherItem {
  id: number;
  sourceDate?: string | null;
  account?: { code: string; name: string } | null;
  debit: number;
  credit: number;
  description: string | null;
  relatedEntity?: string | null;
  entityName?: string | null;
  counterpartyName?: string | null;
  sourceEvidence?: string | null;
  sourceTrace?: GroupVoucherSourceTrace[];
  sourceReclassification?: GroupVoucherReclassificationTrace | null;
  sourceBalanceCheck?: GroupVoucherBalanceCheck | null;
  presentationAccount?: Account | null;
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
      key: "sourceDate",
      label: "发生日期",
      required: true,
      cell: (row) => ({ kind: "text", value: row.sourceDate || "—", tone: "muted" }),
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

export function getGroupItemColumns(expandedSourceLineId: number | null = null): DataSurfaceColumnSpec<VoucherItemRow>[] {
  const base = getBaseItemColumns().filter((column) => (
    !["accountCode", "accountName", "description", "cashFlowDetail", "relatedEntity"].includes(column.key)
  ));
  return [
    { ...base[0]!, width: "xs" },
    base[1]!,
    {
      key: "account",
      label: "原科目",
      required: true,
      cell: (row) => ({
        kind: "disclosure",
        label: [
          row.account?.name,
          row.account?.code === "NCI" ? null : row.account?.code,
        ].filter(Boolean).join(" · ") || "-",
        expanded: expandedSourceLineId === row.id,
        emphasis: "medium",
      }),
    },
    {
      key: "presentationAccount",
      label: "报表列示",
      required: true,
      cell: (row) => row.presentationAccount?.name || row.account?.name || "—",
    },
    {
      key: "entity",
      label: "合并主体",
      required: true,
      cell: (row) => row.entityName || "-",
    },
    ...base.slice(2),
  ];
}

export type GroupVoucherSourceTraceRow = GroupVoucherSourceTrace;

export function getGroupSourceTraceColumns(): DataSurfaceColumnSpec<GroupVoucherSourceTraceRow>[] {
  return [
    { key: "sourceLabel", label: "来源", required: true, width: "content", wrap: "nowrap", cell: (row) => row.sourceLabel },
    { key: "date", label: "日期/余额日", required: true, width: "content", wrap: "nowrap", cell: (row) => row.date || "—" },
    { key: "voucherNo", label: "原始凭证号", required: true, width: "content", wrap: "nowrap", cell: (row) => row.voucherNo || "—" },
    {
      key: "account",
      label: "科目",
      required: true,
      width: "lg",
      wrap: "wrap",
      cell: (row) => `${row.accountName} · ${row.accountCode}`,
    },
    {
      key: "processing",
      label: "处理",
      required: true,
      width: "content",
      wrap: "nowrap",
      cell: (row) => row.reclassifiedToAccountCode
        ? `重分类 → ${row.reclassifiedToAccountCode}`
        : row.voucherNo ? "原始入账" : "余额勾稽",
    },
    { key: "description", label: "摘要", width: "lg", wrap: "wrap", cell: (row) => row.description || "—" },
    {
      key: "debit",
      label: "借方",
      required: true,
      width: "content",
      wrap: "nowrap",
      align: "right",
      numeric: true,
      cell: (row) => Math.abs(row.debit) >= 0.005 ? formatFinanceAmount(row.debit) : "",
    },
    {
      key: "credit",
      label: "贷方",
      required: true,
      width: "content",
      wrap: "nowrap",
      align: "right",
      numeric: true,
      cell: (row) => Math.abs(row.credit) >= 0.005 ? formatFinanceAmount(row.credit) : "",
    },
  ];
}

export type { VoucherItem };
