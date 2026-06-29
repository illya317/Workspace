"use client";

import { workspacePath } from "@workspace/core/routing";
import { useEffect, useState, useMemo, useCallback } from "react";
import { createPageBody, PageSurface, createMessageSection, createActionsSection, createMetricsSection } from "@workspace/core/ui";
import type { BodySurfaceSectionSpec, SurfaceToolbarItems } from "@workspace/core/ui";
import { flattenBalanceAccountTree, formatBalanceAmount, useBalanceCheckTableSection, type BalanceCheckAccountNode } from "../components/BalanceCheckTable";
import { useFinanceFilterToolbarItems } from "../components/FinanceFilters";
import { useStatementConfig } from "./StatementConfigContext";
export default function BalanceCheckTab() {
  const { sections, toolbarItems } = useBalanceCheckSections();
  return <PageSurface kind="standard" embedded toolbar={{ items: toolbarItems }} body={createPageBody(sections)} />;
}

export function useBalanceCheckSections(): { sections: BodySurfaceSectionSpec[]; toolbarItems: SurfaceToolbarItems } {
  const {
    company,
    year
  } = useStatementConfig();
  const [levelFilter, setLevelFilter] = useState("");
  const [tree, setTree] = useState<BalanceCheckAccountNode[] | null>(null);
  const [summary, setSummary] = useState<{
    leafDebit: number;
    leafCredit: number;
    leafBalanced: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const maxLevel = levelFilter ? Number(levelFilter) : Infinity;
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(workspacePath(`/api/modules/finance/statement-config?companyCode=${company}&year=${year}`));
      if (!res.ok) {
        setError(`请求失败 (${res.status})`);
        setTree(null);
      } else {
        const d = await res.json();
        setTree(d.accountTree || []);
        if (d.accountTree) {
          let ld = 0,
            lc = 0;
          const walk = (ns: BalanceCheckAccountNode[]) => {
            for (const n of ns) {
              if (n.children.length === 0) {
                ld += n.closingDebit;
                lc += n.closingCredit;
              }
              walk(n.children);
            }
          };
          walk(d.accountTree);
          setSummary({
            leafDebit: Math.round(ld * 100) / 100,
            leafCredit: Math.round(lc * 100) / 100,
            leafBalanced: Math.abs(ld - lc) < 0.01
          });
        }
      }
    } catch {
      setError("网络错误");
      setTree(null);
    }
    setLoading(false);
  }, [company, year]);
  useEffect(() => {
    load();
  }, [load]);

  // Compute default expanded: ancestor chains of inconsistent nodes
  useEffect(() => {
    if (!tree) return;
    const toExpand = new Set<string>();
    // Build code → parentCode map
    const parentOf = new Map<string, string | null>();
    const buildParent = (ns: BalanceCheckAccountNode[], parent: string | null) => {
      for (const n of ns) {
        parentOf.set(n.code, parent);
        buildParent(n.children, n.code);
      }
    };
    buildParent(tree, null);
    // Find inconsistent nodes and expand their ancestor chain
    const walk = (ns: BalanceCheckAccountNode[]) => {
      for (const n of ns) {
        if (!n.isBalanced) {
          let cur: string | null = n.code;
          while (cur) {
            toExpand.add(cur);
            cur = parentOf.get(cur) || null;
          }
        }
        walk(n.children);
      }
    };
    walk(tree);
    setExpanded(toExpand);
  }, [tree]);
  const extraToolbarItems: SurfaceToolbarItems = [{
    kind: "action-group",
    key: "balance-check-actions",
    section: "action",
    actions: [{ key: "refresh", kind: "refresh", label: "刷新", variant: "primary", onClick: load }],
  }];
  const toggleNode = useCallback((code: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);else next.add(code);
      return next;
    });
  }, []);
  const flatNodes = useMemo(() => tree ? flattenBalanceAccountTree(tree, expanded, maxLevel) : [], [tree, expanded, maxLevel]);
  const toolbarItems = useFinanceFilterToolbarItems({
    showCompanyYear: false,
    levelFilter,
    onLevelChange: setLevelFilter,
    showMonth: false,
    showLevel: true,
    showSearch: false,
    showPageSize: false,
    extraItems: extraToolbarItems,
  });
  const inconsistentCount = useMemo(() => {
    if (!tree) return 0;
    let c = 0;
    const walk = (ns: BalanceCheckAccountNode[]) => {
      for (const n of ns) {
        if (!n.isBalanced) c++;
        walk(n.children);
      }
    };
    walk(tree);
    return c;
  }, [tree]);
  const statusBlocks: BodySurfaceSectionSpec[] = [
    ...(!loading && error ? [
      createMessageSection("error", {
        tone: "danger" as const,

        content: error,
      }),
      createActionsSection("retry", [{ key: "retry", label: "重试", variant: "danger", onClick: load }], {  }),
    ] : []),
    ...(!loading && !error && tree && flatNodes.length > 0 && summary ? [
      createMetricsSection("balance-summary", {
        metrics: [
          { key: "leaf-debit", label: "叶子借", value: formatBalanceAmount(summary.leafDebit) },
          { key: "leaf-credit", label: "叶子贷", value: formatBalanceAmount(summary.leafCredit) },
          { key: "leaf-balanced", label: "叶子平衡", value: summary.leafBalanced ? "平衡" : `不平衡 ${formatBalanceAmount(Math.abs(summary.leafDebit - summary.leafCredit))}` },
          ...(inconsistentCount > 0 ? [{ key: "inconsistent", label: "父子不一致", value: `${inconsistentCount} 项` }] : []),
        ],
      }),
    ] : []),
  ];

  const tableSection = useBalanceCheckTableSection({ rows: flatNodes, expanded, maxLevel, onToggleNode: toggleNode });
  return {
    toolbarItems,
    sections: [
      ...(loading ? [createMessageSection("loading", { content: "加载中...", tone: "muted" })] : []),
      ...statusBlocks,
      ...(!loading && !error && tree && flatNodes.length === 0
        ? [createMessageSection("empty", { content: "暂无科目余额数据", tone: "muted" })]
        : []),
      ...(!loading && !error && tree && flatNodes.length > 0 ? [tableSection] : []),
    ],
  };
}
