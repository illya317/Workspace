import { RESOURCE_KEYS } from "@workspace/platform/resources";
import { isResourceEnabled } from "@workspace/platform/effective-module-registry";
import { currentOpenEndedDateWhere } from "../fk-registry";
import { prisma } from "../prisma";
import { WORKFLOW_MANAGEMENT_ROOT_RESOURCE_KEY } from "../../workflow-management-resources";

export const IMPLICIT_ALL_ADMIN_EMPLOYEE_IDS = ["00001"] as const;
const IMPLICIT_GRANT_DEPARTMENT_KEYWORDS = ["IT", "信息"] as const;

export async function isImplicitAllResourceAdminUser(userId: number) {
  const employee = await prisma.employee.findFirst({
    where: {
      userId,
      employeeId: { in: [...IMPLICIT_ALL_ADMIN_EMPLOYEE_IDS] },
      employments: { some: { isActive: true } },
    },
    select: { id: true },
  });
  return Boolean(employee);
}

async function getAllActiveResourceIds() {
  const resources = await prisma.resource.findMany({
    where: { key: { in: RESOURCE_KEYS.filter((key) => isResourceEnabled(key)) } },
    select: { id: true },
  });
  return resources.map((resource) => resource.id);
}

export async function getImplicitAdminResourceIdsForUser(userId: number) {
  if (await isImplicitAllResourceAdminUser(userId)) {
    return getAllActiveResourceIds();
  }
  if (await isImplicitAllResourceGrantUser(userId)) {
    const workflowRoot = await prisma.resource.findUnique({
      where: { key: WORKFLOW_MANAGEMENT_ROOT_RESOURCE_KEY },
      select: { id: true },
    });
    return workflowRoot ? [workflowRoot.id] : [];
  }
  return [];
}

export async function hasImplicitAdminForResourceIds(userId: number, resourceIds: number[]) {
  const implicitAdminResourceIds = await getImplicitAdminResourceIdsForUser(userId);
  if (implicitAdminResourceIds.length === 0) return false;
  const resourceIdSet = new Set(resourceIds);
  return implicitAdminResourceIds.some((resourceId) => resourceIdSet.has(resourceId));
}

export async function getImplicitGrantManagerPositionIds() {
  const departments = await prisma.department.findMany({
    where: {
      isArchived: false,
      OR: IMPLICIT_GRANT_DEPARTMENT_KEYWORDS.flatMap((keyword) => [
        { name: { contains: keyword } },
        { alias: { contains: keyword } },
        { code: { contains: keyword } },
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

export async function isImplicitAllResourceGrantUser(userId: number) {
  const managerPositionIds = await getImplicitGrantManagerPositionIds();
  if (managerPositionIds.length === 0) return false;
  const employee = await prisma.employee.findFirst({
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

export async function getImplicitGrantResourceIdsForUser(userId: number) {
  if (await isImplicitAllResourceGrantUser(userId)) return getAllActiveResourceIds();
  return [];
}

export async function hasImplicitGrantForResourceIds(userId: number, resourceIds: number[]) {
  const implicitGrantResourceIds = await getImplicitGrantResourceIdsForUser(userId);
  if (implicitGrantResourceIds.length === 0) return false;
  const resourceIdSet = new Set(resourceIds);
  return implicitGrantResourceIds.some((resourceId) => resourceIdSet.has(resourceId));
}
