import { prisma } from "@workspace/platform/server/prisma";

export async function findProjectEnablingDepartmentReference(projectId: number) {
  return prisma.project.findUnique({
    where: { id: projectId },
    select: { projectType: true, enablingDepartments: { select: { departmentId: true } } },
  });
}

export async function findEmployeeIdByNumber(employeeNumber: string) {
  return prisma.employee.findUnique({ where: { employeeId: employeeNumber }, select: { id: true } });
}

export async function findProjectMemberReference(recordId: number) {
  return prisma.employeeProject.findUnique({
    where: { id: recordId },
    select: { employeeId: true, projectId: true, role: true, recordState: true },
  });
}

export async function findProjectMemberDeleteReference(recordId: number) {
  return prisma.employeeProject.findUnique({
    where: { id: recordId },
    select: { projectId: true, recordState: true },
  });
}
