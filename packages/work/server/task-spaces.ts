import { serviceError, serviceOk } from "@workspace/platform/server/api";
import {
  listDepartmentNaturalSpacePermissions,
  mergeBusinessSpacePermissionRows,
} from "@workspace/platform/server/business-space-permissions";
import { currentOpenEndedDateWhere } from "@workspace/platform/server/fk-registry";
import { prisma } from "@workspace/platform/server/prisma";
import { getUserPreferredDepartmentIds } from "@workspace/platform/server/user-preferences";
import {
  canManageWorkTaskSpace,
  getUserEmployeeIds,
  getWorkSpaceRole,
  hasWorkTaskAdmin,
  normalizeWorkSpaceRole,
  type WorkSpaceRole,
  type WorkSpaceTargetType,
} from "./access";
import { canPersistWorkSpaceRole } from "./domain/work-space-validation";

export type WorkTaskSpace = {
  targetType: WorkSpaceTargetType;
  targetId: number;
  name: string;
  subtitle: string | null;
  lifecycleStatus: "active" | "archived" | "inactive";
  role: WorkSpaceRole;
  counts: { objective: number; keyResult: number; task: number; archived: number };
};

export type WorkScopePermissionInput = {
  userId: number;
  role: WorkSpaceRole;
  kind?: "task";
};

type SpaceSeed = {
  targetType: WorkSpaceTargetType;
  targetId: number;
  name: string;
  subtitle: string | null;
  lifecycleStatus: WorkTaskSpace["lifecycleStatus"];
};

export async function listWorkTaskSpaces(userId: number): Promise<{ spaces: WorkTaskSpace[]; preferredDepartmentIds: number[] }> {
  const isAdmin = await hasWorkTaskAdmin(userId);
  const [user, companies, departments, projects, preferredDepartmentIds] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        nickname: true,
        employees: {
          select: {
            name: true,
            employments: { select: { isActive: true } },
          },
        },
      },
    }),
    listCompanySeeds(userId, isAdmin),
    listDepartmentSeeds(userId, isAdmin),
    listProjectSeeds(userId, isAdmin),
    getUserPreferredDepartmentIds(userId),
  ]);

  const seeds = dedupeSeeds([
    {
      targetType: "personal",
      targetId: userId,
      name: user?.employees[0]?.name || user?.nickname || "我的工作",
      subtitle: "个人工作台",
      lifecycleStatus: user && user.employees.length > 0 && !user.employees.some((employee) => employee.employments.some((employment) => employment.isActive)) ? "inactive" : "active",
    },
    ...companies,
    ...departments,
    ...projects,
  ]);
  const countMap = await getSpaceCountsMap(seeds);

  const spaces = await Promise.all(seeds.map(async (seed) => {
    const role: WorkSpaceRole | null = isAdmin ? "manager" : await getWorkSpaceRole(userId, seed.targetType, seed.targetId, "task");
    if (!role) return null;
    return {
      ...seed,
      role,
      counts: countMap.get(spaceKey(seed.targetType, seed.targetId)) ?? emptyCounts(),
    };
  }));

  return {
    spaces: spaces.filter((space): space is WorkTaskSpace => Boolean(space)),
    preferredDepartmentIds,
  };
}

async function listCompanySeeds(userId: number, isAdmin: boolean): Promise<SpaceSeed[]> {
  const company = await prisma.company.findFirst({
    where: {
      isActive: true,
      childOfRelations: { none: {} },
      parentOfRelations: { some: {} },
    },
    select: { id: true, name: true },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
  if (!company) return [];
  if (isAdmin) return [companySpaceSeed(company)];

  const explicit = await prisma.workScopePermission.findMany({
    where: { userId, targetType: "company", targetId: company.id, kind: "task" },
    select: { targetId: true },
  });
  if (explicit.length === 0) return [];
  return [companySpaceSeed(company)];
}

function companySpaceSeed(company: { id: number }): SpaceSeed {
  return {
    targetType: "company",
    targetId: company.id,
    name: "运营委员会",
    subtitle: "组织级工作计划",
    lifecycleStatus: "active",
  };
}

async function listDepartmentSeeds(userId: number, isAdmin: boolean): Promise<SpaceSeed[]> {
  if (isAdmin) {
    const rows = await prisma.department.findMany({
      select: { id: true, name: true, code: true, isArchived: true },
      orderBy: [{ isArchived: "asc" }, { code: "asc" }, { id: "asc" }],
    });
    return rows.map(departmentSpaceSeed);
  }

  const [edps, managed, assignees, explicit] = await Promise.all([
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
    prisma.department.findMany({
      where: { managerUserId: userId },
      select: { id: true, name: true, code: true, isArchived: true },
    }),
    prisma.departmentWorkAssignee.findMany({
      where: { userId, kind: "task" },
      select: { department: { select: { id: true, name: true, code: true, isArchived: true } } },
    }),
    prisma.workScopePermission.findMany({
      where: { userId, targetType: "department", kind: "task" },
      select: { targetId: true },
    }),
  ]);

  const explicitDepartments = explicit.length ? await prisma.department.findMany({
    where: { id: { in: explicit.map((item) => item.targetId) } },
    select: { id: true, name: true, code: true, isArchived: true },
  }) : [];

  return [
    ...edps.flatMap((item) => item.positions.map((position) => position.department)).filter(Boolean),
    ...managed,
    ...assignees.map((item) => item.department),
    ...explicitDepartments,
  ]
    .map((department) => departmentSpaceSeed(department!));
}

function departmentSpaceSeed(department: { id: number; name: string; code: string; isArchived: boolean }): SpaceSeed {
  return {
    targetType: "department",
    targetId: department.id,
    name: department.name,
    subtitle: department.code,
    lifecycleStatus: department.isArchived ? "archived" : "active",
  };
}

async function listProjectSeeds(userId: number, isAdmin: boolean): Promise<SpaceSeed[]> {
  if (isAdmin) {
    const rows = await prisma.project.findMany({
      where: { isArchived: false },
      select: { id: true, name: true, code: true },
      orderBy: [{ id: "asc" }],
    });
    return rows.map((project) => ({
      targetType: "project",
      targetId: project.id,
      name: project.name,
      subtitle: project.code,
      lifecycleStatus: "active",
    }));
  }

  const employeeIds = await getUserEmployeeIds(userId);
  const [memberProjects, assignees, explicit] = await Promise.all([
    employeeIds.length ? prisma.employeeProject.findMany({
      where: { employeeId: { in: employeeIds } },
      select: { project: { select: { id: true, name: true, code: true } } },
    }) : [],
    prisma.projectWorkAssignee.findMany({
      where: { userId, kind: "task" },
      select: { project: { select: { id: true, name: true, code: true } } },
    }),
    prisma.workScopePermission.findMany({
      where: { userId, targetType: "project", kind: "task" },
      select: { targetId: true },
    }),
  ]);

  const explicitProjects = explicit.length ? await prisma.project.findMany({
    where: { id: { in: explicit.map((item) => item.targetId) }, isArchived: false },
    select: { id: true, name: true, code: true },
  }) : [];

  return [...memberProjects.map((item) => item.project), ...assignees.map((item) => item.project), ...explicitProjects]
    .map((project) => ({
      targetType: "project" as const,
      targetId: project.id,
      name: project.name,
      subtitle: project.code,
      lifecycleStatus: "active" as const,
    }));
}

function dedupeSeeds(seeds: SpaceSeed[]) {
  const seen = new Set<string>();
  return seeds.filter((seed) => {
    const key = `${seed.targetType}:${seed.targetId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function emptyCounts() {
  return { objective: 0, keyResult: 0, task: 0, archived: 0 };
}

function spaceKey(targetType: string, targetId: number) {
  return `${targetType}:${targetId}`;
}

async function getSpaceCountsMap(seeds: SpaceSeed[]) {
  const map = new Map<string, WorkTaskSpace["counts"]>();
  for (const seed of seeds) map.set(spaceKey(seed.targetType, seed.targetId), emptyCounts());
  if (seeds.length === 0) return map;

  const rows = await prisma.workItem.groupBy({
    by: ["targetType", "targetId", "itemType", "isArchived"],
    where: {
      OR: seeds.map((seed) => ({ targetType: seed.targetType, targetId: seed.targetId })),
    },
    _count: { _all: true },
  });

  for (const row of rows) {
    if (row.targetId == null) continue;
    const counts = map.get(spaceKey(row.targetType, row.targetId));
    if (!counts) continue;
    if (row.isArchived) {
      counts.archived += row._count._all;
    } else if (row.itemType === "objective") {
      counts.objective += row._count._all;
    } else if (row.itemType === "key_result") {
      counts.keyResult += row._count._all;
    } else {
      counts.task += row._count._all;
    }
  }
  return map;
}

export async function listWorkSpacePermissions(input: { userId: number; targetType: WorkSpaceTargetType; targetId: number }) {
  const canManage = await canManageWorkTaskSpace(input.userId, input.targetType, input.targetId);
  if (!canManage) return serviceError("无权限管理该工作空间", 403);
  const [explicit, natural] = await Promise.all([
    prisma.workScopePermission.findMany({
      where: { targetType: input.targetType, targetId: input.targetId, kind: "task" },
      include: { user: { select: { id: true, nickname: true, username: true, employees: { select: { name: true }, take: 1 } } } },
      orderBy: [{ role: "asc" }, { id: "asc" }],
    }),
    listNaturalWorkSpaceRows(input.targetType, input.targetId),
  ]);
  return serviceOk({
      permissions: mergeBusinessSpacePermissionRows({
        natural,
        kind: "task" as const,
        explicit: explicit.map((item) => ({
          userId: item.userId,
          userName: userName(item.user),
          role: normalizeWorkSpaceRole(item.role),
          kind: "task" as const,
        })),
      }).map((row) => ({
        ...row,
        role: row.role as WorkSpaceRole,
      })),
  });
}

export async function updateWorkSpacePermissions(input: {
  actorUserId: number;
  targetType: WorkSpaceTargetType;
  targetId: number;
  permissions: WorkScopePermissionInput[];
}) {
  if (!(await canManageWorkTaskSpace(input.actorUserId, input.targetType, input.targetId))) {
    return serviceError("无权限管理该工作空间", 403);
  }
  const rows = input.permissions
    .map((item) => ({
      userId: Number(item.userId),
      role: normalizeWorkSpaceRole(item.role),
      kind: "task" as const,
    }))
    .filter((item) => Number.isInteger(item.userId) && item.userId > 0 && canPersistWorkSpaceRole(item.role));
  const users = rows.length ? await prisma.user.findMany({ where: { id: { in: rows.map((item) => item.userId) } }, select: { id: true } }) : [];
  const userIds = new Set(users.map((user) => user.id));
  if (rows.some((row) => !userIds.has(row.userId))) return serviceError("授权用户不存在", 400);

  await prisma.$transaction(async (tx) => {
    await tx.workScopePermission.deleteMany({ where: { targetType: input.targetType, targetId: input.targetId, kind: "task" } });
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

async function listNaturalManagers(targetType: WorkSpaceTargetType, targetId: number) {
  if (targetType === "personal") {
    const user = await prisma.user.findUnique({ where: { id: targetId }, select: userSelect });
    return user ? [{ userId: user.id, userName: userName(user) }] : [];
  }
  if (targetType === "department") {
    const department = await prisma.department.findUnique({ where: { id: targetId }, select: { managerUserId: true } });
    if (!department?.managerUserId) return [];
    const user = await prisma.user.findUnique({ where: { id: department.managerUserId }, select: userSelect });
    return user ? [{ userId: user.id, userName: userName(user) }] : [];
  }
  if (targetType === "project") {
    const project = await prisma.project.findUnique({
      where: { id: targetId },
      select: {
        createdBy: true,
        employees: {
          where: { role: { in: ["负责人", "项目负责人"] } },
          select: { employee: { select: { user: { select: userSelect } } } },
        },
      },
    });
    const users = [
      ...(project?.createdBy ? await prisma.user.findMany({ where: { id: project.createdBy }, select: userSelect }) : []),
      ...(project?.employees.map((item) => item.employee.user).filter(Boolean) || []),
    ];
    return dedupeUsers(users.map((user) => ({ userId: user!.id, userName: userName(user!) })));
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

async function listNaturalWorkSpaceRows(targetType: WorkSpaceTargetType, targetId: number) {
  if (targetType === "department") return listDepartmentNaturalSpacePermissions(targetId);
  const managers = await listNaturalManagers(targetType, targetId);
  const sourceLabel = naturalManagerLabel(targetType);
  return managers.map((manager) => ({
    ...manager,
    role: "manager" as const,
    sourceLabel,
  }));
}

function naturalManagerLabel(targetType: WorkSpaceTargetType): string {
  if (targetType === "department") return "部门负责人";
  if (targetType === "project") return "项目负责人";
  if (targetType === "personal") return "所有者";
  return "";
}

function dedupeUsers<T extends { userId: number }>(items: T[]) {
  const seen = new Set<number>();
  return items.filter((item) => {
    if (seen.has(item.userId)) return false;
    seen.add(item.userId);
    return true;
  });
}
