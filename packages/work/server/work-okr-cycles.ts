import { matchesFkKeyword } from "@workspace/platform/server/relation-registry";
import { prisma } from "@workspace/platform/server/prisma";
import { validateWorkOkrCycleCommand } from "./domain/work-okr-cycle-validation";

export const WORK_OKR_CYCLE_TYPES = ["yearly", "half_year", "quarterly", "monthly", "weekly"] as const;
export type WorkOkrCycleType = typeof WORK_OKR_CYCLE_TYPES[number];

const OKR_PLAN_CYCLE_TYPES = new Set<WorkOkrCycleType>(["yearly", "half_year", "quarterly", "monthly"]);

export type WorkOkrCycleOption = {
  id: number;
  name: string;
  periodType: WorkOkrCycleType;
  startDate: string;
  endDate: string;
  subtitle?: string;
  lifecycleStatus: "active";
};

type CycleSeed = {
  periodType: WorkOkrCycleType;
  code: string;
  label: string;
  year: number;
  sequence: number;
  parentCode: string | null;
  startDate: Date;
  endDate: Date;
};

export function isOkrPlanCycleType(value: string | null | undefined): value is WorkOkrCycleType {
  return OKR_PLAN_CYCLE_TYPES.has(value as WorkOkrCycleType);
}

export async function listWorkOkrCycleOptions(input: {
  keyword: string;
  periodType?: string | null;
  includeWeekly?: boolean;
  limit?: number;
}): Promise<WorkOkrCycleOption[]> {
  const currentYear = new Date().getUTCFullYear();
  await ensureWorkOkrCyclesForYears([currentYear - 1, currentYear, currentYear + 1]);
  const allowedTypes = input.periodType && isOkrPlanCycleType(input.periodType)
    ? [input.periodType]
    : input.includeWeekly
      ? Array.from(WORK_OKR_CYCLE_TYPES)
      : Array.from(OKR_PLAN_CYCLE_TYPES);
  const rows = await prisma.workOkrCycle.findMany({
    where: { periodType: { in: allowedTypes } },
    select: { id: true, code: true, label: true, periodType: true, startDate: true, endDate: true },
    orderBy: [{ startDate: "desc" }, { periodType: "asc" }, { sequence: "asc" }],
    take: input.keyword.trim() ? 120 : Math.max(input.limit ?? 40, 40),
  });
  return rows
    .map((row) => ({
      id: row.id,
      name: row.label,
      periodType: row.periodType as WorkOkrCycleType,
      startDate: formatDate(row.startDate),
      endDate: formatDate(row.endDate),
      subtitle: `${row.code} · ${formatDate(row.startDate)} - ${formatDate(row.endDate)}`,
      lifecycleStatus: "active" as const,
    }))
    .filter((row) => matchesFkKeyword([row.name, row.subtitle], input.keyword))
    .slice(0, input.limit ?? 20);
}

export async function resolveWorkOkrCycleOption(id: number) {
  const row = await prisma.workOkrCycle.findUnique({
    where: { id },
    select: { id: true, label: true },
  });
  return row ? { id: row.id, label: row.label, lifecycleStatus: "active" as const } : null;
}

export async function ensureWorkOkrCyclesForYears(years: number[]) {
  const command = validateWorkOkrCycleCommand("ensureWorkOkrCyclesForYears");
  if (!command.ok) throw new Error(command.issue.message);
  const uniqueYears = Array.from(new Set(years.filter((year) => Number.isInteger(year) && year >= 2000 && year <= 2100))).sort();
  for (const year of uniqueYears) await ensureWorkOkrCyclesForYear(year);
}

export async function ensureWorkOkrCyclesForYear(year: number) {
  const command = validateWorkOkrCycleCommand("ensureWorkOkrCyclesForYear");
  if (!command.ok) throw new Error(command.issue.message);
  const seeds = buildCycleSeeds(year);
  const byCode = new Map<string, number>();
  for (const seed of seeds) {
    const parentId = seed.parentCode ? byCode.get(seed.parentCode) ?? null : null;
    const row = await prisma.workOkrCycle.upsert({
      where: { code: seed.code },
      create: {
        periodType: seed.periodType,
        code: seed.code,
        label: seed.label,
        year: seed.year,
        sequence: seed.sequence,
        parentId,
        startDate: seed.startDate,
        endDate: seed.endDate,
      },
      update: {
        periodType: seed.periodType,
        label: seed.label,
        year: seed.year,
        sequence: seed.sequence,
        parentId,
        startDate: seed.startDate,
        endDate: seed.endDate,
      },
      select: { id: true },
    });
    byCode.set(seed.code, row.id);
  }
}

export async function getWorkOkrCycleOrNull(cycleId: number | null | undefined) {
  if (!cycleId || !Number.isInteger(Number(cycleId)) || Number(cycleId) <= 0) return null;
  return prisma.workOkrCycle.findUnique({
    where: { id: Number(cycleId) },
    select: { id: true, periodType: true, code: true, label: true, startDate: true, endDate: true },
  });
}

export function workOkrCyclePeriodTypeForPlan(periodType: string | null | undefined) {
  return isOkrPlanCycleType(periodType) ? periodType : null;
}

function buildCycleSeeds(year: number): CycleSeed[] {
  const seeds: CycleSeed[] = [{
    periodType: "yearly",
    code: String(year),
    label: `${year} 年`,
    year,
    sequence: 1,
    parentCode: null,
    startDate: utcDate(year, 0, 1),
    endDate: utcDate(year, 11, 31),
  }];
  for (const half of [1, 2]) {
    const startMonth = half === 1 ? 0 : 6;
    const endMonth = half === 1 ? 5 : 11;
    seeds.push({
      periodType: "half_year",
      code: `${year}-H${half}`,
      label: `${year} H${half}`,
      year,
      sequence: half,
      parentCode: String(year),
      startDate: utcDate(year, startMonth, 1),
      endDate: utcDate(year, endMonth + 1, 0),
    });
  }
  for (let quarter = 1; quarter <= 4; quarter += 1) {
    const startMonth = (quarter - 1) * 3;
    const half = quarter <= 2 ? 1 : 2;
    seeds.push({
      periodType: "quarterly",
      code: `${year}-Q${quarter}`,
      label: `${year} Q${quarter}`,
      year,
      sequence: quarter,
      parentCode: `${year}-H${half}`,
      startDate: utcDate(year, startMonth, 1),
      endDate: utcDate(year, startMonth + 3, 0),
    });
  }
  for (let month = 1; month <= 12; month += 1) {
    const quarter = Math.floor((month - 1) / 3) + 1;
    seeds.push({
      periodType: "monthly",
      code: `${year}-${pad2(month)}`,
      label: `${year}-${pad2(month)}`,
      year,
      sequence: month,
      parentCode: `${year}-Q${quarter}`,
      startDate: utcDate(year, month - 1, 1),
      endDate: utcDate(year, month, 0),
    });
  }
  let weekStart = startOfIsoWeek(utcDate(year, 0, 1));
  let sequence = 1;
  while (weekStart.getUTCFullYear() <= year || addDays(weekStart, 6).getUTCFullYear() <= year) {
    const weekEnd = addDays(weekStart, 6);
    const parentMonth = weekStart.getUTCFullYear() === year ? weekStart.getUTCMonth() + 1 : 1;
    seeds.push({
      periodType: "weekly",
      code: `${year}-W${pad2(sequence)}`,
      label: `${formatDate(weekStart)} 周`,
      year,
      sequence,
      parentCode: `${year}-${pad2(parentMonth)}`,
      startDate: weekStart,
      endDate: weekEnd,
    });
    weekStart = addDays(weekStart, 7);
    sequence += 1;
    if (sequence > 54) break;
  }
  return seeds;
}

function utcDate(year: number, monthIndex: number, day: number) {
  return new Date(Date.UTC(year, monthIndex, day));
}

function startOfIsoWeek(date: Date) {
  const copy = new Date(date);
  const day = copy.getUTCDay() || 7;
  copy.setUTCDate(copy.getUTCDate() + 1 - day);
  return copy;
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function formatDate(value: Date) {
  return value.toISOString().slice(0, 10);
}
