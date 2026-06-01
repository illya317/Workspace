"use client";

import { useState } from "react";

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
  // Edit mode
  editing?: boolean;
  lineOptions?: { lineCode: string; label: string }[];
  saving?: boolean;
  onSetMapping?: (lineCode: string) => void;
  onRemoveMapping?: () => void;
}

export default function MappingRow(props: MappingRowProps) {
  const {
    accountCode, accountName, closingDebit, closingCredit, net,
    resolvedLineLabel, mappingSource, ancestorAccountCode,
    depth, hasVisibleChildren, isExpanded, onToggle,
    editing, lineOptions, saving, onSetMapping, onRemoveMapping,
  } = props;
  const pad = depth * 16 + 8;

  const [selectedLine, setSelectedLine] = useState("");
  const [showOverride, setShowOverride] = useState(false);

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

  const renderLineCell = () => {
    if (!editing || !lineOptions || !onSetMapping) {
      return resolvedLineLabel ?? <span className="text-gray-300">—</span>;
    }
    if (saving) {
      return <span className="text-gray-400 text-[11px]">保存中...</span>;
    }

    const selectEl = (
      <select
        value={selectedLine}
        onChange={(e) => setSelectedLine(e.target.value)}
        className="rounded border border-gray-200 px-1 py-0.5 text-[11px] focus:border-emerald-400 focus:outline-none"
      >
        <option value="">— 选择报表项目 —</option>
        {lineOptions.map((o) => (
          <option key={o.lineCode} value={o.lineCode}>{o.label}</option>
        ))}
      </select>
    );
    const setBtn = selectedLine ? (
      <button onClick={() => onSetMapping(selectedLine)} className="ml-1 rounded bg-emerald-600 px-2 py-0.5 text-[10px] text-white hover:bg-emerald-700">设置</button>
    ) : null;

    switch (mappingSource) {
      case "none":
        return <span className="flex items-center">{selectEl}{setBtn}</span>;
      case "explicit":
        return (
          <span className="flex items-center gap-1">
            <span className="text-gray-700">{resolvedLineLabel}</span>
            {selectEl}{setBtn}
            <button onClick={onRemoveMapping} className="rounded px-1.5 py-0.5 text-[10px] text-red-500 hover:bg-red-50 hover:text-red-700">清除</button>
          </span>
        );
      case "inherited":
        if (!showOverride) {
          return (
            <span className="flex items-center gap-1">
              <span className="text-gray-400 text-[11px]">继承自 {ancestorAccountCode || "?"} → {resolvedLineLabel}</span>
              <button onClick={() => setShowOverride(true)} className="rounded px-1.5 py-0.5 text-[10px] text-blue-500 hover:bg-blue-50">覆盖</button>
            </span>
          );
        }
        return (
          <span className="flex items-center gap-1">
            {selectEl}{setBtn}
            <button onClick={() => setShowOverride(false)} className="rounded px-1.5 py-0.5 text-[10px] text-gray-400 hover:text-gray-600">取消</button>
          </span>
        );
    }
  };

  return (
    <tr className={`border-b text-xs hover:bg-gray-50 transition-colors ${mappingSource === "none" ? "bg-red-50/60" : ""}`}>
      <td className="py-1.5" style={{ paddingLeft: `${pad}px` }}>
        <span className="flex items-center gap-1">
          {hasVisibleChildren ? (
            <button onClick={onToggle} className="text-gray-300 hover:text-gray-600 w-3 text-[10px] leading-none">
              {isExpanded ? "▼" : "▶"}
            </button>
          ) : (<span className="w-3" />)}
          <span className="font-mono text-gray-700">{accountCode}</span>
        </span>
      </td>
      <td className="py-1.5 text-gray-700">{accountName}</td>
      <td className="py-1.5 text-right text-gray-600">{fmt(closingDebit)}</td>
      <td className="py-1.5 text-right text-gray-600">{fmt(closingCredit)}</td>
      <td className={`py-1.5 text-right pr-3 ${net < 0 ? "text-red-600" : "text-gray-700"}`}>{fmt(Math.abs(net))}</td>
      <td className="py-1.5">{renderLineCell()}</td>
      <td className="py-1.5">{sourceBadge}</td>
    </tr>
  );
}
