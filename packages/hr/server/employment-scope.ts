import type { Prisma } from "@workspace/platform/server/prisma";
import { workspaceBusinessDate } from "@workspace/platform/server/business-date";

export function buildEmploymentDepartmentScopeWhere(
  departmentId: number,
): Prisma.EmploymentWhereInput {
  return {
    employee: {
      positions: {
        some: {
          OR: [
            { departmentId },
            { position: { departmentId } },
          ],
        },
      },
    },
  };
}

export function buildCurrentEmploymentDepartmentScopeWhere(
  departmentId: number,
  at: Date | string = new Date(),
): Prisma.EmploymentWhereInput {
  const today = typeof at === "string" ? at : workspaceBusinessDate(at);
  return {
    employee: {
      positions: {
        some: {
          AND: [
            { OR: [{ departmentId }, { position: { departmentId } }] },
            { OR: [{ startDate: null }, { startDate: "" }, { startDate: { lte: today } }] },
            { OR: [{ endDate: null }, { endDate: "" }, { endDate: { gte: today } }] },
          ],
        },
      },
    },
  };
}
