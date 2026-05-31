"use client";

// no React hooks needed — pure render

interface Account {
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

interface AccountTableProps {
  accounts: Account[];
  loading?: boolean;
  visibleColumns?: string[];
}

export default function AccountTable({ accounts, loading, visibleColumns }: AccountTableProps) {
  const show = (key: string) => !visibleColumns || visibleColumns.includes(key);

  if (loading) {
    return <p className="p-8 text-center text-gray-500">加载中...</p>;
  }

  const visibleCount = visibleColumns ? visibleColumns.length : 12;

  return (
    <table className="w-full text-xs">
      <thead className="border-b bg-gray-50">
        <tr>
          {show("code") && <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">编码</th>}
          {show("name") && <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">名称</th>}
          {show("companyCode") && <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">公司</th>}
          {show("category") && <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">类别</th>}
          {show("subjectLevel") && <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">层级</th>}
          {show("balanceDirection") && <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">余额方向</th>}
          {show("groupSubjectCode") && <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">集团编码</th>}
          {show("mnemonicCode") && <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">助记码</th>}
          {show("currency") && <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">币种</th>}
          {show("parent") && <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">父级科目</th>}
          {show("isActive") && <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">状态</th>}
        </tr>
      </thead>
      <tbody>
        {accounts.map((acc) => (
          <tr key={acc.id} className="border-b last:border-0 hover:bg-gray-50">
            {show("code") && <td className="px-3 py-2 font-mono text-gray-700 whitespace-nowrap">{acc.code}</td>}
            {show("name") && <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{acc.name}</td>}
            {show("companyCode") && <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
              {acc.companyCode ? COMPANIES[acc.companyCode] || acc.companyCode : "-"}
            </td>}
            {show("category") && <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{CATEGORIES[acc.category] || acc.category}</td>}
            {show("subjectLevel") && <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{acc.subjectLevel ?? "-"}</td>}
            {show("balanceDirection") && <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
              {acc.balanceDirection === "debit" ? "借" : "贷"}
            </td>}
            {show("groupSubjectCode") && <td className="px-3 py-2 font-mono text-gray-500 whitespace-nowrap">{acc.groupSubjectCode || "-"}</td>}
            {show("mnemonicCode") && <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{acc.mnemonicCode || "-"}</td>}
            {show("currency") && <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{acc.currency || "-"}</td>}
            {show("parent") && <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
              {acc.parent ? `${acc.parent.code} ${acc.parent.name}` : "-"}
            </td>}
            {show("isActive") && <td className="px-3 py-2 whitespace-nowrap">
              <span className={`text-xs ${acc.isActive ? "text-emerald-600" : "text-gray-400"}`}>
                {acc.isActive ? "启用" : "停用"}
              </span>
            </td>}
          </tr>
        ))}
        {accounts.length === 0 && (
          <tr>
            <td colSpan={visibleCount} className="px-3 py-8 text-center text-gray-400">
              暂无科目数据
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
