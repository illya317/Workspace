"use client";

import { useMemo, useState } from "react";
import { createPageBody, createSelectorPanelBlock, PageSurface } from "@workspace/core/ui";

type StatusVariant = "green" | "yellow" | "gray";

export interface ResourceTreeNode {
  key: string;
  name: string;
  selectableWithChildren?: boolean;
  hidden?: boolean;
  enabled?: boolean;
  disabledReason?: string | null;
  statusLabel?: string;
  statusVariant?: StatusVariant;
  statusInteractive?: boolean;
  statusDisabled?: boolean;
  children?: ResourceTreeNode[];
}

interface ResourceTreeProps {
  resources: ResourceTreeNode[];
  selectedResource: string | null;
  onSelect: (key: string) => void;
  collapsible?: boolean;
  defaultExpanded?: boolean;
  forceExpanded?: boolean;
  onStatusClick?: (resource: ResourceTreeNode) => void;
}
const STATUS_TONE_CLASS: Record<StatusVariant, string> = {
  green: "bg-emerald-50 text-emerald-600",
  yellow: "bg-yellow-50 text-yellow-700",
  gray: "bg-gray-100 text-gray-600",
};
function StatusBadge({
  label,
  tone,
  disabled = false,
  onClick,
}: {
  label: string;
  tone: StatusVariant;
  disabled?: boolean;
  onClick?: () => void;
}) {
  const className = `inline-block rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_TONE_CLASS[tone]} ${onClick && !disabled ? "cursor-pointer hover:ring-1 hover:ring-current/20" : ""} ${disabled ? "cursor-not-allowed opacity-50" : ""}`;
  if (!onClick) return <span className={className}>{label}</span>;
  return (
    <span
      className={className}
      onClick={(event) => {
        event.stopPropagation();
        if (!disabled) onClick();
      }}
    >
      {label}
    </span>
  );
}

export default function ResourceTree({
  resources,
  selectedResource,
  onSelect,
  collapsible = true,
  defaultExpanded = false,
  forceExpanded = false,
  onStatusClick,
}: ResourceTreeProps) {
  const initialExpanded = useMemo(() => {
    if (forceExpanded || defaultExpanded) {
      const set = new Set<string>();
      function visit(nodes: ResourceTreeNode[]) {
        for (const node of nodes) {
          if (node.children && node.children.length > 0) {
            set.add(node.key);
            visit(node.children);
          }
        }
      }
      visit(resources);
      return set;
    }
    return new Set<string>();
  }, [resources, forceExpanded, defaultExpanded]);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(initialExpanded);

  const expandedIds = forceExpanded ? undefined : expandedKeys;

  function toggleNode(key: string) {
    if (forceExpanded) return;
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function renderStatus(resource: ResourceTreeNode) {
    const clickStatus = resource.statusInteractive && onStatusClick
      ? () => onStatusClick(resource)
      : undefined;
    if (resource.statusLabel) {
      return <StatusBadge label={resource.statusLabel} tone={resource.statusVariant ?? "gray"} disabled={resource.statusDisabled} onClick={clickStatus} />;
    }
    if (resource.hidden) return <StatusBadge label="隐藏" tone="yellow" disabled={resource.statusDisabled} onClick={clickStatus} />;
    if (resource.enabled === false) return <StatusBadge label="停用" tone="gray" disabled={resource.statusDisabled} onClick={clickStatus} />;
    return null;
  }

  function getChildren(resource: ResourceTreeNode): ResourceTreeNode[] | undefined {
    return resource.children;
  }

  return (
    <PageSurface
      embedded
      kind="detail"
      body={createPageBody([
        createSelectorPanelBlock<ResourceTreeNode>("resource-tree", {
          mode: "tree",
          framed: false,
          items: resources,
          selectedId: selectedResource,
          onSelect: (resource) => {
            if (resource.children?.length && !resource.selectableWithChildren) {
              toggleNode(resource.key);
              return;
            }
            onSelect(resource.key);
          },
          getKey: (resource) => resource.key,
          getChildren,
          expandedIds,
          collapsible: collapsible && !forceExpanded,
          onToggle: (key, expanded) => {
            setExpandedKeys((prev) => {
              const next = new Set(prev);
              if (expanded) next.add(String(key));
              else next.delete(String(key));
              return next;
            });
          },
          renderItem: (resource, ctx) => ({
            title: resource.name,
            code: renderStatus(resource),
            level: ctx.level,
          }),
        }),
      ])}
    />
  );
}
