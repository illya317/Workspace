"use client";

import { useState, useCallback } from "react";
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
    <div>
      <button
        onClick={() => {
          if (hasChildren) onToggle(node.path);
          onSelectPath(node.path);
        }}
        className={`w-full text-left flex items-center justify-between rounded px-3 py-2 text-sm transition hover:bg-gray-100 ${
          isSelected ? "bg-emerald-50 text-emerald-700 font-medium" : "text-gray-700"
        }`}
        style={{ paddingLeft: `${12 + level * 16}px` }}
      >
        <span className="flex items-center gap-1">
          {hasChildren && (
            <svg
              className={`h-3 w-3 text-gray-400 transition-transform ${isExpanded ? "rotate-90" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          )}
          <span className="truncate">{node.name}</span>
        </span>
        <span className="shrink-0 text-xs text-gray-400 ml-2">{node.count}</span>
      </button>
      {isExpanded && hasChildren && (
        <div>
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
        </div>
      )}
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
      <button
        onClick={() => onSelectPath(null)}
        className={`w-full text-left rounded px-3 py-2 text-sm transition hover:bg-gray-100 ${
          selectedPath === null ? "bg-emerald-50 text-emerald-700 font-medium" : "text-gray-700"
        }`}
      >
        全部
      </button>
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
