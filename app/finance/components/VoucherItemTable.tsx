"use client";

interface VoucherItem {
  id: number;
  account?: { code: string; name: string } | null;
  debit: number;
  credit: number;
  description: string | null;
  relatedEntity?: string | null;
}

interface Props {
  items: VoucherItem[];
  visibleColumns?: string[];
}

const fmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function VoucherItemTable({ items, visibleColumns }: Props) {
  const show = (key: string) => !visibleColumns || visibleColumns.includes(key);

  return (
    <table className="w-full text-xs">
      <thead className="border-b bg-gray-100">
        <tr>
          {show("seq") && <th className="px-3 py-1.5 text-left font-medium text-gray-500">序号</th>}
          {show("accountCode") && <th className="px-3 py-1.5 text-left font-medium text-gray-500">科目编码</th>}
          {show("accountName") && <th className="px-3 py-1.5 text-left font-medium text-gray-500">科目名称</th>}
          {show("description") && <th className="px-3 py-1.5 text-left font-medium text-gray-500">摘要</th>}
          {show("debit") && <th className="px-3 py-1.5 text-right font-medium text-gray-500">借方</th>}
          {show("credit") && <th className="px-3 py-1.5 text-right font-medium text-gray-500">贷方</th>}
          {show("relatedEntity") && <th className="px-3 py-1.5 text-left font-medium text-gray-500">关联实体</th>}
        </tr>
      </thead>
      <tbody>
        {items.map((item, idx) => (
          <tr key={item.id} className="border-b last:border-0">
            {show("seq") && <td className="px-3 py-1.5 text-gray-500">{idx + 1}</td>}
            {show("accountCode") && <td className="px-3 py-1.5 font-mono text-gray-600">{item.account?.code || "-"}</td>}
            {show("accountName") && <td className="px-3 py-1.5 text-gray-700">{item.account?.name || "-"}</td>}
            {show("description") && <td className="px-3 py-1.5 text-gray-600">{item.description || "-"}</td>}
            {show("debit") && <td className="px-3 py-1.5 text-right text-gray-700">{item.debit > 0 ? fmt(item.debit) : ""}</td>}
            {show("credit") && <td className="px-3 py-1.5 text-right text-gray-700">{item.credit > 0 ? fmt(item.credit) : ""}</td>}
            {show("relatedEntity") && <td className="px-3 py-1.5 text-gray-500">{item.relatedEntity || "-"}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
