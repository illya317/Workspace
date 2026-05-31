"use client";

import DataTable, {
  type DataTableColumn,
  getDefaultVisibleColumns,
} from "@/app/components/DataTable";

// ─── Types ───────────────────────────────────────────────

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

// ─── Lookups ─────────────────────────────────────────────

const COMPANIES: Record<string, string> = {
  "01": "丰华生物",
  "02": "丰华天力通",
  "03": "丰华悦通",
  "04": "丰华制药",
  "05": "加拿大",
  "06": "上海悦通",
};

const CATEGORIES: Record<string, string> = {
  asset: "资产",
  liability: "负债",
  equity: "权益",
  cost: "成本",
  revenue: "收入",
  expense: "费用",
  other: "其他",
};

// ─── Column Definitions ──────────────────────────────────

export const ACCOUNT_COLUMNS: DataTableColumn<Account>[] = [
  {
    key: "code",
    label: "编码",
    required: true,
    render: (a) => <span className="font-mono text-gray-700">{a.code}</span>,
  },
  {
    key: "name",
    label: "名称",
    required: true,
    render: (a) => <span className="text-gray-700">{a.name}</span>,
  },
  {
    key: "companyCode",
    label: "公司",
    render: (a) => (
      <span className="text-gray-600">
        {a.companyCode ? COMPANIES[a.companyCode] || a.companyCode : "-"}
      </span>
    ),
  },
  {
    key: "category",
    label: "类别",
    render: (a) => (
      <span className="text-gray-600">
        {CATEGORIES[a.category] || a.category}
      </span>
    ),
  },
  {
    key: "subjectLevel",
    label: "层级",
    render: (a) => (
      <span className="text-gray-600">{a.subjectLevel ?? "-"}</span>
    ),
  },
  {
    key: "balanceDirection",
    label: "余额方向",
    render: (a) => (
      <span className="text-gray-600">
        {a.balanceDirection === "debit" ? "借" : "贷"}
      </span>
    ),
  },
  {
    key: "groupSubjectCode",
    label: "集团编码",
    render: (a) => (
      <span className="font-mono text-gray-500">
        {a.groupSubjectCode || "-"}
      </span>
    ),
  },
  {
    key: "mnemonicCode",
    label: "助记码",
    render: (a) => (
      <span className="text-gray-500">{a.mnemonicCode || "-"}</span>
    ),
  },
  {
    key: "currency",
    label: "币种",
    render: (a) => (
      <span className="text-gray-500">{a.currency || "-"}</span>
    ),
  },
  {
    key: "parent",
    label: "父级科目",
    render: (a) => (
      <span className="text-gray-500">
        {a.parent ? `${a.parent.code} ${a.parent.name}` : "-"}
      </span>
    ),
  },
  {
    key: "isActive",
    label: "状态",
    render: (a) => (
      <span
        className={`text-xs ${a.isActive ? "text-emerald-600" : "text-gray-400"}`}
      >
        {a.isActive ? "启用" : "停用"}
      </span>
    ),
  },
];

// ─── Component ───────────────────────────────────────────

interface AccountTableProps {
  accounts: Account[];
  loading?: boolean;
  visibleColumns?: string[];
}

/**
 * 科目表格。
 * 内部使用 DataTable，列定义从 ACCOUNT_COLUMNS 取。
 *
 * 典型用法：
 *   const visible = getDefaultVisibleColumns(ACCOUNT_COLUMNS);
 *   <ColumnToggle columns={ACCOUNT_COLUMNS} visible={visible} onChange={setVisible} />
 *   <AccountTable accounts={data} visibleColumns={visible} loading={loading} />
 */
export default function AccountTable({
  accounts,
  loading,
  visibleColumns = getDefaultVisibleColumns(ACCOUNT_COLUMNS),
}: AccountTableProps) {
  return (
    <DataTable
      rows={accounts}
      columns={ACCOUNT_COLUMNS}
      visibleColumns={visibleColumns}
      loading={loading}
      emptyText="暂无科目数据"
      rowKey={(a) => a.id}
    />
  );
}
