import "server-only";

import type { PermissionActionKey } from "@workspace/platform/permission-actions";
import { authorize } from "../auth/authorize";
import { isRootAdminUser } from "../auth/root";
import {
  businessSpaceScopeId,
  getCompanyNaturalSpaceRole,
  getDepartmentNaturalSpaceRole,
  getOperatingCommitteeNaturalSpaceRole,
} from "../business-space-permissions";
import { currentOpenEndedDateWhere } from "../fk-registry";
import { prisma } from "../prisma";
import { evaluatePermissionAction } from "../rbac/action-grants";
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
  DocsEditorSpaceActionPermissions,
  DocsEditorSpaceKind,
} from "./types";
import {
  HR_POSITION_DESCRIPTION_DEPARTMENT_CODE,
  HR_POSITION_DESCRIPTION_DEPARTMENT_NAME,
} from "./official-templates";

export type DepartmentContext = {
  id: number;
  name: string;
  code: string;
  managerPositionId: number | null;
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

export function docsEditorScopeId(space: { targetType: string; targetId: number }) {
  return businessSpaceScopeId(normalizeDocsEditorTargetType(space.targetType), space.targetId);
}

async function hasDocsEditorScopedAction(
  userId: number,
  space: { targetType: string; targetId: number },
  actionKey: PermissionActionKey,
) {
  return evaluatePermissionAction(userId, "docs.editor", actionKey, {
    scopeId: docsEditorScopeId(space),
  });
}

export async function getDocsEditorScopedActionPermissions(
  userId: number,
  space: { targetType: string; targetId: number },
): Promise<DocsEditorSpaceActionPermissions> {
  const [role, canCreate, canWrite, canDelete, canExport, canAdmin] = await Promise.all([
    resolveSpaceRole(userId, space as DocsEditorSpaceRow),
    hasDocsEditorScopedAction(userId, space, "create"),
    hasDocsEditorScopedAction(userId, space, "write"),
    hasDocsEditorScopedAction(userId, space, "delete"),
    hasDocsEditorScopedAction(userId, space, "export"),
    hasDocsEditorScopedAction(userId, space, "admin"),
  ]);
  return {
    canCreate: isDocsEditorRoleAtLeast(role, "editor") || canCreate || canWrite || canDelete || canAdmin,
    canWrite: isDocsEditorRoleAtLeast(role, "editor") || canWrite || canDelete || canAdmin,
    canDelete: isDocsEditorRoleAtLeast(role, "delete") || canDelete || canAdmin,
    canExport: isDocsEditorRoleAtLeast(role, "viewer") || canExport || canAdmin,
  };
}

export async function canCreateDocsEditorTemplateAction(
  userId: number,
  space: DocsEditorSpaceRow,
  role?: DocsEditorPermissionRole | null,
) {
  const actualRole = role ?? await resolveSpaceRole(userId, space);
  return isDocsEditorRoleAtLeast(actualRole, "editor") ||
    await hasDocsEditorScopedAction(userId, space, "create");
}

export async function canWriteDocsEditorTemplateAction(
  userId: number,
  space: DocsEditorSpaceRow,
  role?: DocsEditorPermissionRole | null,
) {
  const actualRole = role ?? await resolveSpaceRole(userId, space);
  return isDocsEditorRoleAtLeast(actualRole, "editor") ||
    await hasDocsEditorScopedAction(userId, space, "write");
}

export async function canDeleteDocsEditorTemplateAction(
  userId: number,
  space: DocsEditorSpaceRow,
  role?: DocsEditorPermissionRole | null,
) {
  const actualRole = role ?? await resolveSpaceRole(userId, space);
  return isDocsEditorRoleAtLeast(actualRole, "delete") ||
    await hasDocsEditorScopedAction(userId, space, "delete");
}

export async function getUserDepartmentContexts(userId: number): Promise<DepartmentContext[]> {
  const [memberRows, managedRows] = await Promise.all([
    prisma.employee.findMany({
      where: {
        userId,
        employments: { some: { isActive: true } },
        positions: { some: currentOpenEndedDateWhere({ departmentId: { not: null }, department: { isArchived: false } }) },
      },
      select: {
        positions: {
          where: currentOpenEndedDateWhere({ departmentId: { not: null }, department: { isArchived: false } }),
          select: {
            department: {
              select: {
                id: true,
                name: true,
                code: true,
                managerPositionId: true,
                isArchived: true,
              },
            },
          },
        },
      },
    }),
    prisma.department.findMany({
      where: {
        isArchived: false,
        managerPosition: {
          edps: {
            some: currentOpenEndedDateWhere({
              employee: {
                userId,
                employments: { some: { isActive: true } },
              },
            }),
          },
        },
      },
      select: {
        id: true,
        name: true,
        code: true,
        managerPositionId: true,
        isArchived: true,
      },
    }),
  ]);
  const byId = new Map<number, DepartmentContext>();
  for (const row of memberRows) {
    for (const position of row.positions) {
      if (position.department) byId.set(position.department.id, position.department);
    }
  }
  for (const department of managedRows) {
    byId.set(department.id, department);
  }
  return Array.from(byId.values());
}

export async function getAllDepartmentContexts(): Promise<DepartmentContext[]> {
  return prisma.department.findMany({
    select: {
      id: true,
      name: true,
      code: true,
      managerPositionId: true,
      isArchived: true,
    },
    orderBy: [{ isArchived: "asc" }, { code: "asc" }, { id: "asc" }],
  });
}

export async function getDepartmentContext(departmentId: number): Promise<DepartmentContext | null> {
  const department = await prisma.department.findFirst({
    where: { id: departmentId },
    select: { id: true, name: true, code: true, managerPositionId: true, isArchived: true },
  });
  return department;
}

export async function getQcDepartmentContext(): Promise<DepartmentContext | null> {
  const byCode = await prisma.department.findFirst({
    where: { code: "FUN701", isArchived: false },
    select: { id: true, name: true, code: true, managerPositionId: true, isArchived: true },
  });
  if (byCode) return byCode;
  return prisma.department.findFirst({
    where: { name: "质量控制部", isArchived: false },
    select: { id: true, name: true, code: true, managerPositionId: true, isArchived: true },
  });
}

export async function getHrDepartmentContext(): Promise<DepartmentContext | null> {
  const byCode = await prisma.department.findFirst({
    where: { code: HR_POSITION_DESCRIPTION_DEPARTMENT_CODE, isArchived: false },
    select: { id: true, name: true, code: true, managerPositionId: true, isArchived: true },
  });
  if (byCode) return byCode;
  return prisma.department.findFirst({
    where: { name: HR_POSITION_DESCRIPTION_DEPARTMENT_NAME, isArchived: false },
    select: { id: true, name: true, code: true, managerPositionId: true, isArchived: true },
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
  const [natural, explicit, actionRole] = await Promise.all([
    naturalDocsEditorSpaceRole(userId, targetType, targetId),
    explicitDocsEditorSpaceRole(userId, targetType, targetId),
    scopedActionDocsEditorSpaceRole(userId, targetType, targetId),
  ]);
  return asDocsRole(maxBusinessSpaceRole(maxBusinessSpaceRole(natural, explicit), actionRole));
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
      select: {
        managerPosition: {
          select: {
            edps: {
              where: currentOpenEndedDateWhere({
                employee: {
                  userId: { not: null },
                  employments: { some: { isActive: true } },
                },
              }),
              select: {
                employee: {
                  select: {
                    userId: true,
                    user: { select: userSelect },
                  },
                },
              },
              orderBy: [{ isPrimary: "desc" }, { id: "asc" }],
            },
          },
        },
      },
    });
    return (department?.managerPosition?.edps ?? [])
      .map((edp) => {
        const user = edp.employee.user;
        if (!edp.employee.userId || !user) return null;
        return { userId: edp.employee.userId, userName: userName(user) };
      })
      .filter((row): row is { userId: number; userName: string } => Boolean(row));
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

export function normalizeDocsEditorTargetType(value: string): DocsEditorSpaceTargetType {
  if (value === "company" || value === "committee" || value === "department" || value === "personal") return value;
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

async function scopedActionDocsEditorSpaceRole(
  userId: number,
  targetType: DocsEditorSpaceTargetType,
  targetId: number,
): Promise<DocsEditorPermissionRole | null> {
  const space = { targetType, targetId };
  const [admin, deleteRole, write, create, access, exportRole] = await Promise.all([
    hasDocsEditorScopedAction(userId, space, "admin"),
    hasDocsEditorScopedAction(userId, space, "delete"),
    hasDocsEditorScopedAction(userId, space, "write"),
    hasDocsEditorScopedAction(userId, space, "create"),
    hasDocsEditorScopedAction(userId, space, "access"),
    hasDocsEditorScopedAction(userId, space, "export"),
  ]);
  if (admin) return "manager";
  if (deleteRole) return "delete";
  if (write || create) return "editor";
  return access || exportRole ? "viewer" : null;
}

async function naturalDocsEditorSpaceRole(
  userId: number,
  targetType: DocsEditorSpaceTargetType,
  targetId: number,
): Promise<DocsEditorPermissionRole | null> {
  if (targetType === "personal") return targetId === userId ? "manager" : null;
  if (await hasDocsEditorAdmin(userId)) return "manager";

  if (targetType === "department") {
    return asDocsRole(await getDepartmentNaturalSpaceRole(userId, targetId));
  }

  if (targetType === "company") return asDocsRole(await getCompanyNaturalSpaceRole(userId));
  if (targetType === "committee") return asDocsRole(await getOperatingCommitteeNaturalSpaceRole(userId));

  return null;
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
