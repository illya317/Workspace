import { prisma } from "@workspace/platform/server/prisma";
import { RESOURCE_KEYS } from "@workspace/platform/resources";
import { isRootAdminUsername } from "../auth/root";

type RoleKey = "access" | "write";

interface ResourceLite {
  id: number;
  key: string;
  parentId: number | null;
}

const ROLE_LEVEL: Record<string, number> = { access: 0, write: 1, delete: 2, admin: 3 };

function visibleRole(roleKey: string): RoleKey {
  return (ROLE_LEVEL[roleKey] ?? 0) >= ROLE_LEVEL.write ? "write" : "access";
}

function maxVisibleRole(a: RoleKey | undefined, b: RoleKey): RoleKey {
  if (!a) return b;
  return ROLE_LEVEL[a] >= ROLE_LEVEL[b] ? a : b;
}

function buildResourceMaps(resources: ResourceLite[]) {
  const byId = new Map(resources.map((r) => [r.id, r]));
  const byParent = new Map<number, number[]>();
  for (const r of resources) {
    if (r.parentId == null) continue;
    byParent.set(r.parentId, [...(byParent.get(r.parentId) || []), r.id]);
  }

  const descendants = new Map<number, number[]>();
  const ancestors = new Map<number, number[]>();

  function collectDescendants(id: number): number[] {
    if (descendants.has(id)) return descendants.get(id)!;
    const result = [id];
    for (const child of byParent.get(id) || []) result.push(...collectDescendants(child));
    descendants.set(id, result);
    return result;
  }

  function collectAncestors(id: number): number[] {
    if (ancestors.has(id)) return ancestors.get(id)!;
    const result = [id];
    let current = byId.get(id)?.parentId ?? null;
    while (current != null) {
      result.push(current);
      current = byId.get(current)?.parentId ?? null;
    }
    ancestors.set(id, result);
    return result;
  }

  for (const r of resources) {
    collectDescendants(r.id);
    collectAncestors(r.id);
  }

  return { byId, descendants, ancestors };
}

export async function listUsersWithEffectiveResourceRoles() {
  const users = await prisma.user.findMany({
    where: { username: { not: "admin" } },
    orderBy: { id: "asc" },
    select: { id: true, username: true, nickname: true, canLogin: true },
  });
  const userIds = users.map((u) => u.id);

  const [employees, resources, userRows] = await Promise.all([
    prisma.employee.findMany({
      where: { userId: { in: userIds } },
      select: {
        userId: true,
        name: true,
        employeeId: true,
        positions: { select: { positionId: true, departmentId: true } },
      },
    }),
    prisma.resource.findMany({ select: { id: true, key: true, parentId: true } }),
    prisma.userResourceRole.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, resourceId: true, role: { select: { key: true } } },
    }),
  ]);

  const empByUser: Record<number, { name: string; employeeId: string }> = {};
  const positionIdsByUser = new Map<number, Set<number>>();
  const departmentIdsByUser = new Map<number, Set<number>>();
  const allPositionIds = new Set<number>();
  const allDepartmentIds = new Set<number>();

  for (const employee of employees) {
    if (employee.userId == null) continue;
    empByUser[employee.userId] = { name: employee.name, employeeId: employee.employeeId };
    const positionSet = positionIdsByUser.get(employee.userId) || new Set<number>();
    const departmentSet = departmentIdsByUser.get(employee.userId) || new Set<number>();
    for (const position of employee.positions) {
      if (position.positionId != null) {
        positionSet.add(position.positionId);
        allPositionIds.add(position.positionId);
      }
      if (position.departmentId != null) {
        departmentSet.add(position.departmentId);
        allDepartmentIds.add(position.departmentId);
      }
    }
    positionIdsByUser.set(employee.userId, positionSet);
    departmentIdsByUser.set(employee.userId, departmentSet);
  }

  const [positionRows, departmentRows] = await Promise.all([
    allPositionIds.size > 0
      ? prisma.positionResourceRole.findMany({
          where: { positionId: { in: [...allPositionIds] } },
          select: { positionId: true, resourceId: true, role: { select: { key: true } } },
        })
      : [],
    allDepartmentIds.size > 0
      ? prisma.departmentResourceRole.findMany({
          where: { departmentId: { in: [...allDepartmentIds] } },
          select: { departmentId: true, resourceId: true, role: { select: { key: true } } },
        })
      : [],
  ]);

  const activeResourceKeys = new Set(RESOURCE_KEYS);
  const { byId, descendants, ancestors } = buildResourceMaps(resources);
  const grantsByUser = new Map<number, Map<string, RoleKey>>();

  function addGrant(userId: number, resourceId: number, roleKey: string) {
    const role = visibleRole(roleKey);
    const map = grantsByUser.get(userId) || new Map<string, RoleKey>();
    const targets = descendants.get(resourceId) || [resourceId];
    for (const targetId of targets) {
      for (const id of ancestors.get(targetId) || [targetId]) {
        const resource = byId.get(id);
        if (!resource) continue;
        if (!activeResourceKeys.has(resource.key)) continue;
        map.set(resource.key, maxVisibleRole(map.get(resource.key), role));
      }
    }
    grantsByUser.set(userId, map);
  }

  for (const row of userRows) addGrant(row.userId, row.resourceId, row.role.key);

  for (const user of users) {
    const positionSet = positionIdsByUser.get(user.id) || new Set<number>();
    const departmentSet = departmentIdsByUser.get(user.id) || new Set<number>();
    for (const row of positionRows) {
      if (positionSet.has(row.positionId)) addGrant(user.id, row.resourceId, row.role.key);
    }
    for (const row of departmentRows) {
      if (departmentSet.has(row.departmentId)) addGrant(user.id, row.resourceId, row.role.key);
    }
  }

  return users.filter((user) => !isRootAdminUsername(user.username)).map((user) => {
    const grants = grantsByUser.get(user.id) || new Map<string, RoleKey>();
    const resourceRoles = [...grants].map(([resourceKey, roleKey]) => ({ resourceKey, roleKey }));

    return {
      id: user.id,
      name: empByUser[user.id]?.name || user.nickname,
      username: user.username,
      nickname: user.nickname,
      employeeId: empByUser[user.id]?.employeeId || null,
      canLogin: user.canLogin,
      isWorkListAdmin: false,
      resourceRoles,
    };
  });
}
