import { prisma } from "@workspace/platform/server/prisma";

export async function listEmployeeEmploymentReferences(employeeId: number) {
  return prisma.employment.findMany({
    where: { employeeId },
    orderBy: { id: "desc" },
    select: { id: true, isActive: true, joinDate: true, leaveDate: true },
  });
}
