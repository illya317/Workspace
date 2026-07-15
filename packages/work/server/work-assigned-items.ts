import { Prisma, prisma } from "@workspace/platform/server/prisma";
import { getWorkOkrControlSettings } from "./work-okr-control";
import { toWorkItemDto, workItemInclude } from "./work-item-dto";
import { toWorkPlanDto, workPlanInclude, type WorkPlanRow } from "./work-plan-dto";

const ASSIGNED_ITEM_TYPES = ["objective", "key_result", "task"];
const { planAlignments: _planAlignmentsInclude, ...workPlanIncludeWithoutAlignments } = workPlanInclude;

export async function listAssignedDepartmentWorkItems(userId: number) {
  const groups = await listAssignedDepartmentWorkPlanGroups(userId);
  return groups.flatMap((group) => group.assignedWorks);
}

export async function listAssignedPersonalCollaborationWorkItems(userId: number) {
  const groups = await listAssignedPersonalCollaborationWorkPlanGroups(userId);
  return groups.flatMap((group) => group.assignedWorks);
}

export async function listAssignedDepartmentWorkPlanGroups(userId: number) {
  return listAssignedWorkPlanGroups(userId, { targetTypes: ["department", "project"] });
}

export async function listAssignedPersonalCollaborationWorkPlanGroups(userId: number) {
  return listAssignedWorkPlanGroups(userId, { targetTypes: ["personal"], excludeTargetId: userId });
}

const assignedWorkPlanInclude = {
  ...workPlanIncludeWithoutAlignments,
  items: { where: { isArchived: false }, orderBy: [{ sortOrder: "asc" as const }, { id: "asc" as const }], include: workItemInclude },
} satisfies Prisma.WorkPlanInclude;

async function listAssignedWorkPlanGroups(userId: number, input: { targetTypes: Array<"department" | "project" | "personal">; excludeTargetId?: number }) {
  const ownerEmployeeIds = await activeEmployeeIdsForUser(userId);
  if (ownerEmployeeIds.length === 0) return [];
  const where: Prisma.WorkItemWhereInput = {
    targetType: { in: input.targetTypes },
    ...(input.excludeTargetId ? { targetId: { not: input.excludeTargetId } } : {}),
    ownerEmployeeId: { in: ownerEmployeeIds },
    itemType: { in: ASSIGNED_ITEM_TYPES },
    isArchived: false,
    plan: { isArchived: false },
  };
  const assignedRows = await prisma.workItem.findMany({
    where: { ...where, planId: { not: null } },
    select: { id: true, planId: true },
    orderBy: [{ targetId: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
  });
  const planIds = Array.from(new Set(assignedRows.map((row) => row.planId).filter((id): id is number => Boolean(id))));
  if (planIds.length === 0) return [];
  const assignedIdsByPlan = new Map<number, Set<number>>();
  for (const row of assignedRows) if (row.planId) assignedIdsByPlan.set(row.planId, new Set([...(assignedIdsByPlan.get(row.planId) ?? []), row.id]));
  const plans = await prisma.workPlan.findMany({
    where: { id: { in: planIds } },
    include: assignedWorkPlanInclude,
    orderBy: [{ targetType: "asc" }, { targetId: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
  });
  const personalOwnerNames = await employeeNamesByUserId(plans.filter((plan) => plan.targetType === "personal").map((plan) => plan.targetId));
  const departmentNames = await departmentNamesById(plans.filter((plan) => plan.targetType === "department").map((plan) => plan.targetId));
  const projectNames = await projectNamesById(plans.filter((plan) => plan.targetType === "project").map((plan) => plan.targetId));
  const timeControlEnabled = (await getWorkOkrControlSettings()).enabled;
  return plans.map((plan) => {
    const assignedIds = assignedIdsByPlan.get(plan.id) ?? new Set<number>();
    const assignedWorks = plan.items.map(toWorkItemDto).filter((work) => assignedIds.has(work.id));
    return {
      plan: toWorkPlanDto({ ...plan, planAlignments: [] } as WorkPlanRow, { timeControlEnabled }),
      works: assignedWorks,
      assignedWorks,
      assignedWorkIds: [...assignedIds],
      arrangerEmployeeName: plan.targetType === "personal" ? personalOwnerNames.get(plan.targetId) ?? plan.owner?.name ?? null : null,
      assignerSpaceName: plan.targetType === "department"
        ? departmentNames.get(plan.targetId) ?? null
        : plan.targetType === "project"
          ? projectNames.get(plan.targetId) ?? null
          : null,
    };
  });
}

async function departmentNamesById(departmentIds: number[]) {
  const ids = uniquePositiveIds(departmentIds);
  if (ids.length === 0) return new Map<number, string>();
  const rows = await prisma.department.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  });
  return new Map(rows.map((row) => [row.id, row.name]));
}

async function projectNamesById(projectIds: number[]) {
  const ids = uniquePositiveIds(projectIds);
  if (ids.length === 0) return new Map<number, string>();
  const rows = await prisma.project.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  });
  return new Map(rows.map((row) => [row.id, row.name]));
}

async function employeeNamesByUserId(userIds: number[]) {
  const ids = uniquePositiveIds(userIds);
  if (ids.length === 0) return new Map<number, string>();
  const employees = await prisma.employee.findMany({
    where: { userId: { in: ids }, employments: { some: { isActive: true } } },
    select: { userId: true, name: true },
    orderBy: { employeeId: "asc" },
  });
  return new Map(employees.filter((employee) => employee.userId).map((employee) => [employee.userId!, employee.name]));
}

function uniquePositiveIds(ids: number[]) {
  return Array.from(new Set(ids.filter((id) => Number.isInteger(id) && id > 0)));
}

async function activeEmployeeIdsForUser(userId: number) {
  const employees = await prisma.employee.findMany({
    where: { userId, employments: { some: { isActive: true } } },
    select: { id: true },
  });
  return employees.map((employee) => employee.id);
}
