import "server-only";

import { isRootAdminUsername, ROOT_ADMIN_ACTOR_NAME } from "./auth/root";
import { workspaceBusinessDate, workspaceBusinessDayStart } from "./business-date";
import { prisma, type Prisma } from "./prisma";
import { currentEmploymentDateWhere } from "./relation-registry";

type UserIdentityDatabaseClient = Prisma.TransactionClient | typeof prisma;

export type UserEmployeeIdentity = {
  username: string;
  canLogin: boolean;
  employeeName: string | null;
  employeeId: string | null;
  employeeRefId: number | null;
  hasEmployeeRecord: boolean;
  isActiveEmployee: boolean;
};

export type UserBusinessActorIdentity = UserEmployeeIdentity & {
  actorName: string;
  signatureName: string;
  isRootAdmin: boolean;
};

export type UserActivePositionAssignment = {
  id: number;
  positionId: number;
  positionCode: string;
  positionName: string;
  departmentId: number;
  departmentCode: string;
  departmentName: string;
  isPrimary: boolean;
};

export async function getUserEmployeeIdentity(userId: number): Promise<UserEmployeeIdentity | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      username: true,
      canLogin: true,
      employees: {
        select: {
          id: true,
          name: true,
          employeeId: true,
          employments: {
            where: currentEmploymentDateWhere(),
            select: { id: true },
            take: 1,
          },
        },
        orderBy: { id: "asc" },
        take: 1,
      },
    },
  });
  if (!user) return null;
  const employee = user.employees[0] ?? null;

  return {
    username: user.username,
    canLogin: user.canLogin,
    employeeName: employee?.name ?? null,
    employeeId: employee?.employeeId ?? null,
    employeeRefId: employee?.id ?? null,
    hasEmployeeRecord: Boolean(employee),
    isActiveEmployee: Boolean(employee?.employments.length),
  };
}

export function businessActorIdentity(
  identity: UserEmployeeIdentity | null,
): UserBusinessActorIdentity | null {
  if (!identity) return null;
  const isRootAdmin = identity.canLogin && isRootAdminUsername(identity.username);
  if (isRootAdmin) {
    return {
      ...identity,
      actorName: ROOT_ADMIN_ACTOR_NAME,
      signatureName: ROOT_ADMIN_ACTOR_NAME,
      isRootAdmin: true,
    };
  }
  const employeeName = identity.employeeName?.trim();
  if (!identity.hasEmployeeRecord || !employeeName) return null;
  return {
    ...identity,
    actorName: employeeName,
    signatureName: identity.employeeId ? `${identity.employeeId} ${employeeName}` : employeeName,
    isRootAdmin: false,
  };
}

export async function getUserBusinessActorIdentity(userId: number): Promise<UserBusinessActorIdentity | null> {
  return businessActorIdentity(await getUserEmployeeIdentity(userId));
}

export async function resolveUserBusinessActorName(userId: number): Promise<string | null> {
  return (await getUserBusinessActorIdentity(userId))?.actorName ?? null;
}

export async function getUserBusinessActorSignatureName(userId: number): Promise<string | null> {
  return (await getUserBusinessActorIdentity(userId))?.signatureName ?? null;
}

export async function canUserActAsActiveEmployee(userId: number): Promise<boolean> {
  const actor = await getUserBusinessActorIdentity(userId);
  return Boolean(actor && (actor.isRootAdmin || actor.isActiveEmployee));
}

export async function getUserActivePositionAssignments(
  userId: number,
  client: UserIdentityDatabaseClient = prisma,
  at = new Date(),
): Promise<UserActivePositionAssignment[]> {
  const today = workspaceBusinessDate(at);
  const activeDateTimeFloor = workspaceBusinessDayStart(at);
  const assignments = await client.eDP.findMany({
    where: {
      employee: { userId, employments: { some: currentEmploymentDateWhere({}, at) } },
      positionId: { not: null },
      departmentId: { not: null },
      AND: [
        { OR: [{ startDate: null }, { startDate: "" }, { startDate: { lte: today } }] },
        { OR: [{ endDate: null }, { endDate: "" }, { endDate: { gte: today } }] },
      ],
      position: {
        isArchived: false,
        OR: [{ endDate: null }, { endDate: { gte: activeDateTimeFloor } }],
      },
      department: {
        isArchived: false,
        OR: [{ endDate: null }, { endDate: { gte: activeDateTimeFloor } }],
      },
    },
    select: {
      id: true,
      positionId: true,
      departmentId: true,
      isPrimary: true,
      position: { select: { code: true, name: true } },
      department: { select: { code: true, name: true } },
    },
    orderBy: [{ isPrimary: "desc" }, { id: "asc" }],
  });

  return assignments.flatMap((assignment) => (
    assignment.positionId && assignment.departmentId && assignment.position && assignment.department
      ? [{
          id: assignment.id,
          positionId: assignment.positionId,
          positionCode: assignment.position.code,
          positionName: assignment.position.name,
          departmentId: assignment.departmentId,
          departmentCode: assignment.department.code,
          departmentName: assignment.department.name,
          isPrimary: assignment.isPrimary,
        }]
      : []
  ));
}
