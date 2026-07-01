import { serviceError, serviceOk } from "@workspace/platform/server/api";
import {
  businessSpaceScopeId,
  getCompanyNaturalSpaceRole,
  getGroupCompanyContext,
  listDepartmentNaturalSpacePermissions,
  listCompanyNaturalSpacePermissions,
  listOperatingCommitteeNaturalSpacePermissions,
  mergeBusinessSpacePermissionRows,
  getDepartmentNaturalSpaceRole,
  getOperatingCommitteeNaturalSpaceRole,
  getOperatingCommitteeDepartmentContext,
} from "@workspace/platform/server/business-space-permissions";
import { authorize } from "@workspace/platform/server/auth";
import { currentOpenEndedDateWhere } from "@workspace/platform/server/fk-registry";
import { prisma } from "@workspace/platform/server/prisma";
import { evaluatePermissionAction } from "@workspace/platform/server/auth";
import { getUserPreferredDepartmentIds } from "@workspace/platform/server/user-preferences";
import {
  normalizeWorkSpaceRole,
  workSpaceRoleAllows,
  type WorkSpaceRole,
} from "./access";
import { canPersistWorkSpaceRole } from "./domain/work-space-validation";

export type WorkProjectSpaceTargetType = "personal" | "company" | "committee" | "department";

export type WorkProjectSpace = {
  targetType: WorkProjectSpaceTargetType;
  targetId: number;
  name: string;
  subtitle: string | null;
  role: WorkSpaceRole;
  actionPermissions: WorkProjectSpaceActionPermissions;
};

export type WorkProjectSpaceActionPermissions = {
  canCreate: boolean;
  canWrite: boolean;
  canDelete: boolean;
  canRevise: boolean;
};

export type WorkProjectScopePermissionInput = {
  userId: number;
  role: WorkSpaceRole;
  kind?: "project";
};

type ProjectSpaceSeed = {
  targetType: WorkProjectSpaceTargetType;
  targetId: number;
  name: string;
  subtitle: string | null;
};

const WORK_PROJECT_PERMISSION_KIND = "project" as const;

export async function executeWorkProjectSpacesRouteCommand(command: { userId: number }) {
  return serviceOk(await listWorkProjectSpaces(command.userId));
}

export function normalizeWorkProjectSpaceTargetType(targetType: string): WorkProjectSpaceTargetType {
  if (targetType === "user") return "personal";
  if (targetType === "personal" || targetType === "company" || targetType === "committee" || targetType === "department") return targetType;
  return "department";
}

export function workProjectSpaceScopeId(targetType: string, targetId: number) {
  return businessSpaceScopeId(normalizeWorkProjectSpaceTargetType(targetType), targetId);
}

export async function listWorkProjectSpaces(userId: number): Promise<{ spaces: WorkProjectSpace[]; preferredDepartmentIds: number[] }> {
  const isAdmin = await hasWorkProjectAdmin(userId);
  const [user, companies, committees, departments, preferredDepartmentIds] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        nickname: true,
        username: true,
        employees: { select: { name: true }, take: 1 },
      },
    }),
    listCompanyProjectSpaceSeeds(userId, isAdmin),
    listCommitteeProjectSpaceSeeds(userId, isAdmin),
    listDepartmentProjectSpaceSeeds(userId, isAdmin),
    getUserPreferredDepartmentIds(userId),
  ]);

  const seeds = dedupeProjectSpaceSeeds([
    {
      targetType: "personal",
      targetId: userId,
      name: user?.employees[0]?.name || user?.nickname || user?.username || "个人空间",
      subtitle: "个人项目权限",
    },
    ...companies,
    ...committees,
    ...departments,
  ]);
  const spaces = await Promise.all(seeds.map(async (seed) => {
    const role = isAdmin ? "manager" : await getWorkProjectSpaceRole(userId, seed.targetType, seed.targetId);
    if (!role) return null;
    return {
      ...seed,
      role,
      actionPermissions: await getWorkProjectSpaceActionPermissions(userId, seed.targetType, seed.targetId),
    };
  }));

  return {
    spaces: spaces.filter((space): space is WorkProjectSpace => Boolean(space)),
    preferredDepartmentIds,
  };
}

async function listCompanyProjectSpaceSeeds(userId: number, isAdmin: boolean): Promise<ProjectSpaceSeed[]> {
  const company = await getGroupCompanyContext();
  if (!company) return [];
  if (isAdmin || await getWorkProjectSpaceRole(userId, "company", company.id)) {
    return [{
      targetType: "company",
      targetId: company.id,
      name: company.name || "公司",
      subtitle: "公司级项目权限",
    }];
  }
  return [];
}

async function listCommitteeProjectSpaceSeeds(userId: number, isAdmin: boolean): Promise<ProjectSpaceSeed[]> {
  const committee = await getOperatingCommitteeDepartmentContext();
  if (!committee) return [];
  if (isAdmin || await getWorkProjectSpaceRole(userId, "committee", committee.id) || await explicitWorkProjectSpaceRole(userId, "committee", committee.id)) {
    return [{
      targetType: "committee",
      targetId: committee.id,
      name: committee.name,
      subtitle: committee.code,
    }];
  }
  return [];
}

async function listDepartmentProjectSpaceSeeds(userId: number, isAdmin: boolean): Promise<ProjectSpaceSeed[]> {
  if (isAdmin) {
    const rows = await prisma.department.findMany({
      where: { code: { not: "EXC001" } },
      select: { id: true, name: true, code: true, isArchived: true },
      orderBy: [{ isArchived: "asc" }, { code: "asc" }, { id: "asc" }],
    });
    return rows.map(departmentProjectSpaceSeed);
  }

  const [edps, explicit, actionDepartmentIds] = await Promise.all([
    prisma.employee.findMany({
      where: {
        userId,
        employments: { some: { isActive: true } },
        positions: { some: currentOpenEndedDateWhere({ departmentId: { not: null } }) },
      },
      select: {
        positions: {
          where: currentOpenEndedDateWhere({ departmentId: { not: null } }),
          select: { department: { select: { id: true, name: true, code: true, isArchived: true } } },
        },
      },
    }),
    prisma.workScopePermission.findMany({
      where: { userId, targetType: "department", kind: WORK_PROJECT_PERMISSION_KIND },
      select: { targetId: true },
    }),
    listDirectActionGrantTargetIds(userId, "work.projects", "department"),
  ]);

  const explicitDepartmentIds = [...explicit.map((item) => item.targetId), ...actionDepartmentIds];
  const explicitDepartments = explicitDepartmentIds.length ? await prisma.department.findMany({
    where: { id: { in: explicitDepartmentIds } },
    select: { id: true, name: true, code: true, isArchived: true },
  }) : [];

  return [
    ...edps.flatMap((item) => item.positions.map((position) => position.department)).filter(Boolean),
    ...explicitDepartments,
  ]
    .filter((department) => department?.code !== "EXC001")
    .map((department) => departmentProjectSpaceSeed(department!));
}

function departmentProjectSpaceSeed(department: { id: number; name: string; code: string; isArchived: boolean }): ProjectSpaceSeed {
  return {
    targetType: "department",
    targetId: department.id,
    name: department.name,
    subtitle: department.isArchived ? `${department.code} · 已归档` : department.code,
  };
}

async function listDirectActionGrantTargetIds(userId: number, resourceKey: string, targetType: string) {
  const prefix = `${targetType}:`;
  const rows = await prisma.userResourceActionGrant.findMany({
    where: {
      userId,
      resource: { key: resourceKey },
      scopeId: { startsWith: prefix },
    },
    select: { scopeId: true },
  });
  return Array.from(new Set(rows.flatMap((row) => {
    const id = Number(row.scopeId?.slice(prefix.length));
    return Number.isInteger(id) && id > 0 ? [id] : [];
  })));
}

async function hasWorkProjectAdmin(userId: number) {
  return authorize({ user: userId, resourceKey: "work.projects", action: "admin" });
}

async function explicitWorkProjectSpaceRole(
  userId: number,
  targetType: WorkProjectSpaceTargetType,
  targetId: number,
) {
  const rows = await prisma.workScopePermission.findMany({
    where: { userId, targetType, targetId, kind: WORK_PROJECT_PERMISSION_KIND },
    select: { role: true },
  });
  return rows.reduce<WorkSpaceRole | null>((best, row) => {
    const role = normalizeWorkSpaceRole(row.role);
    return !best || roleLevel(role) > roleLevel(best) ? role : best;
  }, null);
}

async function scopedActionWorkProjectSpaceRole(
  userId: number,
  targetType: WorkProjectSpaceTargetType,
  targetId: number,
): Promise<WorkSpaceRole | null> {
  const scopeId = workProjectSpaceScopeId(targetType, targetId);
  const [admin, deleteRole, write, create, revise, access] = await Promise.all([
    evaluatePermissionAction(userId, "work.projects", "admin", { scopeId }),
    evaluatePermissionAction(userId, "work.projects", "delete", { scopeId }),
    evaluatePermissionAction(userId, "work.projects", "write", { scopeId }),
    evaluatePermissionAction(userId, "work.projects", "create", { scopeId }),
    evaluatePermissionAction(userId, "work.projects", "revise", { scopeId }),
    evaluatePermissionAction(userId, "work.projects", "access", { scopeId }),
  ]);
  if (admin) return "manager";
  if (deleteRole) return "delete";
  if (write || create || revise) return "editor";
  return access ? "viewer" : null;
}

async function naturalWorkProjectSpaceRole(
  userId: number,
  targetType: WorkProjectSpaceTargetType,
  targetId: number,
): Promise<WorkSpaceRole | null> {
  if (targetType === "personal") return targetId === userId ? "manager" : null;
  if (await hasWorkProjectAdmin(userId)) return "manager";
  if (targetType === "department") return getDepartmentNaturalSpaceRole(userId, targetId);
  if (targetType === "company") return getCompanyNaturalSpaceRole(userId) as Promise<WorkSpaceRole | null>;
  if (targetType === "committee") return getOperatingCommitteeNaturalSpaceRole(userId) as Promise<WorkSpaceRole | null>;
  return null;
}

export async function getWorkProjectSpaceRole(
  userId: number,
  targetTypeInput: string,
  targetId: number,
): Promise<WorkSpaceRole | null> {
  const targetType = normalizeWorkProjectSpaceTargetType(targetTypeInput);
  const [natural, explicit, actionRole] = await Promise.all([
    naturalWorkProjectSpaceRole(userId, targetType, targetId),
    explicitWorkProjectSpaceRole(userId, targetType, targetId),
    scopedActionWorkProjectSpaceRole(userId, targetType, targetId),
  ]);
  return [natural, explicit, actionRole].reduce<WorkSpaceRole | null>((best, role) => {
    if (!role) return best;
    if (!best) return role;
    return roleLevel(role) > roleLevel(best) ? role : best;
  }, null);
}

export async function canManageWorkProjectSpace(userId: number, targetType: string, targetId: number) {
  const role = await getWorkProjectSpaceRole(userId, targetType, targetId);
  return workSpaceRoleAllows(role, "manager");
}

export async function getWorkProjectSpaceActionPermissions(
  userId: number,
  targetType: string,
  targetId: number,
): Promise<WorkProjectSpaceActionPermissions> {
  const scopeId = workProjectSpaceScopeId(targetType, targetId);
  const [role, canCreate, canWrite, canDelete, canRevise, canAdmin] = await Promise.all([
    getWorkProjectSpaceRole(userId, targetType, targetId),
    evaluatePermissionAction(userId, "work.projects", "create", { scopeId }),
    evaluatePermissionAction(userId, "work.projects", "write", { scopeId }),
    evaluatePermissionAction(userId, "work.projects", "delete", { scopeId }),
    evaluatePermissionAction(userId, "work.projects", "revise", { scopeId }),
    evaluatePermissionAction(userId, "work.projects", "admin", { scopeId }),
  ]);
  return {
    canCreate: workSpaceRoleAllows(role, "editor") || canCreate || canWrite || canDelete || canAdmin,
    canWrite: workSpaceRoleAllows(role, "editor") || canWrite || canDelete || canAdmin,
    canDelete: workSpaceRoleAllows(role, "delete") || canDelete || canAdmin,
    canRevise: workSpaceRoleAllows(role, "manager") || canRevise || canAdmin,
  };
}

export async function listWorkProjectSpacePermissions(input: {
  userId: number;
  targetType: WorkProjectSpaceTargetType;
  targetId: number;
}) {
  if (!(await canManageWorkProjectSpace(input.userId, input.targetType, input.targetId))) {
    return serviceError("无权限管理该项目空间", 403);
  }
  const [explicit, natural] = await Promise.all([
    prisma.workScopePermission.findMany({
      where: { targetType: input.targetType, targetId: input.targetId, kind: WORK_PROJECT_PERMISSION_KIND },
      include: { user: { select: userSelect } },
      orderBy: [{ role: "asc" }, { id: "asc" }],
    }),
    listNaturalWorkProjectSpaceRows(input.targetType, input.targetId),
  ]);
  return serviceOk({
    permissions: mergeBusinessSpacePermissionRows({
      natural,
      kind: WORK_PROJECT_PERMISSION_KIND,
      explicit: explicit.map((item) => ({
        userId: item.userId,
        userName: userName(item.user),
        role: normalizeWorkSpaceRole(item.role),
        kind: WORK_PROJECT_PERMISSION_KIND,
      })),
    }).map((row) => ({
      ...row,
      role: row.role as WorkSpaceRole,
    })),
  });
}

export async function updateWorkProjectSpacePermissions(input: {
  actorUserId: number;
  targetType: WorkProjectSpaceTargetType;
  targetId: number;
  permissions: WorkProjectScopePermissionInput[];
}) {
  if (!(await canManageWorkProjectSpace(input.actorUserId, input.targetType, input.targetId))) {
    return serviceError("无权限管理该项目空间", 403);
  }
  const rows = input.permissions
    .map((item) => ({
      userId: Number(item.userId),
      role: normalizeWorkSpaceRole(item.role),
      kind: WORK_PROJECT_PERMISSION_KIND,
    }))
    .filter((item) => Number.isInteger(item.userId) && item.userId > 0 && canPersistWorkSpaceRole(item.role));
  const users = rows.length ? await prisma.user.findMany({ where: { id: { in: rows.map((item) => item.userId) } }, select: { id: true } }) : [];
  const userIds = new Set(users.map((user) => user.id));
  if (rows.some((row) => !userIds.has(row.userId))) return serviceError("授权用户不存在", 400);

  await prisma.$transaction(async (tx) => {
    await tx.workScopePermission.deleteMany({
      where: { targetType: input.targetType, targetId: input.targetId, kind: WORK_PROJECT_PERMISSION_KIND },
    });
    for (const row of rows) {
      await tx.workScopePermission.create({
        data: {
          targetType: input.targetType,
          targetId: input.targetId,
          userId: row.userId,
          role: row.role,
          kind: row.kind,
        },
      });
    }
  });
  return serviceOk({ success: true });
}

async function listNaturalWorkProjectSpaceRows(targetType: WorkProjectSpaceTargetType, targetId: number) {
  if (targetType === "department") return listDepartmentNaturalSpacePermissions(targetId);
  if (targetType === "company") return listCompanyNaturalSpacePermissions();
  if (targetType === "committee") return listOperatingCommitteeNaturalSpacePermissions();
  if (targetType === "personal") {
    const user = await prisma.user.findUnique({ where: { id: targetId }, select: userSelect });
    return user ? [{
      userId: user.id,
      userName: userName(user),
      role: "manager" as const,
      sourceLabel: "所有者",
      actionSource: "implicit" as const,
    }] : [];
  }
  return [];
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

function dedupeProjectSpaceSeeds(seeds: ProjectSpaceSeed[]) {
  const seen = new Set<string>();
  return seeds.filter((seed) => {
    const key = `${seed.targetType}:${seed.targetId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function roleLevel(role: WorkSpaceRole) {
  if (role === "manager") return 3;
  if (role === "delete") return 2;
  if (role === "editor") return 1;
  return 0;
}
