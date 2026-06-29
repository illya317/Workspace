"use client";

import { workspacePath } from "@workspace/core/routing";
import { matchText } from "@workspace/core/search";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createBlockSurfaceSection, createPageBody, createSectionSection, PageSurface, type PageSurfaceSectionSpec } from "@workspace/core/ui";
import type { SessionUser } from "@workspace/platform/types";

interface TreeNode {
  code: string;
  name: string;
  level: number;
  parentCode: string | null;
  positions: string[];
  ownPositions?: string[];
  children?: TreeNode[];
}

function parsePositionEntry(entry: string) {
  const [code, name] = entry.split("|");
  return { code: code ?? entry, name: name ?? entry };
}

function filterTree(nodes: TreeNode[], search: string): TreeNode[] {
  const term = search.trim();
  if (!term) return nodes;
  return nodes
    .map((node): TreeNode | null => {
      const nodeMatches = matchText(node.name, term) || matchText(node.code, term);
      const filteredChildren = filterTree(node.children ?? [], term);
      if (nodeMatches || filteredChildren.length > 0) {
        return {
          ...node,
          children: filteredChildren.length > 0 ? filteredChildren : node.children,
        };
      }
      return null;
    })
    .filter((node): node is TreeNode => node !== null);
}

export default function GmpPositionsPage({ hideShell: _hideShell }: { hideShell?: boolean }) {
  const router = useRouter();
  const [_user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [sideOpen, setSideOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [search, setSearch] = useState(() => {
    if (typeof window !== "undefined") return new URLSearchParams(window.location.search).get("search") || "";
    return "";
  });

  useEffect(() => {
    fetch(workspacePath("/api/auth/me"))
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setUser(d.user))
      .catch(() => router.push("/login"));
  }, [router]);

  useEffect(() => {
    fetch(workspacePath("/api/modules/hr/roster/position-descriptions?tree=1"))
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        const allNodes = data.tree as TreeNode[];
        for (const n of allNodes) {
          if (n.parentCode) {
            const parent = allNodes.find((p) => p.code === n.parentCode);
            if (parent) {
              if (!parent.children) parent.children = [];
              parent.children.push(n);
            }
          }
        }
        for (const n of allNodes) {
          if (n.children) n.children.sort((a, b) => a.code.localeCompare(b.code));
        }
        const roots = allNodes.filter((n) => !n.parentCode).sort((a, b) => a.code.localeCompare(b.code));
        setTree(roots);
        setSelectedCode((prev) => prev ?? (roots[0]?.code ?? null));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [router]);

  const visibleTree = useMemo(() => filterTree(tree, search), [tree, search]);

  const selectedNode = useMemo(
    () => tree.find((n) => n.code === selectedCode) ?? null,
    [tree, selectedCode],
  );

  const directPositions = useMemo(() => {
    if (!selectedNode) return [];
    return (selectedNode.ownPositions ?? [])
      .map(parsePositionEntry)
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [selectedNode]);

  function handleSelectPosition(code: string) {
    router.push(`/docs/positions/${code}`);
  }

  const mainBlocks: PageSurfaceSectionSpec[] = !selectedNode ? [createBlockSurfaceSection("empty", {
    kind: "empty",
    content: "选择左侧部门查看直属岗位"
  })] : [createSectionSection("positions", {
    title: `直属岗位 · ${selectedNode.name}`,
    subtitle: `${directPositions.length} 个`,

    sections: [{
      key: "position-list",
      body: {
        kind: "navigation",
        navigation: {
          kind: "selector",
          selector: {
            framed: false,
            items: directPositions,
            selectedId: null,
            onSelect: (pos) => handleSelectPosition(pos.code),
            getKey: (pos) => pos.code,
            renderItem: (pos) => ({
              title: pos.name,
              subtitle: pos.code,
            }),
            emptyText: "该部门暂无直属岗位",
          },
        },
      },
    }],
  })];

  return (
    <PageSurface kind="standard"
      body={{
        kind: "split",
        selector: {
          kind: "tree",
          title: "部门目录",
          items: visibleTree,
          selectedId: selectedCode,
          onSelect: (node: TreeNode) => setSelectedCode(node.code),
          getKey: (node: TreeNode) => node.code,
          getChildren: (node: TreeNode) => node.children,
          renderItem: (node: TreeNode, ctx) => ({
            title: node.name,
            code: node.code,
            level: ctx.level,
          }),
          filter: { kind: "search", value: search, onChange: setSearch, placeholder: "搜索部门..." },
          loading,
        },
        right: createPageBody(mainBlocks),
        sideOpen,
        drawerOpen,
        onSideOpenChange: setSideOpen,
        onDrawerOpenChange: setDrawerOpen,
        sideLabel: "部门目录",
      }}
    />
  );
}
