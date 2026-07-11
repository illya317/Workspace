import type {
  PeriodDossierInitialGoal,
  PeriodDossierModel,
  PeriodDossierReportRow,
  PeriodDossierTask,
} from "@workspace/platform/period-dossier";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { checkHRRead } from "@workspace/platform/server/auth";
import { okCommand } from "@workspace/platform/server/domain-validation";
import { Prisma, prisma } from "@workspace/platform/server/prisma";
import {
  resolveHrPerformanceContributionTarget,
  type HrPerformanceAudienceType,
  type HrPerformanceContributionTarget,
} from "./performance-audience";

const HR_PERFORMANCE_RESOURCE_KEY = "hr.performance";
const PERIOD_TYPES = ["weekly", "monthly", "quarterly", "half_year", "yearly"] as const;
type PeriodType = typeof PERIOD_TYPES[number];
type ContributionAudience = HrPerformanceAudienceType;
type ContributionTarget = HrPerformanceContributionTarget;

const planInclude = {
  okrCycle: { select: { id: true, label: true, startDate: true, endDate: true } },
  sourceDepartment: { select: { id: true, code: true, name: true } },
  linkedProject: { select: { id: true, code: true, name: true } },
  items: {
    where: { isArchived: false },
    include: {
      parentWorkItem: { select: { id: true, content: true, itemType: true, parentWorkItemId: true } },
      sourceDepartment: { select: { id: true, code: true, name: true } },
      linkedProject: { select: { id: true, code: true, name: true } },
    },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  },
} satisfies Prisma.WorkPlanInclude;

type PlanRow = Prisma.WorkPlanGetPayload<{ include: typeof planInclude }>;
type PlanItem = PlanRow["items"][number];

export function buildGetHrPerformanceContributionDetailRouteCommand(input: {
  userId: number;
  audienceType: string;
  audienceId: number;
  cycleId: number;
}) {
  return okCommand({
    userId: input.userId,
    audienceType: normalizeAudience(input.audienceType),
    audienceId: positiveId(input.audienceId),
    cycleId: positiveId(input.cycleId),
  });
}

export async function executeGetHrPerformanceContributionDetailRouteCommand(command: {
  userId: number;
  audienceType: ContributionAudience | null;
  audienceId: number | null;
  cycleId: number | null;
}) {
  if (!(await checkHRRead(command.userId, HR_PERFORMANCE_RESOURCE_KEY))) return serviceError("无权限查看绩效贡献材料", 403);
  if (!command.audienceType || !command.audienceId || !command.cycleId) return serviceError("查看范围或周期无效", 400);
  const [target, cycle] = await Promise.all([
    resolveHrPerformanceContributionTarget(command.audienceType, command.audienceId),
    prisma.workOkrCycle.findUnique({
      where: { id: command.cycleId },
      select: { id: true, label: true, periodType: true, startDate: true, endDate: true },
    }),
  ]);
  if (!target) return serviceError("对应工作空间不存在或已停用", 404);
  if (!cycle || !isPeriodType(cycle.periodType)) return serviceError("绩效周期不存在或不支持", 404);
  const normalizedCycle = { ...cycle, periodType: cycle.periodType as PeriodType };
  const modelBase: Omit<PeriodDossierModel, "content"> = {
    subject: target.subject,
    period: {
      id: normalizedCycle.id,
      type: normalizedCycle.periodType,
      label: normalizedCycle.label,
      startDate: formatDate(normalizedCycle.startDate),
      endDate: formatDate(normalizedCycle.endDate),
    },
  };
  const content = normalizedCycle.periodType === "weekly" || normalizedCycle.periodType === "monthly"
    ? await reportContent(target, { ...normalizedCycle, periodType: normalizedCycle.periodType })
    : await initialGoalContent(target, { ...normalizedCycle, periodType: normalizedCycle.periodType });
  return serviceOk({ dossier: { ...modelBase, content } satisfies PeriodDossierModel });
}

async function reportContent(
  target: ContributionTarget,
  cycle: { id: number; periodType: "weekly" | "monthly"; startDate: Date; endDate: Date },
): Promise<Extract<PeriodDossierModel["content"], { kind: "report" }>> {
  const saved = await prisma.workReport.findFirst({
    where: {
      targetType: target.targetType,
      targetId: target.targetId,
      periodType: cycle.periodType,
      periodStart: cycle.startDate,
      reportStage: "final",
    },
    include: { items: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } },
    orderBy: { updatedAt: "desc" },
  });
  if (saved) return { kind: "report", saved: true, rows: savedReportRows(saved.items) };
  const nextEnd = nextPeriodEnd(cycle.periodType, cycle.endDate);
  const items = await prisma.workItem.findMany({
    where: {
      isArchived: false,
      itemType: "task",
      AND: [
        target.audienceType === "personal"
          ? { OR: [
            { targetType: "personal", targetId: target.targetId },
            ...(target.employeeId ? [{ ownerEmployeeId: target.employeeId }] : []),
          ] }
          : { targetType: target.targetType, targetId: target.targetId },
        { OR: [
          { plannedStartDate: { lte: nextEnd }, plannedEndDate: { gte: cycle.startDate } },
          { actualStartDate: { lte: nextEnd }, actualEndDate: { gte: cycle.startDate } },
          { plan: { okrCycle: { startDate: { lte: nextEnd }, endDate: { gte: cycle.startDate } } } },
        ] },
      ],
    },
    include: {
      plan: { select: { id: true, title: true } },
      parentWorkItem: {
        select: { id: true, content: true, itemType: true, parentWorkItem: { select: { content: true, itemType: true } } },
      },
    },
    orderBy: [{ planId: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
  });
  const groups = new Map<string, PeriodDossierReportRow>();
  for (const item of items) {
    const objective = item.parentWorkItem?.parentWorkItem?.itemType === "objective"
      ? item.parentWorkItem.parentWorkItem.content
      : item.parentWorkItem?.itemType === "objective"
        ? item.parentWorkItem.content
        : item.plan?.title || "其他工作";
    const group = groups.get(objective) ?? { id: `${item.planId ?? "none"}:${objective}`, objective, current: [], next: [], keyResults: [] };
    const task = toDossierTask(item);
    const startsAt = item.plannedStartDate ?? item.actualStartDate;
    if (startsAt && startsAt > cycle.endDate) group.next.push(task);
    else group.current.push(task);
    const keyResult = item.parentWorkItem?.itemType === "key_result" ? item.parentWorkItem.content : "";
    if (keyResult && !group.keyResults.includes(keyResult)) group.keyResults.push(keyResult);
    groups.set(objective, group);
  }
  return { kind: "report", saved: false, rows: [...groups.values()] };
}

function savedReportRows(items: Array<{
  id: number;
  title: string;
  workPlanId: number | null;
  workPlanTitleSnapshot: string;
  objectiveTitleSnapshot: string;
  keyResultTitleSnapshot: string;
  reportItemKindSnapshot: string;
  snapshotPlannedEndDate: Date | null;
  snapshotActualEndDate: Date | null;
}>) {
  const groups = new Map<string, PeriodDossierReportRow>();
  for (const item of items) {
    const objective = item.objectiveTitleSnapshot || item.workPlanTitleSnapshot || "其他工作";
    const group = groups.get(objective) ?? { id: `${item.workPlanId ?? "none"}:${objective}`, objective, current: [], next: [], keyResults: [] };
    const task: PeriodDossierTask = {
      id: String(item.id),
      title: item.title,
      plannedEndDate: formatNullableDate(item.snapshotPlannedEndDate),
      actualEndDate: formatNullableDate(item.snapshotActualEndDate),
    };
    if (item.reportItemKindSnapshot === "next") group.next.push(task);
    else group.current.push(task);
    if (item.keyResultTitleSnapshot && !group.keyResults.includes(item.keyResultTitleSnapshot)) group.keyResults.push(item.keyResultTitleSnapshot);
    groups.set(objective, group);
  }
  return [...groups.values()];
}

async function initialGoalContent(
  target: ContributionTarget,
  cycle: { id: number; periodType: "quarterly" | "half_year" | "yearly"; startDate: Date; endDate: Date },
): Promise<Extract<PeriodDossierModel["content"], { kind: "initial-goal" }>> {
  const scope: Prisma.WorkPlanWhereInput = target.audienceType === "personal"
    ? { OR: [
      { targetType: "personal", targetId: target.targetId },
      ...(target.employeeId ? [
        { ownerEmployeeId: target.employeeId },
        { items: { some: { ownerEmployeeId: target.employeeId, isArchived: false } } },
      ] : []),
    ] }
    : { targetType: target.targetType, targetId: target.targetId };
  const [plans, columns] = await Promise.all([
    prisma.workPlan.findMany({
      where: {
        isArchived: false,
        AND: [
          scope,
          { OR: [
            { kind: "routine" },
            { kind: "okr", okrCycle: { startDate: { lte: cycle.endDate }, endDate: { gte: cycle.startDate } } },
            { kind: "okr", plannedStartDate: { lte: cycle.endDate }, plannedEndDate: { gte: cycle.startDate } },
          ] },
        ],
      },
      include: planInclude,
      orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
    }),
    listMatrixColumns(cycle),
  ]);
  return { kind: "initial-goal", data: initialGoalData(plans, columns, target) };
}

function initialGoalData(
  plans: PlanRow[],
  columns: PeriodDossierInitialGoal["columns"],
  target: ContributionTarget,
): PeriodDossierInitialGoal {
  const routinePlans = plans.filter((plan) => plan.kind === "routine");
  const okrPlans = plans.filter((plan) => plan.kind === "okr");
  const routine = routinePlans.flatMap((plan) => {
    const standing = plan.items.filter((item) => item.itemType === "task" && item.routineTaskType === "standing");
    const rows = standing.length ? standing : plan.items.filter((item) => item.itemType === "task" && !item.parentWorkItemId);
    return rows.filter((item) => !target.employeeId || !item.ownerEmployeeId || item.ownerEmployeeId === target.employeeId).map((item) => ({
      id: String(item.id),
      title: item.content,
      responsibility: item.parentWorkItem?.content || plan.title,
    }));
  });
  const alignedIds = new Set(okrPlans.flatMap((plan) => plan.items.filter((item) => isAligned(plan, item, target)).map((item) => item.id)));
  const objectives = okrPlans.flatMap((plan) => plan.items
    .filter((item) => item.itemType === "objective" && !alignedIds.has(item.id))
    .map((objective) => ({
      id: String(objective.id),
      title: objective.content,
      kindLabel: "目标",
      cells: Object.fromEntries(columns.map((column) => [column.key, objectiveCellItems(plan.items, objective.id, column)])),
    })));
  const alignments = okrPlans.flatMap((plan) => plan.items
    .filter((item) => item.itemType === "objective" && alignedIds.has(item.id))
    .map((item) => ({
      id: String(item.id),
      group: alignmentGroup(plan, item),
      title: item.content,
      source: alignmentSource(plan, item),
      dateRange: dateRange(item.plannedStartDate ?? item.actualStartDate, item.plannedEndDate ?? item.actualEndDate),
    })));
  return { routine, columns, objectives, alignments };
}

async function listMatrixColumns(cycle: { periodType: string; startDate: Date; endDate: Date }) {
  const displayType = cycle.periodType === "quarterly" ? "monthly" : "quarterly";
  const rows = await prisma.workOkrCycle.findMany({
    where: { periodType: displayType, startDate: { lte: cycle.endDate }, endDate: { gte: cycle.startDate } },
    select: { id: true, label: true, startDate: true, endDate: true },
    orderBy: [{ startDate: "asc" }, { sequence: "asc" }, { id: "asc" }],
  });
  const seen = new Set<string>();
  return rows.flatMap((row) => {
    const key = `${formatDate(row.startDate)}:${formatDate(row.endDate)}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ key: String(row.id), label: row.label, startDate: formatDate(row.startDate), endDate: formatDate(row.endDate) }];
  });
}

function objectiveCellItems(items: PlanItem[], objectiveId: number, column: PeriodDossierInitialGoal["columns"][number]) {
  const itemById = new Map(items.map((item) => [item.id, item]));
  return items.filter((item) => item.itemType !== "objective" && objectiveIdFor(item, itemById) === objectiveId)
    .filter((item) => rangesOverlap(item.plannedStartDate ?? item.actualStartDate, item.plannedEndDate ?? item.actualEndDate, column.startDate, column.endDate))
    .map((item) => item.content);
}

function objectiveIdFor(item: PlanItem, itemById: ReadonlyMap<number, PlanItem>) {
  let current = item;
  const visited = new Set<number>();
  while (current.parentWorkItemId && !visited.has(current.id)) {
    visited.add(current.id);
    const parent = itemById.get(current.parentWorkItemId);
    if (!parent) return null;
    if (parent.itemType === "objective") return parent.id;
    current = parent;
  }
  return null;
}

function isAligned(plan: PlanRow, item: PlanItem, target: ContributionTarget) {
  return plan.targetType !== target.targetType
    || plan.targetId !== target.targetId
    || Boolean(plan.sourceDepartmentId || plan.linkedProjectId || item.sourceDepartmentId || item.linkedProjectId);
}

function alignmentGroup(plan: PlanRow, item: PlanItem) {
  if (plan.linkedProjectId || item.linkedProjectId || plan.targetType === "project") return "项目承接";
  if (plan.sourceDepartmentId || item.sourceDepartmentId || plan.targetType === "department") return "部门承接";
  return "个人协作";
}

function alignmentSource(plan: PlanRow, item: PlanItem) {
  return item.linkedProject?.name || plan.linkedProject?.name || item.sourceDepartment?.name || plan.sourceDepartment?.name || plan.title;
}

function toDossierTask(item: { id: number; content: string; plannedEndDate: Date | null; actualEndDate: Date | null; completedAt: Date | null }) {
  return {
    id: String(item.id),
    title: item.content,
    plannedEndDate: formatNullableDate(item.plannedEndDate),
    actualEndDate: formatNullableDate(item.actualEndDate),
  };
}

function nextPeriodEnd(periodType: "weekly" | "monthly", endDate: Date) {
  const date = new Date(endDate);
  if (periodType === "weekly") date.setUTCDate(date.getUTCDate() + 7);
  else date.setUTCMonth(date.getUTCMonth() + 1, 0);
  return date;
}

function rangesOverlap(start: Date | null, end: Date | null, rangeStart: string, rangeEnd: string) {
  if (!start && !end) return false;
  const startKey = formatDate(start ?? end!);
  const endKey = formatDate(end ?? start!);
  return startKey <= rangeEnd && endKey >= rangeStart;
}

function dateRange(start: Date | null, end: Date | null) {
  return start || end ? `${formatNullableDate(start) || "未设置"} - ${formatNullableDate(end) || "未设置"}` : "未设置";
}

function isPeriodType(value: string): value is PeriodType {
  return PERIOD_TYPES.includes(value as PeriodType);
}

function normalizeAudience(value: unknown): ContributionAudience | null {
  return value === "personal" || value === "department" || value === "project" ? value : null;
}

function positiveId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function formatNullableDate(value: Date | null | undefined) {
  return value ? formatDate(value) : null;
}

function formatDate(value: Date | string) {
  return (value instanceof Date ? value : new Date(value)).toISOString().slice(0, 10);
}
