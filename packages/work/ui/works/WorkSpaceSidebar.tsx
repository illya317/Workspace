"use client";

import { PageSurface, type BodySurfaceSelectorProps } from "@workspace/core/ui";
import { businessSpaceGroupTitle } from "@workspace/platform/permissions";
import { getWorkPeriodLabel, getWorkSourceTypeLabel, getWorkSpaceLabel } from "./model";
import type { WorkPlan, WorkTarget, WorkTaskSpace, WorkTargetType } from "./types";

type SpaceNavItem = { kind: "space"; key: string; group: string; space: WorkTaskSpace; plans: WorkPlan[]; expanded: boolean };
type PlanNavItem = { kind: "plan"; key: string; group: string; plan: WorkPlan };
type PagerNavItem = { kind: "pager"; key: string; group: string; space: WorkTaskSpace; label: string; range: string; page: number };
type WorkSpaceNavItem = SpaceNavItem | PlanNavItem | PagerNavItem;

const WORK_SPACE_GROUPS: Array<{ type: WorkTargetType; title: string }> = [
  { type: "department", title: "部门空间" },
  { type: "project", title: "项目空间" },
];

export function createWorkSpaceNavigationBody({
  spaces,
  active,
  activePlanId,
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
  plans: WorkPlan[];
  loading: boolean;
  expandedSpaceKeys: ReadonlySet<string>;
  planPageSize: number;
  planPageBySpace: ReadonlyMap<string, number>;
  onSelect: (space: WorkTaskSpace) => void;
  onSelectPlan: (plan: WorkPlan) => void;
  onToggleSpace: (space: WorkTaskSpace) => void;
  onPlanPageChange: (space: WorkTaskSpace, page: number) => void;
}): BodySurfaceSelectorProps {
  const planGroups = groupPlans(plans);
  const items = spaces.flatMap((space) => spaceItems({
    space,
    group: groupTitle(space),
    plans: planGroups.get(targetKey(space)) ?? [],
    expandedSpaceKeys,
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
      items,
      selectedId: activePlanId ? `plan:${activePlanId}` : active ? `space:${targetKey(active)}` : null,
      getKey: (item) => item.key,
      groupBy: (item) => item.group,
      onSelect: (item) => selectItem(item, onSelect, onSelectPlan, onPlanPageChange),
      renderItem: (item) => renderItem(item, activePlanId, onToggleSpace),
      size: "sm",
    },
  };
}

export function workSpaceKey(target: WorkTarget) {
  return targetKey(target);
}

export function applyDefaultExpandedWorkSpaces(current: ReadonlySet<string>, spaces: WorkTaskSpace[], active: WorkTarget | null) {
  const next = new Set(current);
  for (const space of spaces) if (space.targetType === "personal" || space.targetType === "company") next.add(targetKey(space));
  if (active) next.add(targetKey(active));
  return next;
}

export default function WorkSpaceSidebar(props: Parameters<typeof createWorkSpaceNavigationBody>[0]) {
  return <PageSurface kind="standard" embedded body={createWorkSpaceNavigationBody(props)} />;
}

function groupPlans(plans: WorkPlan[]) {
  const groups = new Map<string, WorkPlan[]>();
  for (const plan of plans) {
    const key = targetKey(plan);
    groups.set(key, [...(groups.get(key) ?? []), plan]);
  }
  return groups;
}

function groupTitle(space: WorkTaskSpace) {
  if (space.targetType === "personal" || space.targetType === "company") {
    return businessSpaceGroupTitle(space.targetType, "work");
  }
  return WORK_SPACE_GROUPS.find((group) => group.type === space.targetType)?.title ?? "";
}

function spaceItems({
  space,
  group,
  plans,
  expandedSpaceKeys,
  planPageSize,
  planPageBySpace,
}: {
  space: WorkTaskSpace;
  group: string;
  plans: WorkPlan[];
  expandedSpaceKeys: ReadonlySet<string>;
  planPageSize: number;
  planPageBySpace: ReadonlyMap<string, number>;
}): WorkSpaceNavItem[] {
  const key = targetKey(space);
  const expanded = expandedSpaceKeys.has(key);
  const totalPages = Math.max(1, Math.ceil(plans.length / planPageSize));
  const page = Math.min(planPageBySpace.get(key) ?? 0, totalPages - 1);
  const pageStart = page * planPageSize;
  const pagePlans = plans.slice(pageStart, pageStart + planPageSize);
  return [
    { kind: "space", key: `space:${key}`, group, space, plans, expanded },
    ...(expanded ? pagePlans.map((plan) => ({ kind: "plan" as const, key: `plan:${plan.id}`, group, plan })) : []),
    ...(expanded && plans.length > planPageSize ? pagerItems(space, group, page, totalPages, pageStart, pagePlans.length, plans.length) : []),
  ];
}

function pagerItems(space: WorkTaskSpace, group: string, page: number, totalPages: number, pageStart: number, pageCount: number, total: number): PagerNavItem[] {
  const range = `OKR ${pageStart + 1}-${pageStart + pageCount} / ${total}`;
  return [
    ...(page > 0 ? [{ kind: "pager" as const, key: `pager-prev:${targetKey(space)}`, group, space, label: "上一页", range, page: page - 1 }] : []),
    ...(page < totalPages - 1 ? [{ kind: "pager" as const, key: `pager-next:${targetKey(space)}`, group, space, label: "下一页", range, page: page + 1 }] : []),
  ];
}

function selectItem(
  item: WorkSpaceNavItem,
  onSelect: (space: WorkTaskSpace) => void,
  onSelectPlan: (plan: WorkPlan) => void,
  onPlanPageChange: (space: WorkTaskSpace, page: number) => void,
) {
  if (item.kind === "space") onSelect(item.space);
  else if (item.kind === "plan") onSelectPlan(item.plan);
  else onPlanPageChange(item.space, item.page);
}

function renderItem(item: WorkSpaceNavItem, activePlanId: number | null, onToggleSpace: (space: WorkTaskSpace) => void) {
  if (item.kind === "space") return spaceCard(item, onToggleSpace);
  if (item.kind === "plan") return planCard(item.plan, activePlanId);
  return { title: <span className="pl-4">{item.label}</span>, subtitle: <span className="pl-4">{item.range}</span>, meta: "分页" };
}

function spaceCard(item: SpaceNavItem, onToggleSpace: (space: WorkTaskSpace) => void) {
  const { space, plans } = item;
  return {
    title: space.name,
    subtitle: `${space.subtitle || getWorkSpaceLabel(space.targetType)} · 事项 ${space.counts.objective + space.counts.keyResult + space.counts.task}`,
    meta: [roleLabel(space.role), lifecycleLabel(space.lifecycleStatus)].filter(Boolean),
    archived: space.lifecycleStatus === "archived" || space.lifecycleStatus === "inactive",
    status: plans.length ? {
      label: item.expanded ? "-" : "+",
      onClick: () => onToggleSpace(space),
    } : undefined,
  };
}

function planCard(plan: WorkPlan, activePlanId: number | null) {
  return {
    title: <span className="pl-4">{plan.title}</span>,
    subtitle: <span className="pl-4">{getWorkPeriodLabel(plan)} · {plan.ownerEmployeeName || "未设置负责人"}</span>,
    code: planStatusLabel(plan.status),
    codeTone: planStatusTone(plan.status),
    metaLine: <span className="pl-4">{getWorkSourceTypeLabel(plan.sourceType)}</span>,
    trailing: plan.itemCount,
    active: activePlanId === plan.id,
    archived: plan.status === "archived",
  };
}

function targetKey(target: WorkTarget) {
  return `${target.targetType}:${target.targetId}`;
}

function planStatusLabel(status: WorkPlan["status"]) {
  if (status === "closed") return "已关闭";
  if (status === "archived") return "已归档";
  return "进行中";
}

function planStatusTone(status: WorkPlan["status"]) {
  if (status === "closed") return "muted" as const;
  if (status === "archived") return "warning" as const;
  return "success" as const;
}

function roleLabel(role: string) {
  if (role === "manager") return "管理";
  if (role === "delete") return "删除";
  if (role === "editor") return "编辑";
  return "查看";
}

function lifecycleLabel(status: WorkTaskSpace["lifecycleStatus"]) {
  if (status === "archived") return "已归档";
  if (status === "inactive") return "已离职";
  return null;
}
