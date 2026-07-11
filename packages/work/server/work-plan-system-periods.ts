import { currentOpenEndedDateWhere } from "@workspace/platform/server/fk-registry";
import { prisma } from "@workspace/platform/server/prisma";
import { validateWorkPlanCommand } from "./domain/work-plan-validation";
import { getWorkOkrCyclePlanningWindow, resolveWorkOkrControlScopeForPlan } from "./work-okr-control";
import { ensureWorkOkrCyclesForYears } from "./work-okr-cycles";
import type { WorkPlanRow } from "./work-plan-dto";

const SYSTEM_OKR_PLAN_START = new Date(Date.UTC(2026, 0, 1));
const PROJECT_LEADER_ROLES = ["负责人", "项目负责人"];

type SystemOkrCycle = {
  id: number;
  periodType: string;
  code: string;
  label: string;
  year: number;
  sequence: number;
  startDate: Date;
  endDate: Date;
};

export async function ensureSystemOkrPeriodPlans(targetType: string, targetId: number) {
  const guard = validateWorkPlanCommand("ensureSystemOkrPeriodPlans");
  if (!guard.ok) throw new Error(guard.issue.message);
  const normalizedTargetId = normalizePositiveId(targetId);
  if (!normalizedTargetId) return new Set<number>();
  if (targetType === "personal" && !await resolvePersonalOwnerEmployeeId(normalizedTargetId)) return new Set<number>();
  const now = startOfUtcDay(new Date());
  await ensureWorkOkrCyclesForYears(planningCycleYears(now));
  const cycles = await listVisibleSystemOkrCycles(now);
  if (!cycles.length) return new Set<number>();
  const cycleIds = cycles.map((cycle) => cycle.id);
  const existingRows = await prisma.workPlan.findMany({
    where: {
      targetType,
      targetId: normalizedTargetId,
      kind: "okr",
      isSystemGenerated: true,
      okrCycleId: { in: cycleIds },
    },
    select: { id: true, okrCycleId: true, isSystemGenerated: true, title: true, ownerEmployeeId: true, periodType: true, actualStartDate: true, actualEndDate: true, plannedStartDate: true, plannedEndDate: true },
  });
  const existingByCycleId = new Map(existingRows.flatMap((row) => row.okrCycleId ? [[row.okrCycleId, row]] : []));
  const ownerEmployeeId = await resolveDefaultPlanOwnerEmployeeId(targetType, normalizedTargetId);
  for (const cycle of cycles) {
    const existing = existingByCycleId.get(cycle.id);
    if (existing) {
      const title = standardOkrPlanTitle(cycle);
      if (
        (existing.isSystemGenerated && existing.title !== title) ||
        existing.periodType !== cycle.periodType ||
        existing.actualStartDate !== null ||
        existing.actualEndDate !== null ||
        dateKey(existing.plannedStartDate) !== dateKey(cycle.startDate) ||
        dateKey(existing.plannedEndDate) !== dateKey(cycle.endDate) ||
        (targetType === "personal" && existing.ownerEmployeeId !== ownerEmployeeId)
      ) {
        await prisma.workPlan.update({
          where: { id: existing.id },
          data: {
            ...(existing.isSystemGenerated && { title }),
            ...(targetType === "personal" && { ownerEmployeeId }),
            periodType: cycle.periodType,
            actualStartDate: null,
            actualEndDate: null,
            plannedStartDate: cycle.startDate,
            plannedEndDate: cycle.endDate,
          },
        });
      }
      continue;
    }
    const controlScope = await resolveWorkOkrControlScopeForPlan({ targetType, targetId: normalizedTargetId, okrCycleId: cycle.id });
    const scoped = controlScope.ok && controlScope.data.type !== "global" ? controlScope.data : null;
    await prisma.workPlan.create({
      data: {
        targetType,
        targetId: normalizedTargetId,
        kind: "okr",
        title: standardOkrPlanTitle(cycle),
        description: "",
        status: "active",
        sourceType: "other",
        sourceKind: null,
        isSystemGenerated: true,
        ownerEmployeeId,
        okrCycleId: cycle.id,
        okrControlScopeType: scoped?.type ?? null,
        okrControlScopeId: scoped?.id ?? null,
        periodType: cycle.periodType,
        actualStartDate: null,
        actualEndDate: null,
        plannedStartDate: cycle.startDate,
        plannedEndDate: cycle.endDate,
        sortOrder: systemOkrPlanSortOrder(cycle),
      },
    });
  }
  await ensureDefaultSystemPlanParents(targetType, normalizedTargetId, cycles);
  return new Set(cycleIds);
}

async function ensureDefaultSystemPlanParents(targetType: string, targetId: number, cycles: SystemOkrCycle[]) {
  const cycleIds = cycles.map((cycle) => cycle.id);
  const plans = await prisma.workPlan.findMany({
    where: { targetType, targetId, kind: "okr", isSystemGenerated: true, okrCycleId: { in: cycleIds }, isArchived: false },
    select: {
      id: true,
      okrCycleId: true,
      parentPeriodPlanId: true,
      planAlignments: { where: { relationKind: "decompose" }, select: { id: true }, take: 1 },
    },
  });
  const planByCycleId = new Map(plans.flatMap((plan) => plan.okrCycleId ? [[plan.okrCycleId, plan]] : []));
  for (const cycle of cycles) {
    const childPlan = planByCycleId.get(cycle.id);
    const parentCycle = defaultParentCycle(cycle, cycles);
    if (!childPlan || childPlan.planAlignments.length || !parentCycle) continue;
    const parentPlan = planByCycleId.get(parentCycle.id);
    if (!parentPlan) continue;
    await prisma.$transaction([
      prisma.workPlan.update({ where: { id: childPlan.id }, data: { parentPeriodPlanId: parentPlan.id } }),
      prisma.workPlanAlignment.create({
        data: {
          childPlanId: childPlan.id,
          sourceType: "plan",
          sourcePlanId: parentPlan.id,
          sourceWorkItemId: null,
          relationKind: "decompose",
          sortOrder: 0,
        },
      }),
    ]);
  }
}

function defaultParentCycle(cycle: SystemOkrCycle, cycles: SystemOkrCycle[]) {
  if (cycle.periodType === "half_year") return cycles.find((item) => item.periodType === "yearly" && containsCycle(item, cycle)) ?? null;
  if (cycle.periodType === "quarterly") return cycles.find((item) => item.periodType === "half_year" && containsCycle(item, cycle)) ?? null;
  if (cycle.periodType === "monthly") return cycles.find((item) => item.periodType === "quarterly" && containsCycle(item, cycle)) ?? null;
  return null;
}

function containsCycle(parent: SystemOkrCycle, child: SystemOkrCycle) {
  return parent.startDate <= child.startDate && parent.endDate >= child.endDate;
}

export function isWorkPlanVisibleInCurrentWindow(row: WorkPlanRow, visibleOkrCycleIds: Set<number> | null) {
  if (row.kind !== "okr") return true;
  if (row.isSystemGenerated && row.periodType === "weekly") return dateKey(row.actualStartDate ?? row.okrCycle?.startDate) <= dateKey(new Date());
  if (row.isSystemGenerated && row.okrCycleId) return visibleOkrCycleIds?.has(row.okrCycleId) ?? true;
  if (!row.isSystemGenerated) return true;
  const start = row.okrCycle?.startDate ?? row.plannedStartDate ?? row.actualStartDate;
  if (!start) return true;
  const startDate = startOfUtcDay(start);
  return startDate >= SYSTEM_OKR_PLAN_START && startDate <= startOfUtcDay(new Date());
}

async function listVisibleSystemOkrCycles(now: Date) {
  const rows = await prisma.workOkrCycle.findMany({
    where: { startDate: { gte: SYSTEM_OKR_PLAN_START }, periodType: { not: "weekly" } },
    select: { id: true, periodType: true, code: true, label: true, year: true, sequence: true, startDate: true, endDate: true },
    orderBy: [{ startDate: "asc" }, { periodType: "asc" }, { sequence: "asc" }],
  });
  const currentOrPast: SystemOkrCycle[] = [];
  const futureByType = new Map<string, SystemOkrCycle>();
  for (const row of rows) {
    const planningWindow = await getWorkOkrCyclePlanningWindow(row);
    if (!planningWindow.enabled) continue;
    if (startOfUtcDay(row.startDate) <= now) {
      currentOrPast.push(row);
      continue;
    }
    if (!planningWindow.opensAt || startOfUtcDay(planningWindow.opensAt) > now) continue;
    const current = futureByType.get(row.periodType);
    if (!current || row.startDate < current.startDate) futureByType.set(row.periodType, row);
  }
  return [...currentOrPast, ...futureByType.values()]
    .sort((left, right) => systemOkrPlanSortOrder(left) - systemOkrPlanSortOrder(right));
}

export async function resolveDefaultPlanOwnerEmployeeId(targetType: string, targetId: number) {
  if (targetType === "personal") return resolvePersonalOwnerEmployeeId(targetId);
  if (targetType === "department" || targetType === "committee" || targetType === "company") return resolveDepartmentOwnerEmployeeId(targetId);
  if (targetType === "project") return resolveProjectOwnerEmployeeId(targetId);
  return null;
}

async function resolvePersonalOwnerEmployeeId(userId: number) {
  const employees = await prisma.employee.findMany({
    where: { userId, employments: { some: { isActive: true } } },
    select: {
      id: true,
      positions: {
        where: currentOpenEndedDateWhere({}),
        select: { isPrimary: true },
        orderBy: [{ isPrimary: "desc" }, { id: "asc" }],
      },
    },
    orderBy: { employeeId: "asc" },
  });
  return employees.find((employee) => employee.positions.some((position) => position.isPrimary))?.id ?? employees[0]?.id ?? null;
}

async function resolveDepartmentOwnerEmployeeId(departmentId: number) {
  const department = await prisma.department.findUnique({
    where: { id: departmentId },
    select: {
      managerPositionId: true,
      managerEmployees: {
        where: { employee: { employments: { some: { isActive: true } } } },
        select: { employeeId: true },
        orderBy: { id: "asc" },
        take: 1,
      },
    },
  });
  if (department?.managerEmployees[0]?.employeeId) return department.managerEmployees[0].employeeId;
  if (!department?.managerPositionId) return null;
  const employee = await prisma.employee.findFirst({
    where: {
      employments: { some: { isActive: true } },
      positions: { some: currentOpenEndedDateWhere({ positionId: department.managerPositionId }) },
    },
    select: { id: true },
    orderBy: { employeeId: "asc" },
  });
  return employee?.id ?? null;
}

async function resolveProjectOwnerEmployeeId(projectId: number) {
  const leader = await prisma.employeeProject.findFirst({
    where: {
      projectId,
      role: { in: PROJECT_LEADER_ROLES },
      employee: { employments: { some: { isActive: true } } },
    },
    select: { employeeId: true },
    orderBy: { id: "asc" },
  });
  return leader?.employeeId ?? null;
}

function planningCycleYears(now: Date) {
  const year = now.getUTCFullYear();
  const years = new Set([2026, year, year + 1]);
  if (year > 2026) years.add(year - 1);
  return Array.from(years);
}

function normalizePositiveId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function standardOkrPlanTitle(cycle: { periodType: string; label?: string; year: number; sequence: number }) {
  if (cycle.periodType === "yearly") return `${cycle.year}年度OKR计划`;
  if (cycle.periodType === "half_year") return `${cycle.year}年${cycle.sequence === 1 ? "上" : "下"}半年OKR计划`;
  if (cycle.periodType === "quarterly") return `${cycle.year}年第${cycle.sequence}季度OKR计划`;
  if (cycle.periodType === "monthly") return `${cycle.year}年${String(cycle.sequence).padStart(2, "0")}月OKR计划`;
  return `${(cycle.label ?? "").replace(/\s+/g, " ")} OKR计划`;
}

function systemOkrPlanSortOrder(cycle: { periodType: string; startDate: Date; sequence: number }) {
  return periodDateValue(cycle.startDate) + periodTypeSortOffset(cycle.periodType) + cycle.sequence;
}

function periodTypeSortOffset(periodType: string) {
  if (periodType === "yearly") return 0;
  if (periodType === "half_year") return 1_000;
  if (periodType === "quarterly") return 2_000;
  if (periodType === "monthly") return 3_000;
  return 4_000;
}

function startOfUtcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function periodDateValue(value: Date) {
  return Math.floor(startOfUtcDay(value).getTime() / 86_400_000) * 10_000;
}

function dateKey(value: Date | null | undefined) {
  return value ? startOfUtcDay(value).toISOString().slice(0, 10) : "";
}
