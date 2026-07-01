import "server-only";

import type { PermissionActionSource } from "../permission-actions";
import type { BusinessSpaceRole } from "../permissions";
import { currentOpenEndedDateWhere } from "./fk-registry";
import { prisma } from "./prisma";

export type NaturalBusinessSpacePermission = {
  userId: number;
  userName: string;
  role: BusinessSpaceRole;
  sourceLabel: string;
  actionSource: PermissionActionSource;
};

const ADMINISTRATIVE_DEPARTMENT_CODES = ["FUN101", "FUN100"];

const userSelect = {
  id: true,
  nickname: true,
  username: true,
  employees: { select: { name: true }, take: 1 },
} as const;

export async function isActiveDepartmentMember(userId: number, departmentId: number) {
  const employee = await prisma.employee.findFirst({
    where: {
      userId,
      employments: { some: { isActive: true } },
      positions: { some: currentOpenEndedDateWhere({ departmentId }) },
    },
    select: { id: true },
  });
  return Boolean(employee);
}

export async function isActiveEmployeeUser(userId: number) {
  const employee = await prisma.employee.findFirst({
    where: {
      userId,
      employments: { some: { isActive: true } },
    },
    select: { id: true },
  });
  return Boolean(employee);
}

export async function isActivePositionUser(userId: number, positionId: number) {
  const employee = await prisma.employee.findFirst({
    where: {
      userId,
      employments: { some: { isActive: true } },
      positions: { some: currentOpenEndedDateWhere({ positionId }) },
    },
    select: { id: true },
  });
  return Boolean(employee);
}

export async function isActiveNamedPositionUser(userId: number, names: string[]) {
  const employee = await prisma.employee.findFirst({
    where: {
      userId,
      employments: { some: { isActive: true } },
      positions: {
        some: currentOpenEndedDateWhere({
          position: {
            isArchived: false,
            OR: names.flatMap((name) => [
              { name },
              { alias: { contains: name } },
            ]),
          },
        }),
      },
    },
    select: { id: true },
  });
  return Boolean(employee);
}

export async function isAdministrativeResponsibleUser(userId: number) {
  const departments = await getAdministrativeDepartments();
  if (departments.length === 0) return false;
  const managerPositionIds = departments
    .map((department) => department.managerPositionId)
    .filter((id): id is number => Boolean(id));
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

export async function listActiveEmployeeUsers(
  role: BusinessSpaceRole,
  sourceLabel: string,
  actionSource: PermissionActionSource = "implicit",
) {
  const employees = await prisma.employee.findMany({
    where: {
      userId: { not: null },
      employments: { some: { isActive: true } },
    },
    select: {
      name: true,
      userId: true,
      user: { select: userSelect },
    },
    orderBy: { employeeId: "asc" },
  });
  return employees.flatMap((employee) => {
    if (!employee.userId || !employee.user) return [];
    return [{
      userId: employee.userId,
      userName: employee.name || userName(employee.user),
      role,
      sourceLabel,
      actionSource,
    }];
  });
}

export async function listActiveDepartmentUsers(
  departmentId: number,
  role: BusinessSpaceRole,
  sourceLabel: string,
  actionSource: PermissionActionSource = "department",
) {
  const employees = await prisma.employee.findMany({
    where: {
      userId: { not: null },
      employments: { some: { isActive: true } },
      positions: { some: currentOpenEndedDateWhere({ departmentId }) },
    },
    select: {
      name: true,
      userId: true,
      user: { select: userSelect },
    },
    orderBy: { employeeId: "asc" },
  });
  return employees.flatMap((employee) => {
    if (!employee.userId || !employee.user) return [];
    return [{
      userId: employee.userId,
      userName: employee.name || userName(employee.user),
      role,
      sourceLabel,
      actionSource,
    }];
  });
}

export async function listNamedPositionUsers(
  names: string[],
  role: BusinessSpaceRole,
  sourceLabel: string,
  actionSource: PermissionActionSource = "position",
) {
  const employees = await prisma.employee.findMany({
    where: {
      userId: { not: null },
      employments: { some: { isActive: true } },
      positions: {
        some: currentOpenEndedDateWhere({
          position: {
            isArchived: false,
            OR: names.flatMap((name) => [
              { name },
              { alias: { contains: name } },
            ]),
          },
        }),
      },
    },
    select: {
      name: true,
      userId: true,
      user: { select: userSelect },
    },
    orderBy: { employeeId: "asc" },
  });
  return employees.flatMap((employee) => {
    if (!employee.userId || !employee.user) return [];
    return [{
      userId: employee.userId,
      userName: employee.name || userName(employee.user),
      role,
      sourceLabel,
      actionSource,
    }];
  });
}

export async function listAdministrativeResponsibleUsers(
  role: BusinessSpaceRole,
  sourceLabel: string,
  actionSource: PermissionActionSource = "position",
) {
  const departments = await getAdministrativeDepartments();
  if (departments.length === 0) return [];
  const managerPositionIds = departments
    .map((department) => department.managerPositionId)
    .filter((id): id is number => Boolean(id));
  if (managerPositionIds.length === 0) return [];
  const employees = await prisma.employee.findMany({
    where: {
      userId: { not: null },
      employments: { some: { isActive: true } },
      positions: {
        some: currentOpenEndedDateWhere({
          positionId: { in: managerPositionIds },
        }),
      },
    },
    select: {
      name: true,
      userId: true,
      user: { select: userSelect },
    },
    orderBy: { employeeId: "asc" },
  });
  return employees.flatMap((employee) => {
    if (!employee.userId || !employee.user) return [];
    return [{
      userId: employee.userId,
      userName: employee.name || userName(employee.user),
      role,
      sourceLabel,
      actionSource,
    }];
  });
}

function getAdministrativeDepartments() {
  return prisma.department.findMany({
    where: {
      isArchived: false,
      OR: [
        { code: { in: ADMINISTRATIVE_DEPARTMENT_CODES } },
        { name: { contains: "行政" } },
      ],
    },
    select: { id: true, managerPositionId: true },
  });
}

function userName(user: { nickname: string; username: string | null; employees?: Array<{ name: string }> }) {
  return user.employees?.[0]?.name || user.nickname || user.username || "未命名用户";
}
