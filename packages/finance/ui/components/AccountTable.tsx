"use client";

import type { DataSurfaceColumnSpec } from "@workspace/core/ui";

export interface Account {
  id: number;
  code: string;
  name: string;
  category: string;
  companyCode: string | null;
  subjectLevel: number | null;
  balanceDirection: string;
  groupSubjectCode: string | null;
  mnemonicCode: string | null;
  currency: string | null;
  parent: { code: string; name: string } | null;
  isActive: boolean;
}

const CATEGORIES: Record<string, string> = {
  asset: "资产",
  liability: "负债",
  equity: "权益",
  cost: "成本",
  revenue: "收入",
  expense: "费用",
  other: "其他",
};

export function getAccountColumns(companyNameByCode: ReadonlyMap<string, string> = new Map()): DataSurfaceColumnSpec<Account>[] {
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
      cell: (account) => ({ kind: "text", value: account.companyCode ? companyNameByCode.get(account.companyCode) || account.companyCode : "-", tone: "muted" }),
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
      key: "groupSubjectCode",
      label: "集团编码",
      cell: (account) => ({ kind: "text", value: account.groupSubjectCode || "-", font: "mono", tone: "muted" }),
    },
    {
      key: "mnemonicCode",
      label: "助记码",
      defaultVisible: true,
      cell: (account) => ({ kind: "text", value: account.mnemonicCode || "-", tone: "muted" }),
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
      key: "isActive",
      label: "状态",
      defaultVisible: true,
      cell: (account) => ({ kind: "badge", label: account.isActive ? "启用" : "停用", tone: account.isActive ? "green" : "gray" }),
    },
  ];
}
