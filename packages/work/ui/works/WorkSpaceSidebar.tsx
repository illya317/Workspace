"use client";

import { BodySurface, type BodySurfaceSelectorProps } from "@workspace/core/ui";
import { getStatusLabel, getWorkPeriodLabel, getWorkSourceTypeLabel } from "./model";
import { workPlanStatusCategory, workStatusCategory, type WorkStatusFilter } from "./work-status-filter";
import type { WorkItem, WorkPlan, WorkTarget, WorkTaskSpace } from "./types";

type PlanNavItem = { kind: "plan"; key: string; group: string; plan: WorkPlan; routineTaskId?: number | null; work: WorkItem | null };
type PagerNavItem = { kind: "pager"; key: string; group: string; space: WorkTaskSpace; label: string; range: string; page: number };
type WorkSpaceNavItem = PlanNavItem | PagerNavItem;
type PlanningGroupKey = "routine" | "monthly" | "quarterly" | "annual";
type PlanningGroup = { key: PlanningGroupKey; title: string };

const PLANNING_GROUPS: PlanningGroup[] = [
  { key: "routine", title: "工作事项" },
  { key: "monthly", title: "月度计划" },
  { key: "quarterly", title: "季度计划" },
  { key: "annual", title: "年度计划" },
];

export function createWorkSpaceNavigationBody({
  spaces,
  active,
  activePlanId,
  activeRoutineTaskId,
  statusFilter,
  routineWorks,
  plans,
  loading,
  expandedSpaceKeys,
  planPageSize,
  planPageBySpace,
  onSelect,
  onSelectPlan,
  onToggleSpace,
  onPlanPageChange,
}: {
  spaces: WorkTaskSpace[];
  active: WorkTarget | null;
  activePlanId: number | null;
  activeRoutineTaskId: number | null;
  statusFilter: WorkStatusFilter;
  routineWorks: WorkItem[];
  plans: WorkPlan[];
  loading: boolean;
  expandedSpaceKeys: ReadonlySet<string>;
  planPageSize: number;
  planPageBySpace: ReadonlyMap<string, number>;
  onSelect: (space: WorkTaskSpace) => void;
  onSelectPlan: (plan: WorkPlan, routineTaskId?: number | null) => void;
  onToggleSpace: (space: WorkTaskSpace) => void;
  onPlanPageChange: (space: WorkTaskSpace, page: number) => void;
}): BodySurfaceSelectorProps {
  void active;
  void expandedSpaceKeys;
  void onSelect;
  void onToggleSpace;
  const planGroups = groupPlans(plans);
  const items = spaces.flatMap((space) => spaceItems({
    space,
    plans: planGroups.get(targetKey(space)) ?? [],
    activePlanId,
    statusFilter,
    routineWorks,
    planPageSize,
    planPageBySpace,
  }));
  return {
    kind: "selector",
    selector: {
      kind: "list",
      title: "工作空间",
      loading,
      loadingText: "加载中...",
      emptyText: "当前账号暂无可进入的工作计划空间",
      items: items.map((item) => ({
        key: item.key,
        value: item,
        group: item.group,
        card: renderItem(item, selectedNavigationId(plans, activePlanId, activeRoutineTaskId)),
      })),
      selectedId: selectedNavigationId(plans, activePlanId, activeRoutineTaskId),
      onSelect: (item) => selectItem(item, onSelectPlan, onPlanPageChange),
      size: "sm",
    },
  };
}

export function workSpaceKey(target: WorkTarget) {
  return targetKey(target);
}

export function applyDefaultExpandedWorkSpaces(current: ReadonlySet<string>, spaces: WorkTaskSpace[], active: WorkTarget | null) {
  const next = new Set(current);
  for (const space of spaces) if (space.targetType === "personal") next.add(targetKey(space));
  if (active) next.add(targetKey(active));
  return next;
}

export default function WorkSpaceSidebar(props: Parameters<typeof createWorkSpaceNavigationBody>[0]) {
  return <BodySurface {...createWorkSpaceNavigationBody(props)} />;
}

function groupPlans(plans: WorkPlan[]) {
  const groups = new Map<string, WorkPlan[]>();
  for (const plan of plans) {
    const key = targetKey(plan);
    groups.set(key, [...(groups.get(key) ?? []), plan]);
  }
  for (const [key, group] of groups) groups.set(key, [...group].sort(comparePlansByTime));
  return groups;
}

function comparePlansByTime(left: WorkPlan, right: WorkPlan) {
  return planSortTime(left, "start") - planSortTime(right, "start")
    || planSortTime(left, "end") - planSortTime(right, "end")
    || left.id - right.id;
}

function comparePlansForGroup(left: WorkPlan, right: WorkPlan, groupKey: PlanningGroupKey) {
  if (groupKey === "routine") {
    const kindOrder = routineGroupOrder(left) - routineGroupOrder(right);
    if (kindOrder !== 0) return kindOrder;
  }
  if (groupKey === "monthly" || groupKey === "quarterly") return comparePlansByTime(right, left);
  if (groupKey === "annual") return compareAnnualPlans(left, right);
  return comparePlansByTime(left, right);
}

function routineGroupOrder(plan: WorkPlan) {
  return plan.kind === "routine" ? 0 : 1;
}

function compareAnnualPlans(left: WorkPlan, right: WorkPlan) {
  return planSortYear(left) - planSortYear(right)
    || annualPlanOrder(left) - annualPlanOrder(right)
    || comparePlansByTime(left, right);
}

function annualPlanOrder(plan: WorkPlan) {
  const half = halfYearSequence(plan);
  if (half === 2) return 0;
  if (half === 1) return 1;
  return 2;
}

function spaceItems({
  space,
  plans,
  activePlanId,
  statusFilter,
  routineWorks,
  planPageSize,
  planPageBySpace,
}: {
  space: WorkTaskSpace;
  plans: WorkPlan[];
  activePlanId: number | null;
  statusFilter: WorkStatusFilter;
  routineWorks: WorkItem[];
  planPageSize: number;
  planPageBySpace: ReadonlyMap<string, number>;
}): WorkSpaceNavItem[] {
  return PLANNING_GROUPS.flatMap((planningGroup) => planningGroupItems({ space, planningGroup, plans, activePlanId, statusFilter, routineWorks, planPageSize, planPageBySpace }));
}

function planningGroupItems({
  space,
  planningGroup,
  plans,
  activePlanId,
  statusFilter,
  routineWorks,
  planPageSize,
  planPageBySpace,
}: {
  space: WorkTaskSpace;
  planningGroup: PlanningGroup;
  plans: WorkPlan[];
  activePlanId: number | null;
  statusFilter: WorkStatusFilter;
  routineWorks: WorkItem[];
  planPageSize: number;
  planPageBySpace: ReadonlyMap<string, number>;
}): WorkSpaceNavItem[] {
  const groupPlans = plans
    .filter((plan) => planPlanningGroup(plan) === planningGroup.key)
    .sort((left, right) => comparePlansForGroup(left, right, planningGroup.key));
  const key = targetKey(space);
  const pageKey = `${key}:${planningGroup.key}`;
  const totalPages = Math.max(1, Math.ceil(groupPlans.length / planPageSize));
  const page = Math.min(planPageBySpace.get(pageKey) ?? planPageBySpace.get(key) ?? 0, totalPages - 1);
  const pageStart = page * planPageSize;
  const pagePlans = groupPlans.slice(pageStart, pageStart + planPageSize);
  return [
    ...pagePlans.flatMap((plan): PlanNavItem[] => plan.kind === "routine"
      ? routinePlanItems(plan, planningGroup.title, plan.id === activePlanId ? routineWorks : [], statusFilter)
      : [{ kind: "plan", key: `plan:${plan.id}`, group: planningGroup.title, plan, work: null }]),
    ...(groupPlans.length > planPageSize ? pagerItems(space, planningGroup, page, totalPages, pageStart, pagePlans.length, groupPlans.length) : []),
  ];
}

function pagerItems(space: WorkTaskSpace, planningGroup: PlanningGroup, page: number, totalPages: number, pageStart: number, pageCount: number, total: number): PagerNavItem[] {
  const group = planningGroup.title;
  const range = `${planningGroup.title} ${pageStart + 1}-${pageStart + pageCount} / ${total}`;
  return [
    ...(page > 0 ? [{ kind: "pager" as const, key: `pager-prev:${targetKey(space)}:${planningGroup.key}`, group, space, label: "上一页", range, page: page - 1 }] : []),
    ...(page < totalPages - 1 ? [{ kind: "pager" as const, key: `pager-next:${targetKey(space)}:${planningGroup.key}`, group, space, label: "下一页", range, page: page + 1 }] : []),
  ];
}

function selectItem(
  item: WorkSpaceNavItem,
  onSelectPlan: (plan: WorkPlan, routineTaskId?: number | null) => void,
  onPlanPageChange: (space: WorkTaskSpace, page: number) => void,
) {
  if (item.kind === "plan") onSelectPlan(item.plan, item.routineTaskId);
  else if (item.kind === "pager") onPlanPageChange(item.space, item.page);
}

function renderItem(item: WorkSpaceNavItem, selectedId: string | null) {
  if (item.kind === "plan") return item.work ? taskCard(item.work, item.key === selectedId) : planCard(item.plan, item.key === selectedId);
  return { title: item.label, subtitle: item.range, meta: "分页" };
}

function planCard(plan: WorkPlan, active: boolean) {
  const status = workPlanStatusCategory(plan);
  return {
    title: plan.kind === "routine" ? "常设职责" : plan.title,
    subtitle: plan.kind === "routine" ? "维护长期职责" : `${planScheduleLabel(plan)} · ${plan.ownerEmployeeName || "未设置负责人"}`,
    tone: "emerald" as const,
    meta: plan.kind === "routine" ? [] : [
      `来源 ${planSourceLabel(plan)}`,
      `节点 ${plan.itemCount}项`,
    ],
    status: plan.kind === "routine" ? undefined : { label: planStatusLabel(status), tone: selectorStatusTone(status) },
    active,
    archived: plan.isArchived,
  };
}

function selectedNavigationId(plans: WorkPlan[], activePlanId: number | null, activeRoutineTaskId: number | null) {
  if (!activePlanId) return null;
  const activePlan = plans.find((plan) => plan.id === activePlanId);
  if (activePlan?.kind !== "routine") return `plan:${activePlanId}`;
  return activeRoutineTaskId ? `plan:${activePlanId}:task:${activeRoutineTaskId}` : `plan:${activePlanId}:standing`;
}

function routinePlanItems(plan: WorkPlan, group: string, works: WorkItem[], statusFilter: WorkStatusFilter): PlanNavItem[] {
  const tasks = works
    .filter((work) => work.routineTaskType === "task")
    .sort((left, right) => left.sortOrder - right.sortOrder || left.id - right.id);
  return [
    ...(statusFilter === "active" ? [{ kind: "plan" as const, key: `plan:${plan.id}:standing`, group, plan, routineTaskId: null, work: null }] : []),
    ...tasks.map((work) => ({ kind: "plan" as const, key: `plan:${plan.id}:task:${work.id}`, group, plan, routineTaskId: work.id, work })),
  ];
}

function taskCard(work: WorkItem, active: boolean) {
  const status = workStatusCategory(work);
  const statusLabel = status === "active" ? getStatusLabel(work.status || "active") : getStatusLabel(status);
  return {
    title: work.content,
    subtitle: work.parentWorkItemContent ? `常设职责 · ${work.parentWorkItemContent}` : "独立任务",
    tone: "blue" as const,
    status: { label: statusLabel, tone: selectorStatusTone(status) },
    active,
    archived: work.isArchived,
  };
}

function selectorStatusTone(status: ReturnType<typeof workPlanStatusCategory> | ReturnType<typeof workStatusCategory>) {
  if (status === "done") return "success" as const;
  if (status === "active") return "warning" as const;
  return "muted" as const;
}

function planScheduleLabel(plan: WorkPlan) {
  const plannedStart = parseDateOnly(plan.plannedStartDate);
  const plannedEnd = parseDateOnly(plan.plannedEndDate);
  if (plannedStart && plannedEnd) return `${plannedStart.text} - ${plannedEnd.text}`;
  if (plannedStart || plannedEnd) return (plannedStart || plannedEnd)!.text;
  return getWorkPeriodLabel(plan);
}

function planSourceLabel(plan: WorkPlan) {
  if (plan.sourceType === "department") return plan.sourceDepartmentName || "部门";
  if (plan.sourceType === "project") return plan.linkedProjectPhaseName || plan.linkedProjectName || "项目";
  return getWorkSourceTypeLabel(plan.sourceType);
}

function planPlanningGroup(plan: WorkPlan): PlanningGroupKey {
  if (plan.kind === "routine") return "routine";
  return periodPlanningGroup(plan) ?? "routine";
}

function periodPlanningGroup(plan: WorkPlan): PlanningGroupKey | null {
  if (plan.periodType === "yearly") return "annual";
  if (plan.periodType === "half_year") return "annual";
  if (plan.periodType === "quarterly") return "quarterly";
  if (plan.periodType === "monthly") return "monthly";
  if (isAnnualPlan(plan)) return "annual";
  if (isHalfYearPlan(plan)) return "annual";
  if (isQuarterlyPlan(plan)) return "quarterly";
  if (isMonthlyPlan(plan)) return "monthly";
  return null;
}

function isAnnualPlan(plan: WorkPlan) {
  const start = planStartDate(plan);
  const end = planEndDate(plan);
  if (!start || !end || start.year !== end.year) return false;
  if (start.month === 1 && start.day === 1 && end.month === 12 && end.day === 31) return true;
  return Math.floor((end.raw.getTime() - start.raw.getTime()) / 86_400_000) + 1 >= 300;
}

function isHalfYearPlan(plan: WorkPlan) {
  const start = planStartDate(plan);
  const end = planEndDate(plan);
  if (!start || !end || start.year !== end.year) return false;
  return (start.month === 1 && start.day === 1 && end.month === 6 && end.day === 30)
    || (start.month === 7 && start.day === 1 && end.month === 12 && end.day === 31);
}

function isQuarterlyPlan(plan: WorkPlan) {
  const start = planStartDate(plan);
  const end = planEndDate(plan);
  if (!start || !end || start.year !== end.year || start.day !== 1) return false;
  return (start.month === 1 && end.month === 3 && end.day === 31)
    || (start.month === 4 && end.month === 6 && end.day === 30)
    || (start.month === 7 && end.month === 9 && end.day === 30)
    || (start.month === 10 && end.month === 12 && end.day === 31);
}

function isMonthlyPlan(plan: WorkPlan) {
  const start = planStartDate(plan);
  const end = planEndDate(plan);
  if (!start || !end || start.year !== end.year || start.month !== end.month || start.day !== 1) return false;
  return end.day === lastDayOfMonth(start.year, start.month);
}

function planStartDate(plan: WorkPlan) {
  return parsePlanDate(plan.plannedStartDate) ?? parsePlanDate(plan.actualStartDate);
}

function planEndDate(plan: WorkPlan) {
  return parsePlanDate(plan.plannedEndDate) ?? parsePlanDate(plan.actualEndDate);
}

function planSortTime(plan: WorkPlan, edge: "start" | "end") {
  const date = edge === "start" ? planStartDate(plan) : planEndDate(plan);
  return date?.raw.getTime() ?? Number.MAX_SAFE_INTEGER;
}

function planSortYear(plan: WorkPlan) {
  return planStartDate(plan)?.year ?? planEndDate(plan)?.year ?? Number.MAX_SAFE_INTEGER;
}

function halfYearSequence(plan: WorkPlan) {
  if (plan.periodType !== "half_year" && !isHalfYearPlan(plan)) return null;
  const start = planStartDate(plan);
  if (start?.month === 7) return 2;
  if (start?.month === 1) return 1;
  const text = `${plan.okrCycleCode ?? ""} ${plan.okrCycleLabel ?? ""} ${plan.title}`;
  if (/\bH2\b|下半年/.test(text)) return 2;
  if (/\bH1\b|上半年/.test(text)) return 1;
  return 1;
}

function parsePlanDate(value: string | null | undefined) {
  const text = String(value || "");
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const raw = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00`);
  if (Number.isNaN(raw.getTime())) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]), raw };
}

function lastDayOfMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function parseDateOnly(value: string | null | undefined) {
  const text = String(value || "");
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return { text: `${match[1]}-${match[2]}-${match[3]}` };
}

function targetKey(target: WorkTarget) {
  return `${target.targetType}:${target.targetId}`;
}

function planStatusLabel(status: WorkStatusFilter) {
  if (status === "done") return "已完成";
  if (status === "archived") return "已归档";
  return "进行中";
}
