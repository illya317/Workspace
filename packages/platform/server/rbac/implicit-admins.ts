import { RESOURCE_KEYS } from "@workspace/platform/resources";
import { isResourceEnabled } from "@workspace/platform/effective-module-registry";
import { currentOpenEndedDateWhere } from "../relation-registry";
import { prisma, type Prisma } from "../prisma";
import { WORKFLOW_MANAGEMENT_ROOT_RESOURCE_KEY } from "../../workflow-management-resources";

export const IMPLICIT_ALL_ADMIN_EMPLOYEE_IDS = ["00001"] as const;
const IMPLICIT_GRANT_DEPARTMENT_KEYWORDS = ["IT", "信息"] as const;
type PermissionDatabaseClient = Prisma.TransactionClient | typeof prisma;

export async function isImplicitAllResourceAdminUser(userId: number, client: PermissionDatabaseClient = prisma) {
  const employee = await client.employee.findFirst({
    where: {
      userId,
      employeeId: { in: [...IMPLICIT_ALL_ADMIN_EMPLOYEE_IDS] },
      employments: { some: { isActive: true } },
    },
    select: { id: true },
  });
  return Boolean(employee);
}

async function getAllActiveResourceIds(client: PermissionDatabaseClient) {
  const resources = await client.resource.findMany({
    where: { key: { in: RESOURCE_KEYS.filter((key) => isResourceEnabled(key)) } },
    select: { id: true },
  });
  return resources.map((resource) => resource.id);
}

export async function getImplicitAdminResourceIdsForUser(userId: number, client: PermissionDatabaseClient = prisma) {
  if (await isImplicitAllResourceAdminUser(userId, client)) {
    return getAllActiveResourceIds(client);
  }
  if (await isImplicitAllResourceGrantUser(userId, client)) {
    const workflowRoot = await client.resource.findUnique({
      where: { key: WORKFLOW_MANAGEMENT_ROOT_RESOURCE_KEY },
      select: { id: true },
    });
    return workflowRoot ? [workflowRoot.id] : [];
  }
  return [];
}

export async function hasImplicitAdminForResourceIds(userId: number, resourceIds: number[], client: PermissionDatabaseClient = prisma) {
  const implicitAdminResourceIds = await getImplicitAdminResourceIdsForUser(userId, client);
  if (implicitAdminResourceIds.length === 0) return false;
  const resourceIdSet = new Set(resourceIds);
  return implicitAdminResourceIds.some((resourceId) => resourceIdSet.has(resourceId));
}

export async function getImplicitGrantManagerPositionIds(client: PermissionDatabaseClient = prisma) {
  const departments = await client.department.findMany({
    where: {
      isArchived: false,
      OR: IMPLICIT_GRANT_DEPARTMENT_KEYWORDS.flatMap((keyword) => [
        { name: { contains: keyword, mode: "insensitive" } },
        { alias: { contains: keyword, mode: "insensitive" } },
        { code: { contains: keyword, mode: "insensitive" } },
      ]),
    },
    select: { managerPositionId: true },
  });
  return Array.from(new Set(
    departments
      .map((department) => department.managerPositionId)
      .filter((id): id is number => Boolean(id)),
  ));
}

export async function isImplicitAllResourceGrantUser(userId: number, client: PermissionDatabaseClient = prisma) {
  const managerPositionIds = await getImplicitGrantManagerPositionIds(client);
  if (managerPositionIds.length === 0) return false;
  const employee = await client.employee.findFirst({
    where: {
      userId,
      employments: { some: { isActive: true } },
      positions: {
        some: currentOpenEndedDateWhere({
          positionId: { in: managerPositionIds },
        }),
      },
    },
    select: { id: true },
  });
  return Boolean(employee);
}

export async function getImplicitGrantResourceIdsForUser(userId: number, client: PermissionDatabaseClient = prisma) {
  if (await isImplicitAllResourceGrantUser(userId, client)) return getAllActiveResourceIds(client);
  return [];
}

export async function hasImplicitGrantForResourceIds(userId: number, resourceIds: number[], client: PermissionDatabaseClient = prisma) {
  const implicitGrantResourceIds = await getImplicitGrantResourceIdsForUser(userId, client);
  if (implicitGrantResourceIds.length === 0) return false;
  const resourceIdSet = new Set(resourceIds);
  return implicitGrantResourceIds.some((resourceId) => resourceIdSet.has(resourceId));
}
