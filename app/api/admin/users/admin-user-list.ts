import { prisma } from "@/lib/prisma";
import { isSystemAdminBypassEnabled } from "@/server/rbac/bypass";

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

export async function listAdminUsers() {
  const users = await prisma.user.findMany({
    orderBy: { id: "asc" },
    select: { id: true, username: true, name: true, canLogin: true },
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

  for (const e of employees) {
    if (e.userId == null) continue;
    empByUser[e.userId] = { name: e.name, employeeId: e.employeeId };
    const posSet = positionIdsByUser.get(e.userId) || new Set<number>();
    const deptSet = departmentIdsByUser.get(e.userId) || new Set<number>();
    for (const p of e.positions) {
      if (p.positionId != null) {
        posSet.add(p.positionId);
        allPositionIds.add(p.positionId);
      }
      if (p.departmentId != null) {
        deptSet.add(p.departmentId);
        allDepartmentIds.add(p.departmentId);
      }
    }
    positionIdsByUser.set(e.userId, posSet);
    departmentIdsByUser.set(e.userId, deptSet);
  }

  const [positionRows, departmentRows, bypassEnabled] = await Promise.all([
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
    isSystemAdminBypassEnabled(),
  ]);

  const { byId, descendants, ancestors } = buildResourceMaps(resources);
  const grantsByUser = new Map<number, Map<string, RoleKey>>();
  const adminUserIds = new Set<number>();

  function addGrant(userId: number, resourceId: number, roleKey: string) {
    const role = visibleRole(roleKey);
    const map = grantsByUser.get(userId) || new Map<string, RoleKey>();
    const targets = descendants.get(resourceId) || [resourceId];
    for (const targetId of targets) {
      for (const id of ancestors.get(targetId) || [targetId]) {
        const resource = byId.get(id);
        if (!resource) continue;
        map.set(resource.key, maxVisibleRole(map.get(resource.key), role));
      }
    }
    grantsByUser.set(userId, map);

    const resource = byId.get(resourceId);
    if (resource?.key === "system" && roleKey === "admin") adminUserIds.add(userId);
  }

  for (const row of userRows) addGrant(row.userId, row.resourceId, row.role.key);

  for (const user of users) {
    const posSet = positionIdsByUser.get(user.id) || new Set<number>();
    const deptSet = departmentIdsByUser.get(user.id) || new Set<number>();
    for (const row of positionRows) {
      if (posSet.has(row.positionId)) addGrant(user.id, row.resourceId, row.role.key);
    }
    for (const row of departmentRows) {
      if (deptSet.has(row.departmentId)) addGrant(user.id, row.resourceId, row.role.key);
    }
  }

  if (bypassEnabled) {
    for (const userId of adminUserIds) {
      const map = grantsByUser.get(userId) || new Map<string, RoleKey>();
      for (const resource of resources) map.set(resource.key, "write");
      grantsByUser.set(userId, map);
    }
  }

  return users.map((u) => {
    const grants = grantsByUser.get(u.id) || new Map<string, RoleKey>();
    const resourceRoles = [...grants].map(([resourceKey, roleKey]) => ({ resourceKey, roleKey }));

    return {
      id: u.id,
      username: u.username,
      name: empByUser[u.id]?.name || u.name,
      employeeId: empByUser[u.id]?.employeeId || null,
      canLogin: u.canLogin,
      isWorkListAdmin: adminUserIds.has(u.id),
      resourceRoles,
    };
  });
}
