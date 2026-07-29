import { currentEmploymentDateWhere, currentOpenEndedDateWhere } from "../relation-registry";
import { prisma } from "../prisma";

export async function listActivePositionUserIds(positionId: number) {
  const employees = await prisma.employee.findMany({
    where: {
      userId: { not: null },
      employments: { some: currentEmploymentDateWhere() },
      positions: { some: currentOpenEndedDateWhere({ positionId }) },
    },
    select: { userId: true },
    orderBy: { employeeId: "asc" },
  });
  return employees.flatMap((employee) => employee.userId ? [employee.userId] : []);
}

export async function listActiveEmployeeUserIds(employeeId: number) {
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, userId: { not: null }, employments: { some: currentEmploymentDateWhere() } },
    select: { userId: true },
  });
  return employee?.userId ? [employee.userId] : [];
}
