import "server-only";

import type { PermissionActionSource } from "../permission-actions";
import type { NaturalSpaceActionProfile } from "../permission-natural-space-actions";
import { getSpaceParentResourceKeyForTargetType } from "../permission-resource-policy";
import { currentEmploymentDateWhere, currentOpenEndedDateWhere } from "./relation-registry";
import { prisma } from "./prisma";
import { evaluatePermissionAction } from "./rbac/action-grants";
import { canManageResourceGrant } from "./rbac/admin-scope";
import {
  isActiveDepartmentMember,
  isActiveEmployeeUser,
  isActiveNamedPositionUser,
  isActivePositionUser,
  listActiveDepartmentUsers,
  listActiveEmployeeUsers,
  listNamedPositionUsers,
  type NaturalBusinessSpacePermission,
} from "./business-space-natural-users";
import { getTenantProfile } from "./tenant-config";
import { resolveRegisteredBusinessSpaceNaturalActionProfile } from "./business-space-access-providers";

export function businessSpaceScopeId(targetType: string, targetId: number) {
  const normalized = targetType === "user" ? "personal" : targetType;
  if (normalized === "company") return "company:company";
  if (normalized === "committee") return "committee:operating-committee";
  return `${normalized}:${targetId}`;
}

const userSelect = {
  id: true,
  employees: { select: { name: true }, take: 1 },
} as const;

export async function getDepartmentNaturalSpaceActionProfile(
  userId: number,
  departmentId: number,
): Promise<NaturalSpaceActionProfile | null> {
  if (await isDepartmentResponsiblePositionUser(userId, departmentId)) return "allBusiness";
  return await isActiveDepartmentMember(userId, departmentId) ? "read" : null;
}

export async function isDepartmentResponsiblePositionUser(userId: number, departmentId: number) {
  const department = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { managerPositionId: true },
  });
  if (!department) return false;
  return Boolean(department.managerPositionId && await isActivePositionUser(userId, department.managerPositionId));
}

export async function listDepartmentIdsManagedByUserPosition(userId: number) {
  const employees = await prisma.employee.findMany({
    where: {
      userId,
      employments: { some: currentEmploymentDateWhere() },
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
  const departments = await prisma.department.findMany({
    where: {
      isArchived: false,
      managerPositionId: { in: positionIds.length > 0 ? positionIds : [-1] },
    },
    select: { id: true },
  });
  return departments.map((department) => department.id);
}

export async function getCompanyNaturalSpaceActionProfile(userId: number): Promise<NaturalSpaceActionProfile | null> {
  return await isActiveEmployeeUser(userId) ? "read" : null;
}

export async function getOperatingCommitteeNaturalSpaceActionProfile(userId: number): Promise<NaturalSpaceActionProfile | null> {
  const positionNames = getTenantProfile().organization.operatingCommittee.executivePositionNames;
  if (await isActiveNamedPositionUser(userId, positionNames)) return "allBusiness";
  const committee = await getOperatingCommitteeDepartmentContext();
  return committee && await isActiveDepartmentMember(userId, committee.id) ? "read" : null;
}

export async function getNaturalSpaceActionProfile(
  userId: number,
  targetType: string,
  targetId: number,
): Promise<NaturalSpaceActionProfile | null> {
  if (targetType === "department") return getDepartmentNaturalSpaceActionProfile(userId, targetId);
  if (targetType === "committee") return getOperatingCommitteeNaturalSpaceActionProfile(userId);
  if (targetType === "company") return getCompanyNaturalSpaceActionProfile(userId);
  return resolveRegisteredBusinessSpaceNaturalActionProfile(userId, targetType, targetId);
}

export async function canManageBusinessSpaceParent(
  userId: number,
  resourceKey: string,
  scopeId: string,
) {
  return canManageScopedPermissionGrant(userId, resourceKey, scopeId);
}

export async function canManageScopedPermissionGrant(
  userId: number,
  resourceKey: string,
  scopeId: string,
) {
  return await evaluatePermissionAction(userId, resourceKey, "grant", { scopeId, projection: "space" })
    || await canManageResourceGrant(userId, resourceKey, "grant");
}

export async function getGroupCompanyContext() {
  const company = await prisma.company.findFirst({
    where: {
      isActive: true,
      issuedOwnerships: { none: {} },
      party: { ownedInterests: { some: {} } },
    },
    select: { id: true, party: { select: { name: true } } },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
  return company ? { id: company.id, name: company.party.name } : null;
}

export async function getOperatingCommitteeDepartmentContext() {
  const committee = getTenantProfile().organization.operatingCommittee;
  const byCode = await prisma.department.findFirst({
    where: { code: committee.departmentCode, isArchived: false },
    select: { id: true, name: true, code: true, isArchived: true },
  });
  if (byCode) return byCode;
  return prisma.department.findFirst({
    where: { name: committee.departmentName, isArchived: false },
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
                  employments: { some: currentEmploymentDateWhere() },
                },
              }),
              select: {
                employee: {
                  select: {
                    name: true,
                    userId: true,
                    employments: { where: currentEmploymentDateWhere(), select: { id: true }, take: 1 },
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
        employments: { some: currentEmploymentDateWhere() },
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
  const responsibleEmployees = (department?.managerPosition?.edps ?? []).map((edp) => edp.employee);
  for (const employee of responsibleEmployees) {
    const manager = employee.user;
    if (!employee.userId || !manager || employee.employments.length === 0) continue;
    rows.push({
      userId: employee.userId,
      userName: employee.name || userName(manager),
      actionProfile: "allBusiness",
      sourceLabel: "部门负责人",
      actionSource: "position",
    });
  }

  for (const employee of employees) {
    if (!employee.userId || !employee.user) continue;
    rows.push({
      userId: employee.userId,
      userName: employee.name || userName(employee.user),
      actionProfile: "read",
      sourceLabel: "部门成员",
      actionSource: "department",
    });
  }

  return mergeNaturalRows(rows);
}

export async function listCompanyNaturalSpacePermissions(): Promise<NaturalBusinessSpacePermission[]> {
  return mergeNaturalRows(await listActiveEmployeeUsers("read", "全员", "implicit"));
}

export async function listOperatingCommitteeNaturalSpacePermissions(): Promise<NaturalBusinessSpacePermission[]> {
  const committee = await getOperatingCommitteeDepartmentContext();
  const committeeConfig = getTenantProfile().organization.operatingCommittee;
  const executiveLabel = committeeConfig.executivePositionNames.join("、");
  const [members, presidents] = await Promise.all([
    committee ? listActiveDepartmentUsers(committee.id, "read", `${committeeConfig.departmentName}成员`) : [],
    listNamedPositionUsers(committeeConfig.executivePositionNames, "allBusiness", executiveLabel),
  ]);
  return mergeNaturalRows([...members, ...presidents]);
}

export async function listNaturalSpacePermissions(targetType: string, targetId: number): Promise<NaturalBusinessSpacePermission[]> {
  if (targetType === "department") return listDepartmentNaturalSpacePermissions(targetId);
  if (targetType === "company") return listCompanyNaturalSpacePermissions();
  if (targetType === "committee") return listOperatingCommitteeNaturalSpacePermissions();
  return [];
}

export async function canManageBusinessSpacePermission(
  userId: number,
  targetType: string,
  targetId: number,
) {
  const resourceKey = getSpaceParentResourceKeyForTargetType(targetType);
  if (!resourceKey) return false;
  const scopeId = businessSpaceScopeId(targetType, targetId);
  return canManageScopedPermissionGrant(userId, resourceKey, scopeId);
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
      actionProfile: maxNaturalActionProfile(existing.actionProfile, row.actionProfile),
      actionSource: pickBusinessSpaceActionSource(existing, row),
      sourceLabel: mergeLabels(existing.sourceLabel, row.sourceLabel) ?? existing.sourceLabel,
    });
  }
  return Array.from(byUser.values());
}

function maxNaturalActionProfile(
  left: NaturalBusinessSpacePermission["actionProfile"],
  right: NaturalBusinessSpacePermission["actionProfile"],
) {
  return left === "allBusiness" || right === "allBusiness" ? "allBusiness" : "read";
}

function pickBusinessSpaceActionSource(
  left: Pick<NaturalBusinessSpacePermission, "actionProfile" | "actionSource">,
  right: Pick<NaturalBusinessSpacePermission, "actionProfile" | "actionSource">,
) {
  if (actionProfileRank(right.actionProfile) > actionProfileRank(left.actionProfile)) return right.actionSource;
  if (actionProfileRank(left.actionProfile) > actionProfileRank(right.actionProfile)) return left.actionSource;
  return actionSourceRank(left.actionSource) <= actionSourceRank(right.actionSource)
    ? left.actionSource
    : right.actionSource;
}

function actionProfileRank(profile: NaturalSpaceActionProfile) {
  return profile === "allBusiness" ? 1 : 0;
}

function actionSourceRank(source: PermissionActionSource) {
  if (source === "direct") return 0;
  if (source === "system" || source === "implicit") return 1;
  if (source === "position") return 2;
  if (source === "department") return 3;
  if (source === "ancestor") return 4;
  if (source === "implied") return 5;
  if (source === "entry") return 6;
  if (source === "child") return 7;
  return 9;
}

function mergeLabels(left: string | undefined, right: string | undefined) {
  const labels = [left, right].filter((label): label is string => Boolean(label));
  return Array.from(new Set(labels)).join(" / ") || undefined;
}

function userName(user: { employees?: Array<{ name: string }> }) {
  return user.employees?.[0]?.name || "未绑定员工";
}
