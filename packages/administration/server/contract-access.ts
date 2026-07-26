import "server-only";

import { isSuperAdmin } from "@workspace/platform/server/auth/admin";
import { listDepartmentIdsManagedByUserPosition } from "@workspace/platform/server/business-space-permissions";
import { prisma, type Prisma } from "@workspace/platform/server/prisma";
import { currentEmploymentDateWhere } from "@workspace/platform/server/relation-registry";

export const CONTRACT_INTERNAL_LEVEL = 2;
export const CONTRACT_CONFIDENTIAL_LEVEL = 3;
export const CONTRACT_TOP_SECRET_LEVEL = 4;

async function contractNaturalScope(userId: number) {
  const [employees, managedDepartmentIds] = await Promise.all([
    prisma.employee.findMany({
      where: { userId, employments: { some: currentEmploymentDateWhere() } },
      select: { id: true },
    }),
    listDepartmentIdsManagedByUserPosition(userId),
  ]);
  return {
    employeeIds: employees.map((employee) => employee.id),
    managedDepartmentIds,
  };
}

export async function buildContractRecordAccessWhere(userId: number): Promise<Prisma.ContractWhereInput> {
  if (await isSuperAdmin(userId)) return {};
  const scope = await contractNaturalScope(userId);
  const confidentialOwners: Prisma.ContractWhereInput[] = [
    ...(scope.employeeIds.length ? [{ handlerEmployeeId: { in: scope.employeeIds } }] : []),
    ...(scope.managedDepartmentIds.length ? [{ ownerDepartmentId: { in: scope.managedDepartmentIds } }] : []),
  ];
  return {
    OR: [
      { confidentialityLevel: { lte: CONTRACT_INTERNAL_LEVEL } },
      ...(confidentialOwners.length ? [{ confidentialityLevel: CONTRACT_CONFIDENTIAL_LEVEL, OR: confidentialOwners }] : []),
    ],
  };
}

export async function canOwnContractScope(input: {
  userId: number;
  confidentialityLevel: number;
  handlerEmployeeId: number | null;
  ownerDepartmentId: number | null;
}) {
  if (await isSuperAdmin(input.userId)) return true;
  if (input.confidentialityLevel <= CONTRACT_INTERNAL_LEVEL) return true;
  if (input.confidentialityLevel >= CONTRACT_TOP_SECRET_LEVEL) return false;
  const scope = await contractNaturalScope(input.userId);
  return Boolean(
    (input.handlerEmployeeId && scope.employeeIds.includes(input.handlerEmployeeId))
    || (input.ownerDepartmentId && scope.managedDepartmentIds.includes(input.ownerDepartmentId)),
  );
}
