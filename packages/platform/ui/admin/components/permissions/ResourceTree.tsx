"use client";

import { useState } from "react";
import { PickerOptionButton } from "@workspace/core/ui";
import type { ResourceItem } from "../../types";

interface ResourceTreeProps {
  resources: ResourceItem[];
  selectedResource: string | null;
  onSelect: (key: string) => void;
  depth?: number;
  collapsible?: boolean;
  defaultExpanded?: boolean;
}

export default function ResourceTree({
  resources,
  selectedResource,
  onSelect,
  depth = 0,
  collapsible = false,
  defaultExpanded = true,
}: ResourceTreeProps) {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(
    () => new Set(defaultExpanded ? resources.map((resource) => resource.key) : []),
  );

  function toggle(key: string) {
    setExpandedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div>
      {resources.map((r) => {
        const isSelected = selectedResource === r.key;
        const hasChildren = !!(r.children && r.children.length > 0);
        const expanded = hasChildren && (!collapsible || expandedKeys.has(r.key));

        return (
          <div key={r.key}>
            <PickerOptionButton
              onClick={() => {
                onSelect(r.key);
                if (collapsible && hasChildren) toggle(r.key);
              }}
              selected={isSelected}
              align="left"
              className="mb-1 w-full border-0"
            >
              <span className="flex min-w-0 items-center gap-2" style={{ paddingLeft: `${depth * 16}px` }}>
                {collapsible && hasChildren && (
                  <span className="shrink-0 text-slate-400" aria-hidden="true">
                    {expanded ? "⌄" : "›"}
                  </span>
                )}
                <span className="min-w-0 truncate">
                  {depth > 0 && <span className="mr-1 text-gray-300">└</span>}
                  {r.name}
                </span>
                {r.hidden && (
                  <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700">
                    隐藏
                  </span>
                )}
                {r.enabled === false && (
                  <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500" title={r.disabledReason ?? undefined}>
                    停用
                  </span>
                )}
              </span>
            </PickerOptionButton>
            {expanded && (
              <ResourceTree
                resources={r.children!}
                selectedResource={selectedResource}
                onSelect={onSelect}
                depth={depth + 1}
                collapsible={collapsible}
                defaultExpanded={defaultExpanded}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
