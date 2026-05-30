import { prisma } from "@/lib/prisma";
import { normalizeRoleKey } from "@/lib/permissions";
import { getUserPositionIds, getUserDepartmentIds } from "./helpers";
import { getResourceAncestors } from "./resource";
import type { PermissionContext } from "./context";

function resolveRoleKeys(roleKey: string): string[] {
  const normalized = normalizeRoleKey(roleKey);
  // 权限层级：admin > delete > write > access
  // resolveRoleKeys(roleKey): 拥有哪些角色的用户，自动拥有 roleKey
  if (normalized === "admin") return ["admin"];                       // 只有 admin 才含 admin
  if (normalized === "delete") return ["admin", "delete"];            // admin 隐含 delete
  if (normalized === "write") return ["admin", "delete", "write"];    // admin/delete 隐含 write
  return ["admin", "delete", "write", "access"];                      // 所有角色都隐含 access
}

export async function checkPermission(
  userId: number,
  resourceKey: string,
  roleKey: string,
): Promise<boolean> {
  // 0. system.admin bypass (skip if already checking system.admin itself)
  if (!(resourceKey === "system" && normalizeRoleKey(roleKey) === "admin")) {
    const isSysAdmin = await checkPermission(userId, "system", "admin");
    if (isSysAdmin) return true;
  }

  // 1. Resolve resource
  const resource = await prisma.resource.findUnique({
    where: { key: resourceKey },
    select: { id: true },
  });
  if (!resource) return false;

  // 2. Check this resource AND all its ancestors (父资源覆盖子资源)
  const resourceIds = await getResourceAncestors(resource.id);
  const roleKeys = resolveRoleKeys(roleKey);

  // 2a. 运行时上限：即使有 grant，超过 maxRoleKey 也拒绝
  const { isRoleAllowedForResource } = await import("./maxRole");
  const withinMax = await isRoleAllowedForResource(resourceKey, roleKey);
  if (!withinMax) return false;

  const userGrant = await prisma.userResourceRole.findFirst({
    where: {
      userId,
      resourceId: { in: resourceIds },
      role: { key: { in: roleKeys } },
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
      },
    });
    if (deptGrant) return true;
  }

  return false;
}

export async function checkPermissionWithContext(
  ctx: PermissionContext,
  resourceKey: string,
  roleKey: string,
): Promise<boolean> {
  if (ctx.isAdmin && !(resourceKey === "system" && normalizeRoleKey(roleKey) === "admin")) return true;

  const resource = await prisma.resource.findUnique({
    where: { key: resourceKey },
    select: { id: true },
  });
  if (!resource) return false;

  const resourceIds = await getResourceAncestors(resource.id);
  const roleKeys = resolveRoleKeys(roleKey);

  const { isRoleAllowedForResource: isWithinMaxCtx } = await import("./maxRole");
  if (!(await isWithinMaxCtx(resourceKey, roleKey))) return false;

  const userGrant = await prisma.userResourceRole.findFirst({
    where: {
      userId: ctx.userId,
      resourceId: { in: resourceIds },
      role: { key: { in: roleKeys } },
    },
  });
  if (userGrant) return true;

  if (ctx.positionIds.length > 0) {
    const positionGrant = await prisma.positionResourceRole.findFirst({
      where: {
        positionId: { in: ctx.positionIds },
        resourceId: { in: resourceIds },
        role: { key: { in: roleKeys } },
      },
    });
    if (positionGrant) return true;
  }

  if (ctx.departmentIds.length > 0) {
    const deptGrant = await prisma.departmentResourceRole.findFirst({
      where: {
        departmentId: { in: ctx.departmentIds },
        resourceId: { in: resourceIds },
        role: { key: { in: roleKeys } },
      },
    });
    if (deptGrant) return true;
  }

  return false;
}
