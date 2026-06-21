import "server-only";

import { prisma } from "./prisma";

export type UserEmployeeIdentity = {
  userName: string;
  employeeName: string;
  employeeId: string | null;
  hasEmployeeRecord: boolean;
};

export async function getUserEmployeeIdentity(userId: number): Promise<UserEmployeeIdentity | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      nickname: true,
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
    userName: user.nickname,
    employeeName: employee?.name || user.nickname,
    employeeId: employee?.employeeId || user.employeeId || null,
    hasEmployeeRecord: Boolean(employee),
  };
}

export async function getUserEmployeeSignatureName(userId: number, fallbackName = ""): Promise<string> {
  const identity = await getUserEmployeeIdentity(userId);
  return identity?.employeeName || fallbackName;
}
