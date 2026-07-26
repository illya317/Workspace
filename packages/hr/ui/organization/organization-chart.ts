import type { VisualizationNetworkSpec } from "@workspace/core/ui";

export type OrganizationChartDepartment = {
  id: number;
  code: string;
  name: string;
  hierarchyKind: "G" | "M";
  level: number;
  parentId: number | null;
  isArchived: boolean;
  sortOrder?: number;
};

export type OrganizationChartCopy = {
  missingRootText: string;
  emptyText: string;
};

export function buildOrganizationChartVisual(
  departments: readonly OrganizationChartDepartment[],
  copy: OrganizationChartCopy,
): VisualizationNetworkSpec {
  const activeDepartments = departments.filter((department) => !department.isArchived);
  const root = activeDepartments.find((department) => department.code === "BOD")
    ?? activeDepartments.find((department) => (
      department.hierarchyKind === "G" && department.level === 1 && department.parentId === null
    ));
  if (!root) {
    return {
      kind: "network",
      layout: { kind: "hierarchy", nodeAspect: "adaptive" },
      nodes: [],
      edges: [],
      emptyText: copy.missingRootText,
    };
  }

  const childrenByParentId = new Map<number, OrganizationChartDepartment[]>();
  for (const department of activeDepartments) {
    if (department.parentId === null) continue;
    childrenByParentId.set(department.parentId, [
      ...(childrenByParentId.get(department.parentId) ?? []),
      department,
    ]);
  }

  const reachable: OrganizationChartDepartment[] = [];
  const depthById = new Map<number, number>([[root.id, 0]]);
  const visited = new Set<number>();
  const queue = [root];
  while (queue.length > 0) {
    const department = queue.shift() as OrganizationChartDepartment;
    if (visited.has(department.id)) continue;
    visited.add(department.id);
    reachable.push(department);
    const children = [...(childrenByParentId.get(department.id) ?? [])]
      .filter((child) => shouldDisplayOrganizationChild(department, child))
      .sort(compareDepartmentOrder);
    for (const child of children) {
      depthById.set(child.id, (depthById.get(department.id) ?? 0) + 1);
      queue.push(child);
    }
  }

  const visibleIds = new Set(reachable.map((department) => department.id));
  const maxDepth = Math.max(0, ...depthById.values());
  return {
    kind: "network",
    layout: { kind: "hierarchy", nodeAspect: "adaptive" },
    focusNodeKey: nodeKey(root.id),
    height: Math.min(820, Math.max(600, 160 + maxDepth * 100)),
    emptyText: copy.emptyText,
    nodes: reachable.map((department) => ({
      key: nodeKey(department.id),
      label: department.name,
      layoutOrder: organizationLayoutOrder(department),
      size: department.id === root.id
        ? "wide" as const
        : department.hierarchyKind === "G"
          ? "compact" as const
          : "default" as const,
      emphasis: department.id === root.id ? "focus" as const : "primary" as const,
      tone: department.hierarchyKind === "G" ? "blue" as const : "emerald" as const,
    })),
    edges: reachable.flatMap((department) => (
      department.parentId !== null && visibleIds.has(department.parentId)
        ? [{
          key: `organization-edge:${department.parentId}:${department.id}`,
          source: nodeKey(department.parentId),
          target: nodeKey(department.id),
          tone: department.hierarchyKind === "G" ? "blue" as const : "emerald" as const,
        }]
        : []
    )),
  };
}

function nodeKey(id: number) {
  return `organization:${id}`;
}

function compareDepartmentOrder(
  left: OrganizationChartDepartment,
  right: OrganizationChartDepartment,
) {
  if (left.sortOrder !== undefined && right.sortOrder !== undefined) {
    return left.sortOrder - right.sortOrder || left.id - right.id;
  }
  if (left.sortOrder !== undefined) return -1;
  if (right.sortOrder !== undefined) return 1;
  return left.id - right.id;
}

function shouldDisplayOrganizationChild(
  parent: OrganizationChartDepartment,
  child: OrganizationChartDepartment,
) {
  if (child.hierarchyKind === "G") return child.level <= 3;
  if (child.level === 1) return true;
  if (child.level === 2) {
    return parent.hierarchyKind === "M"
      && parent.level === 1
      && isFunctionalPlatform(parent);
  }
  return false;
}

function organizationLayoutOrder(department: OrganizationChartDepartment) {
  if (department.hierarchyKind !== "M" || department.level !== 1) {
    return department.sortOrder;
  }
  if (isFunctionalPlatform(department)) return undefined;
  return department.sortOrder ?? department.id;
}

function isFunctionalPlatform(department: OrganizationChartDepartment) {
  return /^FUN(?:\d|$)/i.test(department.code.trim());
}
