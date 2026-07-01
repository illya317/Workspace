"use client";

import { useMemo } from "react";
import { createMessageSection, PageSurface, type BodySurfaceProps, type BodySurfaceSectionSpec } from "@workspace/core/ui";
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

export function usePermissionsTabBody({ resources, capabilitiesByOwner, s }: Props): BodySurfaceProps {
  const { selectedResource, setSelectedResource } = s;
  const resourceTree = useMemo<PermissionTreeNode[]>(() => {
    function attachCapabilities(resource: ResourceItem): PermissionTreeNode {
      const capabilityChildren = (capabilitiesByOwner[resource.key] ?? []).map((capability) => ({
        ...capability,
        name: capability.name,
        children: [],
      } satisfies PermissionTreeNode));
      const children = [
        ...(resource.children ?? []).map(attachCapabilities),
        ...capabilityChildren,
      ];
      return {
        ...resource,
        selectableWithChildren: capabilityChildren.length > 0,
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
    ...(!s.loading ? [createPermissionMatrixSection({ s })] : []),
  ];

  return createAdminSelectorSplitBody({
    title: "资源模块",
    items: resourceTree,
    selectedId: selectedResource,
    sections: bodyBlocks,
    onSelect: (resource) => selectResource(resource.key),
  });
}

export default function PermissionsTab(props: Props) {
  return (
    <PageSurface
      kind="standard"
      embedded
      body={usePermissionsTabBody(props)}
    />
  );
}
