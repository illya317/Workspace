import { prisma } from "@workspace/platform/server/prisma";
import type { WorkSpaceTargetType } from "./access";
import { getUserEmployeeIds } from "./access";
import { routineTaskVisibleInPeriod } from "./report-routine-periods";

export type ReportSourceItem = {
  id: number;
  planId: number;
  planTitle: string;
  planKind: "okr" | "routine";
  itemType: "objective" | "key_result" | "task";
  content: string;
  parentWorkItemId: number | null;
  parentTitle: string;
  objectiveTitleSnapshot: string;
  keyResultTitleSnapshot: string;
  reportItemKind: "assessment" | "current" | "routine" | "next";
  workItemStatusSnapshot: string;
  snapshotPlannedStartDate: Date | null;
  snapshotPlannedEndDate: Date | null;
  snapshotActualEndDate: Date | null;
  snapshotCompletedAt: Date | null;
  currentKeyResult: string;
  nextObjective: string;
  sortOrder: number;
};

export type ReportWorkItemsStage = "kr" | "final";

export async function listReportWorkItems(
  targetType: WorkSpaceTargetType,
  targetId: number,
  period: { startDate: Date; endDate: Date },
  stage: ReportWorkItemsStage = "final",
  options: { userId?: number | null; periodType?: string | null } = {},
): Promise<ReportSourceItem[]> {
  const plans = await prisma.workPlan.findMany({
    where: {
      targetType,
      targetId,
      isArchived: false,
      kind: { in: ["okr", "routine"] },
    },
    select: {
      id: true,
      kind: true,
      title: true,
      sortOrder: true,
      actualStartDate: true,
      actualEndDate: true,
      okrCycle: { select: { startDate: true, endDate: true } },
      items: {
        where: { isArchived: false },
        select: {
          id: true,
          itemType: true,
          content: true,
          status: true,
          completedAt: true,
          ownerEmployeeId: true,
          routineTaskType: true,
          routineRecurrenceType: true,
          routineRecurrenceTime: true,
          routineRecurrenceWeekday: true,
          routineRecurrenceMonthDay: true,
          routineRecurrenceQuarterDay: true,
          routineRecurrenceYearMonth: true,
          routineRecurrenceYearDay: true,
          actualStartDate: true,
          actualEndDate: true,
          plannedStartDate: true,
          plannedEndDate: true,
          parentWorkItemId: true,
          parentWorkItem: { select: { content: true, itemType: true, routineTaskType: true, parentWorkItemId: true, parentWorkItem: { select: { content: true } } } },
          sortOrder: true,
        },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      },
    },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });

  const reportingPeriod = isLightReportPeriod(options.periodType) ? nextLightReportPeriod(period, options.periodType) : null;
  const selectionPeriod = reportingPeriod ? { startDate: period.startDate, endDate: reportingPeriod.endDate } : period;
  const includeAllTaskPlans = Boolean(reportingPeriod && stage !== "kr");
  const activePlans = plans.filter((plan) => plan.kind === "routine" || includeAllTaskPlans || planOverlapsReportPeriod(plan, selectionPeriod));
  const ownItems = activePlans.flatMap((plan) => plan.kind === "routine"
    ? stage === "kr" ? [] : reportRoutineItems(plan, period, reportingPeriod)
    : reportOkrItems(plan, period, stage, options.periodType, reportingPeriod));
  if (targetType !== "personal" || !options.userId) return compactReportSortOrders(ownItems);
  const assignedItems = await listAssignedDepartmentReportItems(options.userId, period, stage, options.periodType);
  return compactReportSortOrders([...ownItems, ...assignedItems]);
}

function compactReportSortOrders(items: ReportSourceItem[]) {
  return [...items]
    .sort((a, b) => (a.sortOrder - b.sortOrder) || (a.id - b.id))
    .map((item, index) => ({ ...item, sortOrder: (index + 1) * 10 }));
}

type ReportPlan = {
  id: number;
  kind: string;
  title: string;
  sortOrder: number;
  actualStartDate: Date | null;
  actualEndDate: Date | null;
  okrCycle: { startDate: Date; endDate: Date } | null;
  items: ReportPlanItem[];
};

type ReportPlanItem = {
  id: number;
  itemType: string;
  content: string;
  status: string | null;
  completedAt: Date | null;
  ownerEmployeeId: number | null;
  routineTaskType: string | null;
  routineRecurrenceType: string | null;
  routineRecurrenceTime: string | null;
  routineRecurrenceWeekday: number | null;
  routineRecurrenceMonthDay: number | null;
  routineRecurrenceQuarterDay: number | null;
  routineRecurrenceYearMonth: number | null;
  routineRecurrenceYearDay: number | null;
  actualStartDate: Date | null;
  actualEndDate: Date | null;
  plannedStartDate: Date | null;
  plannedEndDate: Date | null;
  parentWorkItemId: number | null;
  parentWorkItem: {
    content: string;
    itemType: string;
    routineTaskType: string | null;
    parentWorkItemId: number | null;
    parentWorkItem: { content: string } | null;
  } | null;
  sortOrder: number;
};

function reportRoutineItems(
  plan: ReportPlan,
  period: { startDate: Date; endDate: Date },
  nextPeriod: { startDate: Date; endDate: Date } | null,
): ReportSourceItem[] {
  const itemsById = new Map(plan.items.map((item) => [item.id, item]));
  const allItems = plan.items.filter((item) => item.itemType === "task");
  const referencedStandingIds = new Set(allItems
    .filter((item) => item.routineTaskType !== "standing" && item.parentWorkItemId)
    .map((item) => item.parentWorkItemId!));
  const items = allItems
    .filter((item) => item.status !== "done" || dateInRange(item.completedAt, period.startDate, period.endDate));
  const standingItems = items
    .filter((item) => item.routineTaskType === "standing" && referencedStandingIds.has(item.id))
    .map((item) => taskReportItem(plan, item, period, itemsById, "routine"));
  const taskItems = items.filter((item) => item.routineTaskType !== "standing");
  if (!nextPeriod) {
    return [...standingItems, ...taskItems
      .filter((item) => routineTaskVisibleInPeriod(item, period))
      .map((item) => taskReportItem(plan, item, period, itemsById))];
  }
  return [...standingItems, ...taskItems.flatMap((item) => routineReportingTaskKinds(item, period, nextPeriod)
    .map((kind) => taskReportItem(plan, item, period, itemsById, kind)))];
}

function reportOkrItems(
  plan: ReportPlan,
  period: { startDate: Date; endDate: Date },
  stage: ReportWorkItemsStage,
  periodType?: string | null,
  nextPeriod: { startDate: Date; endDate: Date } | null = null,
): ReportSourceItem[] {
  const itemsById = new Map(plan.items.map((item) => [item.id, item]));
  const objectives = plan.items.filter((item) => item.itemType === "objective");
  const keyResults = plan.items.filter((item) => item.itemType === "key_result");
  const tasks = plan.items.filter((item) => item.itemType === "task");
  if (isLightReportPeriod(periodType) && stage !== "kr" && nextPeriod) {
    return tasks
      .sort(sortReportPlanItem)
      .flatMap((item) => lightReportTaskKinds(item, period)
        .map((kind) => taskReportItem(plan, item, period, itemsById, kind)));
  }
  return objectives
    .map((objective) => {
      const completedKrs = keyResults
        .filter((item) => objectiveIdFor(item, itemsById) === objective.id)
        .filter((item) => item.status === "done" && dateInRange(item.completedAt, period.startDate, period.endDate))
        .sort(sortReportPlanItem);
      const pendingTasks = tasks
        .filter((item) => objectiveIdFor(item, itemsById) === objective.id)
        .filter((item) => item.status !== "done" && taskHasStarted(item.actualStartDate, period.endDate))
        .sort(sortReportPlanItem);
      const plannedKrs = keyResults
        .filter((item) => objectiveIdFor(item, itemsById) === objective.id)
        .sort(sortReportPlanItem);
      return {
        id: objective.id,
        planId: plan.id,
        planTitle: plan.title,
        planKind: "okr" as const,
        itemType: "objective" as const,
        content: objective.content,
        parentWorkItemId: null,
        parentTitle: "",
        objectiveTitleSnapshot: objective.content,
        keyResultTitleSnapshot: "",
        reportItemKind: "assessment" as const,
        workItemStatusSnapshot: objective.status || "",
        snapshotPlannedStartDate: objective.plannedStartDate,
        snapshotPlannedEndDate: objective.plannedEndDate,
        snapshotActualEndDate: objective.actualEndDate,
        snapshotCompletedAt: objective.completedAt,
        currentKeyResult: numberedList((stage === "kr" ? plannedKrs : completedKrs).map((item) => item.content)),
        nextObjective: stage === "kr" ? "" : numberedList(pendingTasks.map((item) => item.content)),
        sortOrder: plan.sortOrder * 10000 + objective.sortOrder,
      };
    })
    .filter((item) => item.currentKeyResult || item.nextObjective || objectiveIsActive(itemsById.get(item.id)));
}

async function listAssignedDepartmentReportItems(
  userId: number,
  period: { startDate: Date; endDate: Date },
  stage: ReportWorkItemsStage,
  periodType?: string | null,
): Promise<ReportSourceItem[]> {
  const employeeIds = await getUserEmployeeIds(userId);
  if (employeeIds.length === 0) return [];
  if (stage === "kr") return listAssignedDepartmentInitialItems(employeeIds, period);
  const reportingPeriod = isLightReportPeriod(periodType) ? nextLightReportPeriod(period, periodType) : null;
  const selectionPeriod = reportingPeriod ? { startDate: period.startDate, endDate: reportingPeriod.endDate } : period;
  const rows = await prisma.workItem.findMany({
    where: {
      targetType: "department",
      ownerEmployeeId: { in: employeeIds },
      itemType: reportingPeriod ? "task" : { in: ["key_result", "task"] },
      isArchived: false,
      plan: {
        kind: "okr",
        isArchived: false,
      },
      ...(!reportingPeriod ? { OR: [
        { status: null },
        { status: { not: "done" } },
        { completedAt: { gte: period.startDate, lt: addDays(period.endDate, 1) } },
      ] } : {}),
    },
    select: {
      id: true,
      itemType: true,
      content: true,
      status: true,
      completedAt: true,
      ownerEmployeeId: true,
      routineTaskType: true,
      routineRecurrenceType: true,
      routineRecurrenceTime: true,
      routineRecurrenceWeekday: true,
      routineRecurrenceMonthDay: true,
      routineRecurrenceQuarterDay: true,
      routineRecurrenceYearMonth: true,
      routineRecurrenceYearDay: true,
      actualStartDate: true,
      actualEndDate: true,
      plannedStartDate: true,
      plannedEndDate: true,
      parentWorkItemId: true,
      parentWorkItem: { select: { content: true, itemType: true, routineTaskType: true, parentWorkItemId: true, parentWorkItem: { select: { content: true } } } },
      sortOrder: true,
      plan: {
        select: {
          id: true,
          title: true,
          kind: true,
          sortOrder: true,
          actualStartDate: true,
          actualEndDate: true,
          okrCycle: { select: { startDate: true, endDate: true } },
        },
      },
    },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
  return rows
    .filter((item) => item.plan)
    .filter((item) => Boolean(reportingPeriod) || planOverlapsReportPeriod(item.plan!, selectionPeriod))
    .flatMap((item) => {
      const plan = { id: item.plan!.id, kind: item.plan!.kind, title: item.plan!.title, sortOrder: item.plan!.sortOrder };
      if (reportingPeriod) {
        return lightReportTaskKinds(item, period)
          .map((kind) => taskReportItem(plan, item, period, new Map(), kind));
      }
      return item.itemType === "key_result" || taskHasStarted(item.actualStartDate, period.endDate)
        ? [taskReportItem(plan, item, period, new Map())]
        : [];
    });
}

async function listAssignedDepartmentInitialItems(
  employeeIds: number[],
  period: { startDate: Date; endDate: Date },
): Promise<ReportSourceItem[]> {
  const plans = await prisma.workPlan.findMany({
    where: {
      targetType: "department",
      kind: "okr",
      isArchived: false,
      items: {
        some: {
          ownerEmployeeId: { in: employeeIds },
          itemType: { in: ["objective", "key_result"] },
          isArchived: false,
        },
      },
    },
    select: {
      id: true,
      kind: true,
      title: true,
      sortOrder: true,
      actualStartDate: true,
      actualEndDate: true,
      okrCycle: { select: { startDate: true, endDate: true } },
      items: {
        where: {
          isArchived: false,
          itemType: { in: ["objective", "key_result"] },
        },
        select: {
          id: true,
          itemType: true,
          content: true,
          status: true,
          completedAt: true,
          ownerEmployeeId: true,
          routineTaskType: true,
          routineRecurrenceType: true,
          routineRecurrenceTime: true,
          routineRecurrenceWeekday: true,
          routineRecurrenceMonthDay: true,
          routineRecurrenceQuarterDay: true,
          routineRecurrenceYearMonth: true,
          routineRecurrenceYearDay: true,
          actualStartDate: true,
          actualEndDate: true,
          plannedStartDate: true,
          plannedEndDate: true,
          parentWorkItemId: true,
          parentWorkItem: { select: { content: true, itemType: true, routineTaskType: true, parentWorkItemId: true, parentWorkItem: { select: { content: true } } } },
          sortOrder: true,
        },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      },
    },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
  const employeeIdSet = new Set(employeeIds);
  return plans
    .filter((plan) => planOverlapsReportPeriod(plan, period))
    .flatMap((plan) => assignedDepartmentInitialPlanItems(plan, employeeIdSet));
}

function assignedDepartmentInitialPlanItems(plan: ReportPlan, employeeIds: ReadonlySet<number>): ReportSourceItem[] {
  const itemsById = new Map(plan.items.map((item) => [item.id, item]));
  const objectives = plan.items.filter((item) => item.itemType === "objective");
  const keyResults = plan.items.filter((item) => item.itemType === "key_result");
  const assignedObjectiveIds = new Set<number>();
  for (const objective of objectives) {
    if (ownedByEmployee(objective, employeeIds)) assignedObjectiveIds.add(objective.id);
  }
  for (const keyResult of keyResults) {
    if (!ownedByEmployee(keyResult, employeeIds)) continue;
    const objectiveId = objectiveIdFor(keyResult, itemsById);
    if (objectiveId) assignedObjectiveIds.add(objectiveId);
  }
  return objectives
    .filter((objective) => assignedObjectiveIds.has(objective.id))
    .map((objective) => {
      const objectiveOwned = ownedByEmployee(objective, employeeIds);
      const plannedKrs = keyResults
        .filter((item) => objectiveIdFor(item, itemsById) === objective.id)
        .filter((item) => objectiveOwned || ownedByEmployee(item, employeeIds))
        .sort(sortReportPlanItem);
      return {
        id: objective.id,
        planId: plan.id,
        planTitle: plan.title,
        planKind: "okr" as const,
        itemType: "objective" as const,
        content: objective.content,
        parentWorkItemId: null,
        parentTitle: "",
        objectiveTitleSnapshot: objective.content,
        keyResultTitleSnapshot: "",
        reportItemKind: "assessment" as const,
        workItemStatusSnapshot: objective.status || "",
        snapshotPlannedStartDate: objective.plannedStartDate,
        snapshotPlannedEndDate: objective.plannedEndDate,
        snapshotActualEndDate: objective.actualEndDate,
        snapshotCompletedAt: objective.completedAt,
        currentKeyResult: numberedList(plannedKrs.map((item) => item.content)),
        nextObjective: "",
        sortOrder: plan.sortOrder * 10000 + objective.sortOrder,
      };
    })
    .filter((item) => item.currentKeyResult || objectiveIsActive(itemsById.get(item.id)));
}

function ownedByEmployee(item: ReportPlanItem, employeeIds: ReadonlySet<number>) {
  return Boolean(item.ownerEmployeeId && employeeIds.has(item.ownerEmployeeId));
}

function planOverlapsReportPeriod(
  plan: { actualStartDate: Date | null; actualEndDate: Date | null; okrCycle: { startDate: Date; endDate: Date } | null },
  period: { startDate: Date; endDate: Date },
) {
  const start = plan.okrCycle?.startDate ?? plan.actualStartDate;
  const end = plan.okrCycle?.endDate ?? plan.actualEndDate;
  return Boolean(start && end && start <= period.endDate && end >= period.startDate);
}

function taskReportItem(
  plan: Pick<ReportPlan, "id" | "kind" | "title" | "sortOrder">,
  item: ReportPlanItem,
  period: { startDate: Date; endDate: Date },
  itemsById: Map<number, ReportPlanItem>,
  reportItemKind: ReportSourceItem["reportItemKind"] = "assessment",
): ReportSourceItem {
  const completedInPeriod = item.status === "done" && dateInRange(item.completedAt, period.startDate, period.endDate);
  const hierarchy = hierarchyTitlesFor(item, itemsById);
  return {
    id: item.id,
    planId: plan.id,
    planTitle: plan.title,
    planKind: plan.kind === "routine" ? "routine" : "okr",
    itemType: item.itemType === "key_result" ? "key_result" : "task",
    content: item.content,
    parentWorkItemId: item.parentWorkItemId,
    parentTitle: parentTitleFor(item, itemsById),
    objectiveTitleSnapshot: hierarchy.objectiveTitle,
    keyResultTitleSnapshot: hierarchy.keyResultTitle,
    reportItemKind,
    workItemStatusSnapshot: item.status || "",
    snapshotPlannedStartDate: item.plannedStartDate,
    snapshotPlannedEndDate: item.plannedEndDate,
    snapshotActualEndDate: item.actualEndDate,
    snapshotCompletedAt: item.completedAt,
    currentKeyResult: reportItemKind === "next" || reportItemKind === "routine" ? "" : completedInPeriod ? item.content : "",
    nextObjective: reportItemKind === "next" ? item.content : reportItemKind === "current" || reportItemKind === "routine" ? "" : item.status === "done" ? "" : item.content,
    sortOrder: plan.sortOrder * 10000 + item.sortOrder,
  };
}

function hierarchyTitlesFor(item: ReportPlanItem, itemsById: Map<number, ReportPlanItem>) {
  const parent = item.parentWorkItemId ? itemsById.get(item.parentWorkItemId) ?? item.parentWorkItem : item.parentWorkItem;
  if (!parent) return { objectiveTitle: "", keyResultTitle: "" };
  if (parent.itemType === "objective") return { objectiveTitle: parent.content, keyResultTitle: "" };
  if (parent.itemType === "task" && parent.routineTaskType === "standing") return { objectiveTitle: parent.content, keyResultTitle: "" };
  if (parent.itemType !== "key_result") return { objectiveTitle: "", keyResultTitle: "" };
  const objective = parent.parentWorkItemId ? itemsById.get(parent.parentWorkItemId) : null;
  return {
    objectiveTitle: objective?.content || parent.parentWorkItem?.content || "",
    keyResultTitle: parent.content,
  };
}

function parentTitleFor(item: ReportPlanItem, itemsById: Map<number, ReportPlanItem>) {
  if (item.parentWorkItem?.content) return item.parentWorkItem.content;
  if (!item.parentWorkItemId) return "";
  return itemsById.get(item.parentWorkItemId)?.content ?? "";
}

function isLightReportPeriod(periodType?: string | null) {
  return periodType === "weekly" || periodType === "monthly";
}

function nextLightReportPeriod(period: { startDate: Date; endDate: Date }, periodType?: string | null) {
  const startDate = addDays(period.endDate, 1);
  if (periodType === "monthly") {
    return {
      startDate,
      endDate: new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + 1, 0)),
    };
  }
  return { startDate, endDate: addDays(startDate, 6) };
}

export function lightReportTaskKinds(
  item: Pick<ReportPlanItem, "status" | "actualStartDate" | "actualEndDate" | "plannedStartDate" | "plannedEndDate">,
  period: { startDate: Date; endDate: Date },
): Array<"current" | "next"> {
  if (item.status !== "done") return ["next"];
  return dateInRange(item.actualEndDate, period.startDate, period.endDate) ? ["current"] : [];
}

function routineReportingTaskKinds(
  item: ReportPlanItem,
  period: { startDate: Date; endDate: Date },
  nextPeriod: { startDate: Date; endDate: Date },
) {
  const kinds = lightReportTaskKinds(item, period);
  if (item.actualStartDate || !item.routineRecurrenceType) return kinds;
  if (routineTaskVisibleInPeriod(item, period) && !kinds.includes("current")) kinds.push("current");
  if (item.status !== "done" && routineTaskVisibleInPeriod(item, nextPeriod) && !kinds.includes("next")) kinds.push("next");
  return kinds;
}

function objectiveIdFor(item: ReportPlanItem, itemsById: Map<number, ReportPlanItem>) {
  if (!item.parentWorkItemId) return null;
  const parent = itemsById.get(item.parentWorkItemId);
  if (!parent) return null;
  if (parent.itemType === "objective") return parent.id;
  if (parent.itemType === "key_result") return parent.parentWorkItemId ?? null;
  return null;
}

function objectiveIsActive(item: ReportPlanItem | undefined) {
  return Boolean(item && item.status !== "done");
}

function sortReportPlanItem(a: ReportPlanItem, b: ReportPlanItem) {
  return (a.sortOrder - b.sortOrder) || (a.id - b.id);
}

function dateInRange(value: Date | null, start: Date, end: Date) {
  return Boolean(value && value >= start && value < addDays(end, 1));
}

function taskHasStarted(value: Date | null, actualEndDate: Date) {
  return !value || value <= actualEndDate;
}

function numberedList(items: string[]) {
  return items.map((item, index) => `${index + 1}. ${item}`).join("\n");
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}
