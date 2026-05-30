/**
 * Scoped permission check — extends checkPermission with scopeId filtering.
 *
 * scopeId format:
 *   null               = global (applies to all targets)
 *   "department:<id>"  = scoped to a department's reports
 *   "user:<id>"        = scoped to a user's personal reports
 *
 * A grant with scopeId=null acts as a wildcard for all scopes.
 * A grant with scopeId="department:12" only applies to that department.
 */

import { prisma } from "@/lib/prisma";
import { normalizeRoleKey } from "@/lib/permissions";
import { getUserPositionIds, getUserDepartmentIds } from "./helpers";
import { getResourceAncestors } from "./resource";
import { isRoleAllowedForResource } from "./maxRole";
import { isSystemAdminBypassEnabled } from "./bypass";

function resolveRoleKeys(roleKey: string): string[] {
  const normalized = normalizeRoleKey(roleKey);
  if (normalized === "admin") return ["admin"];
  if (normalized === "delete") return ["admin", "delete"];
  if (normalized === "write") return ["admin", "delete", "write"];
  return ["admin", "delete", "write", "access"];
}

/**
 * Check if a user has a specific role on a resource, optionally scoped to a target.
 *
 * When scopeId is provided, grants with scopeId=null (global) OR exact scopeId
 * match are considered. When scopeId is null/undefined, only global grants match.
 */
export async function checkScopedPermission(
  userId: number,
  resourceKey: string,
  roleKey: string,
  scopeId?: string | null,
): Promise<boolean> {
  // 0. system.admin bypass (Batch 4 toggle)
  const isSelfCheck = resourceKey === "system" && normalizeRoleKey(roleKey) === "admin";
  if (!isSelfCheck) {
    const isSysAdmin = await prisma.userResourceRole.findFirst({
      where: { userId, resource: { key: "system" }, role: { key: "admin" } },
    });
    if (isSysAdmin) {
      if (resourceKey === "system" || resourceKey.startsWith("system.")) return true;
      if (await isSystemAdminBypassEnabled()) return true;
    }
  }

  // 1. Resolve resource
  const resource = await prisma.resource.findUnique({
    where: { key: resourceKey },
    select: { id: true },
  });
  if (!resource) return false;

  // 2. maxRoleKey runtime cap
  const normalized = normalizeRoleKey(roleKey);
  if (!(await isRoleAllowedForResource(resourceKey, normalized))) return false;

  // 3. Resource + ancestors
  const resourceIds = await getResourceAncestors(resource.id);
  const roleKeys = resolveRoleKeys(roleKey);

  // 4. Build scope filter: null=global-only, value=match global OR exact
  const scopeFilter = scopeId
    ? { OR: [{ scopeId: null }, { scopeId }] }
    : { scopeId: null };

  // 5. Check user → position → department grants
  const userGrant = await prisma.userResourceRole.findFirst({
    where: {
      userId,
      resourceId: { in: resourceIds },
      role: { key: { in: roleKeys } },
      ...scopeFilter,
    },
  });
  if (userGrant) return true;

  const posIds = await getUserPositionIds(userId);
  if (posIds.length > 0) {
    const positionGrant = await prisma.positionResourceRole.findFirst({
      where: {
        positionId: { in: posIds },
        resourceId: { in: resourceIds },
        role: { key: { in: roleKeys } },
        ...scopeFilter,
      },
    });
    if (positionGrant) return true;
  }

  const deptIds = await getUserDepartmentIds(userId);
  if (deptIds.length > 0) {
    const deptGrant = await prisma.departmentResourceRole.findFirst({
      where: {
        departmentId: { in: deptIds },
        resourceId: { in: resourceIds },
        role: { key: { in: roleKeys } },
        ...scopeFilter,
      },
    });
    if (deptGrant) return true;
  }

  return false;
}

/**
 * Build a scopeId string from target type and id.
 */
export function toScopeId(targetType: string, targetId: number): string {
  return `${targetType}:${targetId}`;
}

/**
 * Parse a scopeId string back into type and id.
 */
export function parseScopeId(scopeId: string): { type: string; id: number } | null {
  const idx = scopeId.lastIndexOf(":");
  if (idx <= 0) return null;
  const id = Number(scopeId.slice(idx + 1));
  if (!Number.isFinite(id)) return null;
  return { type: scopeId.slice(0, idx), id };
}
