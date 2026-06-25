"use client";

import { workspacePath } from "@workspace/core/routing";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ActionToolbar,
  EmptyStateCard,
  PanelCard,
  SearchInput,
  SelectorCard,
  TreeNodeBranch,
  TreeNodeCard,
} from "@workspace/core/ui";
import { matchText } from "@workspace/core/search";
import type { SessionUser } from "@workspace/platform/types";
import { WorkspaceSplitPage } from "@workspace/core/ui";

interface TreeNode {
  code: string; name: string; level: number;
  parentCode: string | null;
  positions: string[];
  ownPositions?: string[];
  children?: TreeNode[];
}

export default function GmpPositionsPage({ hideShell: _hideShell }: { hideShell?: boolean }) {
  const router = useRouter();
  const [_user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sideOpen, setSideOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [search, setSearch] = useState(() => {
    if (typeof window !== "undefined") return new URLSearchParams(window.location.search).get("search") || "";
    return "";
  });

  useEffect(() => {
    fetch(workspacePath("/api/auth/me")).then(r => r.ok ? r.json() : Promise.reject()).then(d => setUser(d.user)).catch(() => router.push("/login"));
  }, [router]);

  useEffect(() => {
    fetch(workspacePath("/api/modules/hr/roster/position-descriptions?tree=1"))
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => {
        const allNodes = data.tree as TreeNode[];
        // Build tree: attach children under their parent
        for (const n of allNodes) {
          if (n.parentCode) {
            const parent = allNodes.find(p => p.code === n.parentCode);
            if (parent) {
              if (!parent.children) parent.children = [];
              parent.children.push(n);
            }
          }
        }
        // Sort children by code within each parent
        for (const n of allNodes) {
          if (n.children) n.children.sort((a, b) => a.code.localeCompare(b.code));
        }
        // Roots = no parentCode
        const roots = allNodes.filter(n => !n.parentCode);
        roots.sort((a, b) => a.code.localeCompare(b.code));
        // Auto-expand roots
        setExpanded(new Set(roots.map(r => r.code)));
        setTree(roots);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  function toggle(code: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  }

  function renderNode(node: TreeNode, depth: number): React.ReactNode {
    const isOpen = expanded.has(node.code);
    const hasChildren = node.children && node.children.length > 0;
    const totalPositions = node.positions.length;
    const ownPositions: string[] = node.ownPositions || [];
    const showPositions = isOpen && totalPositions > 0;

    const branchClassName = { 0: "", 1: "ml-4", 2: "ml-8", 3: "ml-12" }[depth] || "ml-12";

    return (
      <TreeNodeBranch key={node.code} className={branchClassName}>
        <TreeNodeCard
          title={node.name}
          code={node.code}
          level={node.level}
          meta={`${totalPositions} 岗`}
          onClick={() => toggle(node.code)}
          toggle={{
            enabled: Boolean(hasChildren || totalPositions > 0),
            expanded: isOpen,
            label: isOpen ? "收起" : "展开",
            onClick: () => toggle(node.code),
          }}
        />
        {showPositions && (
          <div className="space-y-1 pl-8">
            {ownPositions
              .filter((p: string) => matchText(p, search))
              .sort()
              .map(entry => {
                const [code, name] = entry.split("|");
                return (
                  <SelectorCard
                    key={code}
                    title={name || code}
                    subtitle={code}
                    trailing="→"
                    onClick={() => router.push(`/docs/positions/GMP/${code}`)}
                    className="py-2"
                  />
                );
              })}
          </div>
        )}
        {isOpen && hasChildren && node.children!.map(c => renderNode(c, depth + 1))}
      </TreeNodeBranch>
    );
  }

  if (loading) {
    return (
      <WorkspaceSplitPage
        sideOpen={sideOpen}
        drawerOpen={drawerOpen}
        onSideOpenChange={setSideOpen}
        onDrawerOpenChange={setDrawerOpen}
        sideLabel="岗位目录"
        renderSide={() => <EmptyStateCard compact={false}>加载中...</EmptyStateCard>}
      >
        <EmptyStateCard compact={false}>加载中...</EmptyStateCard>
      </WorkspaceSplitPage>
    );
  }

  const renderPositionTree = () => (
    <PanelCard bodyClassName="p-4 space-y-4">
      <ActionToolbar
        leftSlot={
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="搜索岗位..."
          />
        }
      />
      {tree.length === 0 ? (
        <EmptyStateCard compact={false}>暂无数据</EmptyStateCard>
      ) : (
        <div className="space-y-1">
          {tree.map(n => renderNode(n, 0))}
        </div>
      )}
    </PanelCard>
  );

  return (
    <WorkspaceSplitPage
      sideOpen={sideOpen}
      drawerOpen={drawerOpen}
      onSideOpenChange={setSideOpen}
      onDrawerOpenChange={setDrawerOpen}
      sideLabel="岗位目录"
      renderSide={renderPositionTree}
    >
      <EmptyStateCard compact={false}>选择左侧岗位查看说明书。</EmptyStateCard>
    </WorkspaceSplitPage>
  );
}
