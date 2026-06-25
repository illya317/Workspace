"use client";

import { useMemo, useState } from "react";
import { SelectorPanel } from "@workspace/core/ui";
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
  const initialExpanded = useMemo(() => {
    const set = new Set<string>();
    function visit(nodes: DirectoryNode[]) {
      for (const node of nodes) {
        if (node.children.length > 0) {
          set.add(node.path);
          visit(node.children);
        }
      }
    }
    visit(directories);
    return set;
  }, [directories]);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(initialExpanded);

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
      {loading ? <div className="px-3 py-4 text-xs text-gray-400">加载中…</div> : (
        <SelectorPanel
          mode="tree"
          items={rootItems}
          selectedId={selectedPath ?? ""}
          onSelect={(node) => onSelectPath(node.path || null)}
          getKey={(node) => node.path}
          getChildren={getChildren}
          expandedIds={expandedPaths}
          onToggle={(path, expanded) => {
            const key = String(path);
            setExpandedPaths((prev) => {
              const next = new Set(prev);
              if (expanded) next.add(key);
              else next.delete(key);
              return next;
            });
          }}
          renderItem={(node, ctx) => ({
            title: node.name,
            code: node.path === "" ? undefined : node.count,
            level: ctx.level,
          })}
        />
      )}
    </div>
  );
}
