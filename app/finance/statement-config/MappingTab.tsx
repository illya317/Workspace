"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import FinanceFilters from "../components/FinanceFilters";
import MappingRow from "./MappingRow";

// ─── Types ─────────────────────────────────────────────────

export interface MappingNode {
  accountCode: string; accountName: string; level: number;
  closingDebit: number; closingCredit: number; net: number;
  resolvedLineCode: string | null; explicitLineCode: string | null;
  mappingSource: "explicit" | "inherited" | "none";
  ancestorAccountCode: string | null;
  children: MappingNode[];
}

interface FlatNode { node: MappingNode; depth: number; }

interface StatementConfigView {
  lineConfigs: { lineCode: string; label: string }[];
  mappingPreview: MappingNode[] | null;
  month: number | null;
}

// ─── Helpers ───────────────────────────────────────────────

function hasVisibleChildren(node: MappingNode, maxLevel: number): boolean {
  return node.children.some((c) => c.level <= maxLevel);
}

function flattenVisibleTree(
  nodes: MappingNode[], expandedCodes: Set<string>, maxLevel: number, depth = 0,
): FlatNode[] {
  const result: FlatNode[] = [];
  for (const node of nodes) {
    if (node.level > maxLevel) continue;
    result.push({ node, depth });
    if (expandedCodes.has(node.accountCode)) {
      result.push(...flattenVisibleTree(node.children, expandedCodes, maxLevel, depth + 1));
    }
  }
  return result;
}

function buildLineLabelMap(lineConfigs: { lineCode: string; label: string }[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const lc of lineConfigs) m.set(lc.lineCode, lc.label);
  return m;
}

// ─── Component ─────────────────────────────────────────────

export default function MappingTab() {
  const [companyFilter, setCompanyFilter] = useState("02");
  const [yearFilter, setYearFilter] = useState("2025");
  const [levelFilter, setLevelFilter] = useState("");
  const [data, setData] = useState<StatementConfigView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedCodes, setExpandedCodes] = useState<Set<string>>(new Set());

  const loadMapping = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(
        `/api/finance/statement-config?companyCode=${encodeURIComponent(companyFilter)}&year=${yearFilter}&type=balance`,
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error || `请求失败 (${res.status})`);
        setData(null);
      } else { setData(await res.json()); setExpandedCodes(new Set()); }
    } catch { setError("网络错误，请检查连接后重试"); setData(null); }
    setLoading(false);
  }, [companyFilter, yearFilter]);

  useEffect(() => { loadMapping(); }, [loadMapping]);

  const toggleNode = useCallback((code: string) => {
    setExpandedCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  }, []);

  const maxLevel = levelFilter ? Number(levelFilter) : Infinity;
  const lineLabelMap = useMemo(
    () => (data ? buildLineLabelMap(data.lineConfigs) : new Map<string, string>()), [data],
  );
  const flatNodes = useMemo(
    () => data?.mappingPreview ? flattenVisibleTree(data.mappingPreview, expandedCodes, maxLevel) : [],
    [data, expandedCodes, maxLevel],
  );
  const stats = useMemo(() => {
    const all: MappingNode[] = [];
    const walk = (ns: MappingNode[]) => { for (const n of ns) { all.push(n); walk(n.children); } };
    if (data?.mappingPreview) walk(data.mappingPreview);
    const mapped = all.filter((n) => n.mappingSource !== "none").length;
    return { total: all.length, mapped, unmapped: all.length - mapped };
  }, [data]);

  return (
    <div className="space-y-4 mt-4">
      <FinanceFilters
        companyFilter={companyFilter} yearFilter={yearFilter}
        onCompanyChange={setCompanyFilter} onYearChange={setYearFilter}
        levelFilter={levelFilter} onLevelChange={setLevelFilter}
        showMonth={false} showLevel showSearch={false} showPageSize={false}
        extra={
          <button onClick={loadMapping}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs text-white hover:bg-emerald-700">
            刷新
          </button>
        }
      />

      {loading && <p className="p-12 text-center text-sm text-gray-400">加载中...</p>}

      {!loading && error && (
        <div className="rounded-lg bg-red-50 p-8 text-center">
          <p className="text-sm text-red-600 mb-2">{error}</p>
          <button onClick={loadMapping} className="text-xs text-red-500 underline hover:text-red-700">重试</button>
        </div>
      )}

      {!loading && !error && data && flatNodes.length === 0 && (
        <p className="p-12 text-center text-sm text-gray-400">暂无科目映射数据</p>
      )}

      {!loading && !error && data && flatNodes.length > 0 && (
        <>
          <div className="flex gap-4 text-xs text-gray-500">
            <span>共 <b className="text-gray-700">{stats.total}</b> 个科目</span>
            <span>已映射 <b className="text-emerald-600">{stats.mapped}</b></span>
            {stats.unmapped > 0 && (
              <span>未映射 <b className="text-red-500">{stats.unmapped}</b></span>
            )}
            <span className="text-gray-400">期间: {data.month ? `${yearFilter}年${data.month}月` : "—"}</span>
          </div>

          <div className="rounded-lg bg-white shadow-sm overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="border-b bg-gray-50">
                <tr>
                  <th className="py-2 text-left font-medium text-gray-600 w-32">科目编码</th>
                  <th className="py-2 text-left font-medium text-gray-600 w-48">科目名称</th>
                  <th className="py-2 text-right font-medium text-gray-600 w-28">期末借方</th>
                  <th className="py-2 text-right font-medium text-gray-600 w-28">期末贷方</th>
                  <th className="py-2 text-right font-medium text-gray-600 w-24">净值</th>
                  <th className="py-2 text-left font-medium text-gray-600 w-40">报表项目</th>
                  <th className="py-2 text-left font-medium text-gray-600 w-24">映射来源</th>
                </tr>
              </thead>
              <tbody>
                {flatNodes.map(({ node, depth }) => (
                  <MappingRow
                    key={node.accountCode}
                    accountCode={node.accountCode}
                    accountName={node.accountName}
                    level={node.level}
                    closingDebit={node.closingDebit}
                    closingCredit={node.closingCredit}
                    net={node.net}
                    resolvedLineLabel={node.resolvedLineCode ? (lineLabelMap.get(node.resolvedLineCode) || node.resolvedLineCode) : null}
                    mappingSource={node.mappingSource}
                    ancestorAccountCode={node.ancestorAccountCode}
                    depth={depth}
                    hasVisibleChildren={hasVisibleChildren(node, maxLevel)}
                    isExpanded={expandedCodes.has(node.accountCode)}
                    onToggle={() => toggleNode(node.accountCode)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
