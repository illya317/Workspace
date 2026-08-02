"use client";

import { useEffect, useMemo, useState } from "react";
import type { BodySurfaceSelectorProps } from "@workspace/core/ui";
import { createEmptyWorkPlanDraft, createWorkPlanDraft, getWorkPeriodLabel, getWorkPlanKindLabel, getWorkSpaceLabel } from "./model";
import { useAssignedWorkItems } from "./AssignedDepartmentWorkSection";
import { useWorkOkrPlanSurface } from "./WorkOkrPlanSurface";
import { createWorkPlanContentSection } from "./WorkPlanSections";
import type { WorkAssignedPlanGroup } from "./types";
import type { WorkTasksChildView } from "./WorkSpaceTopNavigation";
import { WORK_TASKS_ASSIGNED_VIEW_KEY, WORK_TASKS_COLLABORATION_VIEW_KEY, WORK_TASKS_OWNED_VIEW_KEY } from "./WorkSpaceTopNavigation";
import { shouldShowWorkOwner } from "./work-target-presentation";

export function useAssignedWorkNavigation({
  enabled,
  onToast,
  activeView,
}: {
  enabled: boolean;
  onToast: (message: string, type: "success" | "error") => void;
  activeView: WorkTasksChildView;
}) {
  const assignedItems = useAssignedWorkItems({ enabled, onToast });
  const groups = useMemo(() => activeView === WORK_TASKS_ASSIGNED_VIEW_KEY
    ? assignedItems.departmentPlanGroups
    : activeView === WORK_TASKS_COLLABORATION_VIEW_KEY
      ? assignedItems.collaborationPlanGroups
      : [], [activeView, assignedItems.collaborationPlanGroups, assignedItems.departmentPlanGroups]);
  const [activePlanId, setActivePlanId] = useState<number | null>(null);
  const activeGroup = useMemo(() => groups.find((group) => group.plan.id === activePlanId) ?? groups[0] ?? null, [activePlanId, groups]);
  const [detailId, setDetailId] = useState<number | null>(null);

  useEffect(() => {
    if (activeView === WORK_TASKS_OWNED_VIEW_KEY) return;
    setActivePlanId((current) => groups.some((group) => group.plan.id === current) ? current : groups[0]?.plan.id ?? null);
  }, [activeView, groups]);

  const target = activeGroup ? { targetType: activeGroup.plan.targetType, targetId: activeGroup.plan.targetId } : null;
  const activePlanKind = activeGroup?.plan.kind ?? "okr";
  const activeWorks = activeGroup?.assignedWorks ?? [];
  const viewLabel = activeView === WORK_TASKS_ASSIGNED_VIEW_KEY ? "承接" : "协作";
  const okrSurface = useWorkOkrPlanSurface({
    planDraft: activeGroup ? createWorkPlanDraft(activeGroup.plan) : createEmptyWorkPlanDraft(),
    works: activeWorks,
    target,
    persistenceMode: "active",
    workflowRole: "none",
    editability: "readonly",
    onPlanDraftChange: () => {},
    table: {
      loading: assignedItems.loading,
      saving: false,
      detailId,
      editingId: null,
      editDraft: null,
      workflowRequests: [],
      statusFilter: "active",
      itemTypeFilter: "all",
      groupByObjective: activePlanKind !== "routine",
      target,
      showOwnerColumn: shouldShowWorkOwner(target),
      sectionTitle: activePlanKind === "routine" ? `${viewLabel}事项` : `${viewLabel} OKR`,
      tableLabel: activePlanKind === "routine" ? "工作事项" : "目标 / 执行任务 / 考核结果",
      emptyText: activePlanKind === "routine" ? `暂无${viewLabel}事项` : "暂无目标/KR/任务",
      canEdit: false,
      canDelete: false,
      onDetail: (work) => setDetailId((current) => current === work.id ? null : work.id),
      onEdit: () => {},
      onSave: () => {},
      onCancelEdit: () => {},
      onEditDraftChange: () => {},
      onDelete: () => {},
    },
  });

  return {
    assignedBodySection: activeView === WORK_TASKS_OWNED_VIEW_KEY ? null : createWorkPlanContentSection({
      planCreating: false,
      globalCreateOpen: false,
      sectionTitle: "工作计划",
      hideWorkSections: false,
      activePlan: activeGroup ? assignedPlanForDisplay(activeGroup) : null,
      canEditPlan: false,
      planEditing: false,
      planSaveActions: [],
      canDeletePlan: false,
      canSubmitObjectiveReview: false,
      canSubmitKrReview: false,
      canArchivePlan: false,
      nodeCreating: false,
      planSubmitDisabled: true,
      krSubmitDisabled: true,
      planFormSurface: okrSurface.planFormSurface,
      workSections: okrSurface.workSections,
      plansLoading: assignedItems.loading,
      hasCurrentSpacePlans: groups.length > 0,
      onArchivePlan: noop,
      onDeletePlan: noop,
      onEditPlan: noop,
      onCancelPlanEdit: noop,
      onSubmitObjectiveReview: noop,
      onSubmitKrReview: noop,
    }),
    assignedNavigationBody: activeView === WORK_TASKS_OWNED_VIEW_KEY ? null : assignedPlanNavigationBody({
      groups,
      loading: assignedItems.loading,
      activePlanId: activeGroup?.plan.id ?? null,
      activeView,
      onSelect: (group) => {
        setActivePlanId(group.plan.id);
        setDetailId(null);
      },
    }),
  };
}

function assignedPlanNavigationBody({
  groups,
  loading,
  activePlanId,
  activeView,
  onSelect,
}: {
  groups: WorkAssignedPlanGroup[];
  loading: boolean;
  activePlanId: number | null;
  activeView: WorkTasksChildView;
  onSelect: (group: WorkAssignedPlanGroup) => void;
}): BodySurfaceSelectorProps {
  return {
    kind: "selector",
    selector: {
      kind: "list",
      title: "工作空间",
      loading,
      loadingText: "加载中...",
      emptyText: activeView === WORK_TASKS_ASSIGNED_VIEW_KEY ? "暂无承接计划" : "暂无协作计划",
      items: groups.map((group) => ({
        key: group.plan.id,
        value: group,
        group: assignedPlanGroupTitle(group),
        card: {
          title: group.plan.title,
          code: getWorkPlanKindLabel(group.plan.kind),
          subtitle: `${getWorkPeriodLabel(group.plan)} · ${assignedPlanPersonName(group, activeView)}`,
          trailing: group.assignedWorks.length,
          meta: [activeView === WORK_TASKS_ASSIGNED_VIEW_KEY ? "承接" : "协作", `${group.assignedWorks.length} 项与我相关`],
          active: group.plan.id === activePlanId,
        },
      })),
      selectedId: activePlanId,
      onSelect,
      size: "sm",
    },
  };
}

function assignedPlanForDisplay(group: WorkAssignedPlanGroup) {
  const content = group.assignedWorks.find((work) => work.content.trim())?.content.trim();
  return content ? { ...group.plan, description: content } : group.plan;
}

function assignedPlanPersonName(group: WorkAssignedPlanGroup, activeView: WorkTasksChildView) {
  if (activeView === WORK_TASKS_COLLABORATION_VIEW_KEY) return group.arrangerEmployeeName || group.plan.ownerEmployeeName || "未设置";
  if (activeView === WORK_TASKS_ASSIGNED_VIEW_KEY) return group.assignerSpaceName || getWorkSpaceLabel(group.plan.targetType);
  return group.plan.ownerEmployeeName || "未设置负责人";
}

function assignedPlanGroupTitle(group: WorkAssignedPlanGroup) {
  if (group.plan.kind === "routine") return "日常工作";
  if (group.plan.periodType === "yearly") return "年度规划";
  return "目标计划";
}

function noop() {}
