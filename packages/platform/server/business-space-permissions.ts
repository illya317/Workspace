import "server-only";

import {
  maxBusinessSpaceRole,
  type BusinessSpaceRole,
} from "../permissions";
import { currentOpenEndedDateWhere } from "./fk-registry";
import { prisma } from "./prisma";

export type BusinessSpacePermissionSource = "natural" | "explicit";

export type BusinessSpacePermissionRow<TKind extends string = string> = {
  userId: number;
  userName: string;
  role: BusinessSpaceRole;
  kind: TKind;
  source: BusinessSpacePermissionSource;
  sourceLabel?: string;
  locked: boolean;
};

type NaturalDepartmentPermission = {
  userId: number;
  userName: string;
  role: BusinessSpaceRole;
  sourceLabel: string;
};

type ExplicitBusinessSpacePermission<TKind extends string> = {
  userId: number;
  userName: string;
  role: BusinessSpaceRole;
  kind?: TKind;
};

const userSelect = {
  id: true,
  nickname: true,
  username: true,
  employees: { select: { name: true }, take: 1 },
} as const;

const roleOrder: BusinessSpaceRole[] = ["viewer", "editor", "delete", "manager"];

export async function getDepartmentNaturalSpaceRole(
  userId: number,
  departmentId: number,
): Promise<BusinessSpaceRole | null> {
  const department = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { managerPositionId: true },
  });
  if (department?.managerPositionId && await isActivePositionUser(userId, department.managerPositionId)) return "manager";
  return await isActiveDepartmentMember(userId, departmentId) ? "viewer" : null;
}

export async function listDepartmentNaturalSpacePermissions(
  departmentId: number,
): Promise<NaturalDepartmentPermission[]> {
  const [department, employees] = await Promise.all([
    prisma.department.findUnique({
      where: { id: departmentId },
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
                    name: true,
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
    }),
    prisma.employee.findMany({
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
    }),
  ]);

  const rows: NaturalDepartmentPermission[] = [];
  for (const edp of department?.managerPosition?.edps ?? []) {
    const manager = edp.employee.user;
    if (!edp.employee.userId || !manager) continue;
    rows.push({
      userId: edp.employee.userId,
      userName: edp.employee.name || userName(manager),
      role: "manager",
      sourceLabel: "部门负责人",
    });
  }

  for (const employee of employees) {
    if (!employee.userId || !employee.user) continue;
    rows.push({
      userId: employee.userId,
      userName: employee.name || userName(employee.user),
      role: "viewer",
      sourceLabel: "部门成员",
    });
  }

  return mergeNaturalRows(rows);
}

export function mergeBusinessSpacePermissionRows<TKind extends string>({
  natural,
  explicit,
  kind,
}: {
  natural: NaturalDepartmentPermission[];
  explicit: ExplicitBusinessSpacePermission<TKind>[];
  kind: TKind;
}): BusinessSpacePermissionRow<TKind>[] {
  const byUser = new Map<number, BusinessSpacePermissionRow<TKind>>();
  for (const row of natural) {
    const existing = byUser.get(row.userId);
    const nextRole = maxBusinessSpaceRole(existing?.role ?? null, row.role) ?? row.role;
    if (!existing) {
      byUser.set(row.userId, {
        userId: row.userId,
        userName: row.userName,
        role: nextRole,
        kind,
        source: "natural",
        sourceLabel: row.sourceLabel,
        locked: true,
      });
      continue;
    }
    byUser.set(row.userId, {
      ...existing,
      role: nextRole,
      sourceLabel: mergeLabels(existing.sourceLabel, row.sourceLabel),
    });
  }

  for (const row of explicit) {
    const existing = byUser.get(row.userId);
    const bestRole = maxBusinessSpaceRole(existing?.role ?? null, row.role) ?? row.role;
    if (!existing || roleLevel(row.role) > roleLevel(existing.role)) {
      byUser.set(row.userId, {
        userId: row.userId,
        userName: row.userName,
        role: bestRole,
        kind: row.kind ?? kind,
        source: "explicit",
        sourceLabel: existing?.sourceLabel,
        locked: false,
      });
    }
  }

  return Array.from(byUser.values());
}

async function isActiveDepartmentMember(userId: number, departmentId: number) {
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

async function isActivePositionUser(userId: number, positionId: number) {
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

function mergeNaturalRows(rows: NaturalDepartmentPermission[]) {
  const byUser = new Map<number, NaturalDepartmentPermission>();
  for (const row of rows) {
    const existing = byUser.get(row.userId);
    if (!existing) {
      byUser.set(row.userId, row);
      continue;
    }
    byUser.set(row.userId, {
      ...existing,
      role: maxBusinessSpaceRole(existing.role, row.role) ?? existing.role,
      sourceLabel: mergeLabels(existing.sourceLabel, row.sourceLabel) ?? existing.sourceLabel,
    });
  }
  return Array.from(byUser.values());
}

function mergeLabels(left: string | undefined, right: string | undefined) {
  const labels = [left, right].filter((label): label is string => Boolean(label));
  return Array.from(new Set(labels)).join(" / ") || undefined;
}

function roleLevel(role: BusinessSpaceRole) {
  return roleOrder.indexOf(role);
}

function userName(user: { nickname: string; username: string | null; employees?: Array<{ name: string }> }) {
  return user.employees?.[0]?.name || user.nickname || user.username || "未命名用户";
}
