import "server-only";

import { prisma } from "./prisma";

export type UserEmployeeIdentity = {
  username: string;
  employeeName: string | null;
  employeeId: string | null;
  hasEmployeeRecord: boolean;
};

export async function getUserEmployeeIdentity(userId: number): Promise<UserEmployeeIdentity | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      username: true,
      employeeId: true,
    },
  });
  if (!user) return null;

  const employee = await prisma.employee.findFirst({
    where: {
      OR: [
        { userId },
        ...(user.employeeId ? [{ employeeId: user.employeeId }] : []),
      ],
    },
    select: {
      name: true,
      employeeId: true,
    },
    orderBy: { id: "asc" },
  });

  return {
    username: user.username,
    employeeName: employee?.name ?? null,
    employeeId: employee?.employeeId || user.employeeId || null,
    hasEmployeeRecord: Boolean(employee),
  };
}

export async function resolveUserEmployeeName(userId: number): Promise<string | null> {
  const identity = await getUserEmployeeIdentity(userId);
  return identity?.employeeName ?? null;
}

export async function getUserEmployeeSignatureName(userId: number): Promise<string | null> {
  const identity = await getUserEmployeeIdentity(userId);
  if (!identity?.hasEmployeeRecord || !identity.employeeId || !identity.employeeName) return null;
  return `${identity.employeeId} ${identity.employeeName}`;
}
