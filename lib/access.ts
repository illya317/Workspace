import { prisma } from "./prisma";
import { checkPermission } from "./auth";

// ─── Target-based access control ─────────────────────────

interface TargetInfo {
  id: number;
  name: string;
  company?: string | null;
  type?: string;
  code?: string;
}

/**
 * Get all departments, projects, and positions the user is a member of.
 * System admins get all targets.
 */
export async function getUserTargets(userId: number): Promise<{
  departments: TargetInfo[];
  projects: TargetInfo[];
  positions: TargetInfo[];
}> {
  // Admin bypass — return all targets
  if (await checkPermission(userId, "system", "admin")) {
    const [departments, projects, positions] = await Promise.all([
      prisma.department.findMany({
        select: { id: true, name: true, code: true },
      }),
      prisma.project.findMany({
        select: { id: true, name: true, type: true },
      }),
      prisma.position.findMany({
        select: { id: true, code: true, name: true },
      }),
    ]);
    return { departments, projects, positions };
  }

  // Get employees linked to this user
  const employees = await prisma.employee.findMany({
    where: { userId },
    select: { id: true },
  });
  const employeeIds = employees.map((e) => e.id);

  if (employeeIds.length === 0) {
    return { departments: [], projects: [], positions: [] };
  }

  // Departments and positions from EDP
  const eps = await prisma.eDP.findMany({
    where: { employeeId: { in: employeeIds } },
    select: {
      department: { select: { id: true, name: true, code: true } },
      position: { select: { id: true, code: true, name: true } },
    },
  });

  // Projects from EmployeeProject
  const empProjects = await prisma.employeeProject.findMany({
    where: { employeeId: { in: employeeIds } },
    select: { project: { select: { id: true, name: true, type: true } } },
  });

  // Deduplicate
  const deptMap = new Map<number, TargetInfo>();
  for (const ep of eps) {
    if (ep.department?.id && !deptMap.has(ep.department.id)) {
      deptMap.set(ep.department.id, ep.department as any);
    }
  }

  const posMap = new Map<number, TargetInfo>();
  for (const ep of eps) {
    if (ep.position?.id && !posMap.has(ep.position.id)) {
      posMap.set(ep.position.id, ep.position as any);
    }
  }

  const projMap = new Map<number, TargetInfo>();
  for (const ep of empProjects) {
    if (!projMap.has(ep.project.id)) {
      projMap.set(ep.project.id, ep.project);
    }
  }

  return {
    departments: Array.from(deptMap.values()),
    projects: Array.from(projMap.values()),
    positions: Array.from(posMap.values()),
  };
}

/**
 * Check if a user can view reports for a given target.
 */
export async function canAccessTarget(
  userId: number,
  targetType: string,
  targetId: number
): Promise<boolean> {
  if (await checkPermission(userId, "system", "admin")) return true;
  const targets = await getUserTargets(userId);
  switch (targetType) {
    case "department":
      return targets.departments.some((d) => d.id === targetId);
    case "project":
      return targets.projects.some((p) => p.id === targetId);
    case "position":
      return targets.positions.some((p) => p.id === targetId);
    default:
      return false;
  }
}

/**
 * Check if a user can submit reports for a given target.
 * Membership in the department/project/position implies submission rights.
 */
export async function canSubmitToTarget(
  userId: number,
  targetType: string,
  targetId: number
): Promise<boolean> {
  return canAccessTarget(userId, targetType, targetId);
}
