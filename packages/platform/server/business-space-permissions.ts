import "server-only";

import {
  maxBusinessSpaceRole,
  type BusinessSpaceRole,
} from "../permissions";
import type { PermissionActionSource } from "../permission-actions";
import { currentOpenEndedDateWhere } from "./fk-registry";
import { prisma } from "./prisma";
import {
  isActiveDepartmentMember,
  isActiveEmployeeUser,
  isActiveNamedPositionUser,
  isActivePositionUser,
  isAdministrativeResponsibleUser,
  listActiveDepartmentUsers,
  listActiveEmployeeUsers,
  listAdministrativeResponsibleUsers,
  listNamedPositionUsers,
  type NaturalBusinessSpacePermission,
} from "./business-space-natural-users";

export type BusinessSpacePermissionSource = "natural" | "explicit";

export type BusinessSpacePermissionRow<TKind extends string = string> = {
  userId: number;
  userName: string;
  role: BusinessSpaceRole;
  kind: TKind;
  source: BusinessSpacePermissionSource;
  actionSource: PermissionActionSource;
  sourceLabel?: string;
  locked: boolean;
};

export function businessSpaceScopeId(targetType: string, targetId: number) {
  const normalized = targetType === "user" ? "personal" : targetType;
  if (normalized === "company") return "company:company";
  if (normalized === "committee") return "committee:operating-committee";
  return `${normalized}:${targetId}`;
}

type ExplicitBusinessSpacePermission<TKind extends string> = {
  userId: number;
  userName: string;
  role: BusinessSpaceRole;
  kind?: TKind;
  actionSource?: PermissionActionSource;
};

const userSelect = {
  id: true,
  nickname: true,
  username: true,
  employees: { select: { name: true }, take: 1 },
} as const;

const roleOrder: BusinessSpaceRole[] = ["viewer", "editor", "delete", "manager"];
const OPERATING_COMMITTEE_DEPARTMENT_CODE = "EXC001";
const CHAIRMAN_POSITION_NAMES = ["董事长"];
const EXECUTIVE_PRESIDENT_POSITION_NAMES = ["执行总裁"];

export async function getDepartmentNaturalSpaceRole(
  userId: number,
  departmentId: number,
): Promise<BusinessSpaceRole | null> {
  if (await isActiveNamedPositionUser(userId, CHAIRMAN_POSITION_NAMES)) return "manager";
  if (await isDepartmentResponsiblePositionUser(userId, departmentId)) return "manager";
  return await isActiveDepartmentMember(userId, departmentId) ? "viewer" : null;
}

export async function isDepartmentResponsiblePositionUser(userId: number, departmentId: number) {
  const department = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { managerPositionId: true },
  });
  return Boolean(department?.managerPositionId && await isActivePositionUser(userId, department.managerPositionId));
}

export async function listDepartmentIdsManagedByUserPosition(userId: number) {
  const employees = await prisma.employee.findMany({
    where: {
      userId,
      employments: { some: { isActive: true } },
    },
    select: {
      positions: {
        where: currentOpenEndedDateWhere({ positionId: { not: null } }),
        select: { positionId: true },
      },
    },
  });
  const positionIds = Array.from(new Set(
    employees.flatMap((employee) =>
      employee.positions.map((position) => position.positionId).filter((id): id is number => Boolean(id)),
    ),
  ));
  if (positionIds.length === 0) return [];
  const departments = await prisma.department.findMany({
    where: {
      isArchived: false,
      managerPositionId: { in: positionIds },
    },
    select: { id: true },
  });
  return departments.map((department) => department.id);
}

export async function getCompanyNaturalSpaceRole(userId: number): Promise<BusinessSpaceRole | null> {
  if (await isActiveNamedPositionUser(userId, CHAIRMAN_POSITION_NAMES)) return "manager";
  if (await isAdministrativeResponsibleUser(userId)) return "manager";
  return await isActiveEmployeeUser(userId) ? "viewer" : null;
}

export async function getOperatingCommitteeNaturalSpaceRole(userId: number): Promise<BusinessSpaceRole | null> {
  if (await isActiveNamedPositionUser(userId, [...EXECUTIVE_PRESIDENT_POSITION_NAMES, ...CHAIRMAN_POSITION_NAMES])) return "manager";
  const committee = await getOperatingCommitteeDepartmentContext();
  return committee && await isActiveDepartmentMember(userId, committee.id) ? "viewer" : null;
}

export async function getGroupCompanyContext() {
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

export async function getOperatingCommitteeDepartmentContext() {
  const byCode = await prisma.department.findFirst({
    where: { code: OPERATING_COMMITTEE_DEPARTMENT_CODE, isArchived: false },
    select: { id: true, name: true, code: true, isArchived: true },
  });
  if (byCode) return byCode;
  return prisma.department.findFirst({
    where: { name: "运营委员会", isArchived: false },
    select: { id: true, name: true, code: true, isArchived: true },
  });
}

export async function listDepartmentNaturalSpacePermissions(
  departmentId: number,
): Promise<NaturalBusinessSpacePermission[]> {
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

  const rows: NaturalBusinessSpacePermission[] = [];
  for (const edp of department?.managerPosition?.edps ?? []) {
    const manager = edp.employee.user;
    if (!edp.employee.userId || !manager) continue;
    rows.push({
      userId: edp.employee.userId,
      userName: edp.employee.name || userName(manager),
      role: "manager",
      sourceLabel: "部门负责人",
      actionSource: "position",
    });
  }

  for (const employee of employees) {
    if (!employee.userId || !employee.user) continue;
    rows.push({
      userId: employee.userId,
      userName: employee.name || userName(employee.user),
      role: "viewer",
      sourceLabel: "部门成员",
      actionSource: "department",
    });
  }

  return mergeNaturalRows([
    ...rows,
    ...(await listNamedPositionUsers(CHAIRMAN_POSITION_NAMES, "manager", "董事长")),
  ]);
}

export async function listCompanyNaturalSpacePermissions(): Promise<NaturalBusinessSpacePermission[]> {
  const [employees, admins, chairmen] = await Promise.all([
    listActiveEmployeeUsers("viewer", "全员", "implicit"),
    listAdministrativeResponsibleUsers("manager", "行政负责人"),
    listNamedPositionUsers(CHAIRMAN_POSITION_NAMES, "manager", "董事长"),
  ]);
  return mergeNaturalRows([...employees, ...admins, ...chairmen]);
}

export async function listOperatingCommitteeNaturalSpacePermissions(): Promise<NaturalBusinessSpacePermission[]> {
  const committee = await getOperatingCommitteeDepartmentContext();
  const [members, presidents, chairmen] = await Promise.all([
    committee ? listActiveDepartmentUsers(committee.id, "viewer", "运营委员会成员") : [],
    listNamedPositionUsers(EXECUTIVE_PRESIDENT_POSITION_NAMES, "manager", "执行总裁"),
    listNamedPositionUsers(CHAIRMAN_POSITION_NAMES, "manager", "董事长"),
  ]);
  return mergeNaturalRows([...members, ...presidents, ...chairmen]);
}

export function mergeBusinessSpacePermissionRows<TKind extends string>({
  natural,
  explicit,
  kind,
}: {
  natural: NaturalBusinessSpacePermission[];
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
        actionSource: row.actionSource,
        sourceLabel: row.sourceLabel,
        locked: true,
      });
      continue;
    }
    byUser.set(row.userId, {
      ...existing,
      role: nextRole,
      actionSource: pickBusinessSpaceActionSource(existing, row),
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
        actionSource: row.actionSource ?? "direct",
        sourceLabel: existing?.sourceLabel,
        locked: false,
      });
    }
  }

  return Array.from(byUser.values());
}

function mergeNaturalRows(rows: NaturalBusinessSpacePermission[]) {
  const byUser = new Map<number, NaturalBusinessSpacePermission>();
  for (const row of rows) {
    const existing = byUser.get(row.userId);
    if (!existing) {
      byUser.set(row.userId, row);
      continue;
    }
    byUser.set(row.userId, {
      ...existing,
      role: maxBusinessSpaceRole(existing.role, row.role) ?? existing.role,
      actionSource: pickBusinessSpaceActionSource(existing, row),
      sourceLabel: mergeLabels(existing.sourceLabel, row.sourceLabel) ?? existing.sourceLabel,
    });
  }
  return Array.from(byUser.values());
}

function pickBusinessSpaceActionSource(
  left: Pick<NaturalBusinessSpacePermission, "role" | "actionSource">,
  right: Pick<NaturalBusinessSpacePermission, "role" | "actionSource">,
) {
  if (roleLevel(right.role) > roleLevel(left.role)) return right.actionSource;
  if (roleLevel(left.role) > roleLevel(right.role)) return left.actionSource;
  return actionSourceRank(left.actionSource) <= actionSourceRank(right.actionSource)
    ? left.actionSource
    : right.actionSource;
}

function actionSourceRank(source: PermissionActionSource) {
  if (source === "direct") return 0;
  if (source === "position") return 1;
  if (source === "department") return 2;
  if (source === "child") return 3;
  if (source === "ancestor") return 4;
  if (source === "implied") return 5;
  if (source === "implicit") return 6;
  return 9;
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
