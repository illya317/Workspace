"use client";

import { useMemo } from "react";
import { DataTable, PanelCard, type DataTableColumn } from "@workspace/core/ui";

export interface BalanceCheckAccountNode {
  code: string;
  name: string;
  level: number;
  closingDebit: number;
  closingCredit: number;
  childrenSumDebit: number;
  childrenSumCredit: number;
  diffDebit: number;
  diffCredit: number;
  isBalanced: boolean;
  leafSumDebit: number;
  leafSumCredit: number;
  leafDiffDebit: number;
  leafDiffCredit: number;
  children: BalanceCheckAccountNode[];
}

export interface BalanceCheckFlatNode {
  node: BalanceCheckAccountNode;
  depth: number;
}

export function formatBalanceAmount(value: number) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function flattenBalanceAccountTree(
  nodes: BalanceCheckAccountNode[],
  expanded: Set<string>,
  maxLevel: number,
  depth = 0,
): BalanceCheckFlatNode[] {
  const rows: BalanceCheckFlatNode[] = [];
  for (const node of nodes) {
    if (node.level > maxLevel) continue;
    rows.push({ node, depth });
    if (expanded.has(node.code)) {
      rows.push(...flattenBalanceAccountTree(node.children, expanded, maxLevel, depth + 1));
    }
  }
  return rows;
}

function hasVisibleChildren(node: BalanceCheckAccountNode, maxLevel: number) {
  return node.children.some((child) => child.level <= maxLevel);
}

function DifferenceCell({ node, side }: { node: BalanceCheckAccountNode; side: "debit" | "credit" }) {
  const hasDiff = node.diffDebit !== 0 || node.diffCredit !== 0;
  const value = side === "debit" ? node.diffDebit : node.diffCredit;
  return (
    <span className={hasDiff ? "font-medium text-red-600" : "text-slate-400"}>
      {node.children.length === 0 ? "—" : value !== 0 ? formatBalanceAmount(value) : "0.00"}
    </span>
  );
}

function StatusCell({ node }: { node: BalanceCheckAccountNode }) {
  if (node.children.length === 0) {
    return <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">明细</span>;
  }
  return node.isBalanced ? (
    <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-600">平衡</span>
  ) : (
    <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">不一致</span>
  );
}

export default function BalanceCheckTable({
  rows,
  expanded,
  maxLevel,
  onToggleNode,
}: {
  rows: BalanceCheckFlatNode[];
  expanded: Set<string>;
  maxLevel: number;
  onToggleNode: (code: string) => void;
}) {
  const visibleColumns = useMemo(
    () => ["code", "name", "closingDebit", "closingCredit", "childrenDebit", "childrenCredit", "diffDebit", "diffCredit", "status"],
    [],
  );
  const columns = useMemo<DataTableColumn<BalanceCheckFlatNode>[]>(() => [
    {
      key: "code",
      label: "科目编码",
      required: true,
      headerClassName: "w-28",
      render: ({ node, depth }) => (
        <span className="flex items-center gap-1" style={{ paddingLeft: `${depth * 16 + 8}px` }}>
          {hasVisibleChildren(node, maxLevel) ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onToggleNode(node.code);
              }}
              className="w-4 text-xs leading-none text-slate-300 hover:text-slate-600"
            >
              {expanded.has(node.code) ? "▼" : "▶"}
            </button>
          ) : (
            <span className="w-4" />
          )}
          <span className="font-mono text-slate-700">{node.code}</span>
        </span>
      ),
    },
    { key: "name", label: "科目名称", required: true, headerClassName: "w-44", render: ({ node }) => <span className="text-slate-700">{node.name}</span> },
    { key: "closingDebit", label: "期末借方", required: true, headerClassName: "w-28 text-right", cellClassName: "text-right text-slate-600", render: ({ node }) => formatBalanceAmount(node.closingDebit) },
    { key: "closingCredit", label: "期末贷方", required: true, headerClassName: "w-28 text-right", cellClassName: "text-right text-slate-600", render: ({ node }) => formatBalanceAmount(node.closingCredit) },
    { key: "childrenDebit", label: "子级借方", required: true, headerClassName: "w-28 text-right", cellClassName: "text-right text-slate-500", render: ({ node }) => (node.children.length === 0 ? "—" : formatBalanceAmount(node.childrenSumDebit)) },
    { key: "childrenCredit", label: "子级贷方", required: true, headerClassName: "w-28 text-right", cellClassName: "text-right text-slate-500", render: ({ node }) => (node.children.length === 0 ? "—" : formatBalanceAmount(node.childrenSumCredit)) },
    { key: "diffDebit", label: "借方差", required: true, headerClassName: "w-24 text-right", cellClassName: "text-right", render: ({ node }) => <DifferenceCell node={node} side="debit" /> },
    { key: "diffCredit", label: "贷方差", required: true, headerClassName: "w-24 text-right", cellClassName: "text-right", render: ({ node }) => <DifferenceCell node={node} side="credit" /> },
    { key: "status", label: "状态", required: true, headerClassName: "w-20 text-center", cellClassName: "text-center", render: ({ node }) => <StatusCell node={node} /> },
  ], [expanded, maxLevel, onToggleNode]);

  return (
    <PanelCard className="overflow-hidden" bodyClassName="overflow-x-auto">
      <DataTable
        rows={rows}
        columns={columns}
        visibleColumns={visibleColumns}
        rowKey={({ node }) => node.code}
        density="compact"
        rowClassName={({ node }) => (!node.isBalanced && node.children.length > 0 ? "bg-red-50/60" : "")}
      />
    </PanelCard>
  );
}
