import { RESOURCE_KEYS } from "@workspace/platform/resources";
import { isResourceEnabled } from "@workspace/platform/effective-module-registry";
import { currentOpenEndedDateWhere } from "../fk-registry";
import { prisma } from "../prisma";

export const IMPLICIT_ALL_ADMIN_POSITION_NAME = "董事长";

export async function isImplicitAllResourceAdminUser(userId: number) {
  const employee = await prisma.employee.findFirst({
    where: {
      userId,
      employments: { some: { isActive: true } },
      positions: {
        some: currentOpenEndedDateWhere({
          position: {
              OR: [
                { name: IMPLICIT_ALL_ADMIN_POSITION_NAME },
                { alias: IMPLICIT_ALL_ADMIN_POSITION_NAME },
              ],
              isArchived: false,
            },
        }),
      },
    },
    select: { id: true },
  });
  return Boolean(employee);
}

export async function getImplicitAdminResourceIdsForUser(userId: number) {
  if (await isImplicitAllResourceAdminUser(userId)) {
    const resources = await prisma.resource.findMany({
      where: { key: { in: RESOURCE_KEYS.filter((key) => isResourceEnabled(key)) } },
      select: { id: true },
    });
    return resources.map((resource) => resource.id);
  }
  return [];
}

export async function hasImplicitAdminForResourceIds(userId: number, resourceIds: number[]) {
  const implicitAdminResourceIds = await getImplicitAdminResourceIdsForUser(userId);
  if (implicitAdminResourceIds.length === 0) return false;
  const resourceIdSet = new Set(resourceIds);
  return implicitAdminResourceIds.some((resourceId) => resourceIdSet.has(resourceId));
}
