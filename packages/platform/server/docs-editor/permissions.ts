import "server-only";

import { authorize } from "../auth/authorize";
import { isRootAdminUser } from "../auth/root";
import { prisma } from "../prisma";
import {
  businessSpaceRoleAllows,
  maxBusinessSpaceRole,
  normalizeBusinessSpaceRole,
  type BusinessSpaceRole,
} from "../../permissions";
import type {
  DocsEditorSpaceRow,
} from "./db";
import type {
  DocsEditorPermissionRole,
  DocsEditorSpaceKind,
} from "./types";

export type DepartmentContext = {
  id: number;
  name: string;
  code: string;
  managerUserId: number | null;
  isArchived: boolean;
};

export type CompanyContext = {
  id: number;
  name: string;
};

export type DocsEditorSpaceTargetType = DocsEditorSpaceKind;

const DOCS_EDITOR_PERMISSION_KIND = "template";

function asDocsRole(role: BusinessSpaceRole | null): DocsEditorPermissionRole | null {
  return role as DocsEditorPermissionRole | null;
}

export function normalizeDocsEditorRole(role: string | null | undefined): DocsEditorPermissionRole {
  return normalizeBusinessSpaceRole(role) as DocsEditorPermissionRole;
}

export function maxDocsEditorRole(
  left: DocsEditorPermissionRole | null,
  right: DocsEditorPermissionRole | null,
): DocsEditorPermissionRole | null {
  return asDocsRole(maxBusinessSpaceRole(left, right));
}

export function isDocsEditorRoleAtLeast(
  actual: DocsEditorPermissionRole | null,
  required: DocsEditorPermissionRole,
) {
  return businessSpaceRoleAllows(actual, required);
}

export async function hasDocsEditorAdmin(userId: number) {
  if (await isRootAdminUser(userId)) return true;
  return authorize({
    user: userId,
    resourceKey: "docs.editor",
    action: "admin",
  });
}

export async function getUserDepartmentContexts(userId: number): Promise<DepartmentContext[]> {
  const employeeIds = await getUserEmployeeIds(userId);
  if (employeeIds.length === 0) return [];
  const rows = await prisma.eDP.findMany({
    where: {
      employeeId: { in: employeeIds },
      departmentId: { not: null },
      department: { isArchived: false },
    },
    select: {
      department: {
        select: {
          id: true,
          name: true,
          code: true,
          managerUserId: true,
          isArchived: true,
        },
      },
    },
  });
  const byId = new Map<number, DepartmentContext>();
  for (const row of rows) {
    if (row.department) byId.set(row.department.id, row.department);
  }
  return Array.from(byId.values());
}

export async function getAllDepartmentContexts(): Promise<DepartmentContext[]> {
  return prisma.department.findMany({
    select: { id: true, name: true, code: true, managerUserId: true, isArchived: true },
    orderBy: [{ isArchived: "asc" }, { code: "asc" }, { id: "asc" }],
  });
}

export async function getDepartmentContext(departmentId: number): Promise<DepartmentContext | null> {
  const department = await prisma.department.findFirst({
    where: { id: departmentId },
    select: { id: true, name: true, code: true, managerUserId: true, isArchived: true },
  });
  return department;
}

export async function getQcDepartmentContext(): Promise<DepartmentContext | null> {
  const byCode = await prisma.department.findFirst({
    where: { code: "FUN701", isArchived: false },
    select: { id: true, name: true, code: true, managerUserId: true, isArchived: true },
  });
  if (byCode) return byCode;
  return prisma.department.findFirst({
    where: { name: "质量控制部", isArchived: false },
    select: { id: true, name: true, code: true, managerUserId: true, isArchived: true },
  });
}

export async function getGroupCompanyContext(): Promise<CompanyContext | null> {
  return prisma.company.findFirst({
    where: {
      isActive: true,
      childOfRelations: { none: {} },
      parentOfRelations: { some: {} },
    },
    select: { id: true, name: true },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
}

export async function getDocsEditorSpaceRole(
  userId: number,
  targetTypeInput: string,
  targetId: number,
): Promise<DocsEditorPermissionRole | null> {
  const targetType = normalizeDocsEditorTargetType(targetTypeInput);
  const [natural, explicit] = await Promise.all([
    naturalDocsEditorSpaceRole(userId, targetType, targetId),
    explicitDocsEditorSpaceRole(userId, targetType, targetId),
  ]);
  return asDocsRole(maxBusinessSpaceRole(natural, explicit));
}

export async function resolveSpaceRole(
  userId: number,
  space: DocsEditorSpaceRow,
): Promise<DocsEditorPermissionRole | null> {
  return getDocsEditorSpaceRole(userId, space.targetType, space.targetId);
}

export async function resolveTemplateRole(input: {
  userId: number;
  template: unknown;
  space: DocsEditorSpaceRow | null;
}): Promise<DocsEditorPermissionRole | null> {
  if (!input.space) return null;
  return resolveSpaceRole(input.userId, input.space);
}

export async function canPublishOfficialQcTemplate(userId: number) {
  return hasDocsEditorAdmin(userId);
}

export async function listNaturalDocsEditorManagers(targetType: string, targetId: number) {
  if (targetType === "personal") {
    const user = await prisma.user.findUnique({ where: { id: targetId }, select: userSelect });
    return user ? [{ userId: user.id, userName: userName(user) }] : [];
  }
  if (targetType === "department") {
    const department = await prisma.department.findUnique({
      where: { id: targetId },
      select: { managerUserId: true },
    });
    if (!department?.managerUserId) return [];
    const user = await prisma.user.findUnique({ where: { id: department.managerUserId }, select: userSelect });
    return user ? [{ userId: user.id, userName: userName(user) }] : [];
  }
  return [];
}

export async function getActorDocsEditorAdmin(userId: number) {
  if (!(await hasDocsEditorAdmin(userId))) return null;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: userSelect });
  return user ? { userId: user.id, userName: userName(user) } : null;
}

export async function loadDocsEditorPermissionUsers(userIds: number[]) {
  if (userIds.length === 0) return new Map<number, string>();
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: userSelect,
  });
  return new Map(users.map((user) => [user.id, userName(user)]));
}

export function docsEditorPermissionKind() {
  return DOCS_EDITOR_PERMISSION_KIND;
}

function normalizeDocsEditorTargetType(value: string): DocsEditorSpaceTargetType {
  if (value === "company" || value === "department" || value === "personal") return value;
  return "department";
}

async function explicitDocsEditorSpaceRole(
  userId: number,
  targetType: DocsEditorSpaceTargetType,
  targetId: number,
): Promise<DocsEditorPermissionRole | null> {
  const rows = await prisma.documentTemplateSpacePermission.findMany({
    where: { userId, targetType, targetId, kind: DOCS_EDITOR_PERMISSION_KIND },
    select: { role: true },
  });
  return rows.reduce<DocsEditorPermissionRole | null>((best, row) => {
    const role = normalizeDocsEditorRole(row.role);
    return maxDocsEditorRole(best, role);
  }, null);
}

async function naturalDocsEditorSpaceRole(
  userId: number,
  targetType: DocsEditorSpaceTargetType,
  targetId: number,
): Promise<DocsEditorPermissionRole | null> {
  if (targetType === "personal") return targetId === userId ? "manager" : null;
  if (await hasDocsEditorAdmin(userId)) return "manager";

  if (targetType === "department") {
    const department = await prisma.department.findUnique({
      where: { id: targetId },
      select: { managerUserId: true },
    });
    if (department?.managerUserId === userId) return "manager";
    return await isMemberOfDepartment(userId, targetId) ? "viewer" : null;
  }

  return null;
}

async function isMemberOfDepartment(userId: number, departmentId: number) {
  const employeeIds = await getUserEmployeeIds(userId);
  if (employeeIds.length === 0) return false;
  const edp = await prisma.eDP.findFirst({
    where: { employeeId: { in: employeeIds }, departmentId },
    select: { id: true },
  });
  return Boolean(edp);
}

async function getUserEmployeeIds(userId: number) {
  const employees = await prisma.employee.findMany({
    where: { userId },
    select: { id: true },
  });
  return employees.map((employee) => employee.id);
}

const userSelect = {
  id: true,
  nickname: true,
  username: true,
  employees: { select: { name: true }, take: 1 },
} as const;

function userName(user: { nickname: string; username: string | null; employees?: Array<{ name: string }> }) {
  return user.employees?.[0]?.name || user.nickname || user.username || "未命名用户";
}
