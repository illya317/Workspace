import { prisma } from "@workspace/platform/server/prisma";

export async function findPerformanceArchiveReferences(employeeId: number, okrCycleId: number) {
  const [employee, cycle, duplicate] = await Promise.all([
    prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true } }),
    prisma.workOkrCycle.findUnique({ where: { id: okrCycleId }, select: { id: true } }),
    prisma.hrPerformanceReview.findUnique({
      where: { employeeId_okrCycleId: { employeeId, okrCycleId } },
      select: { id: true },
    }),
  ]);
  return { employee, cycle, duplicate };
}
