"use client";

import { PickerOptionButton } from "@workspace/core/ui";
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
        const isAncestor = !!selectedResource && selectedResource.startsWith(r.key + ".");
        const hasChildren = !!(r.children && r.children.length > 0);
        const expanded = (isSelected || isAncestor) && hasChildren;

        return (
          <div key={r.key}>
            <PickerOptionButton
              onClick={() => onSelect(r.key)}
              selected={isSelected}
              align="left"
              className="mb-1 w-full border-0"
            >
              <span style={{ paddingLeft: `${depth * 16}px` }}>
                {depth > 0 && <span className="mr-1 text-gray-300">└</span>}
                {r.name}
              </span>
            </PickerOptionButton>
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
