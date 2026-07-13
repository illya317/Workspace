import "server-only";

import type { NaturalSpaceActionProfile } from "../permission-natural-space-actions";
import type { PermissionActionSource } from "../permission-actions";
import { currentOpenEndedDateWhere } from "./fk-registry";
import { prisma } from "./prisma";

export type NaturalBusinessSpacePermission = {
  userId: number;
  userName: string;
  actionProfile: NaturalSpaceActionProfile;
  sourceLabel: string;
  actionSource: PermissionActionSource;
};

const ADMINISTRATIVE_DEPARTMENT_CODES = ["FUN101", "FUN100"];

const userSelect = {
  id: true,
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
              { alias: { contains: name, mode: "insensitive" as const } },
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
  actionProfile: NaturalSpaceActionProfile,
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
      userName: employee.name || "未绑定员工",
      actionProfile,
      sourceLabel,
      actionSource,
    }];
  });
}

export async function listActiveDepartmentUsers(
  departmentId: number,
  actionProfile: NaturalSpaceActionProfile,
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
      actionProfile,
      sourceLabel,
      actionSource,
    }];
  });
}

export async function listDepartmentResponsibleUserIds(departmentId: number) {
  const department = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { managerPositionId: true, managerEmployees: { select: { employee: { select: { userId: true, employments: { where: { isActive: true }, select: { id: true }, take: 1 } } } } } },
  });
  if (department?.managerEmployees.length) {
    return Array.from(new Set(department.managerEmployees.flatMap((manager) => manager.employee.userId && manager.employee.employments.length > 0 ? [manager.employee.userId] : [])));
  }
  if (!department?.managerPositionId) return [];
  const employees = await prisma.employee.findMany({
    where: {
      userId: { not: null },
      employments: { some: { isActive: true } },
      positions: { some: currentOpenEndedDateWhere({ positionId: department.managerPositionId }) },
    },
    select: { userId: true },
    orderBy: { employeeId: "asc" },
  });
  return Array.from(new Set(employees.flatMap((employee) => employee.userId ? [employee.userId] : [])));
}

export async function listDirectManagerUserIds(userId: number) {
  const employees = await prisma.employee.findMany({
    where: {
      userId,
      employments: { some: { isActive: true } },
    },
    select: {
      positions: {
        where: currentOpenEndedDateWhere({}),
        select: { reportTo: true },
      },
    },
  });
  const reportToValues = Array.from(new Set(
    employees
      .flatMap((employee) => employee.positions.map((position) => String(position.reportTo || "").trim()))
      .filter(Boolean),
  ));
  if (reportToValues.length === 0) return [];

  const managers = await prisma.employee.findMany({
    where: {
      userId: { not: null },
      employments: { some: { isActive: true } },
      OR: [
        { name: { in: reportToValues } },
        { employeeId: { in: reportToValues } },
      ],
    },
    select: { userId: true },
    orderBy: { employeeId: "asc" },
  });
  return Array.from(new Set(managers.flatMap((employee) => employee.userId ? [employee.userId] : [])));
}

export async function listNamedPositionUsers(
  names: string[],
  actionProfile: NaturalSpaceActionProfile,
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
              { alias: { contains: name, mode: "insensitive" as const } },
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
      actionProfile,
      sourceLabel,
      actionSource,
    }];
  });
}

export async function listAdministrativeResponsibleUsers(
  actionProfile: NaturalSpaceActionProfile,
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
      actionProfile,
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
        { name: { contains: "行政", mode: "insensitive" } },
      ],
    },
    select: { id: true, managerPositionId: true },
  });
}

function userName(user: { employees?: Array<{ name: string }> }) {
  return user.employees?.[0]?.name || "未绑定员工";
}
