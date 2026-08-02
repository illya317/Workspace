import { isSuperAdmin } from "@workspace/platform/server/auth/admin";
import { evaluatePermissionAction } from "@workspace/platform/server/rbac/action-grants";
import { PERMISSION_ACTION_KEYS, actionImplies, type PermissionActionKey } from "@workspace/platform/permission-actions";
import {
  getNaturalSpaceActionProfileActionKeys,
  type NaturalSpaceActionProfile,
} from "@workspace/platform/permission-natural-space-actions";
import { getSpaceChildResourceKeyForTargetType } from "@workspace/platform/permission-resource-policy";
import {
  businessSpaceScopeId,
  canManageScopedPermissionGrant,
  getCompanyNaturalSpaceActionProfile,
  getDepartmentNaturalSpaceActionProfile,
  getGroupCompanyContext,
  getOperatingCommitteeDepartmentContext,
  getOperatingCommitteeNaturalSpaceActionProfile,
  listDepartmentIdsManagedByUserPosition,
} from "@workspace/platform/server/business-space-permissions";
import { prisma } from "@workspace/platform/server/prisma";
import { canEnterResource } from "@workspace/platform/server/rbac/resource-entry";
import { canUserActAsActiveEmployee } from "@workspace/platform/server/user-identity";
import { workspaceBusinessDate } from "@workspace/platform/server/business-date";
import { activeEmployeeAssignmentScopeIds } from "./project-access-temporal";

type ProjectSpaceProject = {
  projectType?: string | null;
  leadingDepartmentId?: number | null;
};

type WorkProjectGrantPermissions = {
  canGrant: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canRevise: boolean;
  canRead: boolean;
};

export async function getWorkProjectSpaceGrantPermissionsForProject(
  userId: number,
  project: ProjectSpaceProject,
): Promise<WorkProjectGrantPermissions> {
  const scope = await projectSpaceScopeForProject(project);
  if (!scope) return emptyProjectGrantPermissions();
  return getWorkProjectSpaceGrantPermissions(userId, scope.targetType, scope.targetId);
}

export async function canCreateWorkProjectInSpace(
  userId: number,
  targetType: string,
  targetId: number,
) {
  const resourceKey = getWorkProjectSpacePermissionResourceKey(targetType);
  const [naturalProfile, scoped] = await Promise.all([
    naturalWorkProjectSpaceActionProfile(userId, targetType, targetId),
    getWorkProjectSpaceGrantPermissions(userId, targetType, targetId),
  ]);
  return naturalProfileAllows(resourceKey, naturalProfile, "create") || scoped.canCreate;
}

export async function canCreateOrganizationProject(userId: number) {
  if (await isSuperAdmin(userId)) return true;
  const committee = await getOperatingCommitteeDepartmentContext();
  return committee ? canCreateWorkProjectInSpace(userId, "committee", committee.id) : false;
}

export async function canCreateDepartmentProject(userId: number, departmentId: number) {
  if (await isSuperAdmin(userId)) return true;
  return canCreateWorkProjectInSpace(userId, "department", departmentId);
}

export async function canCreateOtherProject(userId: number) {
  if (await isSuperAdmin(userId)) return true;
  const company = await getGroupCompanyContext();
  return company ? canCreateWorkProjectInSpace(userId, "company", company.id) : false;
}

export async function getWorkProjectPageActionPermissions(userId: number) {
  const canCreate = Boolean(
    await canEnterResource(userId, "work.projects") && await canUserActAsActiveEmployee(userId)
  );
  return {
    canCreate,
    canCreateOrg: false,
    canUpdate: false,
    canDelete: false,
    canRevise: false,
  };
}

export async function listVisibleProjectDepartmentSpaceIds(userId: number) {
  const directIds = await listProjectDepartmentSpaceGrantTargetIds(userId, "read");
  const naturalIds = await listDepartmentIdsManagedByUserPosition(userId);
  return Array.from(new Set([...directIds, ...naturalIds]));
}

export async function listProjectDepartmentSpaceGrantTargetIds(
  userId: number,
  requiredAction: PermissionActionKey = "read",
) {
  return listScopedSpaceGrantTargetIds(userId, "department", requiredAction);
}

export async function canViewCommitteeProjectSpace(userId: number) {
  const committee = await getOperatingCommitteeDepartmentContext();
  if (!committee) return false;
  const resourceKey = getWorkProjectSpacePermissionResourceKey("committee");
  const checks = await Promise.all([
    evaluatePermissionAction(userId, resourceKey, "read", {
      scopeId: businessSpaceScopeId("committee", committee.id),
      projection: resourceKey === "work.projects" ? "default" : "space",
    }),
    getOperatingCommitteeNaturalSpaceActionProfile(userId).then(Boolean),
  ]);
  return checks.some(Boolean);
}

export async function canViewCompanyProjectSpace(userId: number) {
  const company = await getGroupCompanyContext();
  if (!company) return false;
  const resourceKey = getWorkProjectSpacePermissionResourceKey("company");
  const checks = await Promise.all([
    evaluatePermissionAction(userId, resourceKey, "read", {
      scopeId: businessSpaceScopeId("company", company.id),
      projection: resourceKey === "work.projects" ? "default" : "space",
    }),
    getCompanyNaturalSpaceActionProfile(userId).then(Boolean),
  ]);
  return checks.some(Boolean);
}

async function projectSpaceScopeForProject(project: ProjectSpaceProject) {
  if (project.projectType === "department") {
    return project.leadingDepartmentId
      ? { targetType: "department" as const, targetId: project.leadingDepartmentId }
      : null;
  }
  if (project.projectType === "company") {
    const committee = await getOperatingCommitteeDepartmentContext();
    return committee ? { targetType: "committee" as const, targetId: committee.id } : null;
  }
  const company = await getGroupCompanyContext();
  return company ? { targetType: "company" as const, targetId: company.id } : null;
}

async function getWorkProjectSpaceGrantPermissions(
  userId: number,
  targetType: string,
  targetId: number,
) {
  const resourceKey = getWorkProjectSpacePermissionResourceKey(targetType);
  const projection = resourceKey === "work.projects" ? "default" : "space";
  const [naturalProfile, scoped] = await Promise.all([
    naturalWorkProjectSpaceActionProfile(userId, targetType, targetId),
    getWorkProjectGrantPermissions(userId, businessSpaceScopeId(targetType, targetId), resourceKey, projection),
  ]);
  const natural = workProjectPermissionsFromNaturalProfile(resourceKey, naturalProfile);
  return {
    canGrant: scoped.canGrant,
    canCreate: natural.canCreate || scoped.canCreate,
    canUpdate: natural.canUpdate || scoped.canUpdate,
    canDelete: natural.canDelete || scoped.canDelete,
    canRevise: natural.canRevise || scoped.canRevise,
    canRead: natural.canRead || scoped.canRead,
  };
}

function getWorkProjectSpacePermissionResourceKey(targetType: string) {
  return getSpaceChildResourceKeyForTargetType(targetType, "projects") ?? "work.projects";
}

async function getWorkProjectGrantPermissions(
  userId: number,
  scopeId: string,
  resourceKey = "work.projects",
  projection: "default" | "space" = "default",
) {
  const [canGrant, canCreate, canUpdate, canDelete, canRevise, canRead] = await Promise.all([
    canManageScopedPermissionGrant(userId, resourceKey, scopeId),
    evaluatePermissionAction(userId, resourceKey, "create", { scopeId, projection }),
    evaluatePermissionAction(userId, resourceKey, "update", { scopeId, projection }),
    evaluatePermissionAction(userId, resourceKey, "delete", { scopeId, projection }),
    evaluatePermissionAction(userId, resourceKey, "revise", { scopeId, projection }),
    evaluatePermissionAction(userId, resourceKey, "read", { scopeId, projection }),
  ]);
  return { canGrant, canCreate, canUpdate, canDelete, canRevise, canRead };
}

function emptyProjectGrantPermissions(): WorkProjectGrantPermissions {
  return { canGrant: false, canCreate: false, canUpdate: false, canDelete: false, canRevise: false, canRead: false };
}

async function naturalWorkProjectSpaceActionProfile(
  userId: number,
  targetType: string,
  targetId: number,
): Promise<NaturalSpaceActionProfile | null> {
  if (targetType === "personal") return targetId === userId ? "allBusiness" : null;
  if (targetType === "department") return getDepartmentNaturalSpaceActionProfile(userId, targetId);
  if (targetType === "company") return getCompanyNaturalSpaceActionProfile(userId);
  if (targetType === "committee") return getOperatingCommitteeNaturalSpaceActionProfile(userId);
  return null;
}

function workProjectPermissionsFromNaturalProfile(
  resourceKey: string,
  profile: NaturalSpaceActionProfile | null,
) {
  if (!profile) return emptyProjectGrantPermissions();
  const actionKeys = getNaturalSpaceActionProfileActionKeys(resourceKey, profile);
  const grants = new Set(actionKeys);
  const allows = (actionKey: PermissionActionKey) =>
    actionKeys.some((grantedActionKey) => actionImplies(grantedActionKey, actionKey));
  return {
    canGrant: false,
    canCreate: grants.has("create"),
    canUpdate: grants.has("update"),
    canDelete: grants.has("delete"),
    canRevise: grants.has("revise"),
    canRead: allows("read"),
  };
}

function naturalProfileAllows(
  resourceKey: string,
  profile: NaturalSpaceActionProfile | null,
  actionKey: PermissionActionKey,
) {
  return profile
    ? getNaturalSpaceActionProfileActionKeys(resourceKey, profile).some((grantedActionKey) => actionImplies(grantedActionKey, actionKey))
    : false;
}

async function listScopedSpaceGrantTargetIds(
  userId: number,
  targetType: string,
  requiredAction: PermissionActionKey,
) {
  const prefix = `${targetType}:`;
  const resourceKey = getWorkProjectSpacePermissionResourceKey(targetType);
  const actionKeys = PERMISSION_ACTION_KEYS.filter((actionKey) => actionImplies(actionKey, requiredAction));
  const { positionIds, departmentIds } = await getUserProjectSpaceGrantScopeIds(userId);
  const [userRows, positionRows, departmentRows] = await Promise.all([
    prisma.userResourceActionGrant.findMany({
      where: { userId, resource: { key: resourceKey }, actionKey: { in: actionKeys }, scopeId: { startsWith: prefix } },
      select: { scopeId: true },
    }),
    positionIds.length ? prisma.positionResourceActionGrant.findMany({
      where: { positionId: { in: positionIds }, resource: { key: resourceKey }, actionKey: { in: actionKeys }, scopeId: { startsWith: prefix } },
      select: { scopeId: true },
    }) : Promise.resolve([]),
    departmentIds.length ? prisma.departmentResourceActionGrant.findMany({
      where: { departmentId: { in: departmentIds }, resource: { key: resourceKey }, actionKey: { in: actionKeys }, scopeId: { startsWith: prefix } },
      select: { scopeId: true },
    }) : Promise.resolve([]),
  ]);
  const rows = [...userRows, ...positionRows, ...departmentRows];
  return Array.from(new Set(rows.flatMap((row) => {
    const id = Number(row.scopeId?.slice(prefix.length));
    return Number.isInteger(id) && id > 0 ? [id] : [];
  })));
}

async function getUserProjectSpaceGrantScopeIds(userId: number) {
  const employees = await prisma.employee.findMany({
    where: { userId },
    select: {
      employments: { select: { isActive: true, joinDate: true, leaveDate: true } },
      positions: {
        select: {
          positionId: true,
          departmentId: true,
          startDate: true,
          endDate: true,
        },
      },
    },
  });
  return activeEmployeeAssignmentScopeIds(employees, workspaceBusinessDate(new Date()));
}
