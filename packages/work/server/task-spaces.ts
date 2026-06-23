import { prisma } from "@workspace/platform/server/prisma";
import {
  canManageWorkTaskSpace,
  getUserEmployeeIds,
  getWorkSpaceRole,
  hasWorkAdmin,
  normalizeWorkSpaceRole,
  workSpaceRoleAllows,
  type WorkSpaceRole,
  type WorkSpaceTargetType,
} from "./access";

export type WorkTaskSpace = {
  targetType: WorkSpaceTargetType;
  targetId: number;
  name: string;
  subtitle: string | null;
  role: WorkSpaceRole;
  counts: { routine: number; nonRoutine: number; archived: number };
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
};

export async function listWorkTaskSpaces(userId: number): Promise<{ spaces: WorkTaskSpace[] }> {
  const [user, departments, projects] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, nickname: true, employees: { select: { name: true }, take: 1 } },
    }),
    listDepartmentSeeds(userId),
    listProjectSeeds(userId),
  ]);

  const seeds = dedupeSeeds([
    {
      targetType: "personal",
      targetId: userId,
      name: user?.employees[0]?.name || user?.nickname || "我的工作",
      subtitle: "个人工作台",
    },
    ...departments,
    ...projects,
  ]);

  const spaces = await Promise.all(seeds.map(async (seed) => {
    const role = await getWorkSpaceRole(userId, seed.targetType, seed.targetId, "task");
    if (!role) return null;
    return {
      ...seed,
      role,
      counts: await getSpaceCounts(seed.targetType, seed.targetId),
    };
  }));

  return { spaces: spaces.filter((space): space is WorkTaskSpace => Boolean(space)) };
}

async function listDepartmentSeeds(userId: number): Promise<SpaceSeed[]> {
  if (await hasWorkAdmin(userId)) {
    const rows = await prisma.department.findMany({
      where: { isArchived: false },
      select: { id: true, name: true, code: true },
      orderBy: [{ code: "asc" }, { id: "asc" }],
    });
    return rows.map((department) => ({
      targetType: "department",
      targetId: department.id,
      name: department.name,
      subtitle: department.code,
    }));
  }

  const employeeIds = await getUserEmployeeIds(userId);
  const [edps, managed, assignees, explicit] = await Promise.all([
    employeeIds.length ? prisma.eDP.findMany({
      where: { employeeId: { in: employeeIds }, departmentId: { not: null } },
      select: { department: { select: { id: true, name: true, code: true } } },
    }) : [],
    prisma.department.findMany({
      where: { managerUserId: userId, isArchived: false },
      select: { id: true, name: true, code: true },
    }),
    prisma.departmentWorkAssignee.findMany({
      where: { userId, kind: "task" },
      select: { department: { select: { id: true, name: true, code: true } } },
    }),
    prisma.workScopePermission.findMany({
      where: { userId, targetType: "department", kind: "task" },
      select: { targetId: true },
    }),
  ]);

  const explicitDepartments = explicit.length ? await prisma.department.findMany({
    where: { id: { in: explicit.map((item) => item.targetId) }, isArchived: false },
    select: { id: true, name: true, code: true },
  }) : [];

  return [...edps.map((item) => item.department).filter(Boolean), ...managed, ...assignees.map((item) => item.department), ...explicitDepartments]
    .map((department) => ({
      targetType: "department" as const,
      targetId: department!.id,
      name: department!.name,
      subtitle: department!.code,
    }));
}

async function listProjectSeeds(userId: number): Promise<SpaceSeed[]> {
  if (await hasWorkAdmin(userId)) {
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

async function getSpaceCounts(targetType: string, targetId: number) {
  const [routine, nonRoutine, archived] = await Promise.all([
    prisma.workItem.count({ where: { targetType, targetId, category: "routine", isArchived: false } }),
    prisma.workItem.count({ where: { targetType, targetId, category: "non-routine", isArchived: false } }),
    prisma.workItem.count({ where: { targetType, targetId, isArchived: true } }),
  ]);
  return { routine, nonRoutine, archived };
}

export async function listWorkSpacePermissions(input: { userId: number; targetType: WorkSpaceTargetType; targetId: number }) {
  const canManage = await canManageWorkTaskSpace(input.userId, input.targetType, input.targetId);
  if (!canManage) return { ok: false as const, error: "无权限管理该工作空间", status: 403 };
  const [explicit, naturalManagers] = await Promise.all([
    prisma.workScopePermission.findMany({
      where: { targetType: input.targetType, targetId: input.targetId, kind: "task" },
      include: { user: { select: { id: true, nickname: true, username: true, employees: { select: { name: true }, take: 1 } } } },
      orderBy: [{ role: "asc" }, { id: "asc" }],
    }),
    listNaturalManagers(input.targetType, input.targetId),
  ]);
  return {
    ok: true as const,
    data: {
      permissions: [
        ...naturalManagers.map((item) => ({ ...item, role: "manager" as const, kind: "task", source: "natural" as const, locked: true })),
        ...explicit.map((item) => ({
          userId: item.userId,
          userName: userName(item.user),
          role: normalizeWorkSpaceRole(item.role),
          kind: item.kind,
          source: "explicit" as const,
          locked: false,
        })),
      ],
    },
  };
}

export async function updateWorkSpacePermissions(input: {
  actorUserId: number;
  targetType: WorkSpaceTargetType;
  targetId: number;
  permissions: WorkScopePermissionInput[];
}) {
  if (!(await canManageWorkTaskSpace(input.actorUserId, input.targetType, input.targetId))) {
    return { ok: false as const, error: "无权限管理该工作空间", status: 403 };
  }
  const rows = input.permissions
    .map((item) => ({
      userId: Number(item.userId),
      role: normalizeWorkSpaceRole(item.role),
      kind: "task" as const,
    }))
    .filter((item) => Number.isInteger(item.userId) && item.userId > 0 && workSpaceRoleAllows(item.role, "viewer"));
  const users = rows.length ? await prisma.user.findMany({ where: { id: { in: rows.map((item) => item.userId) } }, select: { id: true } }) : [];
  const userIds = new Set(users.map((user) => user.id));
  if (rows.some((row) => !userIds.has(row.userId))) return { ok: false as const, error: "授权用户不存在", status: 400 };

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
  return { ok: true as const, data: { success: true } };
}

async function listNaturalManagers(targetType: WorkSpaceTargetType, targetId: number) {
  if (targetType === "personal") {
    const user = await prisma.user.findUnique({ where: { id: targetId }, select: userSelect });
    return user ? [{ userId: user.id, userName: userName(user) }] : [];
  }
  if (targetType === "department") {
    const department = await prisma.department.findUnique({ where: { id: targetId }, select: { manager: { select: userSelect } } });
    return department?.manager ? [{ userId: department.manager.id, userName: userName(department.manager) }] : [];
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

function dedupeUsers<T extends { userId: number }>(items: T[]) {
  const seen = new Set<number>();
  return items.filter((item) => {
    if (seen.has(item.userId)) return false;
    seen.add(item.userId);
    return true;
  });
}
