import { matchesFkKeyword, type FkOption } from "@workspace/platform/server/fk-registry";
import { prisma } from "@workspace/platform/server/prisma";
import { collaborationExecutorPositionIds } from "./work-collaboration-references";
import { workOwnerDepartmentScopeIds } from "./work-owner-scopes";
import { listRecursiveSuperiorEmployeeIdsForUser } from "./work-superior-employees";

type LifecycleScope = "active" | "all" | "archived";

type WorkOwnerEligibilityInput = {
  actorUserId?: number | null;
  targetType?: string | null;
  targetId?: number | null;
  collaborationId?: number | null;
};

export async function listWorkOwnerEmployeeOptions(input: WorkOwnerEligibilityInput & {
  keyword: string;
  lifecycleScope: LifecycleScope;
}): Promise<FkOption[]> {
  const context = await resolveWorkOwnerEligibilityContext(input);
  if (context.positionIds !== null && context.positionIds.length === 0) return [];
  if (context.departmentIds !== null && context.departmentIds.length === 0) return [];
  const rows = await prisma.employee.findMany({
    where: {
      ...(context.superiorEmployeeIds.length > 0 ? { id: { notIn: context.superiorEmployeeIds } } : {}),
      ...(context.positionIds !== null
        ? { positions: { some: currentEdpWhere({ positionId: { in: context.positionIds } }) } }
        : context.departmentIds !== null
        ? { positions: { some: currentEdpWhere({ departmentId: { in: context.departmentIds } }) } }
        : {}),
      ...(input.lifecycleScope === "active"
        ? { employments: { some: { isActive: true } } }
        : input.lifecycleScope === "archived"
          ? { employments: { none: { isActive: true } } }
          : {}),
    },
    select: {
      id: true,
      name: true,
      employeeId: true,
      employments: { select: { isActive: true } },
      positions: {
        where: currentEdpWhere(context.positionIds !== null
          ? { positionId: { in: context.positionIds } }
          : context.departmentIds === null ? {} : { departmentId: { in: context.departmentIds } }),
        select: { position: { select: { name: true } }, department: { select: { name: true } } },
        take: 1,
      },
    },
    orderBy: { employeeId: "asc" },
    ...(input.keyword.trim() ? {} : { take: 120 }),
  });
  return rows
    .map((row) => ({
      id: row.id,
      name: row.name,
      subtitle: [row.employeeId, row.positions[0]?.position?.name, row.positions[0]?.department?.name].filter(Boolean).join(" · "),
      lifecycleStatus: row.employments.some((employment) => employment.isActive) ? "active" as const : "inactive" as const,
    }))
    .filter((row) => matchesFkKeyword([row.name, row.subtitle], input.keyword))
    .slice(0, 50);
}

export async function validateWorkOwnerAssignment(input: WorkOwnerEligibilityInput & {
  ownerEmployeeId: number;
}) {
  const context = await resolveWorkOwnerEligibilityContext(input);
  if (context.selfEmployeeIds.includes(input.ownerEmployeeId)) return null;
  if (context.superiorEmployeeIds.includes(input.ownerEmployeeId)) return "负责人不能选择自己的上级";
  if (context.positionIds !== null && context.positionIds.length === 0) return ownerScopeError(input.targetType, true);
  if (context.departmentIds !== null && context.departmentIds.length === 0) return ownerScopeError(input.targetType);
  const owner = await prisma.employee.findFirst({
    where: {
      id: input.ownerEmployeeId,
      employments: { some: { isActive: true } },
      ...(context.positionIds !== null
        ? { positions: { some: currentEdpWhere({ positionId: { in: context.positionIds } }) } }
        : context.departmentIds !== null
        ? { positions: { some: currentEdpWhere({ departmentId: { in: context.departmentIds } }) } }
        : {}),
    },
    select: { id: true },
  });
  return owner ? null : ownerScopeError(input.targetType, context.positionIds !== null);
}

async function resolveWorkOwnerEligibilityContext(input: WorkOwnerEligibilityInput) {
  const personalContext = input.targetType === "personal" && input.targetId
    ? await personalOwnerContext(input.targetId)
    : null;
  const baseDepartmentIds = personalContext
    ? personalContext.departmentIds
    : input.targetId
      ? await workOwnerDepartmentScopeIds(input.targetType, input.targetId)
      : [];
  const positionIds = input.collaborationId ? await collaborationExecutorPositionIds(input) : null;
  const restrictByDepartment = input.targetType === "personal"
    || input.targetType === "department"
    || input.targetType === "committee"
    || input.targetType === "project";
  const superiorUserId = input.actorUserId || (input.targetType === "personal" ? input.targetId : null);
  const superiorEmployeeIds = superiorUserId
    ? await listRecursiveSuperiorEmployeeIdsForUser(superiorUserId)
    : [];
  return {
    departmentIds: positionIds === null && restrictByDepartment ? baseDepartmentIds : null,
    positionIds,
    selfEmployeeIds: personalContext?.selfEmployeeIds ?? [],
    superiorEmployeeIds,
  };
}

async function personalOwnerContext(userId: number) {
  const employees = await prisma.employee.findMany({
    where: { userId, employments: { some: { isActive: true } } },
    select: {
      id: true,
      positions: { where: currentEdpWhere({}), select: { departmentId: true } },
    },
  });
  return {
    selfEmployeeIds: employees.map((employee) => employee.id),
    departmentIds: Array.from(new Set(employees.flatMap((employee) =>
      employee.positions.map((position) => position.departmentId).filter((id): id is number => Boolean(id)),
    ))),
  };
}

function ownerScopeError(targetType?: string | null, collaborationRestricted = false) {
  if (collaborationRestricted) return "负责人必须来自已接受赋能部门的执行岗位";
  if (targetType === "personal") return "个人空间负责人必须来自本人所在部门";
  if (targetType === "project") return "项目空间负责人必须来自赋能部门及其下属部门";
  return "部门空间负责人必须来自当前部门及其下属部门，或已接受协作的赋能部门";
}

function currentEdpWhere<T extends Record<string, unknown>>(extra: T) {
  const today = new Date().toISOString().slice(0, 10);
  return {
    ...extra,
    OR: [{ endDate: null }, { endDate: "" }, { endDate: { gte: today } }],
  };
}
