import type { VisualizationGanttRowSpec, VisualizationGanttZoom } from "@workspace/core/ui";
import type { WorkItem, WorkPeriodType, WorkPlan } from "./types";
import { shouldShowWorkOwner } from "./work-target-presentation";

type ScheduleNode = WorkItem & { scheduleParentId: number | null };
type MilestoneEvent = NonNullable<VisualizationGanttRowSpec["milestones"]>[number];
type WorkCounts = { objective: number; keyResult: number; task: number };
type GanttPlan = Pick<WorkPlan, "id" | "title" | "targetType" | "periodType" | "actualStartDate" | "actualEndDate" | "plannedStartDate" | "plannedEndDate" | "sortOrder" | "isMilestone" | "milestoneDate" | "ownerEmployeeName">;

const PERIOD_RANK: Record<WorkPeriodType, number> = { daily: 0, weekly: 1, monthly: 2, quarterly: 3, half_year: 4, yearly: 5 };

export function hasWorkPlanGanttTargetPlans(plans: WorkPlan[]) {
  return plans.some(isTargetPlan);
}

export function buildWorkPlanGanttRows(input: {
  plans: WorkPlan[];
  works: WorkItem[];
  periodStart: Date;
  zoom: VisualizationGanttZoom;
  expandedKeys?: ReadonlySet<string>;
}): VisualizationGanttRowSpec[] {
  const { plans, works, periodStart, zoom, expandedKeys } = input;
  const periodEnd = ganttRangeEnd(periodStart, zoom);
  const targetPlans = plans.filter(isTargetPlan).sort(sortPlans);
  const visiblePlans = targetPlans.filter((plan) => isScheduleVisible(plan, periodStart, periodEnd));
  const worksByPlanId = groupWorksByPlan(works);
  const nextExpandedKeys = expandedKeys ?? new Set<string>();
  if (visiblePlans.length === 0) return [];
  if (zoom !== "year") {
    return buildWorkRows(worksForPlans(visiblePlans, worksByPlanId), periodStart, periodEnd, 0, nextExpandedKeys);
  }
  const quarterPlans = quarterPlanShells(visiblePlans, periodStart.getFullYear());
  const quarterWorks = groupWorksByQuarter(quarterPlans, visiblePlans, worksByPlanId);
  return quarterPlans.flatMap((plan) => {
    const planWorks = quarterWorks.get(plan.id) ?? [];
    const workRows = buildWorkRows(planWorks, periodStart, periodEnd, 1, nextExpandedKeys);
    const key = planKey(plan);
    const expanded = nextExpandedKeys.has(key);
    return [planRow(plan, countWorks(planWorks), 0, workRows.length > 0, expanded), ...(expanded ? workRows : [])];
  });
}

function buildWorkRows(
  works: WorkItem[],
  periodStart: Date,
  periodEnd: Date,
  depth: number,
  expandedKeys: ReadonlySet<string>,
): VisualizationGanttRowSpec[] {
  const scheduleNodes = scheduleableNodes(works);
  const keyResultMilestones = keyResultMilestonesByObjective(works);
  const children = new Map<number | null, ScheduleNode[]>();
  for (const node of scheduleNodes) {
    children.set(node.scheduleParentId, [...(children.get(node.scheduleParentId) ?? []), node]);
  }
  for (const list of children.values()) list.sort(sortScheduleNodes);
  return visibleChildRows(null, depth);

  function visibleChildRows(parentId: number | null, rowDepth: number): VisualizationGanttRowSpec[] {
    return (children.get(parentId) ?? []).flatMap((node) => {
      const nestedRows = visibleChildRows(node.id, rowDepth + 1);
      const milestones = keyResultMilestones.get(node.id) ?? [];
      const hasVisibleMilestone = milestones.some((milestone) => dateInRange(milestone.date, periodStart, periodEnd));
      if (!isScheduleVisible(node, periodStart, periodEnd) && nestedRows.length === 0 && !hasVisibleMilestone) return [];
      const key = workKey(node);
      const expanded = expandedKeys.has(key);
      const hasChildren = nestedRows.length > 0;
      return [workRow(node, rowDepth, hasChildren, expanded, milestones), ...(expanded ? nestedRows : [])];
    });
  }
}

function planRow(plan: GanttPlan, counts: WorkCounts, depth: number, hasChildren: boolean, expanded: boolean): VisualizationGanttRowSpec {
  return {
    key: planKey(plan),
    label: `${plan.title} · ${countsLabel(counts)}`,
    kind: "project",
    depth,
    hasChildren,
    expanded,
    ownerNames: shouldShowWorkOwner(plan) && plan.ownerEmployeeName ? [plan.ownerEmployeeName] : [],
    startDate: plan.actualStartDate,
    endDate: plan.actualEndDate,
    plannedStartDate: plan.plannedStartDate,
    plannedEndDate: plan.plannedEndDate,
    milestones: milestoneEvents("plan", plan.id, plan.isMilestone, plan.milestoneDate, plan.title),
  };
}

function workRow(work: ScheduleNode, depth: number, hasChildren: boolean, expanded: boolean, extraMilestones: MilestoneEvent[]): VisualizationGanttRowSpec {
  return {
    key: workKey(work),
    label: workLabel(work),
    kind: work.itemType === "objective" ? "phase" : "task",
    depth,
    hasChildren,
    expanded,
    ownerNames: shouldShowWorkOwner(work) && work.ownerEmployeeName ? [work.ownerEmployeeName] : [],
    startDate: work.actualStartDate,
    endDate: work.actualEndDate,
    plannedStartDate: work.plannedStartDate,
    plannedEndDate: work.plannedEndDate,
    milestones: [
      ...milestoneEvents("work", work.id, work.isMilestone, work.milestoneDate, work.content),
      ...extraMilestones,
    ],
  };
}

function workLabel(work: WorkItem) {
  const prefix = work.itemType === "key_result" ? "KR · " : work.itemType === "task" ? "任务 · " : "";
  const parentLabel = work.parentPeriodWorkItemContent ? ` · 承接：${work.parentPeriodWorkItemContent}` : "";
  return `${prefix}${work.content}${parentLabel}`;
}

function countsLabel(counts: WorkCounts) {
  const parts = [`目标 ${counts.objective}`, `KR ${counts.keyResult}`];
  if (counts.task > 0) parts.push(`任务 ${counts.task}`);
  return parts.join(" / ");
}

function countWorks(works: WorkItem[]): WorkCounts {
  const counts: WorkCounts = { objective: 0, keyResult: 0, task: 0 };
  for (const work of works) {
    if (work.isArchived) continue;
    if (work.itemType === "objective") counts.objective += 1;
    if (work.itemType === "key_result") counts.keyResult += 1;
    if (work.itemType === "task") counts.task += 1;
  }
  return counts;
}

function worksForPlans(plans: WorkPlan[], worksByPlanId: ReadonlyMap<number, WorkItem[]>) {
  return plans.flatMap((plan) => worksByPlanId.get(plan.id) ?? []);
}

function quarterPlanShells(plans: WorkPlan[], year: number): GanttPlan[] {
  return Array.from({ length: 4 }, (_, index) => {
    const sequence = index + 1;
    const start = `${year}-${String(index * 3 + 1).padStart(2, "0")}-01`;
    const endDate = new Date(year, sequence * 3, 0);
    const end = `${year}-${String(endDate.getMonth() + 1).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`;
    return plans.find((plan) => plan.periodType === "quarterly" && plan.actualStartDate?.startsWith(start.slice(0, 7))) ?? {
      id: -(year * 10 + sequence), title: `${year}年第${sequence}季度`, periodType: "quarterly",
      targetType: plans[0]?.targetType ?? "personal",
      actualStartDate: start, actualEndDate: end, plannedStartDate: start, plannedEndDate: end,
      sortOrder: sequence, isMilestone: false, milestoneDate: null, ownerEmployeeName: null,
    };
  });
}

function groupWorksByQuarter(quarters: GanttPlan[], visiblePlans: WorkPlan[], worksByPlanId: ReadonlyMap<number, WorkItem[]>) {
  const buckets = new Map(quarters.map((quarter) => [quarter.id, [] as WorkItem[]]));
  const planById = new Map(visiblePlans.map((plan) => [plan.id, plan]));
  const allWorks = worksForPlans(visiblePlans, worksByPlanId);
  const workById = new Map(allWorks.map((work) => [work.id, work]));
  const groups = new Map<number, WorkItem[]>();
  for (const work of allWorks) {
    const rootId = rootWorkId(work, workById);
    groups.set(rootId, [...(groups.get(rootId) ?? []), work]);
  }
  for (const [rootId, group] of groups) {
    const root = workById.get(rootId) ?? group[0];
    const sourcePlan = root.planId ? planById.get(root.planId) : undefined;
    const anchor = parseDate(root.plannedStartDate ?? root.actualStartDate ?? root.milestoneDate ?? sourcePlan?.plannedStartDate ?? sourcePlan?.actualStartDate);
    const quarter = quarters.find((candidate) => sourcePlan && (candidate.id === sourcePlan.id || (containsPlan(candidate, sourcePlan) && periodRank(candidate) > periodRank(sourcePlan))))
      ?? quarters.find((candidate) => anchor && dateInsidePlan(anchor, candidate));
    if (quarter) buckets.set(quarter.id, [...(buckets.get(quarter.id) ?? []), ...group]);
  }
  return buckets;
}

function rootWorkId(work: WorkItem, workById: ReadonlyMap<number, WorkItem>) {
  let root = work;
  while (root.parentWorkItemId && workById.has(root.parentWorkItemId)) root = workById.get(root.parentWorkItemId)!;
  return root.id;
}

function dateInsidePlan(date: Date, plan: GanttPlan) {
  const start = parseDate(plan.actualStartDate ?? plan.plannedStartDate);
  const end = parseDate(plan.actualEndDate ?? plan.plannedEndDate);
  return Boolean(start && end && date >= start && date <= end);
}

function groupWorksByPlan(works: WorkItem[]) {
  const worksByPlanId = new Map<number, WorkItem[]>();
  for (const work of works) {
    if (!work.planId) continue;
    worksByPlanId.set(work.planId, [...(worksByPlanId.get(work.planId) ?? []), work]);
  }
  return worksByPlanId;
}

function scheduleableNodes(works: WorkItem[]): ScheduleNode[] {
  const byId = new Map(works.map((work) => [work.id, work]));
  const scheduledIds = new Set(works.filter(isGanttWorkNode).map((work) => work.id));
  return works
    .filter(isGanttWorkNode)
    .filter((work) => !work.isArchived)
    .map((work) => ({ ...work, scheduleParentId: scheduleParentId(work, byId, scheduledIds) }));
}

function isGanttWorkNode(work: WorkItem) {
  if (work.itemType === "key_result") return false;
  if (work.itemType === "objective" || work.itemType === "task") return true;
  return false;
}

function keyResultMilestonesByObjective(works: WorkItem[]) {
  const byId = new Map(works.map((work) => [work.id, work]));
  const fallbackObjectiveId = singleObjectiveId(works);
  const milestones = new Map<number, MilestoneEvent[]>();
  for (const work of works) {
    if (work.isArchived || work.itemType !== "key_result") continue;
    const event = keyResultMilestoneEvent(work);
    if (!event) continue;
    const objectiveId = parentObjectiveId(work, byId) ?? fallbackObjectiveId;
    if (!objectiveId) continue;
    milestones.set(objectiveId, [...(milestones.get(objectiveId) ?? []), event]);
  }
  return milestones;
}

function keyResultMilestoneEvent(work: WorkItem): MilestoneEvent | null {
  if (!work.isMilestone && !work.milestoneDate) return null;
  const date = work.milestoneDate ?? work.actualEndDate ?? work.plannedEndDate ?? work.completedAt ?? work.actualStartDate ?? work.plannedStartDate;
  if (!date) return null;
  return { key: `kr:${work.id}:milestone`, label: `KR：${work.content}`, date };
}

function parentObjectiveId(work: WorkItem, byId: ReadonlyMap<number, WorkItem>) {
  let parentId = work.parentWorkItemId;
  while (parentId) {
    const parent = byId.get(parentId);
    if (!parent) return null;
    if (parent.itemType === "objective") return parent.id;
    parentId = parent.parentWorkItemId;
  }
  return null;
}

function singleObjectiveId(works: WorkItem[]) {
  const objectiveIds = works.filter((work) => !work.isArchived && work.itemType === "objective").map((work) => work.id);
  return objectiveIds.length === 1 ? objectiveIds[0] : null;
}

function scheduleParentId(work: WorkItem, byId: ReadonlyMap<number, WorkItem>, scheduledIds: ReadonlySet<number>) {
  let parentId = work.parentWorkItemId;
  while (parentId) {
    if (scheduledIds.has(parentId)) return parentId;
    parentId = byId.get(parentId)?.parentWorkItemId ?? null;
  }
  return null;
}

function milestoneEvents(prefix: string, id: number, enabled: boolean, date: string | null, label: string) {
  if (!enabled || !date) return [];
  return [{ key: `${prefix}:${id}:milestone`, label, date }];
}

function isScheduleVisible(
  item: Pick<WorkPlan | WorkItem, "plannedStartDate" | "plannedEndDate" | "actualStartDate" | "actualEndDate" | "isMilestone" | "milestoneDate">,
  periodStart: Date,
  periodEnd: Date,
) {
  return (
    dateRangeOverlaps(item.plannedStartDate, item.plannedEndDate, periodStart, periodEnd) ||
    dateRangeOverlaps(item.actualStartDate, item.actualEndDate, periodStart, periodEnd) ||
    Boolean(item.isMilestone && dateInRange(item.milestoneDate, periodStart, periodEnd))
  );
}

function containsPlan(parent: GanttPlan, child: GanttPlan) {
  const parentStart = parseDate(parent.actualStartDate ?? parent.plannedStartDate);
  const parentEnd = parseDate(parent.actualEndDate ?? parent.plannedEndDate);
  const childStart = parseDate(child.actualStartDate ?? child.plannedStartDate);
  const childEnd = parseDate(child.actualEndDate ?? child.plannedEndDate);
  return Boolean(parentStart && parentEnd && childStart && childEnd && parentStart <= childStart && parentEnd >= childEnd);
}

function dateRangeOverlaps(startValue: string | null | undefined, endValue: string | null | undefined, periodStart: Date, periodEnd: Date) {
  const start = parseDate(startValue);
  const end = parseDate(endValue);
  if (!start && !end) return false;
  if (!start || !end) return dateOverlaps(start ?? end, periodStart, periodEnd);
  return (start <= end ? start : end) < periodEnd && (start <= end ? end : start) >= periodStart;
}

function dateInRange(value: string | null | undefined, periodStart: Date, periodEnd: Date) {
  return dateOverlaps(parseDate(value), periodStart, periodEnd);
}

function dateOverlaps(date: Date | null, periodStart: Date, periodEnd: Date) {
  return Boolean(date && date >= periodStart && date < periodEnd);
}

function ganttRangeEnd(start: Date, zoom: VisualizationGanttZoom) {
  if (zoom === "year") return new Date(start.getFullYear(), start.getMonth() + 12, 1);
  if (zoom === "quarter") return new Date(start.getFullYear(), start.getMonth() + 3, 1);
  return new Date(start.getFullYear(), start.getMonth() + 1, 1);
}

function isTargetPlan(plan: WorkPlan) {
  return plan.kind === "okr" && plan.periodType !== "half_year" && !isAnnualPlan(plan);
}

function isAnnualPlan(plan: WorkPlan) {
  if (plan.periodType === "yearly") return true;
  const start = parseDateOnly(plan.plannedStartDate) ?? parseDateOnly(plan.actualStartDate);
  const end = parseDateOnly(plan.plannedEndDate) ?? parseDateOnly(plan.actualEndDate);
  if (!start || !end || start.year !== end.year) return false;
  if (start.month === 1 && start.day === 1 && end.month === 12 && end.day === 31) return true;
  return daysBetween(start.raw, end.raw) >= 300;
}

function parseDateOnly(value: string | null | undefined) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const raw = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00`);
  if (Number.isNaN(raw.getTime())) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]), raw };
}

function parseDate(value: string | null | undefined) {
  return parseDateOnly(value)?.raw ?? null;
}

function daysBetween(start: Date, end: Date) { return Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1; }

function sortScheduleNodes(a: ScheduleNode, b: ScheduleNode) {
  return a.sortOrder - b.sortOrder || a.id - b.id;
}

function sortPlans(a: WorkPlan, b: WorkPlan) {
  return (a.plannedStartDate || a.actualStartDate || "").localeCompare(b.plannedStartDate || b.actualStartDate || "") || a.sortOrder - b.sortOrder || a.id - b.id;
}

function periodRank(plan: Pick<WorkPlan, "periodType">) { return plan.periodType ? PERIOD_RANK[plan.periodType] ?? 0 : 0; }

function planKey(plan: Pick<WorkPlan, "id">) {
  return `plan:${plan.id}`;
}

function workKey(work: Pick<WorkItem, "id">) {
  return `work:${work.id}`;
}
