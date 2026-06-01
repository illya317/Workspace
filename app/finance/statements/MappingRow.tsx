"use client";

const fmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export interface MappingRowProps {
  accountCode: string;
  accountName: string;
  level: number;
  closingDebit: number;
  closingCredit: number;
  net: number;
  resolvedLineLabel: string | null;
  mappingSource: "explicit" | "inherited" | "none";
  ancestorAccountCode: string | null;
  depth: number;
  hasVisibleChildren: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}

export default function MappingRow({
  accountCode, accountName, closingDebit, closingCredit, net,
  resolvedLineLabel, mappingSource, ancestorAccountCode,
  depth, hasVisibleChildren, isExpanded, onToggle,
}: MappingRowProps) {
  const pad = depth * 16 + 8;

  const sourceBadge = (() => {
    switch (mappingSource) {
      case "explicit":
        return <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">直接</span>;
      case "inherited":
        return (
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
            继承{ancestorAccountCode ? ` (${ancestorAccountCode})` : ""}
          </span>
        );
      case "none":
        return <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700">未映射</span>;
    }
  })();

  return (
    <tr
      className={`border-b text-xs hover:bg-gray-50 transition-colors ${
        mappingSource === "none" ? "bg-red-50/60" : ""
      }`}
    >
      <td className="py-1.5" style={{ paddingLeft: `${pad}px` }}>
        <span className="flex items-center gap-1">
          {hasVisibleChildren ? (
            <button onClick={onToggle} className="text-gray-300 hover:text-gray-600 w-3 text-[10px] leading-none">
              {isExpanded ? "▼" : "▶"}
            </button>
          ) : (
            <span className="w-3" />
          )}
          <span className="font-mono text-gray-700">{accountCode}</span>
        </span>
      </td>
      <td className="py-1.5 text-gray-700">{accountName}</td>
      <td className="py-1.5 text-right text-gray-600">{fmt(closingDebit)}</td>
      <td className="py-1.5 text-right text-gray-600">{fmt(closingCredit)}</td>
      <td className={`py-1.5 text-right ${net < 0 ? "text-red-600" : "text-gray-700"}`}>
        {fmt(Math.abs(net))}
      </td>
      <td className="py-1.5 text-gray-600">
        {resolvedLineLabel ?? <span className="text-gray-300">—</span>}
      </td>
      <td className="py-1.5">{sourceBadge}</td>
    </tr>
  );
}
