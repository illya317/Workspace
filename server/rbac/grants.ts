import { prisma } from "@workspace/platform/server/prisma";
import { normalizeRoleKey } from "@workspace/platform/permissions";

export type SubjectType = "user" | "position" | "department";

interface GrantItem {
  subjectId: number;
  resourceKey: string;
  roleKey: string;
  resourceId: number;
  roleId: number;
  scopeId: string | null;
}

export type UserResourceRoleAssignment = {
  id: number;
  scopeId: string | null;
  user: { id: number; name: string; username: string | null };
};

export async function resourceRoleExists(resourceKey: string, roleKey: string) {
  const normalizedRole = normalizeRoleKey(roleKey);
  const [resource, role] = await Promise.all([
    prisma.resource.findUnique({ where: { key: resourceKey } }),
    prisma.role.findUnique({ where: { key: normalizedRole } }),
  ]);
  return Boolean(resource && role);
}

export async function getUserResourceRoleAssignments(
  resourceKey: string,
  roleKey: string,
): Promise<UserResourceRoleAssignment[]> {
  const normalizedRole = normalizeRoleKey(roleKey);
  return prisma.userResourceRole.findMany({
    where: {
      resource: { key: resourceKey },
      role: { key: normalizedRole },
    },
    include: {
      user: { select: { id: true, name: true, username: true } },
    },
  });
}

export async function userResourceRoleAssignmentExists(
  userId: number,
  resourceKey: string,
  roleKey: string,
  scopeId: string | null,
) {
  const normalizedRole = normalizeRoleKey(roleKey);
  const existing = await prisma.userResourceRole.findFirst({
    where: {
      userId,
      resource: { key: resourceKey },
      role: { key: normalizedRole },
      scopeId,
    },
  });
  return Boolean(existing);
}

export async function deleteUserResourceRoleAssignment(id: number) {
  await prisma.userResourceRole.delete({ where: { id } });
}

export async function setGrant(
  subjectType: SubjectType,
  subjectId: number,
  resourceKey: string,
  roleKey: string,
  value: boolean,
  opts?: { scopeId?: string | null; actorUserId?: number }
): Promise<void> {
  const normalizedRole = normalizeRoleKey(roleKey);

  const resource = await prisma.resource.findUnique({ where: { key: resourceKey } });
  const role = await prisma.role.findUnique({ where: { key: normalizedRole } });

  if (!resource || !role) {
    throw new Error(`Invalid resourceKey(${resourceKey}) or roleKey(${roleKey})`);
  }

  // Only one system.admin allowed
  if (value && resourceKey === "system" && normalizedRole === "admin") {
    const count = await prisma.userResourceRole.count({
      where: { resource: { key: "system" }, role: { key: "admin" } },
    });
    if (count > 0) {
      throw new Error("系统管理员只能有一位");
    }
  }

  // Self-protection: cannot revoke own admin grant (system or any resource)
  if (
    !value &&
    subjectType === "user" &&
    subjectId === opts?.actorUserId &&
    normalizedRole === "admin"
  ) {
    throw new Error("不能取消自己的管理权限");
  }

  const scopeId = opts?.scopeId ?? null;

  if (subjectType === "user") {
    if (value) {
      const existing = await prisma.userResourceRole.findFirst({
        where: { userId: subjectId, resourceId: resource.id, roleId: role.id, scopeId },
      });
      if (!existing) {
        await prisma.userResourceRole.create({
          data: { userId: subjectId, resourceId: resource.id, roleId: role.id, scopeId },
        });
      }
    } else {
      await prisma.userResourceRole.deleteMany({
        where: { userId: subjectId, resourceId: resource.id, roleId: role.id, scopeId },
      });
    }
  } else if (subjectType === "position") {
    if (value) {
      const existing = await prisma.positionResourceRole.findFirst({
        where: { positionId: subjectId, resourceId: resource.id, roleId: role.id, scopeId },
      });
      if (!existing) {
        await prisma.positionResourceRole.create({
          data: { positionId: subjectId, resourceId: resource.id, roleId: role.id, scopeId },
        });
      }
    } else {
      await prisma.positionResourceRole.deleteMany({
        where: { positionId: subjectId, resourceId: resource.id, roleId: role.id, scopeId },
      });
    }
  } else if (subjectType === "department") {
    if (value) {
      const existing = await prisma.departmentResourceRole.findFirst({
        where: { departmentId: subjectId, resourceId: resource.id, roleId: role.id, scopeId },
      });
      if (!existing) {
        await prisma.departmentResourceRole.create({
          data: { departmentId: subjectId, resourceId: resource.id, roleId: role.id, scopeId },
        });
      }
    } else {
      await prisma.departmentResourceRole.deleteMany({
        where: { departmentId: subjectId, resourceId: resource.id, roleId: role.id, scopeId },
      });
    }
  }
}

export async function getGrants(
  subjectType: SubjectType,
  subjectId?: number,
  scopeId?: string | null,
): Promise<GrantItem[]> {
  type GrantRow = {
    userId?: number;
    positionId?: number;
    departmentId?: number;
    resourceId: number;
    roleId: number;
    scopeId: string | null;
    resource: { key: string };
    role: { key: string };
  };

  let rows: GrantRow[] = [];

  const include = {
    resource: { select: { key: true } },
    role: { select: { key: true } },
  };

  function buildWhere(base: Record<string, unknown>) {
    const where: Record<string, unknown> = { ...base };
    if (subjectId !== undefined) {
      where[subjectType === "user" ? "userId" : subjectType === "position" ? "positionId" : "departmentId"] = subjectId;
    }
    if (scopeId !== undefined) {
      // null → only global grants; a value → global + exact match
      where.OR = scopeId === null
        ? [{ scopeId: null }]
        : [{ scopeId: null }, { scopeId }];
    }
    return where;
  }

  if (subjectType === "user") {
    rows = await prisma.userResourceRole.findMany({
      where: buildWhere(subjectId !== undefined ? { userId: subjectId } : {}),
      include,
    });
  } else if (subjectType === "position") {
    rows = await prisma.positionResourceRole.findMany({
      where: buildWhere(subjectId !== undefined ? { positionId: subjectId } : {}),
      include,
    });
  } else if (subjectType === "department") {
    rows = await prisma.departmentResourceRole.findMany({
      where: buildWhere(subjectId !== undefined ? { departmentId: subjectId } : {}),
      include,
    });
  }

  const getSubjectId = (r: GrantRow): number => {
    if (subjectType === "user") return r.userId!;
    if (subjectType === "position") return r.positionId!;
    return r.departmentId!;
  };

  return rows.map((r) => ({
    subjectId: getSubjectId(r),
    resourceKey: r.resource.key,
    roleKey: r.role.key,
    resourceId: r.resourceId,
    roleId: r.roleId,
    scopeId: r.scopeId,
  }));
}
