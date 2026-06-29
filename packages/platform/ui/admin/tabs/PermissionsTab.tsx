"use client";

import { useEffect, useMemo, useState } from "react";
import { createMessageSection, createPageBody, PageSurface, type BodySurfaceProps, type BodySurfaceSectionSpec } from "@workspace/core/ui";
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

function firstSelectableResource(item: PermissionTreeNode): PermissionTreeNode {
  if (!item.children?.length || item.selectableWithChildren) return item;
  return firstSelectableResource(item.children[0]);
}

export function usePermissionsTabBody({ resources, capabilitiesByOwner, s }: Props): BodySurfaceProps {
  const { selectedResource, setSelectedResource } = s;
  const capabilities = useMemo(
    () => Object.values(capabilitiesByOwner).flat(),
    [capabilitiesByOwner],
  );
  const capabilityOwnerByKey = useMemo(
    () => new Map(capabilities.map((capability) => [capability.key, capability.ownerKey ?? ""])),
    [capabilities],
  );
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
  const [drawerOpen, setDrawerOpen] = useState(false);

  const selectedCapability = selectedResource ? capabilityOwnerByKey.has(selectedResource) : false;
  const selectedEntry = selectedResource && !selectedCapability
    ? flattenedResources.find((resource) => resource.key === selectedResource)
    : null;

  function selectResource(key: string) {
    const resource = flattenedResources.find((item) => item.key === key);
    setSelectedResource(resource ? firstSelectableResource(resource).key : key);
  }

  useEffect(() => {
    if (!selectedEntry?.children?.length) return;
    setSelectedResource(firstSelectableResource(selectedEntry).key);
  }, [selectedEntry, setSelectedResource]);

  const bodyBlocks: BodySurfaceSectionSpec[] = [
    ...(s.loading
      ? [createMessageSection("permission-matrix-loading", {
          tone: "muted" as const,
          content: "加载中...",
        })]
      : []),
    ...(!s.loading ? [createPermissionMatrixSection({ s })] : []),
  ];

  return {
    kind: "section",
    layout: "split",
    left: {
      kind: "selector",
      selector: {
        kind: "tree",
        title: "资源模块",
        items: resourceTree,
        selectedId: selectedResource,
        onSelect: (resource: PermissionTreeNode) => selectResource(resource.key),
        getKey: (resource: PermissionTreeNode) => resource.key,
        getChildren: (resource: PermissionTreeNode) => resource.children,
        defaultExpandedLevel: 99,
        renderItem: (resource: PermissionTreeNode, ctx) => ({
          title: resource.name,
          code: resource.hidden ? "隐藏" : resource.enabled === false ? "停用" : undefined,
          level: ctx.level,
        }),
      },
    },
    right: createPageBody(bodyBlocks),
    sideOpen: true,
    drawerOpen,
    onSideOpenChange: () => undefined,
    onDrawerOpenChange: setDrawerOpen,
    sideLabel: "资源模块",
    showSideControls: false,
    splitRatio: [3, 7],
  };
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
