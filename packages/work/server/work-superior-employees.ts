import { prisma } from "@workspace/platform/server/prisma";
import { currentEmploymentDateWhere, currentOpenEndedDateWhere } from "@workspace/platform/server/relation-registry";

export async function listRecursiveSuperiorEmployeeIdsForUser(userId: number) {
  const employees = await prisma.employee.findMany({
    where: { userId, employments: { some: currentEmploymentDateWhere() } },
    select: { id: true },
  });
  return listRecursiveSuperiorEmployeeIds(employees.map((employee) => employee.id));
}

export async function listRecursiveSuperiorEmployeeIds(employeeIds: number[]) {
  const result = new Set<number>();
  const visited = new Set(employeeIds);
  let frontier = employeeIds;
  for (let depth = 0; depth < 12 && frontier.length > 0; depth += 1) {
    const direct = await listDirectSuperiorEmployeeIds(frontier);
    const next = direct.filter((id) => !visited.has(id));
    for (const id of next) {
      visited.add(id);
      result.add(id);
    }
    frontier = next;
  }
  return [...result];
}

async function listDirectSuperiorEmployeeIds(employeeIds: number[]) {
  if (employeeIds.length === 0) return [];
  const edps = await prisma.eDP.findMany({
    where: currentEdpWhere({ employeeId: { in: employeeIds } }),
    select: { reportToPositionId: true },
  });
  const reportToPositionIds = Array.from(new Set(
    edps.flatMap((edp) => edp.reportToPositionId ? [edp.reportToPositionId] : []),
  ));
  const managers = reportToPositionIds.length > 0
    ? await prisma.employee.findMany({
      where: {
        employments: { some: currentEmploymentDateWhere() },
        positions: { some: currentEdpWhere({ positionId: { in: reportToPositionIds } }) },
      },
      select: { id: true },
    })
    : [];
  return Array.from(new Set(managers.map((employee) => employee.id)));
}

function currentEdpWhere<T extends Record<string, unknown>>(extra: T) {
  return currentOpenEndedDateWhere(extra);
}
