import { prisma } from "./prisma";
import { checkPermission } from "./auth";
import { checkScopedPermission, toScopeId } from "@/server/rbac/scoped";

// ─── Target → leaf resource mapping (Batch 5.2) ───

/** Map targetType to the self_only leaf resource for scoped data permissions */
function resourceKeyForTarget(targetType: string): string {
  if (targetType === "department") return "work.report.department";
  if (targetType === "project") return "work.report.project";
  if (targetType === "user") return "work.report.personal";
  if (targetType === "position") return "work.report.department"; // positions belong to departments
  return "work.report"; // fallback
}

/** Leaf resources that carry scoped data grants */
const SCOPED_LEAF_RESOURCES = ["work.report.department", "work.report.project", "work.task.department"];

// ─── Target listing (UI) — returns all targets visible in pickers ───

interface TargetInfo {
  id: number;
  name: string;
  company?: string | null;
  type?: string;
  code?: string;
}

/**
 * Get all departments, projects, and positions the user is a member of,
 * PLUS targets derived from scoped work.report grants (Batch 5.1).
 * Used for populating target selectors in the UI — NOT for authorization.
 * System admins get all targets.
 */
export async function getUserTargets(userId: number): Promise<{
  departments: TargetInfo[];
  projects: TargetInfo[];
  positions: TargetInfo[];
  users: TargetInfo[];
}> {
  const empty = { departments: [], projects: [], positions: [], users: [] };

  if (await checkPermission(userId, "system", "admin")) {
    return await getAllTargets();
  }

  // Batch 5.2: global leaf resource access → show all targets of matching type
  const [showAllDepts, showAllProjs] = await Promise.all([
    checkScopedPermission(userId, "work.report.department", "access", null),
    checkScopedPermission(userId, "work.report.project", "access", null),
  ]);
  if (showAllDepts || showAllProjs) {
    const [allDepts, allProjs] = await Promise.all([
      showAllDepts ? prisma.department.findMany({ select: { id: true, name: true, code: true } }) : Promise.resolve([]),
      showAllProjs ? prisma.project.findMany({ select: { id: true, name: true, type: true } }) : Promise.resolve([]),
    ]);
    return { departments: allDepts, projects: allProjs, positions: [], users: [] };
  }

  const employees = await prisma.employee.findMany({
    where: { userId },
    select: { id: true, name: true },
  });
  const employeeIds = employees.map((e) => e.id);

  if (employeeIds.length === 0) return empty;

  // Membership-based targets
  const [eps, empProjects] = await Promise.all([
    prisma.eDP.findMany({
      where: { employeeId: { in: employeeIds } },
      select: {
        department: { select: { id: true, name: true, code: true } },
        position: { select: { id: true, code: true, name: true } },
      },
    }),
    prisma.employeeProject.findMany({
      where: { employeeId: { in: employeeIds } },
      select: { project: { select: { id: true, name: true, type: true } } },
    }),
  ]);

  const deptMap = new Map<number, TargetInfo>();
  const posMap = new Map<number, TargetInfo>();
  const projMap = new Map<number, TargetInfo>();

  for (const ep of eps) {
    if (ep.department?.id && !deptMap.has(ep.department.id)) {
      deptMap.set(ep.department.id, ep.department as TargetInfo);
    }
    if (ep.position?.id && !posMap.has(ep.position.id)) {
      posMap.set(ep.position.id, ep.position as TargetInfo);
    }
  }
  for (const ep of empProjects) {
    if (!projMap.has(ep.project.id)) projMap.set(ep.project.id, ep.project);
  }

  // Batch 5.1: merge scoped grant targets into deptMap and projMap
  await mergeScopedTargets(userId, employeeIds, deptMap, projMap, new Map());

  // Implicit: user's own personal report target (backend-reserved, not in UI scope selector)
  const userMap = new Map<number, TargetInfo>();
  for (const emp of employees) {
    userMap.set(userId, { id: userId, name: `${emp.name}（个人）` });
  }
  // Merge user-scoped grant targets too (backend-reserved)
  await mergeScopedTargets(userId, employeeIds, new Map(), new Map(), userMap);

  return {
    departments: Array.from(deptMap.values()),
    projects: Array.from(projMap.values()),
    positions: Array.from(posMap.values()),
    users: Array.from(userMap.values()),
  };
}

/**
 * Query scoped work.report grants and merge department/project/user targets
 * into the provided maps. Handles user-level, position-level, and department-level grants.
 */
async function mergeScopedTargets(
  userId: number,
  employeeIds: number[],
  deptMap: Map<number, TargetInfo>,
  projMap: Map<number, TargetInfo>,
  userMap: Map<number, TargetInfo>,
): Promise<void> {
  // Query leaf resources for scoped grants
  const leafResources = await prisma.resource.findMany({
    where: { key: { in: SCOPED_LEAF_RESOURCES } },
    select: { id: true },
  });
  if (leafResources.length === 0) return;
  const leafIds = leafResources.map((r) => r.id);

  const posIds = await getUserPositionIdsForMerge(employeeIds);
  const deptIds = await getUserDepartmentIdsForMerge(employeeIds);

  const scopeIds = new Set<string>();

  const [userGrants, posGrants, deptGrants] = await Promise.all([
    prisma.userResourceRole.findMany({
      where: { userId, resourceId: { in: leafIds }, scopeId: { not: null } },
      select: { scopeId: true },
    }),
    posIds.length > 0
      ? prisma.positionResourceRole.findMany({
          where: { positionId: { in: posIds }, resourceId: { in: leafIds }, scopeId: { not: null } },
          select: { scopeId: true },
        })
      : Promise.resolve([] as Array<{ scopeId: string | null }>),
    deptIds.length > 0
      ? prisma.departmentResourceRole.findMany({
          where: { departmentId: { in: deptIds }, resourceId: { in: leafIds }, scopeId: { not: null } },
          select: { scopeId: true },
        })
      : Promise.resolve([] as Array<{ scopeId: string | null }>),
  ]);

  for (const g of [...userGrants, ...posGrants, ...deptGrants]) {
    if (g.scopeId) scopeIds.add(g.scopeId);
  }

  const scopeDeptIds: number[] = [];
  const scopeProjIds: number[] = [];
  const scopeUserIds: number[] = [];

  for (const sid of scopeIds) {
    const idx = sid.lastIndexOf(":");
    if (idx <= 0) continue;
    const id = Number(sid.slice(idx + 1));
    if (!Number.isFinite(id)) continue;
    const type = sid.slice(0, idx);
    if (type === "department") scopeDeptIds.push(id);
    else if (type === "project") scopeProjIds.push(id);
    else if (type === "user") scopeUserIds.push(id);
  }

  if (scopeDeptIds.length > 0) {
    const depts = await prisma.department.findMany({
      where: { id: { in: scopeDeptIds } },
      select: { id: true, name: true, code: true },
    });
    for (const d of depts) { if (!deptMap.has(d.id)) deptMap.set(d.id, d); }
  }

  if (scopeProjIds.length > 0) {
    const projs = await prisma.project.findMany({
      where: { id: { in: scopeProjIds } },
      select: { id: true, name: true, type: true },
    });
    for (const p of projs) { if (!projMap.has(p.id)) projMap.set(p.id, p); }
  }

  if (scopeUserIds.length > 0) {
    const users = await prisma.user.findMany({
      where: { id: { in: scopeUserIds } },
      include: { employees: { select: { name: true }, take: 1 } },
    });
    for (const u of users) {
      if (!userMap.has(u.id)) {
        userMap.set(u.id, { id: u.id, name: `${u.employees[0]?.name || `用户#${u.id}`}（个人）` });
      }
    }
  }
}

async function getAllTargets() {
  const [departments, projects, positions, users] = await Promise.all([
    prisma.department.findMany({ select: { id: true, name: true, code: true } }),
    prisma.project.findMany({ select: { id: true, name: true, type: true } }),
    prisma.position.findMany({ select: { id: true, code: true, name: true } }),
    prisma.user.findMany({
      where: { employees: { some: { employments: { some: { isActive: true } } } } },
      select: { id: true, name: true },
    }),
  ]);
  return {
    departments,
    projects,
    positions,
    users: users.map((u) => ({ id: u.id, name: u.name || `用户#${u.id}` })),
  };
}

async function getUserPositionIdsForMerge(employeeIds: number[]): Promise<number[]> {
  const eps = await prisma.eDP.findMany({
    where: { employeeId: { in: employeeIds } },
    select: { positionId: true },
  });
  return eps.map((e) => e.positionId).filter((id): id is number => id !== null);
}

async function getUserDepartmentIdsForMerge(employeeIds: number[]): Promise<number[]> {
  const eps = await prisma.eDP.findMany({
    where: { employeeId: { in: employeeIds } },
    select: { departmentId: true },
  });
  return [...new Set(eps.map((e) => e.departmentId).filter((id): id is number => id !== null))];
}

// ─── Scoped permission checks (Batch 5) ─────────────────────────

/**
 * Check if a user can view data for a given target under a specific resource.
 *
 * Rules:
 * - system.admin with bypass ON → always allowed
 * - Personal reports (user:<id>): the user whose userId matches has implicit access
 * - Department/project/position reports: must have scoped grant
 */
export async function canAccessTarget(
  userId: number,
  targetType: string,
  targetId: number,
  resourceKey?: string,
): Promise<boolean> {
  if (targetType === "user" && targetId === userId) return true;

  const rk = resourceKey || resourceKeyForTarget(targetType);
  const scopeId = toScopeId(targetType, targetId);
  return checkScopedPermission(userId, rk, "access", scopeId);
}

export async function canSubmitToTarget(
  userId: number,
  targetType: string,
  targetId: number,
  resourceKey?: string,
): Promise<boolean> {
  if (targetType === "user" && targetId === userId) return true;

  const rk = resourceKey || resourceKeyForTarget(targetType);
  const scopeId = toScopeId(targetType, targetId);
  return checkScopedPermission(userId, rk, "write", scopeId);
}
