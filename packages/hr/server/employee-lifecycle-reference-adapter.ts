import { prisma } from "@workspace/platform/server/prisma";

export async function findEmployeeLifecycleReference(employeeId: number) {
  return prisma.employee.findUnique({
    where: { id: employeeId },
    select: {
      id: true,
      employments: { select: { id: true, version: true, isActive: true, joinDate: true, leaveDate: true } },
      positions: {
        select: {
          id: true,
          version: true,
          employeeId: true,
          reportingCompanyId: true,
          departmentId: true,
          positionId: true,
          positionReportOverrideId: true,
          isPrimary: true,
          startDate: true,
          endDate: true,
          reportTo: true,
          reportToPositionId: true,
          allocationWeight: true,
        },
      },
      lifecycleEvents: { select: { id: true }, take: 1 },
    },
  });
}
