"use client";

import { useState, useCallback } from "react";
import { SelectorCard, TreeNodeBranch, TreeNodeCard } from "@workspace/core/ui";
import type { DirectoryNode } from "@workspace/library/types";

interface Props {
  directories: DirectoryNode[];
  selectedPath: string | null;
  onSelectPath: (path: string | null) => void;
  loading?: boolean;
}

function getL1Paths(nodes: DirectoryNode[]): Set<string> {
  const set = new Set<string>();
  for (const n of nodes) {
    set.add(n.path);
  }
  return set;
}

function DirectoryItem({
  node,
  selectedPath,
  onSelectPath,
  level = 0,
  expandedPaths,
  onToggle,
}: {
  node: DirectoryNode;
  selectedPath: string | null;
  onSelectPath: (path: string | null) => void;
  level?: number;
  expandedPaths: Set<string>;
  onToggle: (path: string) => void;
}) {
  const hasChildren = node.children.length > 0;
  const isSelected = selectedPath === node.path;
  const isExpanded = expandedPaths.has(node.path);

  return (
    <div className={level > 0 ? "mt-2" : undefined}>
      <TreeNodeCard
        title={node.name}
        code={node.count}
        active={isSelected}
        level={level + 1}
        onClick={() => {
          if (hasChildren) onToggle(node.path);
          onSelectPath(node.path);
        }}
        toggle={{
          enabled: hasChildren,
          expanded: isExpanded,
          label: isExpanded ? "收起目录" : "展开目录",
          onClick: () => onToggle(node.path),
        }}
      >
        {isExpanded && hasChildren && (
          <TreeNodeBranch className="mt-2">
            {node.children.map((child) => (
              <DirectoryItem
                key={child.path}
                node={child}
                selectedPath={selectedPath}
                onSelectPath={onSelectPath}
                level={level + 1}
                expandedPaths={expandedPaths}
                onToggle={onToggle}
              />
            ))}
          </TreeNodeBranch>
        )}
      </TreeNodeCard>
    </div>
  );
}

export default function LibrarySidebar({
  directories,
  selectedPath,
  onSelectPath,
  loading,
}: Props) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() =>
    getL1Paths(directories)
  );

  const togglePath = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  return (
    <div className="h-full overflow-y-auto py-2">
      <SelectorCard
        title="全部"
        active={selectedPath === null}
        onClick={() => onSelectPath(null)}
        className="mb-2"
      />
      {loading && <div className="px-3 py-4 text-xs text-gray-400">加载中…</div>}
      {directories.map((d) => (
        <DirectoryItem
          key={d.path}
          node={d}
          selectedPath={selectedPath}
          onSelectPath={onSelectPath}
          expandedPaths={expandedPaths}
          onToggle={togglePath}
        />
      ))}
    </div>
  );
}
