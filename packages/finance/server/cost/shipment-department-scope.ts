import { prisma } from "@workspace/platform/server/prisma";
import { currentEmploymentDateWhere } from "@workspace/platform/server/relation-registry";
import type { CostQueryParams } from "./common";
import { buildShipmentWhere } from "./common";

export async function resolveShipmentDepartmentScope<T extends CostQueryParams>(
  params: T,
): Promise<T & Pick<CostQueryParams, "employeeIds">> {
  if (params.departmentId === undefined) return params;
  const departmentIds = await departmentAndDescendantIds(params.departmentId);
  if (departmentIds.length === 0) return { ...params, employeeIds: [] };

  const range = queryDateRange(params);
  const assignments = await prisma.eDP.findMany({
    where: {
      departmentId: { in: departmentIds },
      ...(range ? {
        AND: [
          { OR: [{ startDate: null }, { startDate: { lte: range.dateTo } }] },
          { OR: [{ endDate: null }, { endDate: { gte: range.dateFrom } }] },
        ],
      } : {}),
    },
    select: { employeeId: true },
    distinct: ["employeeId"],
  });

  return {
    ...params,
    employeeIds: assignments.map((assignment) => assignment.employeeId),
  };
}

export async function hasDepartmentShipmentActivity(departmentId: number) {
  if (!Number.isInteger(departmentId) || departmentId <= 0) return false;
  const scoped = await resolveShipmentDepartmentScope({ departmentId });
  if (!scoped.employeeIds?.length) return false;
  return Boolean(await prisma.financeShipment.findFirst({
    where: buildShipmentWhere(scoped),
    select: { id: true },
  }));
}

export async function hasPersonalShipmentActivity(userId: number) {
  if (!Number.isInteger(userId) || userId <= 0) return false;
  const employees = await prisma.employee.findMany({
    where: { userId, employments: { some: currentEmploymentDateWhere() } },
    select: { id: true },
  });
  if (employees.length === 0) return false;
  return Boolean(await prisma.financeShipment.findFirst({
    where: buildShipmentWhere({ employeeIds: employees.map((employee) => employee.id) }),
    select: { id: true },
  }));
}

async function departmentAndDescendantIds(departmentId: number) {
  const departments = await prisma.department.findMany({
    select: { id: true, parentId: true },
  });
  if (!departments.some((department) => department.id === departmentId)) return [];
  const children = new Map<number, number[]>();
  for (const department of departments) {
    if (department.parentId === null) continue;
    children.set(department.parentId, [...(children.get(department.parentId) ?? []), department.id]);
  }
  const result = [departmentId];
  for (let index = 0; index < result.length; index += 1) {
    result.push(...(children.get(result[index]) ?? []));
  }
  return result;
}

function queryDateRange(params: CostQueryParams) {
  if (params.dateFrom && params.dateTo) return { dateFrom: params.dateFrom, dateTo: params.dateTo };
  if (params.year === undefined) return null;
  if (params.month === undefined) {
    return { dateFrom: `${params.year}-01-01`, dateTo: `${params.year}-12-31` };
  }
  const lastDay = new Date(Date.UTC(params.year, params.month, 0)).getUTCDate();
  return {
    dateFrom: `${params.year}-${String(params.month).padStart(2, "0")}-01`,
    dateTo: `${params.year}-${String(params.month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
  };
}
