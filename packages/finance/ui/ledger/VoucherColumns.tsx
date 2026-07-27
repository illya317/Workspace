"use client";

import type { DataSurfaceColumnSpec } from "@workspace/core/ui";
import {
  SUPPLEMENTAL_VOUCHER_TYPE_NAME,
  WORKSPACE_VOUCHER_SOURCE_SYSTEM,
  type Voucher,
} from "@workspace/finance/types";
import { formatFinanceAmount } from "../formatters";

export function voucherRecordingSource(voucher: Pick<Voucher, "sourceSystem" | "voucherTypeName">) {
  if (voucher.sourceSystem === WORKSPACE_VOUCHER_SOURCE_SYSTEM
    && voucher.voucherTypeName === SUPPLEMENTAL_VOUCHER_TYPE_NAME) return "Workspace 补录";
  if (voucher.sourceSystem === "TPLUS") return "T+";
  return voucher.sourceSystem || "Workspace";
}

export function getVoucherColumns(
  expandedVoucherId: number | null,
  companyNameByCode: ReadonlyMap<string, string> = new Map(),
  options: { group?: boolean } = {},
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
      cell: (v) => ({ kind: "text", value: v.voucherKind === "group" ? "集团" : v.companyCode ? companyNameByCode.get(v.companyCode) || v.companyCode : "-", tone: "muted" }),
    },
    {
      key: "period",
      label: "期间",
      cell: (v) => ({ kind: "text", value: v.period ? `${v.period.year}年${v.period.month}月` : "-", tone: "muted" }),
    },
    ...(!options.group ? [{
      key: "recordingSource",
      label: "录入来源",
      defaultVisible: true,
      cell: (v: Voucher) => ({ kind: "text" as const, value: voucherRecordingSource(v), tone: "muted" as const }),
    }] : []),
    {
      key: "description",
      label: "摘要",
      defaultVisible: true,
      cell: (v: Voucher) => options.group
        ? { kind: "text" as const, value: v.description, wrap: "truncate" as const }
        : v.reviewBlockReason
        ? { kind: "stack" as const, gap: "xs" as const, items: [
            { kind: "text" as const, value: v.description, wrap: "truncate" as const },
            { kind: "text" as const, value: v.reviewBlockReason, tone: "muted" as const, wrap: "wrap" as const },
          ] }
        : { kind: "text" as const, value: v.description, wrap: "truncate" as const },
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
