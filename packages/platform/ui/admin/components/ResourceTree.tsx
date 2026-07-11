"use client";

import { useMemo, useState } from "react";
import { createPageBody, BodySurface, type SelectorSurfaceStatusSpec, type SelectorSurfaceStructuredTreeItemSpec } from "@workspace/core/ui";

type StatusVariant = "green" | "yellow" | "gray" | "red";

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
const STATUS_TONE: Record<StatusVariant, SelectorSurfaceStatusSpec["tone"]> = {
  green: "success",
  yellow: "warning",
  gray: "muted",
  red: "danger",
};

function declareResourceTreeItems(
  resources: ResourceTreeNode[],
  onStatusClick?: (resource: ResourceTreeNode) => void,
  level = 1,
): SelectorSurfaceStructuredTreeItemSpec<ResourceTreeNode>[] {
  return resources.map((resource) => {
    const statusLabel = resource.statusLabel || (resource.hidden ? "隐藏" : resource.enabled === false ? "停用" : undefined);
    const statusTone = resource.statusLabel
      ? STATUS_TONE[resource.statusVariant ?? "gray"]
      : resource.hidden ? "warning" : "muted";
    return {
      key: resource.key,
      value: resource,
      card: {
        title: resource.name,
        level,
        status: statusLabel ? {
          label: statusLabel,
          tone: statusTone,
          disabled: resource.statusDisabled,
          onClick: resource.statusInteractive && onStatusClick ? () => onStatusClick(resource) : undefined,
        } : undefined,
      },
      children: resource.children?.length
        ? declareResourceTreeItems(resource.children, onStatusClick, level + 1)
        : undefined,
    };
  });
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

  return (
    <BodySurface {...createPageBody([
        {
          key: "resource-tree",
          chrome: "plain",
          body: {
            kind: "selector",
            selector: {
              kind: "tree",
              items: declareResourceTreeItems(resources, onStatusClick),
              selectedId: selectedResource,
              onSelect: (resource) => {
                if (resource.children?.length && !resource.selectableWithChildren) {
                  toggleNode(resource.key);
                  return;
                }
                onSelect(resource.key);
              },
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
            },
          },
        },
      ])} />
  );
}
