import { authorize, evaluatePermissionAction } from "@workspace/platform/server/auth";
import type { PermissionActionKey } from "@workspace/platform/permission-actions";
import { isSuperAdmin } from "@workspace/platform/server/auth";
import {
  businessSpaceScopeId,
  getCompanyNaturalSpaceRole,
  getDepartmentNaturalSpaceRole,
  isDepartmentResponsiblePositionUser,
  listDepartmentIdsManagedByUserPosition,
  getOperatingCommitteeNaturalSpaceRole,
} from "@workspace/platform/server/business-space-permissions";
import { currentOpenEndedDateWhere } from "@workspace/platform/server/fk-registry";
import { prisma } from "@workspace/platform/server/prisma";
import { PROJECT_ROLES } from "../constants/field-options";
import {
  canViewCommitteeProjectSpace,
  canViewCompanyProjectSpace,
  getWorkProjectScopedGrantPermissions,
  getWorkProjectSpaceGrantPermissionsForProject,
  listDirectScopedProjectIds,
  listVisibleProjectDepartmentSpaceIds,
} from "./project-space-action-access";

export type ProjectAccessRole = "access" | "write" | "delete" | "admin";
export type WorkSpaceTargetType = "personal" | "company" | "committee" | "department" | "project" | "position";
export type WorkSpaceRole = "viewer" | "editor" | "delete" | "manager";
export type WorkSpacePermissionKind = "project" | "task";

const WORK_SPACE_ROLE_LEVEL: Record<WorkSpaceRole, number> = {
  viewer: 0,
  editor: 1,
  delete: 2,
  manager: 3,
};

export async function canUseProject(userId: number, role: ProjectAccessRole = "access") {
  return hasProjectBroadAccess(userId, role);
}

export async function hasProjectBroadAccess(userId: number, role: ProjectAccessRole = "access") {
  if (await isSuperAdmin(userId)) return true;
  return authorize({ user: userId, resourceKey: "work.projects", action: role });
}

async function hasProjectL2Access(userId: number, role: ProjectAccessRole = "access") {
  if (await isSystemAdminUser(userId)) return true;
  return authorize({ user: userId, resourceKey: "work.projects", action: role });
}

const PROJECT_MANAGER_ROLES = new Set(["负责人", "项目负责人"]);
const PROJECT_EDITOR_ROLES = new Set(["负责人", "项目负责人", "执行负责", "支持协作"]);
const PROJECT_VIEWER_ROLES = new Set<string>(PROJECT_ROLES);

export interface ProjectPermissionResult {
  canView: boolean;
  canEdit: boolean;
  canManage: boolean;
  canDelete: boolean;
}

type ProjectPermissionProject = {
  id: number;
  projectType?: string | null;
  createdBy: number | null;
  editedBy: number | null;
  leadingDepartmentId?: number | null;
  employees?: Array<{ employeeId: number; role: string | null }>;
};

export async function isSystemAdminUser(userId: number) {
  return isSuperAdmin(userId);
}

export async function getUserEmployeeIds(userId: number) {
  const employees = await prisma.employee.findMany({
    where: { userId },
    select: { id: true },
  });
  return employees.map((employee) => employee.id);
}

export async function hasProjectViewAll(userId: number) {
  return isSystemAdminUser(userId);
}
export async function buildVisibleProjectWhere(userId: number) {
  if (!(await hasProjectL2Access(userId, "access"))) return { id: -1 };
  if (await hasProjectViewAll(userId)) return {};
  const [
    employeeIds,
    managedDepartmentIds,
    scopedProjectIds,
    visibleDepartmentSpaceIds,
    canViewCommitteeProjects,
    canViewOtherProjects,
  ] = await Promise.all([
    getUserEmployeeIds(userId),
    listDepartmentIdsManagedByUserPosition(userId),
    listDirectScopedProjectIds(userId),
    listVisibleProjectDepartmentSpaceIds(userId),
    canViewCommitteeProjectSpace(userId),
    canViewCompanyProjectSpace(userId),
  ]);
  return {
    OR: [
      { createdBy: userId },
      ...(managedDepartmentIds.length ? [{ leadingDepartmentId: { in: managedDepartmentIds } }] : []),
      ...(visibleDepartmentSpaceIds.length ? [{ leadingDepartmentId: { in: visibleDepartmentSpaceIds } }] : []),
      ...(employeeIds.length ? [{ employees: { some: { employeeId: { in: employeeIds } } } }] : []),
      ...(scopedProjectIds.length ? [{ id: { in: scopedProjectIds } }] : []),
      ...(canViewCommitteeProjects ? [{ projectType: "company" }] : []),
      ...(canViewOtherProjects ? [{ projectType: "other" }] : []),
    ],
  };
}

export async function getProjectPermissions(
  userId: number,
  project: ProjectPermissionProject,
): Promise<ProjectPermissionResult> {
  if (await isSystemAdminUser(userId)) return { canView: true, canEdit: true, canManage: true, canDelete: true };

  const [hasL2Access, hasL2Write, hasL2Delete, employeeIds, canViewAll] = await Promise.all([
    hasProjectL2Access(userId, "access"),
    hasProjectL2Access(userId, "write"),
    hasProjectL2Access(userId, "delete"),
    getUserEmployeeIds(userId),
    hasProjectViewAll(userId),
  ]);
  if (!hasL2Access) return { canView: false, canEdit: false, canManage: false, canDelete: false };

  const employeeIdSet = new Set(employeeIds);
  const memberRoles = (project.employees || [])
    .filter((member) => employeeIdSet.has(member.employeeId))
    .map((member) => member.role || "");

  const isCreator = project.createdBy === userId;
  const isDepartmentManager = project.leadingDepartmentId
    ? await isDepartmentResponsiblePositionUser(userId, project.leadingDepartmentId)
    : false;
  const isProjectManager = memberRoles.some((role) => PROJECT_MANAGER_ROLES.has(role));
  const isProjectEditor = memberRoles.some((role) => PROJECT_EDITOR_ROLES.has(role));
  const isProjectViewer = memberRoles.some((role) => PROJECT_VIEWER_ROLES.has(role));
  const canManageByProject = isCreator || isDepartmentManager || isProjectManager;
  const [objectScoped, spaceScoped] = await Promise.all([
    getWorkProjectScopedGrantPermissions(userId, project.id),
    getWorkProjectSpaceGrantPermissionsForProject(userId, project),
  ]);
  const canManage = canManageByProject || objectScoped.canAdmin || spaceScoped.canAdmin;
  const canEdit = canManage
    || (hasL2Write && isProjectEditor)
    || objectScoped.canCreate
    || objectScoped.canWrite
    || objectScoped.canRevise
    || spaceScoped.canCreate
    || spaceScoped.canWrite
    || spaceScoped.canRevise;
  const canView = canViewAll || canManage || canEdit || isProjectViewer || objectScoped.canAccess || spaceScoped.canAccess;

  return {
    canView,
    canEdit,
    canManage,
    canDelete: (hasL2Delete && canManageByProject)
      || objectScoped.canDelete
      || objectScoped.canAdmin
      || spaceScoped.canDelete
      || spaceScoped.canAdmin,
  };
}

async function loadProjectForPermission(projectId: number) {
  return prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      projectType: true,
      createdBy: true,
      editedBy: true,
      leadingDepartmentId: true,
      employees: { select: { employeeId: true, role: true } },
    },
  });
}

export async function getProjectPermissionsById(userId: number, projectId: number) {
  const project = await loadProjectForPermission(projectId);
  if (!project) return null;
  return getProjectPermissions(userId, project);
}

export async function getWorkProjectScopedActionPermissions(userId: number, projectId: number) {
  const [permissions, scoped] = await Promise.all([
    getProjectPermissionsById(userId, projectId),
    getWorkProjectScopedGrantPermissions(userId, projectId),
  ]);
  return {
    canCreate: Boolean(permissions?.canEdit || scoped.canCreate || scoped.canWrite || scoped.canDelete || scoped.canAdmin),
    canWrite: Boolean(permissions?.canEdit || scoped.canWrite || scoped.canDelete || scoped.canAdmin),
    canDelete: Boolean(permissions?.canDelete || scoped.canDelete || scoped.canAdmin),
    canRevise: Boolean(permissions?.canManage || scoped.canRevise || scoped.canAdmin),
  };
}

export async function canCreateProjectAction(userId: number, projectId: number) {
  return (await getWorkProjectScopedActionPermissions(userId, projectId)).canCreate;
}

export async function canWriteProjectAction(userId: number, projectId: number) {
  return (await getWorkProjectScopedActionPermissions(userId, projectId)).canWrite;
}

export async function canDeleteProjectAction(userId: number, projectId: number) {
  return (await getWorkProjectScopedActionPermissions(userId, projectId)).canDelete;
}

export async function canDeleteProjectSubresourceAction(userId: number, projectId: number) {
  return (await getWorkProjectScopedActionPermissions(userId, projectId)).canDelete;
}

export async function canReviseProjectAction(userId: number, projectId: number) {
  return (await getWorkProjectScopedActionPermissions(userId, projectId)).canRevise;
}

export async function canViewProject(userId: number, projectId: number) {
  const permissions = await getProjectPermissionsById(userId, projectId);
  return Boolean(permissions?.canView);
}

export async function canEditProject(userId: number, projectId: number) {
  const permissions = await getProjectPermissionsById(userId, projectId);
  return Boolean(permissions?.canEdit);
}

export async function canManageProject(userId: number, projectId: number) {
  const permissions = await getProjectPermissionsById(userId, projectId);
  return Boolean(permissions?.canManage);
}

export async function canDeleteProject(userId: number, projectId: number) {
  const permissions = await getProjectPermissionsById(userId, projectId);
  return Boolean(permissions?.canDelete);
}

export function normalizeWorkTargetType(targetType: string): WorkSpaceTargetType {
  if (targetType === "user") return "personal";
  if (targetType === "personal" || targetType === "company" || targetType === "committee" || targetType === "department" || targetType === "project" || targetType === "position") return targetType;
  return "department";
}

export function normalizeWorkPermissionKind(_kind: string | null | undefined): WorkSpacePermissionKind {
  return "task";
}

export function normalizeWorkSpaceRole(role: string | null | undefined): WorkSpaceRole {
  if (role === "manager" || role === "delete" || role === "editor" || role === "viewer") return role;
  return "viewer";
}

export function workSpaceRoleAllows(role: WorkSpaceRole | null, required: WorkSpaceRole) {
  if (!role) return false;
  return WORK_SPACE_ROLE_LEVEL[role] >= WORK_SPACE_ROLE_LEVEL[required];
}

export async function hasWorkTaskAdmin(userId: number) {
  return authorize({ user: userId, resourceKey: "work.tasks", action: "admin" });
}

async function isMemberOfTarget(
  userId: number,
  targetType: string,
  targetId: number,
): Promise<boolean> {
  const employees = await prisma.employee.findMany({
    where: { userId },
    select: { id: true },
  });
  const employeeIds = employees.map((employee) => employee.id);
  if (employeeIds.length === 0) return false;

  if (targetType === "department") {
    const edp = await prisma.eDP.findFirst({
      where: currentOpenEndedDateWhere({ employeeId: { in: employeeIds }, departmentId: targetId }),
    });
    return Boolean(edp);
  }

  if (targetType === "project") {
    const employeeProject = await prisma.employeeProject.findFirst({
      where: { employeeId: { in: employeeIds }, projectId: targetId },
    });
    return Boolean(employeeProject);
  }

  if (targetType === "company" || targetType === "committee") return false;

  if (targetType === "position") {
    const edp = await prisma.eDP.findFirst({
      where: currentOpenEndedDateWhere({ employeeId: { in: employeeIds }, positionId: targetId }),
    });
    return Boolean(edp);
  }

  if ((targetType === "user" || targetType === "personal") && targetId === userId) return true;
  return false;
}

async function isAssignee(
  userId: number,
  targetType: string,
  targetId: number,
): Promise<boolean> {
  if (targetType === "department") {
    const assignee = await prisma.departmentWorkAssignee.findFirst({
      where: { departmentId: targetId, userId, kind: "task" },
    });
    return Boolean(assignee);
  }

  if (targetType === "company" || targetType === "committee") return false;

  if (targetType === "project") {
    const assignee = await prisma.projectWorkAssignee.findFirst({
      where: { projectId: targetId, userId, kind: "task" },
    });
    return Boolean(assignee);
  }

  return false;
}

async function hasNaturalProjectTaskManagerRole(userId: number, projectId: number) {
  const [project, employeeIds] = await Promise.all([
    loadProjectForPermission(projectId),
    getUserEmployeeIds(userId),
  ]);
  if (!project) return false;

  const employeeIdSet = new Set(employeeIds);
  const isProjectManager = (project.employees || []).some(
    (member) => employeeIdSet.has(member.employeeId) && PROJECT_MANAGER_ROLES.has(member.role || ""),
  );
  return project.createdBy === userId
    || Boolean(project.leadingDepartmentId && await isDepartmentResponsiblePositionUser(userId, project.leadingDepartmentId))
    || isProjectManager;
}

async function explicitWorkSpaceRole(
  userId: number,
  targetType: WorkSpaceTargetType,
  targetId: number,
) {
  const rows = await prisma.workScopePermission.findMany({
    where: {
      userId,
      targetType,
      targetId,
      kind: "task",
    },
    select: { role: true },
  });
  return rows.reduce<WorkSpaceRole | null>((best, row) => {
    const role = normalizeWorkSpaceRole(row.role);
    return !best || WORK_SPACE_ROLE_LEVEL[role] > WORK_SPACE_ROLE_LEVEL[best] ? role : best;
  }, null);
}

async function baseWorkSpaceRole(
  userId: number,
  targetType: WorkSpaceTargetType,
  targetId: number,
) {
  const [natural, explicit] = await Promise.all([
    naturalWorkSpaceRole(userId, targetType, targetId),
    explicitWorkSpaceRole(userId, targetType, targetId),
  ]);
  return maxWorkSpaceRole(natural, explicit);
}

async function scopedActionWorkSpaceRole(
  userId: number,
  targetType: WorkSpaceTargetType,
  targetId: number,
): Promise<WorkSpaceRole | null> {
  const scopeId = workTaskScopeId(targetType, targetId);
  const [admin, deleteRole, archive, write, create, access] = await Promise.all([
    evaluatePermissionAction(userId, "work.tasks", "admin", { scopeId }),
    evaluatePermissionAction(userId, "work.tasks", "delete", { scopeId }),
    evaluatePermissionAction(userId, "work.tasks", "archive", { scopeId }),
    evaluatePermissionAction(userId, "work.tasks", "write", { scopeId }),
    evaluatePermissionAction(userId, "work.tasks", "create", { scopeId }),
    evaluatePermissionAction(userId, "work.tasks", "access", { scopeId }),
  ]);
  if (admin) return "manager";
  if (deleteRole || archive) return "delete";
  if (write || create) return "editor";
  return access ? "viewer" : null;
}

async function naturalWorkSpaceRole(
  userId: number,
  targetType: WorkSpaceTargetType,
  targetId: number,
): Promise<WorkSpaceRole | null> {
  if (targetType === "personal") return targetId === userId ? "manager" : null;
  if (await hasWorkTaskAdmin(userId)) return "manager";

  if (targetType === "department") {
    const [departmentRole, assigned] = await Promise.all([
      getDepartmentNaturalSpaceRole(userId, targetId),
      isAssignee(userId, "department", targetId),
    ]);
    if (departmentRole === "manager") return "manager";
    if (assigned) return "editor";
    return departmentRole as WorkSpaceRole | null;
  }

  if (targetType === "company") {
    return getCompanyNaturalSpaceRole(userId) as Promise<WorkSpaceRole | null>;
  }

  if (targetType === "committee") {
    return getOperatingCommitteeNaturalSpaceRole(userId) as Promise<WorkSpaceRole | null>;
  }

  if (targetType === "project") {
    if (await hasNaturalProjectTaskManagerRole(userId, targetId)) return "manager";

    const permissions = await getProjectPermissionsById(userId, targetId);
    if (permissions?.canManage) return "manager";
    if (permissions?.canDelete) return "delete";
    if (permissions?.canEdit) return "editor";
    if (await isAssignee(userId, "project", targetId)) return "editor";
    return permissions?.canView || await isMemberOfTarget(userId, "project", targetId) ? "viewer" : null;
  }

  if (targetType === "position") return await isMemberOfTarget(userId, "position", targetId) ? "viewer" : null;
  return null;
}

export async function getWorkSpaceRole(
  userId: number,
  targetTypeInput: string,
  targetId: number,
  kindInput: string | null | undefined = "task",
): Promise<WorkSpaceRole | null> {
  const targetType = normalizeWorkTargetType(targetTypeInput);
  normalizeWorkPermissionKind(kindInput);
  const [baseRole, actionRole] = await Promise.all([
    baseWorkSpaceRole(userId, targetType, targetId),
    scopedActionWorkSpaceRole(userId, targetType, targetId),
  ]);
  return maxWorkSpaceRole(baseRole, actionRole);
}

export async function canAccessTarget(
  userId: number,
  targetType: string,
  targetId: number,
): Promise<boolean> {
  const role = await getWorkSpaceRole(userId, targetType, targetId, "task");
  return workSpaceRoleAllows(role, "viewer");
}

export async function canEditWorkTask(userId: number, targetType: string, targetId: number): Promise<boolean> {
  const role = await getWorkSpaceRole(userId, targetType, targetId, "task");
  return workSpaceRoleAllows(role, "editor");
}

export async function canDeleteWorkTask(userId: number, targetType: string, targetId: number): Promise<boolean> {
  const role = await getWorkSpaceRole(userId, targetType, targetId, "task");
  return workSpaceRoleAllows(role, "delete");
}

function workTaskScopeId(targetType: string, targetId: number) {
  return businessSpaceScopeId(normalizeWorkTargetType(targetType), targetId);
}

async function hasWorkTaskScopedAction(
  userId: number,
  targetType: string,
  targetId: number,
  actionKey: PermissionActionKey,
) {
  return evaluatePermissionAction(userId, "work.tasks", actionKey, {
    scopeId: workTaskScopeId(targetType, targetId),
  });
}

function workTaskActionPermissionsFromRole(role: WorkSpaceRole | null) {
  return {
    canCreate: workSpaceRoleAllows(role, "editor"),
    canWrite: workSpaceRoleAllows(role, "editor"),
    canDelete: workSpaceRoleAllows(role, "delete"),
    canArchive: workSpaceRoleAllows(role, "delete"),
  };
}

export async function getEffectiveWorkTaskActionPermissions(
  userId: number,
  targetTypeInput: string,
  targetId: number,
) {
  const targetType = normalizeWorkTargetType(targetTypeInput);
  const [baseRole, canCreate, canWrite, canDelete, canArchive] = await Promise.all([
    baseWorkSpaceRole(userId, targetType, targetId),
    hasWorkTaskScopedAction(userId, targetType, targetId, "create"),
    hasWorkTaskScopedAction(userId, targetType, targetId, "write"),
    hasWorkTaskScopedAction(userId, targetType, targetId, "delete"),
    hasWorkTaskScopedAction(userId, targetType, targetId, "archive"),
  ]);
  const base = workTaskActionPermissionsFromRole(baseRole);
  return {
    canCreate: base.canCreate || canCreate || canWrite || canDelete,
    canWrite: base.canWrite || canWrite || canDelete,
    canDelete: base.canDelete || canDelete,
    canArchive: base.canArchive || canArchive,
  };
}

export async function canCreateWorkTaskAction(userId: number, targetType: string, targetId: number) {
  return (await getEffectiveWorkTaskActionPermissions(userId, targetType, targetId)).canCreate;
}

export async function canWriteWorkTaskAction(userId: number, targetType: string, targetId: number) {
  return (await getEffectiveWorkTaskActionPermissions(userId, targetType, targetId)).canWrite;
}

export async function canDeleteWorkTaskAction(userId: number, targetType: string, targetId: number) {
  return (await getEffectiveWorkTaskActionPermissions(userId, targetType, targetId)).canDelete;
}

export async function canArchiveWorkTaskAction(userId: number, targetType: string, targetId: number) {
  return (await getEffectiveWorkTaskActionPermissions(userId, targetType, targetId)).canArchive;
}

export async function canManageWorkTaskSpace(userId: number, targetType: string, targetId: number) {
  const role = await getWorkSpaceRole(userId, targetType, targetId, "task");
  return workSpaceRoleAllows(role, "manager");
}

function maxWorkSpaceRole(left: WorkSpaceRole | null, right: WorkSpaceRole | null) {
  if (!left) return right;
  if (!right) return left;
  return WORK_SPACE_ROLE_LEVEL[left] >= WORK_SPACE_ROLE_LEVEL[right] ? left : right;
}
