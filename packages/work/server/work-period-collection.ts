import { countWorkdayOverlap as countCalendarWorkdayOverlap } from "@workspace/platform/calendar";
import { serviceError, serviceOk, type ServiceResult } from "@workspace/platform/server/api";
import { Prisma, prisma } from "@workspace/platform/server/prisma";
import { getWorkOkrControlSettings } from "./work-okr-control";
import { toWorkItemDto, workItemInclude } from "./work-item-dto";
import { toWorkPlanDto, workPlanInclude } from "./work-plan-dto";

const PERIOD_RANK: Record<string, number> = {
  weekly: 1,
  monthly: 2,
  quarterly: 3,
  half_year: 4,
  yearly: 5,
};

const DEFAULT_DISPLAY_PERIOD: Record<string, string | null> = {
  yearly: "quarterly",
  half_year: "quarterly",
  quarterly: "monthly",
  monthly: "weekly",
  weekly: null,
};

type CycleRange = {
  id: number;
  code: string;
  label: string;
  periodType: string;
  startDate: Date;
  endDate: Date;
};

type PeriodCollectionInput = {
  userId?: number | null;
  targetType: string;
  targetId: number;
  cycleId: number;
  displayPeriodType?: string | null;
  includeItems?: boolean;
};

type PeriodCollectionCycle = {
  id: number;
  code: string;
  label: string;
  periodType: string;
  startDate: string;
  endDate: string;
  workdayOverlapCount: number;
};

type PlanRow = Prisma.WorkPlanGetPayload<{ include: typeof workPlanInclude }>;
type ItemRow = Prisma.WorkItemGetPayload<{ include: typeof workItemInclude }>;

export async function listWorkPeriodCollection(
  input: PeriodCollectionInput,
): Promise<ServiceResult<{
  rootCycle: PeriodCollectionCycle;
  displayPeriodType: string | null;
  cycles: PeriodCollectionCycle[];
  plans: Array<{ plan: ReturnType<typeof toWorkPlanDto>; overlapCycleIds: number[] }>;
  items: Array<{ item: ReturnType<typeof toWorkItemDto>; planId: number | null; planTitle: string | null; planCycleId: number | null; planCycleLabel: string | null; overlapCycleIds: number[] }>;
}>> {
  const rootCycle = await prisma.workOkrCycle.findUnique({
    where: { id: input.cycleId },
    select: { id: true, code: true, label: true, periodType: true, startDate: true, endDate: true },
  });
  if (!rootCycle) return serviceError("OKR 周期不存在", 404);
  const displayPeriodType = resolveDisplayPeriodType(rootCycle.periodType, input.displayPeriodType);
  const [cycles, plans, timeControlEnabled] = await Promise.all([
    displayPeriodType ? listOverlapCycles(rootCycle, displayPeriodType) : Promise.resolve([]),
    listOverlapPlans(input, rootCycle),
    getWorkOkrControlSettings().then((settings) => settings.enabled),
  ]);
  const mappedPlans = plans.map((plan) => ({
    plan: toWorkPlanDto(plan, { timeControlEnabled }),
    overlapCycleIds: overlapCycleIds(plan.okrCycle, cycles),
  }));
  const items = input.includeItems
    ? await listOverlapItems(plans, cycles)
    : [];
  return serviceOk({
    rootCycle: cycleDto(rootCycle, workdayOverlapCount(rootCycle, rootCycle)),
    displayPeriodType,
    cycles,
    plans: dedupeBy(mappedPlans, ({ plan }) => plan.id),
    items,
  });
}

function resolveDisplayPeriodType(rootType: string, requested?: string | null) {
  if (requested && PERIOD_RANK[requested] && PERIOD_RANK[requested] < periodRank(rootType)) return requested;
  return DEFAULT_DISPLAY_PERIOD[rootType] ?? null;
}

async function listOverlapCycles(root: CycleRange, displayPeriodType: string): Promise<PeriodCollectionCycle[]> {
  const rows = await prisma.workOkrCycle.findMany({
    where: {
      periodType: displayPeriodType,
      startDate: { lte: root.endDate },
      endDate: { gte: root.startDate },
    },
    select: { id: true, code: true, label: true, periodType: true, year: true, startDate: true, endDate: true },
    orderBy: [{ startDate: "asc" }, { sequence: "asc" }, { id: "asc" }],
  });
  const deduped = dedupeCycles(rows, root);
  return deduped
    .map((cycle) => ({ cycle, count: workdayOverlapCount(root, cycle) }))
    .filter((entry) => entry.count > 0)
    .map((entry) => cycleDto(entry.cycle, entry.count));
}

async function listOverlapPlans(input: PeriodCollectionInput, root: CycleRange) {
  const rows = await prisma.workPlan.findMany({
    where: {
      targetType: input.targetType,
      targetId: input.targetId,
      kind: "okr",
      isArchived: false,
      OR: [
        { okrCycle: { startDate: { lte: root.endDate }, endDate: { gte: root.startDate } } },
        { plannedStartDate: { lte: root.endDate }, plannedEndDate: { gte: root.startDate } },
      ],
    },
    orderBy: [{ okrCycle: { startDate: "asc" } }, { sortOrder: "asc" }, { id: "asc" }],
    include: workPlanInclude,
  });
  return rows.filter((plan) => workdayOverlapCount(root, planRange(plan)) > 0);
}

async function listOverlapItems(plans: PlanRow[], cycles: PeriodCollectionCycle[]) {
  const planIds = plans.map((plan) => plan.id);
  if (planIds.length === 0) return [];
  const planById = new Map(plans.map((plan) => [plan.id, plan]));
  const rows = await prisma.workItem.findMany({
    where: {
      planId: { in: planIds },
      isArchived: false,
    },
    orderBy: [{ plan: { okrCycle: { startDate: "asc" } } }, { sortOrder: "asc" }, { id: "asc" }],
    include: workItemInclude,
  });
  return dedupeBy(rows, (row) => row.id).map((row) => {
    const plan = row.planId ? planById.get(row.planId) ?? null : null;
    return {
      item: toWorkItemDto(row as ItemRow),
      planId: row.planId,
      planTitle: plan?.title ?? null,
      planCycleId: plan?.okrCycleId ?? null,
      planCycleLabel: plan?.okrCycle?.label ?? null,
      overlapCycleIds: overlapCycleIds(itemRange(row) ?? plan?.okrCycle, cycles),
    };
  });
}

function dedupeCycles<T extends CycleRange & { year?: number }>(rows: T[], root: CycleRange) {
  const byRange = new Map<string, T>();
  for (const row of rows) {
    const key = `${row.periodType}:${formatDate(row.startDate)}:${formatDate(row.endDate)}`;
    const current = byRange.get(key);
    if (!current || preferCycle(row, current, root)) byRange.set(key, row);
  }
  return [...byRange.values()].sort((left, right) => left.startDate.getTime() - right.startDate.getTime() || left.id - right.id);
}

function preferCycle<T extends CycleRange & { year?: number }>(candidate: T, current: T, root: CycleRange) {
  const rootYear = root.startDate.getUTCFullYear();
  if (candidate.year === rootYear && current.year !== rootYear) return true;
  if (candidate.year !== rootYear && current.year === rootYear) return false;
  return candidate.id < current.id;
}

function overlapCycleIds(range: CycleRange | null | undefined, cycles: PeriodCollectionCycle[]) {
  if (!range) return [];
  return cycles.filter((cycle) => workdayOverlapCount(range, parseCycleDto(cycle)) > 0).map((cycle) => cycle.id);
}

function planRange(plan: Pick<PlanRow, "okrCycle" | "plannedStartDate" | "plannedEndDate">): CycleRange | null {
  if (plan.okrCycle) return plan.okrCycle;
  if (!plan.plannedStartDate || !plan.plannedEndDate) return null;
  return {
    id: 0,
    code: "",
    label: "",
    periodType: "",
    startDate: plan.plannedStartDate,
    endDate: plan.plannedEndDate,
  };
}

function itemRange(item: Pick<ItemRow, "periodType" | "periodStart" | "periodEnd" | "plannedStartDate" | "plannedEndDate">): CycleRange | null {
  const startDate = item.periodStart ?? item.plannedStartDate;
  const endDate = item.periodEnd ?? item.plannedEndDate;
  if (!startDate || !endDate) return null;
  return {
    id: 0,
    code: "",
    label: "",
    periodType: item.periodType ?? "",
    startDate,
    endDate,
  };
}

function parseCycleDto(cycle: PeriodCollectionCycle): CycleRange {
  return {
    id: cycle.id,
    code: cycle.code,
    label: cycle.label,
    periodType: cycle.periodType,
    startDate: dateOnlyUtc(cycle.startDate),
    endDate: dateOnlyUtc(cycle.endDate),
  };
}

function cycleDto(cycle: CycleRange, workdayOverlapCountValue: number): PeriodCollectionCycle {
  return {
    id: cycle.id,
    code: cycle.code,
    label: cycle.label,
    periodType: cycle.periodType,
    startDate: formatDate(cycle.startDate),
    endDate: formatDate(cycle.endDate),
    workdayOverlapCount: workdayOverlapCountValue,
  };
}

function workdayOverlapCount(left: CycleRange | null | undefined, right: CycleRange | null | undefined) {
  if (!left || !right) return 0;
  return countCalendarWorkdayOverlap(
    { startDate: formatDate(left.startDate), endDate: formatDate(left.endDate) },
    { startDate: formatDate(right.startDate), endDate: formatDate(right.endDate) },
    { mode: "china" },
  );
}

function dateOnlyUtc(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function formatDate(value: Date | string) {
  return dateOnlyUtc(value).toISOString().slice(0, 10);
}

function periodRank(type: string) {
  return PERIOD_RANK[type] ?? 0;
}

function dedupeBy<T, TKey>(items: T[], keyOf: (item: T) => TKey) {
  const seen = new Set<TKey>();
  return items.filter((item) => {
    const key = keyOf(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
