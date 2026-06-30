import "server-only";

import { authorize } from "../auth/authorize";
import { isRootAdminUser } from "../auth/root";
import { prisma } from "../prisma";
import type {
  DocsEditorPermissionRow,
  DocsEditorSpaceRow,
  DocsEditorTemplateRow,
} from "./db";
import type {
  DocsEditorPermissionRole,
  DocsEditorSpaceKind,
} from "./types";

type DepartmentContext = {
  id: number;
  name: string;
  managerUserId: number | null;
};

const ROLE_RANK: Record<DocsEditorPermissionRole, number> = {
  viewer: 1,
  editor: 2,
  manager: 3,
};

function normalizeRole(role: string | null | undefined): DocsEditorPermissionRole | null {
  if (role === "viewer" || role === "editor" || role === "manager") return role;
  return null;
}

export function maxDocsEditorRole(
  left: DocsEditorPermissionRole | null,
  right: DocsEditorPermissionRole | null,
): DocsEditorPermissionRole | null {
  if (!left) return right;
  if (!right) return left;
  return ROLE_RANK[left] >= ROLE_RANK[right] ? left : right;
}

export function isDocsEditorRoleAtLeast(
  actual: DocsEditorPermissionRole | null,
  required: DocsEditorPermissionRole,
) {
  return Boolean(actual && ROLE_RANK[actual] >= ROLE_RANK[required]);
}

function isSpaceKind(value: string): value is DocsEditorSpaceKind {
  return value === "personal" || value === "department";
}

export async function getUserDepartmentContexts(userId: number): Promise<DepartmentContext[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { employeeId: true },
  });
  const employeeWhere = {
    OR: [
      { userId },
      ...(user?.employeeId ? [{ employeeId: user.employeeId }] : []),
    ],
  };
  const rows = await prisma.eDP.findMany({
    where: {
      employee: employeeWhere,
      departmentId: { not: null },
      department: { isArchived: false },
    },
    select: {
      department: {
        select: {
          id: true,
          name: true,
          managerUserId: true,
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

export async function getDepartmentContext(departmentId: number): Promise<DepartmentContext | null> {
  const department = await prisma.department.findFirst({
    where: { id: departmentId, isArchived: false },
    select: { id: true, name: true, managerUserId: true },
  });
  return department;
}

export async function resolveSpaceRole(
  userId: number,
  space: DocsEditorSpaceRow,
  departments?: DepartmentContext[],
): Promise<DocsEditorPermissionRole | null> {
  if (await isRootAdminUser(userId)) return "manager";
  if (!isSpaceKind(space.kind)) return null;
  if (space.kind === "personal") return space.ownerUserId === userId ? "manager" : null;
  if (!space.departmentId) return null;

  const contexts = departments ?? await getUserDepartmentContexts(userId);
  const department = contexts.find((item) => item.id === space.departmentId);
  if (!department) return null;
  if (department.managerUserId === userId) return "manager";
  return "viewer";
}

export async function resolveTemplateRole(input: {
  userId: number;
  template: DocsEditorTemplateRow;
  space: DocsEditorSpaceRow | null;
  explicit?: DocsEditorPermissionRow | null;
  departments?: DepartmentContext[];
}): Promise<DocsEditorPermissionRole | null> {
  if (await isRootAdminUser(input.userId)) return "manager";

  let implicit: DocsEditorPermissionRole | null = null;
  if (input.space) {
    implicit = await resolveSpaceRole(input.userId, input.space, input.departments);
  }
  const explicit = normalizeRole(input.explicit?.role);
  return maxDocsEditorRole(implicit, explicit);
}

export async function canPublishOfficialQcTemplate(userId: number) {
  if (await isRootAdminUser(userId)) return true;
  return authorize({
    user: userId,
    resourceKey: "docs.editor",
    action: "admin",
  });
}
