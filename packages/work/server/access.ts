import { authorize } from "@workspace/platform/server/auth";
import { prisma } from "@workspace/platform/server/prisma";

async function isMemberOfTarget(
  userId: number,
  targetType: string,
  targetId: number,
): Promise<boolean> {
  const employees = await prisma.employee.findMany({
    where: { userId },
    select: { id: true },
  });
  const employeeIds = employees.map((employee) => employee.id);
  if (employeeIds.length === 0) return false;

  if (targetType === "department") {
    const edp = await prisma.eDP.findFirst({
      where: { employeeId: { in: employeeIds }, departmentId: targetId },
    });
    return Boolean(edp);
  }

  if (targetType === "project") {
    const employeeProject = await prisma.employeeProject.findFirst({
      where: { employeeId: { in: employeeIds }, projectId: targetId },
    });
    return Boolean(employeeProject);
  }

  if (targetType === "position") {
    const edp = await prisma.eDP.findFirst({
      where: { employeeId: { in: employeeIds }, positionId: targetId },
    });
    return Boolean(edp);
  }

  if (targetType === "user") return targetId === userId;
  return false;
}

async function isAssignee(
  userId: number,
  targetType: string,
  targetId: number,
  kind: "task" | "report",
): Promise<boolean> {
  if (targetType === "department") {
    const assignee = await prisma.departmentWorkAssignee.findFirst({
      where: { departmentId: targetId, userId, kind },
    });
    return Boolean(assignee);
  }

  if (targetType === "project") {
    const assignee = await prisma.projectWorkAssignee.findFirst({
      where: { projectId: targetId, userId, kind },
    });
    return Boolean(assignee);
  }

  return false;
}

export async function canAccessTarget(
  userId: number,
  targetType: string,
  targetId: number,
): Promise<boolean> {
  if (targetType === "user" && targetId === userId) return true;
  if (await authorize({ user: userId, resourceKey: "work", action: "admin" })) return true;
  return isMemberOfTarget(userId, targetType, targetId);
}

export async function canSubmitToTarget(
  userId: number,
  targetType: string,
  targetId: number,
): Promise<boolean> {
  if (targetType === "user" && targetId === userId) return true;
  if (await authorize({ user: userId, resourceKey: "work", action: "admin" })) return true;
  return isAssignee(userId, targetType, targetId, "report");
}

export async function canEditWorkTask(
  userId: number,
  targetType: string,
  targetId: number,
): Promise<boolean> {
  if (targetType === "user" && targetId === userId) return true;
  if (await authorize({ user: userId, resourceKey: "work", action: "admin" })) return true;
  return isAssignee(userId, targetType, targetId, "task");
}
