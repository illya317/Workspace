"use client";

import type { ResourceItem } from "../../types";

interface ResourceTreeProps {
  resources: ResourceItem[];
  selectedResource: string | null;
  onSelect: (key: string) => void;
  depth?: number;
}

export default function ResourceTree({
  resources,
  selectedResource,
  onSelect,
  depth = 0,
}: ResourceTreeProps) {
  return (
    <div>
      {resources.map((r) => {
        const isSelected = selectedResource === r.key;
        const isAncestor = selectedResource?.startsWith(r.key + ".");
        const hasChildren = r.children && r.children.length > 0;
        const expanded = (isSelected || isAncestor) && hasChildren;

        return (
          <div key={r.key}>
            <button
              onClick={() => onSelect(r.key)}
              className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                isSelected
                  ? "bg-emerald-50 text-emerald-700 font-medium"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
              style={{ paddingLeft: `${12 + depth * 16}px` }}
            >
              {r.name}
            </button>
            {expanded && (
              <ResourceTree
                resources={r.children!}
                selectedResource={selectedResource}
                onSelect={onSelect}
                depth={depth + 1}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
