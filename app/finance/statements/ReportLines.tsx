"use client";

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export interface ReportLine {
  label: string;
  code?: string;
  amount: number;
  isHeader?: boolean;
  isTotal?: boolean;
  isGrandTotal?: boolean;
}

export interface AccountDetail {
  code: string;
  name: string;
  category: string;
  balanceDirection: string;
  openingDebit: number;
  openingCredit: number;
  currentDebit: number;
  currentCredit: number;
  closing: number;
}

function renderAmount(v: number) {
  if (Math.abs(v) < 0.01) return <span className="text-gray-300">—</span>;
  const neg = v < 0;
  return <span className={neg ? "text-red-600" : "text-gray-800"}>{neg ? "-" : ""}{fmt(Math.abs(v))}</span>;
}

interface Props {
  items: ReportLine[];
  expandedCodes: Set<string>;
  details: Record<string, AccountDetail[]>;
  loadingDetail: string | null;
  onToggle: (code: string) => void;
}

export default function ReportLines({ items, expandedCodes, details, loadingDetail, onToggle }: Props) {
  return items.map((item, i) => {
    const hasCode = !!item.code;
    const isExpanded = hasCode && expandedCodes.has(item.code!);
    const detailRows = hasCode ? details[item.code!] : undefined;

    return (
      <tbody key={i}>
        <tr
          className={`cursor-pointer border-b border-slate-100 transition-colors hover:bg-emerald-50/20 ${
            item.isGrandTotal ? "border-t border-slate-200 font-bold" :
            item.isTotal ? "font-medium bg-slate-50" :
            item.isHeader ? "font-medium text-gray-700" : "text-gray-600"
          }`}
          onClick={() => hasCode && onToggle(item.code!)}
        >
          <td className={`py-2 ${item.isHeader ? "text-slate-700" : item.isTotal || item.isGrandTotal ? "text-slate-800" : "pl-4"}`}>
            <span className="flex items-center gap-1">
              {hasCode && <span className="text-gray-300 text-xs">{isExpanded ? "▼" : "▶"}</span>}
              {item.label}
            </span>
          </td>
          <td className="py-2 text-right">{renderAmount(item.amount)}</td>
        </tr>
        {isExpanded && (
          <tr key={`${i}-detail`}>
            <td colSpan={2} className="bg-slate-50 px-4 py-2">
              {loadingDetail === item.code ? (
                <p className="text-xs text-gray-400 py-2">加载明细...</p>
              ) : detailRows && detailRows.length > 0 ? (
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-100 text-slate-500">
                    <tr>
                      <th className="whitespace-nowrap py-1 font-medium">科目编码</th>
                      <th className="whitespace-nowrap py-1 font-medium">科目名称</th>
                      <th className="whitespace-nowrap py-1 text-right font-medium">期初借</th>
                      <th className="whitespace-nowrap py-1 text-right font-medium">期初贷</th>
                      <th className="whitespace-nowrap py-1 text-right font-medium">本期借</th>
                      <th className="whitespace-nowrap py-1 text-right font-medium">本期贷</th>
                      <th className="whitespace-nowrap py-1 text-right font-medium">期末余额</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {detailRows.map((d) => (
                      <tr key={d.code}>
                        <td className="py-1 font-mono text-gray-600">{d.code}</td>
                        <td className="py-1 text-gray-700">{d.name}</td>
                        <td className="py-1 text-right text-gray-600">{d.openingDebit > 0 ? fmt(d.openingDebit) : ""}</td>
                        <td className="py-1 text-right text-gray-600">{d.openingCredit > 0 ? fmt(d.openingCredit) : ""}</td>
                        <td className="py-1 text-right text-gray-600">{d.currentDebit > 0 ? fmt(d.currentDebit) : ""}</td>
                        <td className="py-1 text-right text-gray-600">{d.currentCredit > 0 ? fmt(d.currentCredit) : ""}</td>
                        <td className={`py-1 text-right font-medium ${d.closing < 0 ? "text-red-600" : "text-gray-800"}`}>
                          {fmt(Math.abs(d.closing))}{d.balanceDirection === "credit" && d.closing !== 0 ? " (贷)" : ""}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-slate-50 font-medium">
                      <td colSpan={6} className="py-1 text-right text-gray-600">合计</td>
                      <td className="py-1 text-right text-gray-800">{fmt(Math.abs(detailRows.reduce((s, d) => s + d.closing, 0)))}</td>
                    </tr>
                  </tbody>
                </table>
              ) : (
                <p className="text-xs text-gray-400 py-2">无明细数据</p>
              )}
            </td>
          </tr>
        )}
      </tbody>
    );
  });
}
