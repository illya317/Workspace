"use client";

import { useEffect, useMemo, useState } from "react";
import { createBlockSurfaceSection, createMessageSection, createPageBody, PageSurface, type PageSurfaceSectionSpec } from "@workspace/core/ui";
import ResourceTree from "../components/ResourceTree";
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

export default function PermissionsTab({ resources, capabilitiesByOwner, s }: Props) {
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

  const bodyBlocks: PageSurfaceSectionSpec[] = [
    ...(s.loading
      ? [createMessageSection("permission-matrix-loading", {
          tone: "muted" as const,
          content: "加载中...",
        })]
      : []),
    ...(!s.loading ? [createPermissionMatrixSection({ s })] : []),
  ];

  return (
    <PageSurface kind="standard"
      embedded
      body={{
        kind: "split",
        left: {
          sections: createPageBody([createBlockSurfaceSection("resource-tree", {
            kind: "message",

            content: (
              <div className="space-y-3">
                <div className="text-sm font-semibold text-gray-700">资源模块</div>
                <ResourceTree
                  resources={resourceTree}
                  selectedResource={selectedResource}
                  onSelect={selectResource}
                  defaultExpanded
                />
              </div>
            )
          })]).sections,
        },
        right: createPageBody(bodyBlocks),
        sideOpen: true,
        drawerOpen,
        onSideOpenChange: () => undefined,
        onDrawerOpenChange: setDrawerOpen,
        sideLabel: "资源模块",
        showSideControls: false,
        splitRatio: [3, 7],
      }}
    />
  );
}
