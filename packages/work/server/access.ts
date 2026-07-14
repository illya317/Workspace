import { isSuperAdmin } from "@workspace/platform/server/auth/admin";
import { evaluatePermissionAction } from "@workspace/platform/server/rbac/action-grants";
import { canEnterResource } from "@workspace/platform/server/rbac/resource-entry";
import { actionImplies, type PermissionActionKey } from "@workspace/platform/permission-actions";
import {
  getNaturalSpaceActionProfileActionKeys,
  type NaturalSpaceActionProfile,
} from "@workspace/platform/permission-natural-space-actions";
import { getSpaceChildResourceKeyForTargetType } from "@workspace/platform/permission-resource-policy";
import {
  businessSpaceScopeId,
  getCompanyNaturalSpaceActionProfile,
  getDepartmentNaturalSpaceActionProfile,
  isDepartmentResponsiblePositionUser,
  listDepartmentIdsManagedByUserPosition,
  getOperatingCommitteeNaturalSpaceActionProfile,
} from "@workspace/platform/server/business-space-permissions";
import { prisma } from "@workspace/platform/server/prisma";
import { PROJECT_ROLES } from "../constants/field-options";
import {
  canViewCommitteeProjectSpace,
  canViewCompanyProjectSpace,
  getWorkProjectSpaceGrantPermissionsForProject,
  listVisibleProjectDepartmentSpaceIds,
} from "./project-space-action-access";

export type ProjectAccessRole = "entry";
export type WorkSpaceTargetType = "personal" | "company" | "committee" | "department" | "project";
export type WorkSpacePermissionKind = "project" | "task";

export async function canUseProject(userId: number, role: ProjectAccessRole = "entry") {
  void role;
  return canEnterResource(userId, "work.projects");
}

async function hasProjectL2Access(userId: number) {
  if (await isSystemAdminUser(userId)) return true;
  return canUseProject(userId);
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
  if (!(await hasProjectL2Access(userId))) return { id: -1 };
  if (await hasProjectViewAll(userId)) return {};
  const [
    employeeIds,
    managedDepartmentIds,
    visibleDepartmentSpaceIds,
    canViewCommitteeProjects,
    canViewOtherProjects,
  ] = await Promise.all([
    getUserEmployeeIds(userId),
    listDepartmentIdsManagedByUserPosition(userId),
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

  const [hasL2Access, employeeIds, canViewAll] = await Promise.all([
    hasProjectL2Access(userId),
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
  const spaceScoped = await getWorkProjectSpaceGrantPermissionsForProject(userId, project);
  const canManage = canManageByProject;
  const canEdit = canManage
    || isProjectEditor
    || spaceScoped.canCreate
    || spaceScoped.canUpdate
    || spaceScoped.canRevise;
  const canView = canViewAll || canManage || canEdit || isProjectViewer || spaceScoped.canRead;

  return {
    canView,
    canEdit,
    canManage,
    canDelete: canManageByProject || spaceScoped.canDelete,
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
  const permissions = await getProjectPermissionsById(userId, projectId);
  return {
    canCreate: Boolean(permissions?.canEdit),
    canUpdate: Boolean(permissions?.canEdit),
    canDelete: Boolean(permissions?.canDelete),
    canRevise: Boolean(permissions?.canManage),
  };
}

export async function canCreateProjectAction(userId: number, projectId: number) {
  return (await getWorkProjectScopedActionPermissions(userId, projectId)).canCreate;
}

export async function canUpdateProjectAction(userId: number, projectId: number) {
  return (await getWorkProjectScopedActionPermissions(userId, projectId)).canUpdate;
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

export async function canViewProject(userId: number, projectId: number) { return Boolean((await getProjectPermissionsById(userId, projectId))?.canView); }
export async function canEditProject(userId: number, projectId: number) { return Boolean((await getProjectPermissionsById(userId, projectId))?.canEdit); }
export async function canManageProject(userId: number, projectId: number) { return Boolean((await getProjectPermissionsById(userId, projectId))?.canManage); }
export async function canDeleteProject(userId: number, projectId: number) { return Boolean((await getProjectPermissionsById(userId, projectId))?.canDelete); }

export function normalizeWorkTargetType(targetType: string): WorkSpaceTargetType {
  if (targetType === "user") return "personal";
  if (targetType === "personal" || targetType === "company" || targetType === "committee" || targetType === "department" || targetType === "project") return targetType;
  return "department";
}

export function getWorkTaskPermissionResourceKey(targetType: string) {
  const normalized = normalizeWorkTargetType(targetType);
  if (normalized !== "company" && normalized !== "committee" && normalized !== "department") return "work.tasks";
  return getSpaceChildResourceKeyForTargetType(normalized, "tasks") ?? "work.tasks";
}

export function getWorkTaskPermissionProjection(targetType: string) {
  return getWorkTaskPermissionResourceKey(targetType) === "work.tasks" ? "default" : "space";
}

export function normalizeWorkPermissionKind(_kind: string | null | undefined): WorkSpacePermissionKind {
  return "task";
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

  return false;
}

async function scopedWorkTaskActions(
  userId: number,
  targetType: WorkSpaceTargetType,
  targetId: number,
) {
  if (targetType === "project") return emptyWorkTaskActions();
  const scopeId = workTaskScopeId(targetType, targetId);
  const resourceKey = getWorkTaskPermissionResourceKey(targetType);
  const projection = getWorkTaskPermissionProjection(targetType);
  const [canRead, canCreate, canUpdate, canDelete, canArchive, canSubmit, canApprove, canReject, canManagePermissions] = await Promise.all([
    evaluatePermissionAction(userId, resourceKey, "read", { scopeId, projection }),
    evaluatePermissionAction(userId, resourceKey, "create", { scopeId, projection }),
    evaluatePermissionAction(userId, resourceKey, "update", { scopeId, projection }),
    evaluatePermissionAction(userId, resourceKey, "delete", { scopeId, projection }),
    evaluatePermissionAction(userId, resourceKey, "archive", { scopeId, projection }),
    evaluatePermissionAction(userId, resourceKey, "submit", { scopeId, projection }),
    evaluatePermissionAction(userId, resourceKey, "approve", { scopeId, projection }),
    evaluatePermissionAction(userId, resourceKey, "reject", { scopeId, projection }),
    evaluatePermissionAction(userId, resourceKey, "grant", { scopeId, projection }),
  ]);
  return {
    canRead: canRead || canCreate || canUpdate || canDelete || canArchive || canSubmit || canApprove || canReject,
    canCreate,
    canUpdate,
    canDelete,
    canArchive,
    canSubmit,
    canApprove: canApprove || canReject,
    canManagePermissions,
  };
}

async function naturalWorkTaskActionProfile(
  userId: number,
  targetType: WorkSpaceTargetType,
  targetId: number,
): Promise<NaturalSpaceActionProfile | null> {
  if (targetType === "personal") return targetId === userId ? "allBusiness" : null;

  if (targetType === "department") {
    return getDepartmentNaturalSpaceActionProfile(userId, targetId);
  }

  if (targetType === "company") {
    return getCompanyNaturalSpaceActionProfile(userId);
  }

  if (targetType === "committee") {
    return getOperatingCommitteeNaturalSpaceActionProfile(userId);
  }

  return null;
}

async function projectWorkTaskActions(userId: number, projectId: number) {
  const permissions = await getProjectPermissionsById(userId, projectId);
  if (!permissions?.canView) return emptyWorkTaskActions();
  return {
    ...emptyWorkTaskActions(),
    canRead: true,
    canCreate: permissions.canEdit,
    canUpdate: permissions.canEdit,
    canDelete: permissions.canDelete,
    canArchive: permissions.canEdit,
    canSubmit: permissions.canEdit,
    canApprove: permissions.canManage,
  };
}

export async function canViewWorkTaskTarget(
  userId: number,
  targetType: string,
  targetId: number,
): Promise<boolean> {
  return (await getEffectiveWorkTaskActionPermissions(userId, targetType, targetId)).canRead;
}

export async function canEditWorkTask(userId: number, targetType: string, targetId: number): Promise<boolean> {
  const permissions = await getEffectiveWorkTaskActionPermissions(userId, targetType, targetId);
  return permissions.canCreate || permissions.canUpdate;
}

export async function canDeleteWorkTask(userId: number, targetType: string, targetId: number): Promise<boolean> {
  return (await getEffectiveWorkTaskActionPermissions(userId, targetType, targetId)).canDelete;
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
  const resourceKey = getWorkTaskPermissionResourceKey(targetType);
  return evaluatePermissionAction(userId, resourceKey, actionKey, {
    scopeId: workTaskScopeId(targetType, targetId),
    projection: getWorkTaskPermissionProjection(targetType),
  });
}

function emptyWorkTaskActions() {
  return {
    canRead: false,
    canCreate: false,
    canUpdate: false,
    canDelete: false,
    canArchive: false,
    canSubmit: false,
    canApprove: false,
    canManagePermissions: false,
  };
}

function workTaskActionsFromKeys(resourceKey: string, actionKeys: PermissionActionKey[]) {
  const grants = new Set(actionKeys);
  const allows = (actionKey: PermissionActionKey) =>
    actionKeys.some((grantedActionKey) => actionImplies(grantedActionKey, actionKey));
  return {
    ...emptyWorkTaskActions(),
    canRead: allows("read"),
    canCreate: grants.has("create"),
    canUpdate: grants.has("update"),
    canDelete: grants.has("delete"),
    canArchive: grants.has("archive"),
    canSubmit: grants.has("submit"),
    canApprove: grants.has("approve") || grants.has("reject"),
    canManagePermissions: grants.has("grant") && resourceKey !== "work.tasks",
  };
}

function mergeWorkTaskActions(...items: ReturnType<typeof emptyWorkTaskActions>[]) {
  return items.reduce((merged, item) => ({
    canRead: merged.canRead || item.canRead,
    canCreate: merged.canCreate || item.canCreate,
    canUpdate: merged.canUpdate || item.canUpdate,
    canDelete: merged.canDelete || item.canDelete,
    canArchive: merged.canArchive || item.canArchive,
    canSubmit: merged.canSubmit || item.canSubmit,
    canApprove: merged.canApprove || item.canApprove,
    canManagePermissions: merged.canManagePermissions || item.canManagePermissions,
  }), emptyWorkTaskActions());
}

async function baseWorkTaskActions(
  userId: number,
  targetType: WorkSpaceTargetType,
  targetId: number,
) {
  if (targetType === "project") return projectWorkTaskActions(userId, targetId);
  const resourceKey = getWorkTaskPermissionResourceKey(targetType);
  const [profile, assigned] = await Promise.all([
    naturalWorkTaskActionProfile(userId, targetType, targetId),
    isAssignee(userId, targetType, targetId),
  ]);
  const profileActions = profile
    ? workTaskActionsFromKeys(resourceKey, getNaturalSpaceActionProfileActionKeys(resourceKey, profile))
    : emptyWorkTaskActions();
  const assigneeActions = assigned
    ? { ...emptyWorkTaskActions(), canRead: true, canCreate: true, canUpdate: true, canSubmit: true }
    : emptyWorkTaskActions();
  return mergeWorkTaskActions(profileActions, assigneeActions);
}

export async function getEffectiveWorkTaskActionPermissions(
  userId: number,
  targetTypeInput: string,
  targetId: number,
) {
  const targetType = normalizeWorkTargetType(targetTypeInput);
  const [base, scoped] = await Promise.all([
    baseWorkTaskActions(userId, targetType, targetId),
    scopedWorkTaskActions(userId, targetType, targetId),
  ]);
  return mergeWorkTaskActions(base, scoped);
}

export async function canCreateWorkTaskAction(userId: number, targetType: string, targetId: number) { return (await getEffectiveWorkTaskActionPermissions(userId, targetType, targetId)).canCreate; }
export async function canUpdateWorkTaskAction(userId: number, targetType: string, targetId: number) { return (await getEffectiveWorkTaskActionPermissions(userId, targetType, targetId)).canUpdate; }
export async function canDeleteWorkTaskAction(userId: number, targetType: string, targetId: number) { return (await getEffectiveWorkTaskActionPermissions(userId, targetType, targetId)).canDelete; }
export async function canArchiveWorkTaskAction(userId: number, targetType: string, targetId: number) { return (await getEffectiveWorkTaskActionPermissions(userId, targetType, targetId)).canArchive; }
export async function canSubmitWorkTaskAction(userId: number, targetType: string, targetId: number) { return (await getEffectiveWorkTaskActionPermissions(userId, targetType, targetId)).canSubmit; }
export async function canApproveWorkTaskAction(userId: number, targetType: string, targetId: number) { return (await getEffectiveWorkTaskActionPermissions(userId, targetType, targetId)).canApprove; }

export async function canManageWorkTaskSpace(userId: number, targetType: string, targetId: number) {
  return hasWorkTaskScopedAction(userId, targetType, targetId, "grant");
}
