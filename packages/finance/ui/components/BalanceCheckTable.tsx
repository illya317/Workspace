"use client";

import { useMemo } from "react";
import { DataSurface, type DataSurfaceColumnSpec, type DataTableColumn } from "@workspace/core/ui";
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
    maximumFractionDigits: 2
  });
}
export function flattenBalanceAccountTree(nodes: BalanceCheckAccountNode[], expanded: Set<string>, maxLevel: number, depth = 0): BalanceCheckFlatNode[] {
  const rows: BalanceCheckFlatNode[] = [];
  for (const node of nodes) {
    if (node.level > maxLevel) continue;
    rows.push({
      node,
      depth
    });
    if (expanded.has(node.code)) {
      rows.push(...flattenBalanceAccountTree(node.children, expanded, maxLevel, depth + 1));
    }
  }
  return rows;
}
function hasVisibleChildren(node: BalanceCheckAccountNode, maxLevel: number) {
  return node.children.some(child => child.level <= maxLevel);
}
function DifferenceCell({
  node,
  side
}: {
  node: BalanceCheckAccountNode;
  side: "debit" | "credit";
}) {
  const hasDiff = node.diffDebit !== 0 || node.diffCredit !== 0;
  const value = side === "debit" ? node.diffDebit : node.diffCredit;
  return <span className={hasDiff ? "font-medium text-red-600" : "text-slate-400"}>
      {node.children.length === 0 ? "—" : value !== 0 ? formatBalanceAmount(value) : "0.00"}
    </span>;
}
export default function BalanceCheckTable({
  rows,
  expanded,
  maxLevel,
  onToggleNode
}: {
  rows: BalanceCheckFlatNode[];
  expanded: Set<string>;
  maxLevel: number;
  onToggleNode: (code: string) => void;
}) {
  const visibleColumns = useMemo(() => ["code", "name", "closingDebit", "closingCredit", "childrenDebit", "childrenCredit", "diffDebit", "diffCredit", "status"], []);
  const columns = useMemo<Array<DataTableColumn<BalanceCheckFlatNode> | DataSurfaceColumnSpec<BalanceCheckFlatNode>>>(() => [{
    key: "code",
    label: "科目编码",
    required: true,
    headerClassName: "w-28",
    cell: ({
      node
    }) => ({
      kind: "actions",
      className: "gap-1",
      actions: [
        ...(hasVisibleChildren(node, maxLevel) ? [{
          key: `toggle-${node.code}`,
          label: expanded.has(node.code) ? "▼" : "▶",
          size: "sm" as const,
          className: "w-4 border-0 bg-transparent px-0 py-0 text-base leading-none text-slate-300 shadow-none hover:bg-transparent hover:text-slate-600",
          onClick: () => onToggleNode(node.code),
        }] : []),
        {
          key: `code-${node.code}`,
          label: node.code,
          size: "sm" as const,
          className: "border-0 bg-transparent px-0 py-0 font-mono text-slate-700 shadow-none hover:bg-transparent",
          disabled: true,
        },
      ],
      align: "left",
    })
  }, {
    key: "name",
    label: "科目名称",
    required: true,
    headerClassName: "w-44",
    render: ({
      node
    }) => <span className="text-slate-700">{node.name}</span>
  }, {
    key: "closingDebit",
    label: "期末借方",
    required: true,
    headerClassName: "w-28 text-right",
    cellClassName: "text-right text-slate-600",
    render: ({
      node
    }) => formatBalanceAmount(node.closingDebit)
  }, {
    key: "closingCredit",
    label: "期末贷方",
    required: true,
    headerClassName: "w-28 text-right",
    cellClassName: "text-right text-slate-600",
    render: ({
      node
    }) => formatBalanceAmount(node.closingCredit)
  }, {
    key: "childrenDebit",
    label: "子级借方",
    required: true,
    headerClassName: "w-28 text-right",
    cellClassName: "text-right text-slate-500",
    render: ({
      node
    }) => node.children.length === 0 ? "—" : formatBalanceAmount(node.childrenSumDebit)
  }, {
    key: "childrenCredit",
    label: "子级贷方",
    required: true,
    headerClassName: "w-28 text-right",
    cellClassName: "text-right text-slate-500",
    render: ({
      node
    }) => node.children.length === 0 ? "—" : formatBalanceAmount(node.childrenSumCredit)
  }, {
    key: "diffDebit",
    label: "借方差",
    required: true,
    headerClassName: "w-24 text-right",
    cellClassName: "text-right",
    render: ({
      node
    }) => <DifferenceCell node={node} side="debit" />
  }, {
    key: "diffCredit",
    label: "贷方差",
    required: true,
    headerClassName: "w-24 text-right",
    cellClassName: "text-right",
    render: ({
      node
    }) => <DifferenceCell node={node} side="credit" />
  }, {
    key: "status",
    label: "状态",
    required: true,
    headerClassName: "w-20 text-center",
    cellClassName: "text-center",
    cell: ({
      node
    }) => {
      if (node.children.length === 0) return { kind: "badge", label: "明细", tone: "gray" };
      return node.isBalanced ? { kind: "badge", label: "平衡", tone: "green" } : { kind: "badge", label: "不一致", tone: "red" };
    }
  }], [expanded, maxLevel, onToggleNode]);
  return <DataSurface kind="table" framed className="overflow-hidden" bodyClassName="overflow-x-auto" rows={rows} columns={columns} visibleColumns={visibleColumns} rowKey={({
      node
    }) => node.code} density="compact" tableClassName="text-base" rowClassName={({
      node
    }) => !node.isBalanced && node.children.length > 0 ? "bg-red-50/60" : ""} />
}
