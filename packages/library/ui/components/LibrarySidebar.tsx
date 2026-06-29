"use client";

import { useMemo, useState } from "react";
import { createPageBody, createSelectorPanelSection, PageSurface } from "@workspace/core/ui";
import type { DirectoryNode } from "@workspace/library/types";

interface Props {
  directories: DirectoryNode[];
  selectedPath: string | null;
  onSelectPath: (path: string | null) => void;
  loading?: boolean;
}

export default function LibrarySidebar({
  directories,
  selectedPath,
  onSelectPath,
  loading,
}: Props) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set());

  function getChildren(node: DirectoryNode): DirectoryNode[] | undefined {
    return node.children.length > 0 ? node.children : undefined;
  }

  const rootItems = useMemo<DirectoryNode[]>(() => {
    const allRoot: DirectoryNode = {
      path: "",
      name: "全部",
      count: 0,
      children: [],
    };
    return [allRoot, ...directories];
  }, [directories]);

  return (
    <div className="h-full overflow-y-auto py-2">
      <PageSurface kind="standard"
        embedded
        body={createPageBody([
          createSelectorPanelSection<DirectoryNode>("library-directories", {
            mode: "tree",
            items: rootItems,
            selectedId: selectedPath ?? "",
            onSelect: (node) => onSelectPath(node.path || null),
            getKey: (node) => node.path,
            getChildren,
            expandedIds: expandedPaths,
            onToggle: (path, expanded) => {
              const key = String(path);
              setExpandedPaths((prev) => {
                const next = new Set(prev);
                if (expanded) next.add(key);
                else next.delete(key);
                return next;
              });
            },
            renderItem: (node, ctx) => ({
              title: node.name,
              code: node.path === "" ? undefined : node.count,
              level: ctx.level,
            }),
            framed: false,
            loading,
            loadingText: "加载中...",
          }),
        ])}
      />
    </div>
  );
}
