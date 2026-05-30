import { prisma } from "./prisma";
import { checkPermission } from "./auth";
import { checkScopedPermission, toScopeId } from "@/server/rbac/scoped";

// ─── Target listing (UI) — returns all targets visible in pickers ───

interface TargetInfo {
  id: number;
  name: string;
  company?: string | null;
  type?: string;
  code?: string;
}

/**
 * Get all departments, projects, and positions the user is a member of.
 * Used for populating target selectors in the UI — NOT for authorization.
 * System admins get all targets.
 */
export async function getUserTargets(userId: number): Promise<{
  departments: TargetInfo[];
  projects: TargetInfo[];
  positions: TargetInfo[];
}> {
  if (await checkPermission(userId, "system", "admin")) {
    const [departments, projects, positions] = await Promise.all([
      prisma.department.findMany({ select: { id: true, name: true, code: true } }),
      prisma.project.findMany({ select: { id: true, name: true, type: true } }),
      prisma.position.findMany({ select: { id: true, code: true, name: true } }),
    ]);
    return { departments, projects, positions };
  }

  const employees = await prisma.employee.findMany({
    where: { userId },
    select: { id: true },
  });
  const employeeIds = employees.map((e) => e.id);

  if (employeeIds.length === 0) {
    return { departments: [], projects: [], positions: [] };
  }

  const eps = await prisma.eDP.findMany({
    where: { employeeId: { in: employeeIds } },
    select: {
      department: { select: { id: true, name: true, code: true } },
      position: { select: { id: true, code: true, name: true } },
    },
  });

  const empProjects = await prisma.employeeProject.findMany({
    where: { employeeId: { in: employeeIds } },
    select: { project: { select: { id: true, name: true, type: true } } },
  });

  const deptMap = new Map<number, TargetInfo>();
  for (const ep of eps) {
    if (ep.department?.id && !deptMap.has(ep.department.id)) {
      deptMap.set(ep.department.id, ep.department as TargetInfo);
    }
  }

  const posMap = new Map<number, TargetInfo>();
  for (const ep of eps) {
    if (ep.position?.id && !posMap.has(ep.position.id)) {
      posMap.set(ep.position.id, ep.position as TargetInfo);
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

// ─── Scoped permission checks (Batch 5) ─────────────────────────

/**
 * Check if a user can view reports for a given target.
 *
 * Rules:
 * - system.admin with bypass ON → always allowed
 * - Personal reports (user:<id>): the user whose userId matches has implicit access
 * - Department/project/position reports: must have scoped work.report.access grant
 */
export async function canAccessTarget(
  userId: number,
  targetType: string,
  targetId: number
): Promise<boolean> {
  // Implicit: user can always access their own personal reports
  if (targetType === "user" && targetId === userId) return true;

  const scopeId = toScopeId(targetType, targetId);
  return checkScopedPermission(userId, "work.report", "access", scopeId);
}

/**
 * Check if a user can submit/edit reports for a given target.
 *
 * Rules:
 * - system.admin with bypass ON → always allowed
 * - Personal reports (user:<id>): the user whose userId matches has implicit write
 * - Department/project/position reports: must have scoped work.report.write grant
 */
export async function canSubmitToTarget(
  userId: number,
  targetType: string,
  targetId: number
): Promise<boolean> {
  // Implicit: user can always write their own personal reports
  if (targetType === "user" && targetId === userId) return true;

  const scopeId = toScopeId(targetType, targetId);
  return checkScopedPermission(userId, "work.report", "write", scopeId);
}
