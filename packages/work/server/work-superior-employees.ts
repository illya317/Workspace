import { prisma } from "@workspace/platform/server/prisma";

export async function listRecursiveSuperiorEmployeeIdsForUser(userId: number) {
  const employees = await prisma.employee.findMany({
    where: { userId, employments: { some: { isActive: true } } },
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
    select: {
      reportTo: true,
      positionId: true,
      reportingCompanyId: true,
      departmentId: true,
      positionReportOverrideId: true,
    },
  });
  const reportToValues = Array.from(new Set(edps.map((edp) => String(edp.reportTo || "").trim()).filter(Boolean)));
  const byReportTo = reportToValues.length > 0
    ? await prisma.employee.findMany({
      where: {
        employments: { some: { isActive: true } },
        OR: [{ employeeId: { in: reportToValues } }, { name: { in: reportToValues } }],
      },
      select: { id: true },
    })
    : [];
  const parentPositionIds = await listParentPositionIds(edps);
  const byParentPosition = parentPositionIds.length > 0
    ? await prisma.employee.findMany({
      where: {
        employments: { some: { isActive: true } },
        positions: { some: currentEdpWhere({ positionId: { in: parentPositionIds } }) },
      },
      select: { id: true },
    })
    : [];
  return Array.from(new Set([...byReportTo, ...byParentPosition].map((employee) => employee.id)));
}

async function listParentPositionIds(edps: Array<{
  positionId: number | null;
  reportingCompanyId: number | null;
  departmentId: number | null;
  positionReportOverrideId: number | null;
}>) {
  const parentIds = new Set<number>();
  for (const edp of edps) {
    if (!edp.positionId) continue;
    const override = await prisma.positionReportOverride.findFirst({
      where: {
        ...(edp.positionReportOverrideId
          ? { id: edp.positionReportOverrideId }
          : { companyId: edp.reportingCompanyId ?? undefined }),
        positionId: edp.positionId,
        departmentId: edp.departmentId ?? undefined,
        isActive: true,
      },
      select: { reportToPositionId: true },
    });
    if (override?.reportToPositionId) {
      parentIds.add(override.reportToPositionId);
      continue;
    }
    const position = await prisma.position.findUnique({
      where: { id: edp.positionId },
      select: { reportToPositionId: true },
    });
    if (position?.reportToPositionId) parentIds.add(position.reportToPositionId);
  }
  return [...parentIds];
}

function currentEdpWhere<T extends Record<string, unknown>>(extra: T) {
  const today = new Date().toISOString().slice(0, 10);
  return {
    ...extra,
    OR: [{ endDate: null }, { endDate: "" }, { endDate: { gte: today } }],
  };
}
