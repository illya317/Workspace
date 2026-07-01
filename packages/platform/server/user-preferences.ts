import { randomBytes } from "node:crypto";

import { isRootAdminUser } from "./auth/root";
import { currentOpenEndedDateWhere } from "./fk-registry";
import { prisma } from "./prisma";

export const MAX_PREFERRED_DEPARTMENTS = 3;

export interface RoutineItem {
  plan: string;
  nextGoal?: string;
}

export interface PreferredDepartmentOption {
  id: number;
  name: string;
  code: string;
}

function generateApiKey(): string {
  return randomBytes(24).toString("hex");
}

function parseRoutineItems(value: string | null): RoutineItem[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is RoutineItem => (
        item &&
        typeof item === "object" &&
        typeof item.plan === "string" &&
        (item.nextGoal === undefined || typeof item.nextGoal === "string")
      ));
  } catch {
    return [];
  }
}

function parsePreferredDepartmentIds(value: string | null): number[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<number>();
    const ids: number[] = [];
    for (const item of parsed) {
      const id = typeof item === "number" ? item : Number(item);
      if (!Number.isInteger(id) || id <= 0 || seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
      if (ids.length >= MAX_PREFERRED_DEPARTMENTS) break;
    }
    return ids;
  } catch {
    return [];
  }
}

export async function getUserApiKey(userId: number) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { apiKey: true },
  });
  return user?.apiKey || null;
}

export async function rotateUserApiKey(userId: number) {
  const apiKey = generateApiKey();
  await prisma.user.update({
    where: { id: userId },
    data: { apiKey },
  });
  return apiKey;
}

export async function getUserRoutineItems(userId: number): Promise<RoutineItem[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { routineItems: true },
  });
  return parseRoutineItems(user?.routineItems ?? null);
}

export async function updateUserRoutineItems(userId: number, routineItems: RoutineItem[]) {
  await prisma.user.update({
    where: { id: userId },
    data: { routineItems: JSON.stringify(routineItems) },
  });
}

export async function listUserAvailableDepartments(userId: number): Promise<PreferredDepartmentOption[]> {
  if (await isRootAdminUser(userId)) {
    return prisma.department.findMany({
      where: { isArchived: false },
      select: { id: true, name: true, code: true },
      orderBy: [{ code: "asc" }, { id: "asc" }],
    });
  }

  const [employeeDepartments, managedDepartments, taskAssignees, explicitTaskPermissions, explicitTemplatePermissions] = await Promise.all([
    prisma.employee.findMany({
      where: {
        userId,
        employments: { some: { isActive: true } },
        positions: { some: currentOpenEndedDateWhere({ departmentId: { not: null } }) },
      },
      select: {
        positions: {
          where: currentOpenEndedDateWhere({ departmentId: { not: null } }),
          select: { department: { select: { id: true, name: true, code: true, isArchived: true } } },
        },
      },
    }),
    prisma.department.findMany({
      where: { managerUserId: userId, isArchived: false },
      select: { id: true, name: true, code: true },
    }),
    prisma.departmentWorkAssignee.findMany({
      where: { userId },
      select: { department: { select: { id: true, name: true, code: true, isArchived: true } } },
    }),
    prisma.workScopePermission.findMany({
      where: { userId, targetType: "department" },
      select: { targetId: true },
    }),
    prisma.documentTemplateSpacePermission.findMany({
      where: { userId, targetType: "department" },
      select: { targetId: true },
    }),
  ]);

  const explicitIds = Array.from(new Set([
    ...explicitTaskPermissions.map((item) => item.targetId),
    ...explicitTemplatePermissions.map((item) => item.targetId),
  ]));
  const explicitDepartments = explicitIds.length ? await prisma.department.findMany({
    where: { id: { in: explicitIds }, isArchived: false },
    select: { id: true, name: true, code: true },
  }) : [];

  const byId = new Map<number, PreferredDepartmentOption>();
  const addDepartment = (department: PreferredDepartmentOption & { isArchived?: boolean }) => {
    if (department.isArchived) return;
    byId.set(department.id, { id: department.id, name: department.name, code: department.code });
  };
  employeeDepartments.forEach((employee) => {
    employee.positions.forEach((position) => {
      if (position.department) addDepartment(position.department);
    });
  });
  managedDepartments.forEach(addDepartment);
  taskAssignees.forEach((assignee) => addDepartment(assignee.department));
  explicitDepartments.forEach(addDepartment);

  return Array.from(byId.values()).sort((left, right) => left.code.localeCompare(right.code) || left.id - right.id);
}

export async function getUserPreferredDepartmentIds(userId: number): Promise<number[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { preferredDepartmentIds: true },
  });
  return parsePreferredDepartmentIds(user?.preferredDepartmentIds ?? null);
}

export async function getUserPreferredDepartmentSettings(userId: number) {
  const [departments, preferredDepartmentIds] = await Promise.all([
    listUserAvailableDepartments(userId),
    getUserPreferredDepartmentIds(userId),
  ]);
  const availableIds = new Set(departments.map((department) => department.id));
  return {
    departments,
    preferredDepartmentIds: preferredDepartmentIds.filter((id) => availableIds.has(id)),
    maxPreferredDepartments: MAX_PREFERRED_DEPARTMENTS,
  };
}

export async function updateUserPreferredDepartmentIds(userId: number, departmentIds: number[]) {
  const nextIds = Array.from(new Set(departmentIds))
    .filter((id) => Number.isInteger(id) && id > 0)
    .slice(0, MAX_PREFERRED_DEPARTMENTS);
  const departments = await listUserAvailableDepartments(userId);
  const availableIds = new Set(departments.map((department) => department.id));
  if (nextIds.some((id) => !availableIds.has(id))) {
    throw new Error("不能选择无权访问的部门");
  }
  await prisma.user.update({
    where: { id: userId },
    data: { preferredDepartmentIds: JSON.stringify(nextIds) },
  });
  return nextIds;
}
