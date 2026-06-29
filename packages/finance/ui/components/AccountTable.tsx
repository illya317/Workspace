"use client";

import { createPageBody, PageSurface, createPageTableSection, type DataSurfaceColumnSpec } from "@workspace/core/ui";
import CompanyNameCell from "@workspace/platform/ui/CompanyNameCell";

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

export function getAccountColumns(): DataSurfaceColumnSpec<Account>[] {
  return [
    {
      key: "code",
      label: "编码",
      required: true,
      cell: (account) => (
        <span className="font-mono text-gray-700">{account.code}</span>
      ),
    },
    {
      key: "name",
      label: "名称",
      required: true,
      cell: (account) => <span className="text-gray-700">{account.name}</span>,
    },
    {
      key: "companyCode",
      label: "公司",
      cell: (account) => <CompanyNameCell code={account.companyCode} />,
    },
    {
      key: "category",
      label: "类别",
      defaultVisible: true,
      cell: (account) => (
        <span className="text-gray-600">
          {CATEGORIES[account.category] || account.category}
        </span>
      ),
    },
    {
      key: "subjectLevel",
      label: "层级",
      cell: (account) => (
        <span className="text-gray-600">{account.subjectLevel ?? "-"}</span>
      ),
    },
    {
      key: "balanceDirection",
      label: "余额方向",
      cell: (account) => (
        <span className="text-gray-600">
          {account.balanceDirection === "debit" ? "借" : "贷"}
        </span>
      ),
    },
    {
      key: "groupSubjectCode",
      label: "集团编码",
      cell: (account) => (
        <span className="font-mono text-gray-500">
          {account.groupSubjectCode || "-"}
        </span>
      ),
    },
    {
      key: "mnemonicCode",
      label: "助记码",
      defaultVisible: true,
      cell: (account) => (
        <span className="text-gray-500">{account.mnemonicCode || "-"}</span>
      ),
    },
    {
      key: "currency",
      label: "币种",
      cell: (account) => (
        <span className="text-gray-500">{account.currency || "-"}</span>
      ),
    },
    {
      key: "parent",
      label: "父级科目",
      defaultVisible: true,
      cell: (account) => (
        <span className="text-gray-500">
          {account.parent ? `${account.parent.code} ${account.parent.name}` : "-"}
        </span>
      ),
    },
    {
      key: "isActive",
      label: "状态",
      defaultVisible: true,
      cell: (account) => (
        <span
          className={`text-xs ${account.isActive ? "text-emerald-600" : "text-gray-400"}`}
        >
          {account.isActive ? "启用" : "停用"}
        </span>
      ),
    },
  ];
}

interface AccountTableProps {
  accounts: Account[];
  loading?: boolean;
  visibleColumns?: string[];
}

export default function AccountTable({
  accounts,
  loading,
  visibleColumns,
}: AccountTableProps) {
  const columns = getAccountColumns();

  return (
    <PageSurface kind="standard"
      embedded
      body={createPageBody([
        createPageTableSection("accounts", {
          rows: accounts,
          columns,
          visibleColumns,
          loading,
          emptyText: "暂无科目数据",
          rowKey: (account) => account.id,
        }),
      ])}
    />
  );
}
