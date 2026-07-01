import { evaluatePermissionAction } from "@workspace/platform/server/auth";
import { authorize } from "@workspace/platform/server/auth";
import {
  businessSpaceScopeId,
  getCompanyNaturalSpaceRole,
  getDepartmentNaturalSpaceRole,
  getGroupCompanyContext,
  getOperatingCommitteeDepartmentContext,
  getOperatingCommitteeNaturalSpaceRole,
  listDepartmentIdsManagedByUserPosition,
} from "@workspace/platform/server/business-space-permissions";
import { isSuperAdmin } from "@workspace/platform/server/auth";
import { prisma } from "@workspace/platform/server/prisma";
import { businessSpaceRoleAllows, type BusinessSpaceRole } from "@workspace/platform/permissions";

type ProjectSpaceProject = {
  projectType?: string | null;
  leadingDepartmentId?: number | null;
};

type WorkProjectGrantPermissions = {
  canAdmin: boolean;
  canCreate: boolean;
  canWrite: boolean;
  canDelete: boolean;
  canRevise: boolean;
  canAccess: boolean;
};

export function workProjectScopeId(projectId: number) {
  return `project:${projectId}`;
}

export async function getWorkProjectScopedGrantPermissions(
  userId: number,
  projectId: number,
): Promise<WorkProjectGrantPermissions> {
  return getWorkProjectGrantPermissions(userId, workProjectScopeId(projectId));
}

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
  const [naturalRole, scoped] = await Promise.all([
    naturalWorkProjectSpaceRole(userId, targetType, targetId),
    getWorkProjectSpaceGrantPermissions(userId, targetType, targetId),
  ]);
  return businessSpaceRoleAllows(naturalRole, "manager") || scoped.canCreate || scoped.canWrite || scoped.canAdmin;
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
  const [canCreateOrg, canCreateOther, directDepartmentIds, managedDepartmentIds, canWrite, canDelete, canRevise, canAccess] = await Promise.all([
    canCreateOrganizationProject(userId),
    canCreateOtherProject(userId),
    listDirectSpaceGrantTargetIds(userId, "department"),
    listDepartmentIdsManagedByUserPosition(userId),
    hasProjectL2Access(userId, "write"),
    hasProjectL2Access(userId, "delete"),
    evaluatePermissionAction(userId, "work.projects", "revise"),
    hasProjectL2Access(userId, "access"),
  ]);
  const canCreateDepartment = directDepartmentIds.length > 0 || managedDepartmentIds.length > 0;
  return {
    canCreate: canCreateOrg || canCreateOther || canCreateDepartment || canAccess,
    canCreateOrg,
    canWrite,
    canDelete,
    canRevise,
  };
}

export async function listDirectScopedProjectIds(userId: number) {
  return listDirectSpaceGrantTargetIds(userId, "project");
}

export async function listVisibleProjectDepartmentSpaceIds(userId: number) {
  const directIds = await listDirectSpaceGrantTargetIds(userId, "department");
  const naturalIds = await listDepartmentIdsManagedByUserPosition(userId);
  return Array.from(new Set([...directIds, ...naturalIds]));
}

export async function canViewCommitteeProjectSpace(userId: number) {
  const committee = await getOperatingCommitteeDepartmentContext();
  if (!committee) return false;
  const checks = await Promise.all([
    evaluatePermissionAction(userId, "work.projects", "access", {
      scopeId: businessSpaceScopeId("committee", committee.id),
    }),
    getOperatingCommitteeNaturalSpaceRole(userId).then(Boolean),
  ]);
  return checks.some(Boolean);
}

export async function canViewCompanyProjectSpace(userId: number) {
  const company = await getGroupCompanyContext();
  if (!company) return false;
  const checks = await Promise.all([
    evaluatePermissionAction(userId, "work.projects", "access", {
      scopeId: businessSpaceScopeId("company", company.id),
    }),
    getCompanyNaturalSpaceRole(userId).then(Boolean),
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
  return getWorkProjectGrantPermissions(userId, businessSpaceScopeId(targetType, targetId));
}

async function getWorkProjectGrantPermissions(userId: number, scopeId: string) {
  const [canAdmin, canCreate, canWrite, canDelete, canRevise, canAccess] = await Promise.all([
    evaluatePermissionAction(userId, "work.projects", "admin", { scopeId }),
    evaluatePermissionAction(userId, "work.projects", "create", { scopeId }),
    evaluatePermissionAction(userId, "work.projects", "write", { scopeId }),
    evaluatePermissionAction(userId, "work.projects", "delete", { scopeId }),
    evaluatePermissionAction(userId, "work.projects", "revise", { scopeId }),
    evaluatePermissionAction(userId, "work.projects", "access", { scopeId }),
  ]);
  return { canAdmin, canCreate, canWrite, canDelete, canRevise, canAccess };
}

function emptyProjectGrantPermissions(): WorkProjectGrantPermissions {
  return { canAdmin: false, canCreate: false, canWrite: false, canDelete: false, canRevise: false, canAccess: false };
}

async function naturalWorkProjectSpaceRole(
  userId: number,
  targetType: string,
  targetId: number,
): Promise<BusinessSpaceRole | null> {
  if (targetType === "personal") return targetId === userId ? "manager" : null;
  if (await hasProjectL2Access(userId, "admin")) return "manager";
  if (targetType === "department") return getDepartmentNaturalSpaceRole(userId, targetId);
  if (targetType === "company") return getCompanyNaturalSpaceRole(userId);
  if (targetType === "committee") return getOperatingCommitteeNaturalSpaceRole(userId);
  return null;
}

async function listDirectSpaceGrantTargetIds(userId: number, targetType: string) {
  const prefix = `${targetType}:`;
  const rows = await prisma.userResourceActionGrant.findMany({
    where: {
      userId,
      resource: { key: "work.projects" },
      scopeId: { startsWith: prefix },
    },
    select: { scopeId: true },
  });
  return Array.from(new Set(rows.flatMap((row) => {
    const id = Number(row.scopeId?.slice(prefix.length));
    return Number.isInteger(id) && id > 0 ? [id] : [];
  })));
}

async function hasProjectL2Access(userId: number, role: "access" | "write" | "delete" | "admin") {
  if (await isSuperAdmin(userId)) return true;
  return authorize({ user: userId, resourceKey: "work.projects", action: role });
}
