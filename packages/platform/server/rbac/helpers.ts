import { prisma, type Prisma } from "@workspace/platform/server/prisma";
import {
  workspaceBusinessDate,
  workspaceBusinessDayStart,
} from "../business-date";

type PermissionDatabaseClient = Prisma.TransactionClient | typeof prisma;

export async function getUserPositionIds(
  userId: number,
  client: PermissionDatabaseClient = prisma,
  at = new Date(),
): Promise<number[]> {
  const today = workspaceBusinessDate(at);
  const activeDateTimeFloor = workspaceBusinessDayStart(at);
  const eps = await client.eDP.findMany({
    where: {
      employee: { userId, employments: { some: { isActive: true } } },
      AND: [
        { OR: [{ startDate: null }, { startDate: "" }, { startDate: { lte: today } }] },
        { OR: [{ endDate: null }, { endDate: "" }, { endDate: { gte: today } }] },
      ],
      position: {
        isArchived: false,
        OR: [{ endDate: null }, { endDate: { gte: activeDateTimeFloor } }],
      },
    },
    select: { positionId: true },
  });
  return eps
    .map((e) => e.positionId)
    .filter((id): id is number => id !== null);
}

export async function getUserDepartmentIds(
  userId: number,
  client: PermissionDatabaseClient = prisma,
  at = new Date(),
): Promise<number[]> {
  const today = workspaceBusinessDate(at);
  const activeDateTimeFloor = workspaceBusinessDayStart(at);
  const eps = await client.eDP.findMany({
    where: {
      employee: { userId, employments: { some: { isActive: true } } },
      AND: [
        { OR: [{ startDate: null }, { startDate: "" }, { startDate: { lte: today } }] },
        { OR: [{ endDate: null }, { endDate: "" }, { endDate: { gte: today } }] },
      ],
      department: {
        isArchived: false,
        OR: [{ endDate: null }, { endDate: { gte: activeDateTimeFloor } }],
      },
    },
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
