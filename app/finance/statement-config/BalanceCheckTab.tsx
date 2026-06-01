"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import FinanceFilters from "../components/FinanceFilters";

// ─── Types ─────────────────────────────────────────────────

interface AccountNode {
  code: string; name: string; level: number;
  closingDebit: number; closingCredit: number; net: number;
  childrenSumDebit: number; childrenSumCredit: number;
  diffDebit: number; diffCredit: number;
  isBalanced: boolean;
  leafSumDebit: number; leafSumCredit: number;
  leafDiffDebit: number; leafDiffCredit: number;
  children: AccountNode[];
}
interface FlatNode { node: AccountNode; depth: number; }

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ─── Helpers ───────────────────────────────────────────────

function hasVisibleChildren(node: AccountNode, maxLevel: number): boolean {
  return node.children.some((c) => c.level <= maxLevel);
}

function flattenTree(nodes: AccountNode[], expanded: Set<string>, maxLevel: number, depth = 0): FlatNode[] {
  const r: FlatNode[] = [];
  for (const n of nodes) {
    if (n.level > maxLevel) continue;
    r.push({ node: n, depth });
    if (expanded.has(n.code)) r.push(...flattenTree(n.children, expanded, maxLevel, depth + 1));
  }
  return r;
}

// ─── Component ─────────────────────────────────────────────

export default function BalanceCheckTab() {
  const [company, setCompany] = useState("02");
  const [year, setYear] = useState("2025");
  const [levelFilter, setLevelFilter] = useState("");
  const [tree, setTree] = useState<AccountNode[] | null>(null);
  const [summary, setSummary] = useState<{ leafDebit: number; leafCredit: number; leafBalanced: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const maxLevel = levelFilter ? Number(levelFilter) : Infinity;

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/finance/statement-config?companyCode=${company}&year=${year}`);
      if (!res.ok) { setError(`请求失败 (${res.status})`); setTree(null); }
      else {
        const d = await res.json();
        setTree(d.accountTree || []);
        if (d.accountTree) {
          let ld = 0, lc = 0;
          const walk = (ns: AccountNode[]) => { for (const n of ns) { if (n.children.length === 0) { ld += n.closingDebit; lc += n.closingCredit; } walk(n.children); } };
          walk(d.accountTree);
          setSummary({ leafDebit: Math.round(ld * 100) / 100, leafCredit: Math.round(lc * 100) / 100, leafBalanced: Math.abs(ld - lc) < 0.01 });
        }
      }
    } catch { setError("网络错误"); setTree(null); }
    setLoading(false);
  }, [company, year]);

  useEffect(() => { load(); }, [load]);

  // Compute default expanded: ancestor chains of inconsistent nodes
  useEffect(() => {
    if (!tree) return;
    const toExpand = new Set<string>();
    // Build code → parentCode map
    const parentOf = new Map<string, string | null>();
    const buildParent = (ns: AccountNode[], parent: string | null) => {
      for (const n of ns) { parentOf.set(n.code, parent); buildParent(n.children, n.code); }
    };
    buildParent(tree, null);
    // Find inconsistent nodes and expand their ancestor chain
    const walk = (ns: AccountNode[]) => {
      for (const n of ns) {
        if (!n.isBalanced) {
          let cur: string | null = n.code;
          while (cur) { toExpand.add(cur); cur = parentOf.get(cur) || null; }
        }
        walk(n.children);
      }
    };
    walk(tree);
    setExpanded(toExpand);
  }, [tree]);

  const toggleNode = useCallback((code: string) => {
    setExpanded((prev) => { const next = new Set(prev); if (next.has(code)) next.delete(code); else next.add(code); return next; });
  }, []);

  const flatNodes = useMemo(() => tree ? flattenTree(tree, expanded, maxLevel) : [], [tree, expanded, maxLevel]);

  const inconsistentCount = useMemo(() => {
    if (!tree) return 0;
    let c = 0;
    const walk = (ns: AccountNode[]) => { for (const n of ns) { if (!n.isBalanced) c++; walk(n.children); } };
    walk(tree); return c;
  }, [tree]);

  return (
    <div className="space-y-4 mt-4">
      <FinanceFilters
        companyFilter={company} yearFilter={year}
        onCompanyChange={setCompany} onYearChange={setYear}
        levelFilter={levelFilter} onLevelChange={setLevelFilter}
        showMonth={false} showLevel showSearch={false} showPageSize={false}
        extra={
          <button onClick={load} className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs text-white hover:bg-emerald-700">刷新</button>
        }
      />

      {loading && <p className="p-12 text-center text-sm text-gray-400">加载中...</p>}

      {!loading && error && (
        <div className="rounded-lg bg-red-50 p-8 text-center"><p className="text-sm text-red-600 mb-2">{error}</p><button onClick={load} className="text-xs text-red-500 underline hover:text-red-700">重试</button></div>
      )}

      {!loading && !error && tree && flatNodes.length === 0 && (
        <p className="p-12 text-center text-sm text-gray-400">暂无科目余额数据</p>
      )}

      {!loading && !error && tree && flatNodes.length > 0 && (
        <>
          {/* Summary */}
          {summary && (
            <div className="flex gap-4 text-xs text-gray-500 bg-white rounded-lg shadow-sm px-4 py-2">
              <span>叶子借: <b className="text-gray-700">{fmt(summary.leafDebit)}</b></span>
              <span>叶子贷: <b className="text-gray-700">{fmt(summary.leafCredit)}</b></span>
              <span>
                叶子平衡:{" "}
                {summary.leafBalanced
                  ? <b className="text-emerald-600">✓ 平衡</b>
                  : <b className="text-red-500">✗ 不平衡 {fmt(Math.abs(summary.leafDebit - summary.leafCredit))}</b>}
              </span>
              {inconsistentCount > 0 && (
                <span>父子不一致: <b className="text-red-500">{inconsistentCount}</b> 项</span>
              )}
            </div>
          )}

          {/* Tree table */}
          <div className="rounded-lg bg-white shadow-sm overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="border-b bg-gray-50">
                <tr>
                  <th className="py-2 text-left font-medium text-gray-600 w-28">科目编码</th>
                  <th className="py-2 text-left font-medium text-gray-600 w-44">科目名称</th>
                  <th className="py-2 text-right font-medium text-gray-600 w-24">期末借方</th>
                  <th className="py-2 text-right font-medium text-gray-600 w-24">期末贷方</th>
                  <th className="py-2 text-right font-medium text-gray-600 w-24">子级借方</th>
                  <th className="py-2 text-right font-medium text-gray-600 w-24">子级贷方</th>
                  <th className="py-2 text-right font-medium text-gray-600 w-20">借方差</th>
                  <th className="py-2 text-right font-medium text-gray-600 w-20">贷方差</th>
                  <th className="py-2 text-center font-medium text-gray-600 w-20">状态</th>
                </tr>
              </thead>
              <tbody>
                {flatNodes.map(({ node, depth }) => {
                  const isLeaf = node.children.length === 0;
                  const pad = depth * 16 + 8;
                  const diffC = node.diffDebit !== 0 || node.diffCredit !== 0;
                  return (
                    <tr key={node.code}
                      className={`border-b text-xs hover:bg-gray-50 transition-colors ${
                        !isLeaf && !node.isBalanced ? "bg-red-50/60" : ""
                      }`}
                    >
                      <td className="py-1.5" style={{ paddingLeft: `${pad}px` }}>
                        <span className="flex items-center gap-1">
                          {hasVisibleChildren(node, maxLevel) ? (
                            <button onClick={() => toggleNode(node.code)} className="text-gray-300 hover:text-gray-600 w-3 text-[10px] leading-none">
                              {expanded.has(node.code) ? "▼" : "▶"}
                            </button>
                          ) : (<span className="w-3" />)}
                          <span className="font-mono text-gray-700">{node.code}</span>
                        </span>
                      </td>
                      <td className="py-1.5 text-gray-700">{node.name}</td>
                      <td className="py-1.5 text-right text-gray-600">{fmt(node.closingDebit)}</td>
                      <td className="py-1.5 text-right text-gray-600">{fmt(node.closingCredit)}</td>
                      <td className="py-1.5 text-right text-gray-500">{isLeaf ? "—" : fmt(node.childrenSumDebit)}</td>
                      <td className="py-1.5 text-right text-gray-500">{isLeaf ? "—" : fmt(node.childrenSumCredit)}</td>
                      <td className={`py-1.5 text-right ${diffC ? "text-red-600 font-medium" : "text-gray-400"}`}>
                        {isLeaf ? "—" : (node.diffDebit !== 0 ? fmt(node.diffDebit) : "0.00")}
                      </td>
                      <td className={`py-1.5 text-right ${diffC ? "text-red-600 font-medium" : "text-gray-400"}`}>
                        {isLeaf ? "—" : (node.diffCredit !== 0 ? fmt(node.diffCredit) : "0.00")}
                      </td>
                      <td className="py-1.5 text-center">
                        {isLeaf ? (
                          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">明细</span>
                        ) : node.isBalanced ? (
                          <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600">平衡</span>
                        ) : (
                          <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700">不一致</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
