import { prisma } from "@workspace/platform/server/prisma";
import { isPermissionActionKey, type PermissionActionKey } from "@workspace/platform/permission-actions";
import { isPermissionActionSupported } from "@workspace/platform/permission-resource-policy";
import { RESOURCE_KEYS } from "@workspace/platform/resources";
import { isRootAdminUser } from "../auth/root";

type VisiblePermissionKey = PermissionActionKey;

interface ResourceLite {
  id: number;
  key: string;
  parentId: number | null;
}

const ACTION_DISPLAY_LEVEL = {
  entry: 0,
  read: 0,
  create: 1,
  update: 1,
  archive: 1,
  revise: 1,
  reverse: 1,
  lock: 1,
  unlock: 1,
  submit: 1,
  approve: 1,
  reject: 1,
  import: 1,
  export: 1,
  apiUse: 1,
  share: 1,
  delete: 2,
  grant: 3,
  configure: 3,
  audit: 3,
} satisfies Record<PermissionActionKey, number>;

function maxVisiblePermission(a: VisiblePermissionKey | undefined, b: VisiblePermissionKey): VisiblePermissionKey {
  if (!a) return b;
  return (ACTION_DISPLAY_LEVEL[a] ?? 0) >= (ACTION_DISPLAY_LEVEL[b] ?? 0) ? a : b;
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
    select: { id: true, username: true, canLogin: true },
  });
  const userIds = users.map((u) => u.id);

  const [employees, resources] = await Promise.all([
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

  const [userActionRows, positionActionRows, departmentActionRows] = await Promise.all([
    prisma.userResourceActionGrant.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, resourceId: true, actionKey: true },
    }),
    allPositionIds.size > 0
      ? prisma.positionResourceActionGrant.findMany({
          where: { positionId: { in: [...allPositionIds] } },
          select: { positionId: true, resourceId: true, actionKey: true },
        })
      : [],
    allDepartmentIds.size > 0
      ? prisma.departmentResourceActionGrant.findMany({
          where: { departmentId: { in: [...allDepartmentIds] } },
          select: { departmentId: true, resourceId: true, actionKey: true },
        })
      : [],
  ]);

  const activeResourceKeys = new Set(RESOURCE_KEYS);
  const { byId, ancestors } = buildResourceMaps(resources);
  const grantsByUser = new Map<number, Map<string, VisiblePermissionKey>>();

  function addActionGrant(userId: number, resourceId: number, actionKey: string) {
    if (!isPermissionActionKey(actionKey)) return;
    const map = grantsByUser.get(userId) || new Map<string, VisiblePermissionKey>();
    for (const id of ancestors.get(resourceId) || [resourceId]) {
      const resource = byId.get(id);
      if (!resource || !activeResourceKeys.has(resource.key)) continue;
      if (!isPermissionActionSupported(resource.key, actionKey)) continue;
      map.set(resource.key, maxVisiblePermission(map.get(resource.key), actionKey));
    }
    grantsByUser.set(userId, map);
  }

  for (const row of userActionRows) addActionGrant(row.userId, row.resourceId, row.actionKey);

  for (const user of users) {
    const positionSet = positionIdsByUser.get(user.id) || new Set<number>();
    const departmentSet = departmentIdsByUser.get(user.id) || new Set<number>();
    for (const row of positionActionRows) {
      if (positionSet.has(row.positionId)) addActionGrant(user.id, row.resourceId, row.actionKey);
    }
    for (const row of departmentActionRows) {
      if (departmentSet.has(row.departmentId)) addActionGrant(user.id, row.resourceId, row.actionKey);
    }
  }

  const visibleUsers = (await Promise.all(
    users.map(async (user) => await isRootAdminUser(user.id) ? null : user),
  )).filter((user): user is (typeof users)[number] => Boolean(user));

  return visibleUsers.map((user) => {
    const grants = grantsByUser.get(user.id) || new Map<string, VisiblePermissionKey>();
    const resourceRoles = [...grants].map(([resourceKey, roleKey]) => ({ resourceKey, roleKey }));

    return {
      id: user.id,
      name: empByUser[user.id]?.name || "未绑定员工",
      username: user.username,
      employeeId: empByUser[user.id]?.employeeId || null,
      canLogin: user.canLogin,
      isWorkListAdmin: false,
      resourceRoles,
    };
  });
}
