import { prisma } from "@/lib/prisma";
import { getResourceDescendants } from "./resource";
import { getUserPositionIds, getUserDepartmentIds } from "./helpers";

/**
 * Find all resource IDs where the user (or their positions/departments)
 * has been granted the "admin" role directly.
 */
async function findAdminResourceIds(userId: number): Promise<number[]> {
  const [direct, position, department] = await Promise.all([
    prisma.userResourceRole.findMany({
      where: { userId, role: { key: "admin" } },
      select: { resourceId: true },
    }),
    (async () => {
      const posIds = await getUserPositionIds(userId);
      if (posIds.length === 0) return [] as Array<{ resourceId: number }>;
      return prisma.positionResourceRole.findMany({
        where: { positionId: { in: posIds }, role: { key: "admin" } },
        select: { resourceId: true },
      });
    })(),
    (async () => {
      const deptIds = await getUserDepartmentIds(userId);
      if (deptIds.length === 0) return [] as Array<{ resourceId: number }>;
      return prisma.departmentResourceRole.findMany({
        where: { departmentId: { in: deptIds }, role: { key: "admin" } },
        select: { resourceId: true },
      });
    })(),
  ]);

  return [
    ...new Set([
      ...direct.map((r) => r.resourceId),
      ...position.map((r) => r.resourceId),
      ...department.map((r) => r.resourceId),
    ]),
  ];
}

/**
 * Return all resource keys this user is allowed to manage grants for.
 * Includes the admin resource itself and all its descendants.
 */
export async function getManageableResourceKeys(userId: number): Promise<Set<string>> {
  // system.admin can manage everything
  const sysAdmin = await prisma.userResourceRole.findFirst({
    where: { userId, resource: { key: "system" }, role: { key: "admin" } },
  });
  if (sysAdmin) {
    const all = await prisma.resource.findMany({ select: { key: true } });
    return new Set(all.map((r) => r.key));
  }

  const adminResourceIds = await findAdminResourceIds(userId);
  const manageableIds = new Set<number>();

  for (const rid of adminResourceIds) {
    // Include the resource itself and all descendants
    const descendants = await getResourceDescendants(rid);
    for (const id of descendants) manageableIds.add(id);
  }

  const resources = await prisma.resource.findMany({
    where: { id: { in: [...manageableIds] } },
    select: { key: true },
  });

  return new Set(resources.map((r) => r.key));
}

/**
 * Can this user manage grants for the given resourceKey + roleKey?
 */
export async function canManageResourceGrant(
  userId: number,
  resourceKey: string,
  roleKey: string
): Promise<boolean> {
  const normalizedRole = roleKey === "read" ? "access" : roleKey;

  // Only system.admin can manage system.* or grant system.admin
  const isSystemScope = resourceKey === "system" || resourceKey.startsWith("system.");
  const isGrantingSystemAdmin = resourceKey === "system" && normalizedRole === "admin";

  const manageable = await getManageableResourceKeys(userId);

  if (isSystemScope || isGrantingSystemAdmin) {
    // Must be system.admin
    return manageable.has("system"); // system.admin implies manageable has "system"
  }

  return manageable.has(resourceKey);
}
