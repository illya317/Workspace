import { prisma } from "@workspace/platform/server/prisma";

export async function countEmployeeReferences(employeeIds: number[]) {
  return employeeIds.length ? prisma.employee.count({ where: { id: { in: employeeIds } } }) : 0;
}

export async function findProjectUpdateReference(projectId: number) {
  return prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      status: true,
      plannedStartDate: true,
      plannedEndDate: true,
      actualStartDate: true,
      actualEndDate: true,
      projectType: true,
      leadingDepartmentId: true,
    },
  });
}

export async function listProjectRascMemberReferences(projectId: number) {
  return prisma.employeeProject.findMany({
    where: {
      projectId,
      role: { in: ["负责人", "项目负责人", "执行负责", "支持协作", "咨询参与"] },
      recordState: "confirmed",
    },
    select: {
      employeeId: true,
      startDate: true,
      endDate: true,
      employee: { select: { employments: { select: { isActive: true, joinDate: true, leaveDate: true } } } },
    },
  });
}
