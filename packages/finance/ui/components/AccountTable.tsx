"use client";

import type { DataSurfaceColumnSpec } from "@workspace/core/ui";
import type { FinanceGroupAccountMappingMethod, FinanceGroupAccountReviewStatus } from "@workspace/finance/types";

export interface AccountTableRow {
  id: number;
  code: string;
  name: string;
  category: string;
  companyCode: string | null;
  parentId: number | null;
  subjectLevel: number | null;
  year: number | null;
  balanceDirection: string;
  groupAccount: { id: number; code: string; name: string } | null;
  mapping: { id: number; updatedAt: string; method: FinanceGroupAccountMappingMethod } | null;
  reviewStatus: FinanceGroupAccountReviewStatus;
  currency: string | null;
  parent: { code: string; name: string } | null;
  isActive: boolean;
}

export interface Account extends AccountTableRow {
  groupSubjectCode: string | null;
}

const CATEGORIES: Record<string, string> = {
  asset: "资产",
  liability: "负债",
  common: "共同",
  equity: "权益",
  cost: "成本",
  revenue: "收入",
  expense: "费用",
  other: "其他",
};

export function getAccountColumns<T extends AccountTableRow = Account>(
  companyNameByCode: ReadonlyMap<string, string> = new Map(),
  options: { nullCompanyLabel?: string } = {},
): DataSurfaceColumnSpec<T>[] {
  return [
    {
      key: "code",
      label: "编码",
      required: true,
      cell: (account) => ({ kind: "text", value: account.code, font: "mono" }),
    },
    {
      key: "name",
      label: "名称",
      required: true,
      cell: (account) => ({ kind: "text", value: account.name }),
    },
    {
      key: "companyCode",
      label: "公司",
      cell: (account) => ({
        kind: "text",
        value: account.companyCode
          ? companyNameByCode.get(account.companyCode) || account.companyCode
          : options.nullCompanyLabel ?? "-",
        tone: "muted",
      }),
    },
    {
      key: "category",
      label: "类别",
      defaultVisible: true,
      cell: (account) => ({ kind: "text", value: CATEGORIES[account.category] || account.category, tone: "muted" }),
    },
    {
      key: "subjectLevel",
      label: "层级",
      cell: (account) => ({ kind: "text", value: account.subjectLevel ?? "-", tone: "muted" }),
    },
    {
      key: "balanceDirection",
      label: "余额方向",
      cell: (account) => ({ kind: "text", value: account.balanceDirection === "debit" ? "借" : "贷", tone: "muted" }),
    },
    {
      key: "groupAccount",
      label: "集团科目",
      defaultVisible: true,
      cell: (account) => account.groupAccount
        ? ({ kind: "stack", gap: "xs", items: [
            { kind: "text", value: account.groupAccount.code, font: "mono" },
            { kind: "text", value: account.groupAccount.name, tone: "muted" },
          ] })
        : ({ kind: "empty" }),
    },
    {
      key: "currency",
      label: "币种",
      cell: (account) => ({ kind: "text", value: account.currency || "-", tone: "muted" }),
    },
    {
      key: "parent",
      label: "父级科目",
      defaultVisible: true,
      cell: (account) => ({ kind: "text", value: account.parent ? `${account.parent.code} ${account.parent.name}` : "-", tone: "muted" }),
    },
    {
      key: "reviewStatus",
      label: "复核状态",
      defaultVisible: true,
      cell: (account) => ({
        kind: "badge",
        label: reviewStatusLabel(account.reviewStatus),
        tone: reviewStatusTone(account.reviewStatus),
      }),
    },
    {
      key: "isActive",
      label: "启停状态",
      defaultVisible: true,
      cell: (account) => ({ kind: "badge", label: account.isActive ? "启用" : "停用", tone: account.isActive ? "green" : "gray" }),
    },
  ];
}

function reviewStatusLabel(value: FinanceGroupAccountReviewStatus) {
  return ({
    confirmed: "已确认",
    reviewed: "已复核",
    pending_review: "待复核",
    pending_delete: "待删除",
  } as const)[value];
}

function reviewStatusTone(value: FinanceGroupAccountReviewStatus) {
  if (value === "confirmed") return "blue" as const;
  if (value === "reviewed") return "green" as const;
  if (value === "pending_delete") return "red" as const;
  return "orange" as const;
}
