import {
  createSelectorTreeExpandedIds,
  type SelectorTreeNodeKey,
} from "@workspace/core/ui";
import type { GovernanceOrganization, GovernancePositionSummary } from "../types";

export type GovernanceTreeNode =
  | { kind: "organization"; id: number; children: GovernanceTreeNode[] }
  | { kind: "position"; id: number; departmentId: number | null; children?: GovernanceTreeNode[] };

export function splitGovernanceAlias(value: string | null | undefined) {
  if (!value) return [];
  const text = value.trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return uniqueStrings(parsed.map((item) => String(item)));
    }
  } catch {}
  return uniqueStrings(text.split(/[,，、;；\n]+/));
}

export function formatGovernanceAlias(value: string | null | undefined) {
  return splitGovernanceAlias(value).join("、");
}

export function serializeGovernanceAlias(value: string) {
  const items = splitGovernanceAlias(value);
  return items.length > 0 ? JSON.stringify(items) : null;
}

export function buildGovernanceTree(
  organizations: GovernanceOrganization[],
  positions: GovernancePositionSummary[],
): GovernanceTreeNode[] {
  const positionsByDepartment = new Map<number, GovernancePositionSummary[]>();
  for (const position of positions) {
    if (position.departmentId == null) continue;
    positionsByDepartment.set(position.departmentId, [
      ...(positionsByDepartment.get(position.departmentId) ?? []),
      position,
    ]);
  }

  const childrenByParent = new Map<number | null, GovernanceOrganization[]>();
  for (const organization of organizations) {
    childrenByParent.set(organization.parentId, [
      ...(childrenByParent.get(organization.parentId) ?? []),
      organization,
    ]);
  }

  function buildOrganization(organization: GovernanceOrganization): GovernanceTreeNode {
    const childOrganizations = (childrenByParent.get(organization.id) ?? []).map(buildOrganization);
    const childPositions = (positionsByDepartment.get(organization.id) ?? []).map((position) => ({
      kind: "position" as const,
      id: position.id,
      departmentId: position.departmentId,
      children: [],
    }));
    return {
      kind: "organization",
      id: organization.id,
      children: [...childOrganizations, ...childPositions],
    };
  }

  return (childrenByParent.get(null) ?? []).map(buildOrganization);
}

export function governanceTreeExpandedIds(
  organizations: GovernanceOrganization[],
  collapsedIds: ReadonlySet<SelectorTreeNodeKey>,
) {
  return createSelectorTreeExpandedIds({
    items: organizations,
    getKey: (organization) => `organization:${organization.id}`,
    collapsedIds,
  });
}

export function renderGovernanceTreeItem({
  node,
  ctx,
  organizationsById,
  positionsById,
}: {
  node: GovernanceTreeNode;
  ctx: { level: number };
  organizationsById: Map<number, GovernanceOrganization>;
  positionsById: Map<number, GovernancePositionSummary>;
}) {
  if (node.kind === "position") {
    const position = positionsById.get(node.id);
    return {
      title: position?.name || "未命名岗位",
      subtitle: position?.departmentName || "未归属组织",
      code: position?.code,
      level: Math.max(ctx.level, 4),
      showLevelBadge: false,
      meta: [`在岗 ${position?.headcount ?? 0}`],
      tone: "slate" as const,
      size: "sm" as const,
    };
  }

  const organization = organizationsById.get(node.id);
  return {
    title: organization?.name || "未命名组织",
    code: organization?.code,
    level: organization?.level ?? ctx.level,
    showLevelBadge: false,
    meta: organization ? [`直属岗位 ${organization.directPositions}`, `总岗位 ${organization.totalPositions}`] : undefined,
    status: organization?.managerName ? { label: organization.managerName, tone: "muted" as const } : undefined,
    tone: "amber" as const,
  };
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((item) => item.trim()).filter(Boolean)));
}
