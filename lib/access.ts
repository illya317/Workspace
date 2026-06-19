import { prisma } from "./prisma";
import { authorize } from "./auth";

// ─── Business rule helpers ──────────────────────────────

/** User is a member of the target department/project via EDP/EmployeeProject */
async function isMemberOfTarget(userId: number, targetType: string, targetId: number): Promise<boolean> {
  const employees = await prisma.employee.findMany({ where: { userId }, select: { id: true } });
  const employeeIds = employees.map((e) => e.id);
  if (employeeIds.length === 0) return false;

  if (targetType === "department") {
    const ep = await prisma.eDP.findFirst({
      where: { employeeId: { in: employeeIds }, departmentId: targetId },
    });
    return !!ep;
  }
  if (targetType === "project") {
    const ep = await prisma.employeeProject.findFirst({
      where: { employeeId: { in: employeeIds }, projectId: targetId },
    });
    return !!ep;
  }
  // position: check if user holds this position
  if (targetType === "position") {
    const ep = await prisma.eDP.findFirst({
      where: { employeeId: { in: employeeIds }, positionId: targetId },
    });
    return !!ep;
  }
  // user/personal: only the user themselves
  if (targetType === "user") return targetId === userId;
  return false;
}

/** User is an assignee (writer) for the target */
async function isAssignee(userId: number, targetType: string, targetId: number, kind: "task" | "report"): Promise<boolean> {
  if (targetType === "department") {
    const a = await prisma.departmentWorkAssignee.findFirst({
      where: { departmentId: targetId, userId, kind },
    });
    return !!a;
  }
  if (targetType === "project") {
    const a = await prisma.projectWorkAssignee.findFirst({
      where: { projectId: targetId, userId, kind },
    });
    return !!a;
  }
  return false;
}

// ─── Target listing (UI) ─────────────────────────────────

interface TargetInfo {
  id: number;
  name: string;
  company?: string | null;
  type?: string;
  code?: string;
}

export async function getUserTargets(userId: number): Promise<{
  departments: TargetInfo[];
  projects: TargetInfo[];
  positions: TargetInfo[];
  users: TargetInfo[];
}> {
  // System admin → all targets
  if (await authorize({ user: userId, resourceKey: "work", action: "admin" })) {
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
      departments, projects, positions,
      users: users.map((u) => ({ id: u.id, name: u.name || `用户#${u.id}` })),
    };
  }

  // Work admin → all department/project targets
  const isWorkAdmin = await authorize({ user: userId, resourceKey: "work", action: "admin" });
  const [allDepts, allProjs] = isWorkAdmin ? await Promise.all([
    prisma.department.findMany({ select: { id: true, name: true, code: true } }),
    prisma.project.findMany({ select: { id: true, name: true, type: true } }),
  ]) : [[], []];

  const deptMap = new Map<number, TargetInfo>();
  const projMap = new Map<number, TargetInfo>();
  const posMap = new Map<number, TargetInfo>();
  const userMap = new Map<number, TargetInfo>();

  if (isWorkAdmin) {
    for (const d of allDepts) deptMap.set(d.id, d);
    for (const p of allProjs) projMap.set(p.id, p);
  }

  const employees = await prisma.employee.findMany({ where: { userId }, select: { id: true, name: true } });
  const employeeIds = employees.map((e) => e.id);

  if (employeeIds.length > 0) {
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
    for (const ep of eps) {
      if (ep.department?.id) deptMap.set(ep.department.id, ep.department as TargetInfo);
      if (ep.position?.id) posMap.set(ep.position.id, ep.position as TargetInfo);
    }
    for (const ep of empProjects) projMap.set(ep.project.id, ep.project);

    // Assignee targets: departments/projects user is assigned to write for
    const [deptAssigns, projAssigns] = await Promise.all([
      prisma.departmentWorkAssignee.findMany({
        where: { userId },
        select: { departmentId: true },
      }),
      prisma.projectWorkAssignee.findMany({
        where: { userId },
        select: { projectId: true },
      }),
    ]);
    if (deptAssigns.length > 0) {
      const depts = await prisma.department.findMany({
        where: { id: { in: deptAssigns.map((a) => a.departmentId) } },
        select: { id: true, name: true, code: true },
      });
      for (const d of depts) deptMap.set(d.id, d);
    }
    if (projAssigns.length > 0) {
      const projs = await prisma.project.findMany({
        where: { id: { in: projAssigns.map((a) => a.projectId) } },
        select: { id: true, name: true, type: true },
      });
      for (const p of projs) projMap.set(p.id, p);
    }

    // Own personal target
    for (const emp of employees) {
      userMap.set(userId, { id: userId, name: `${emp.name}（个人）` });
    }
  }

  return {
    departments: Array.from(deptMap.values()),
    projects: Array.from(projMap.values()),
    positions: Array.from(posMap.values()),
    users: Array.from(userMap.values()),
  };
}

// ─── Permission checks ───────────────────────────────────

/** Check if user can VIEW reports/work-items for a target */
export async function canAccessTarget(
  userId: number, targetType: string, targetId: number,
): Promise<boolean> {
  // Own personal data: always
  if (targetType === "user" && targetId === userId) return true;
  // Admin bypass
  if (await authorize({ user: userId, resourceKey: "work", action: "admin" })) return true;
  // Membership → can view
  return isMemberOfTarget(userId, targetType, targetId);
}

/** Check if user can WRITE reports for a target */
export async function canSubmitToTarget(
  userId: number, targetType: string, targetId: number,
): Promise<boolean> {
  // Own personal data: always
  if (targetType === "user" && targetId === userId) return true;
  // Admin bypass
  if (await authorize({ user: userId, resourceKey: "work", action: "admin" })) return true;
  // Assignee → can write
  if (await isAssignee(userId, targetType, targetId, "report")) return true;
  return false;
}

/** Check if user can WRITE work tasks for a target */
export async function canEditWorkTask(
  userId: number, targetType: string, targetId: number,
): Promise<boolean> {
  if (targetType === "user" && targetId === userId) return true;
  if (await authorize({ user: userId, resourceKey: "work", action: "admin" })) return true;
  if (await isAssignee(userId, targetType, targetId, "task")) return true;
  return false;
}
