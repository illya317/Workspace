import { authorize } from "@workspace/platform/server/auth";
import { isSuperAdmin } from "@workspace/platform/server/auth";
import { prisma } from "@workspace/platform/server/prisma";
import { PROJECT_ROLES } from "../constants/field-options";

export type ProjectAccessRole = "access" | "write" | "delete" | "admin";

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

const PROJECT_VIEW_ALL_RESOURCE = "work.projects.viewAll";
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
  createdBy: number | null;
  editedBy: number | null;
  leadingDepartment?: { managerUserId: number | null } | null;
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
  if (await isSystemAdminUser(userId)) return true;
  return authorize({ user: userId, resourceKey: PROJECT_VIEW_ALL_RESOURCE, action: "access" });
}

export async function buildVisibleProjectWhere(userId: number) {
  if (!(await hasProjectL2Access(userId, "access"))) return { id: -1 };
  if (await hasProjectViewAll(userId)) return {};
  const employeeIds = await getUserEmployeeIds(userId);
  return {
    OR: [
      { createdBy: userId },
      { leadingDepartment: { managerUserId: userId } },
      ...(employeeIds.length ? [{ employees: { some: { employeeId: { in: employeeIds } } } }] : []),
    ],
  };
}

export async function getProjectPermissions(
  userId: number,
  project: ProjectPermissionProject,
): Promise<ProjectPermissionResult> {
  if (await isSystemAdminUser(userId)) return { canView: true, canEdit: true, canManage: true, canDelete: true };

  const [hasL2Access, hasL2Write, hasL2Delete, hasL2Admin, employeeIds, canViewAll] = await Promise.all([
    hasProjectL2Access(userId, "access"),
    hasProjectL2Access(userId, "write"),
    hasProjectL2Access(userId, "delete"),
    hasProjectL2Access(userId, "admin"),
    getUserEmployeeIds(userId),
    hasProjectViewAll(userId),
  ]);
  if (!hasL2Access) return { canView: false, canEdit: false, canManage: false, canDelete: false };

  const employeeIdSet = new Set(employeeIds);
  const memberRoles = (project.employees || [])
    .filter((member) => employeeIdSet.has(member.employeeId))
    .map((member) => member.role || "");

  const isCreator = project.createdBy === userId;
  const isDepartmentManager = project.leadingDepartment?.managerUserId === userId;
  const isProjectManager = memberRoles.some((role) => PROJECT_MANAGER_ROLES.has(role));
  const isProjectEditor = memberRoles.some((role) => PROJECT_EDITOR_ROLES.has(role));
  const isProjectViewer = memberRoles.some((role) => PROJECT_VIEWER_ROLES.has(role));
  const canManageByProject = isCreator || isDepartmentManager || isProjectManager;
  const canManage = hasL2Admin && canManageByProject;
  const canEdit = hasL2Write && (canManageByProject || isProjectEditor);
  const canView = canViewAll || canManageByProject || isProjectViewer;

  return {
    canView,
    canEdit,
    canManage,
    canDelete: hasL2Delete && canManageByProject,
  };
}

async function loadProjectForPermission(projectId: number) {
  return prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      createdBy: true,
      editedBy: true,
      leadingDepartment: { select: { managerUserId: true } },
      employees: { select: { employeeId: true, role: true } },
    },
  });
}

export async function getProjectPermissionsById(userId: number, projectId: number) {
  const project = await loadProjectForPermission(projectId);
  if (!project) return null;
  return getProjectPermissions(userId, project);
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
      where: { employeeId: { in: employeeIds }, departmentId: targetId },
    });
    return Boolean(edp);
  }

  if (targetType === "project") {
    const employeeProject = await prisma.employeeProject.findFirst({
      where: { employeeId: { in: employeeIds }, projectId: targetId },
    });
    return Boolean(employeeProject);
  }

  if (targetType === "position") {
    const edp = await prisma.eDP.findFirst({
      where: { employeeId: { in: employeeIds }, positionId: targetId },
    });
    return Boolean(edp);
  }

  if (targetType === "user") return targetId === userId;
  return false;
}

async function isAssignee(
  userId: number,
  targetType: string,
  targetId: number,
  kind: "task" | "report",
): Promise<boolean> {
  if (targetType === "department") {
    const assignee = await prisma.departmentWorkAssignee.findFirst({
      where: { departmentId: targetId, userId, kind },
    });
    return Boolean(assignee);
  }

  if (targetType === "project") {
    const assignee = await prisma.projectWorkAssignee.findFirst({
      where: { projectId: targetId, userId, kind },
    });
    return Boolean(assignee);
  }

  return false;
}

export async function canAccessTarget(
  userId: number,
  targetType: string,
  targetId: number,
): Promise<boolean> {
  if (targetType === "user" && targetId === userId) return true;
  if (await authorize({ user: userId, resourceKey: "work", action: "admin" })) return true;
  return isMemberOfTarget(userId, targetType, targetId);
}

export async function canSubmitToTarget(
  userId: number,
  targetType: string,
  targetId: number,
): Promise<boolean> {
  if (targetType === "user" && targetId === userId) return true;
  if (await authorize({ user: userId, resourceKey: "work", action: "admin" })) return true;
  return isAssignee(userId, targetType, targetId, "report");
}

export async function canEditWorkTask(
  userId: number,
  targetType: string,
  targetId: number,
): Promise<boolean> {
  if (targetType === "user" && targetId === userId) return true;
  if (await authorize({ user: userId, resourceKey: "work", action: "admin" })) return true;
  return isAssignee(userId, targetType, targetId, "task");
}
