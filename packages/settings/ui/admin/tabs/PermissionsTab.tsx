"use client";

import { useMemo, useState } from "react";
import { createMessageSection, BodySurface, type BodySurfaceProps, type BodySurfaceSectionSpec } from "@workspace/core/ui";
import { createAdminSelectorSplitBody } from "../components/AdminSelectorSplit";
import { createPermissionMatrixSection } from "../components/permissions/MatrixTable";
import type { PermissionsTabState } from "../hooks/usePermissionsTab";
import type { ResourceItem } from "../types";
import type { ResourceTreeNode } from "../components/ResourceTree";

interface Props {
  resources: ResourceItem[];
  capabilitiesByOwner: Record<string, ResourceItem[]>;
  s: PermissionsTabState;
}

type PermissionTreeNode = ResourceTreeNode & ResourceItem;

function flattenResources(items: PermissionTreeNode[]): PermissionTreeNode[] {
  const output: PermissionTreeNode[] = [];
  for (const item of items) {
    output.push(item);
    if (item.children?.length) output.push(...flattenResources(item.children));
  }
  return output;
}

function setExpandedResourceId(current: ReadonlySet<string>, id: string, expanded: boolean) {
  const next = new Set(current);
  if (expanded) next.add(id);
  else next.delete(id);
  return next;
}

export function usePermissionsTabBody({ resources, capabilitiesByOwner, s }: Props): BodySurfaceProps {
  const { selectedResource, setSelectedResource } = s;
  const [expandedResourceIds, setExpandedResourceIds] = useState<Set<string>>(new Set());
  const resourceTree = useMemo<PermissionTreeNode[]>(() => {
    function attachCapability(capability: ResourceItem): PermissionTreeNode {
      const children = (capability.children ?? []).map(attachCapability);
      return {
        ...capability,
        selectableWithChildren: children.length > 0,
        children,
      };
    }
    function attachCapabilities(resource: ResourceItem): PermissionTreeNode {
      const capabilityChildren = (capabilitiesByOwner[resource.key] ?? []).map(attachCapability);
      const children = [
        ...(resource.children ?? []).map(attachCapabilities),
        ...capabilityChildren,
      ];
      return {
        ...resource,
        selectableWithChildren: Boolean(resource.grantManageable && capabilityChildren.length > 0),
        children,
      };
    }
    return resources.map(attachCapabilities);
  }, [capabilitiesByOwner, resources]);
  const flattenedResources = useMemo(() => flattenResources(resourceTree), [resourceTree]);
  function selectResource(key: string) {
    const resource = flattenedResources.find((item) => item.key === key);
    setSelectedResource(resource?.key ?? key);
  }

  const bodyBlocks: BodySurfaceSectionSpec[] = [
    ...(s.loading
      ? [createMessageSection("permission-matrix-loading", {
          tone: "muted" as const,
          content: "加载中...",
        })]
      : []),
    ...(s.selectedResource && !s.loading
      ? [{ ...createMessageSection("permission-matrix-mobile-boundary", {
          tone: "muted" as const,
          content: "权限矩阵需要同时核对资源、主体与动作，请在桌面端维护。",
        }), visibility: "mobile" as const }]
      : []),
    ...(!s.loading ? [createPermissionMatrixSection({ s })] : []),
  ];

  return createAdminSelectorSplitBody({
    expandedIds: expandedResourceIds,
    onToggle: (id, expanded) => {
      setExpandedResourceIds((current) => setExpandedResourceId(current, String(id), expanded));
    },
    title: "资源模块",
    items: resourceTree,
    selectedId: selectedResource,
    sections: bodyBlocks,
    onSelect: (resource) => {
      if (resource.children?.length && !resource.selectableWithChildren) {
        setExpandedResourceIds((current) => setExpandedResourceId(
          current,
          resource.key,
          !current.has(resource.key),
        ));
        return;
      }
      selectResource(resource.key);
    },
  });
}

export default function PermissionsTab(props: Props) {
  return (
    <BodySurface {...usePermissionsTabBody(props)} />
  );
}
