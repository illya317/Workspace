"use client";

import { useMemo, useState } from "react";
import { NavigationSurface } from "@workspace/core/ui";

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
  collapsible?: boolean;
  defaultExpanded?: boolean;
  forceExpanded?: boolean;
}
const STATUS_TONE_CLASS: Record<StatusVariant, string> = {
  green: "bg-emerald-50 text-emerald-600",
  yellow: "bg-yellow-50 text-yellow-700",
  gray: "bg-gray-100 text-gray-600",
};
function StatusBadge({ label, tone }: { label: string; tone: StatusVariant }) {
  return <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_TONE_CLASS[tone]}`}>{label}</span>;
}

export default function ResourceTree({
  resources,
  selectedResource,
  onSelect,
  collapsible = true,
  defaultExpanded = false,
  forceExpanded = false,
}: ResourceTreeProps) {
  const initialExpanded = useMemo(() => {
    if (forceExpanded) {
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
    if (defaultExpanded) {
      return new Set(resources.map((resource) => resource.key));
    }
    return new Set<string>();
  }, [resources, forceExpanded, defaultExpanded]);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(initialExpanded);

  const expandedIds = forceExpanded ? undefined : expandedKeys;

  function renderStatus(resource: ResourceTreeNode) {
    if (resource.statusLabel) {
      return <StatusBadge label={resource.statusLabel} tone={resource.statusVariant ?? "gray"} />;
    }
    if (resource.hidden) return <StatusBadge label="隐藏" tone="yellow" />;
    if (resource.enabled === false) return <StatusBadge label="停用" tone="gray" />;
    return null;
  }

  function getChildren(resource: ResourceTreeNode): ResourceTreeNode[] | undefined {
    return resource.children;
  }

  return (
    <NavigationSurface
      kind="selector"
      selector={{
        mode: "tree",
        framed: false,
        items: resources,
        selectedId: selectedResource,
        onSelect: (resource) => onSelect(resource.key),
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
      }}
    />
  );
}
