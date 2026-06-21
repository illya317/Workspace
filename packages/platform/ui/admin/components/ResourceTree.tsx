"use client";

import { useState } from "react";
import { StatusBadge, TreeNodeBranch, TreeNodeCard } from "@workspace/core/ui";

type StatusVariant = "green" | "yellow" | "gray";

export interface ResourceTreeNode {
  key: string;
  name: string;
  hidden?: boolean;
  enabled?: boolean;
  disabledReason?: string | null;
  statusLabel?: string;
  statusVariant?: StatusVariant;
  children?: ResourceTreeNode[];
}

interface ResourceTreeProps {
  resources: ResourceTreeNode[];
  selectedResource: string | null;
  onSelect: (key: string) => void;
  depth?: number;
  collapsible?: boolean;
  defaultExpanded?: boolean;
  forceExpanded?: boolean;
}

export default function ResourceTree({
  resources,
  selectedResource,
  onSelect,
  depth = 0,
  collapsible = true,
  defaultExpanded = false,
  forceExpanded = false,
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

  function renderStatus(resource: ResourceTreeNode) {
    if (resource.statusLabel) {
      return (
        <StatusBadge
          label={resource.statusLabel}
          variant={resource.statusVariant ?? "gray"}
        />
      );
    }
    if (resource.hidden) return <StatusBadge label="隐藏" variant="yellow" />;
    if (resource.enabled === false) return <StatusBadge label="停用" variant="gray" />;
    return null;
  }

  return (
    <div className={depth === 0 ? "space-y-1" : ""}>
      {resources.map((resource) => {
        const isSelected = selectedResource === resource.key;
        const hasChildren = !!(resource.children && resource.children.length > 0);
        const expanded = hasChildren && (forceExpanded || !collapsible || expandedKeys.has(resource.key));
        const status = renderStatus(resource);
        const card = (
          <TreeNodeCard
            title={resource.name}
            code={status}
            level={depth + 1}
            active={isSelected}
            onClick={() => onSelect(resource.key)}
            toggle={{
              enabled: collapsible && hasChildren,
              expanded,
              label: expanded ? "收起资源" : "展开资源",
              onClick: () => toggle(resource.key),
            }}
            showToggle={collapsible}
            className="mb-2"
          />
        );

        return (
          <div key={resource.key}>
            {depth > 0 ? <TreeNodeBranch className="ml-3">{card}</TreeNodeBranch> : card}
            {expanded && (
              <ResourceTree
                resources={resource.children!}
                selectedResource={selectedResource}
                onSelect={onSelect}
                depth={depth + 1}
                collapsible={collapsible}
                defaultExpanded={defaultExpanded}
                forceExpanded={forceExpanded}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
