import { prisma } from "@workspace/platform/server/prisma";

export async function getUserPositionIds(userId: number): Promise<number[]> {
  const eps = await prisma.eDP.findMany({
    where: { employee: { userId } },
    select: { positionId: true },
  });
  return eps
    .map((e) => e.positionId)
    .filter((id): id is number => id !== null);
}

export async function getUserDepartmentIds(userId: number): Promise<number[]> {
  const eps = await prisma.eDP.findMany({
    where: { employee: { userId } },
    select: { departmentId: true },
  });
  return [
    ...new Set(
      eps
        .map((e) => e.departmentId)
        .filter((id): id is number => id !== null),
    ),
  ];
}
