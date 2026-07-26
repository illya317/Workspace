"use client";

import { createFormSection, createMessageSection, createPanelSection } from "@workspace/core/ui";
import type { BodySurfaceCommandSpec, BodySurfaceSectionSpec, CreateSurfaceToolbarProps, FormSurfaceActionSpec, FormSurfaceProps, SelectorSurfaceProps } from "@workspace/core/ui";
import { formatWorkDate, getWorkPeriodLabel, getWorkPlanKindLabel, getWorkSourceTypeLabel, getWorkSpaceLabel } from "./model";
import { shouldShowWorkOwner } from "./work-target-presentation";
import type { WorkPlan, WorkTaskSpace, WorkTarget } from "./types";

function targetKey(target: WorkTarget) {
  return `${target.targetType}:${target.targetId}`;
}

const SUBMIT_WORK_REPORT_LABEL = "提交考核结果";

function planStatusLabel(status: WorkPlan["status"], isArchived: boolean) {
  if (isArchived) return "已归档";
  if (status === "done") return "已完成";
  return "进行中";
}

function spaceLabelForPlan(plan: WorkPlan, spacesByKey?: ReadonlyMap<string, WorkTaskSpace>) {
  const space = spacesByKey?.get(targetKey(plan));
  return space?.name || getWorkSpaceLabel(plan.targetType);
}

function spaceSubtitleForPlan(plan: WorkPlan, spacesByKey?: ReadonlyMap<string, WorkTaskSpace>) {
  const space = spacesByKey?.get(targetKey(plan));
  return space?.subtitle || getWorkSpaceLabel(plan.targetType);
}

export function createWorkPlanSelector({
  plans,
  activePlanId,
  plansLoading,
  spacesByKey,
  onSelect,
}: {
  plans: WorkPlan[];
  activePlanId: number | null;
  plansLoading: boolean;
  spacesByKey?: ReadonlyMap<string, WorkTaskSpace>;
  onSelect: (plan: WorkPlan) => void;
}): SelectorSurfaceProps<WorkPlan> {
  return {
    kind: "list",
    title: "工作计划",
    loading: plansLoading,
    loadingText: "加载中...",
    emptyText: "暂无工作计划",
    items: plans.map((plan) => ({
      key: plan.id,
      value: plan,
      card: {
        title: plan.title,
        code: getWorkPlanKindLabel(plan.kind),
        subtitle: `${getWorkPeriodLabel(plan)} · ${spaceSubtitleForPlan(plan, spacesByKey)}`,
        trailing: plan.itemCount,
        meta: [
          getWorkPlanKindLabel(plan.kind),
          spaceLabelForPlan(plan, spacesByKey),
          shouldShowWorkOwner(plan) ? plan.ownerEmployeeName || "未设置负责人" : null,
          plan.linkedProjectPhaseName || plan.linkedProjectName || plan.sourcePlanTitle || plan.sourceDepartmentName || getWorkSourceTypeLabel(plan.sourceType === "meeting" ? "other" : plan.sourceType),
        ].filter((item): item is string => Boolean(item)),
        archived: plan.isArchived,
      },
    })),
    selectedId: activePlanId,
    onSelect,
  };
}

function workPlanHeaderSection(plan: WorkPlan, actions?: BodySurfaceCommandSpec[]): BodySurfaceSectionSpec {
  const source = plan.sourceType === "project"
    ? [plan.linkedProjectName, plan.linkedProjectPhaseName].filter(Boolean).join(" / ")
    : plan.sourceType === "department"
      ? [plan.sourcePlanTitle, plan.sourcePlanCycleLabel].filter(Boolean).join(" / ") || [plan.sourceDepartmentName, plan.sourceDepartmentCode].filter(Boolean).join(" / ")
      : getWorkSourceTypeLabel(plan.sourceType === "meeting" ? "other" : plan.sourceType);
  const alignmentSource = planAlignmentSourceLabel(plan);
  const alignmentLabel = planAlignmentRelationLabel(plan);
  return {
    key: "plan-header",
    body: {
      kind: "section",
      list: {
        presentation: "list",
        items: [{
          key: "plan-readonly",
          title: plan.title,
          description: plan.description || undefined,
          badges: [
            { key: "type", label: getWorkPlanKindLabel(plan.kind), tone: plan.kind === "okr" ? "success" : "default" },
            {
              key: "status",
              label: planStatusLabel(plan.status, plan.isArchived),
              tone: plan.isArchived ? "warning" : plan.status === "done" ? "muted" : "success",
            },
            ...(plan.kind === "okr" ? (plan.governance?.badges ?? [])
              .filter((badge) => badge.key !== "archived")
              .map((badge) => ({
                key: `governance-${badge.key}`,
                label: badge.label,
                tone: badge.key === "free_edit" ? "success" as const
                  : badge.key === "readonly" ? "muted" as const
                    : "warning" as const,
              })) : []),
          ],
          actions,
          meta: (
            <div className="flex min-w-0 flex-wrap gap-x-4 gap-y-1">
              <span>{plan.kind === "okr" ? "计划" : "范围"}：{plan.kind === "okr" ? scheduleRange(plan.plannedStartDate, plan.plannedEndDate) : getWorkPeriodLabel(plan)}</span>
              {plan.kind === "okr" ? <span>实际：{getWorkPeriodLabel(plan)}</span> : null}
              {plan.kind === "okr" && plan.isMilestone ? <span>里程碑：{formatWorkDate(plan.milestoneDate) || "未设置"}</span> : null}
              {shouldShowWorkOwner(plan) ? <span>负责人：{plan.ownerEmployeeName || "未设置"}</span> : null}
              <span>{plan.kind === "okr" ? alignmentLabel : "来源"}：{plan.kind === "okr" ? alignmentSource || "未设置" : source || "未设置"}</span>
            </div>
          ),
        }],
      },
    },
  };
}

function planAlignmentSourceLabel(plan: WorkPlan) {
  if (plan.alignmentSourceType === "plan") return [plan.alignmentSourcePlanTitle, plan.alignmentSourcePlanCycleLabel].filter(Boolean).join(" / ");
  if (plan.alignmentSourceType === "objective" || plan.alignmentSourceType === "key_result") {
    const typeLabel = plan.alignmentSourceType === "key_result" ? "KR" : "目标";
    const metric = plan.alignmentSourceWorkItemKrTargetValue === null ? null : `目标 ${plan.alignmentSourceWorkItemKrTargetValue}${plan.alignmentSourceWorkItemKrUnit || ""}`;
    return [typeLabel, plan.alignmentSourceWorkItemContent, plan.alignmentSourceWorkItemCycleLabel, metric].filter(Boolean).join(" / ");
  }
  return "";
}

function planAlignmentRelationLabel(plan: WorkPlan) {
  if (plan.alignmentSourceType === "plan" && plan.alignmentSourcePlanId) {
    return plan.alignmentSourcePlanTargetType && (plan.alignmentSourcePlanTargetType !== plan.targetType || plan.alignmentSourcePlanTargetId !== plan.targetId) ? "对齐到" : "上级";
  }
  if ((plan.alignmentSourceType === "objective" || plan.alignmentSourceType === "key_result") && plan.alignmentSourceWorkItemId) {
    return plan.alignmentSourceWorkItemTargetType && (plan.alignmentSourceWorkItemTargetType !== plan.targetType || plan.alignmentSourceWorkItemTargetId !== plan.targetId) ? "对齐到" : "上级";
  }
  return "对齐到";
}

function scheduleRange(startDate: string | null, endDate: string | null) {
  const start = formatWorkDate(startDate);
  const end = formatWorkDate(endDate);
  if (start && end) return `${start} - ${end}`;
  return start || end || "未设置";
}

export function createWorkPlanContentSection({
  planCreating,
  globalCreate,
  sectionTitle,
  hideWorkSections,
  activePlan,
  canEditPlan,
  planEditing,
  planSaveActions,
  canDeletePlan,
  canSubmitObjectiveReview,
  canSubmitKrReview,
  canArchivePlan,
  nodeCreating,
  planSubmitDisabled,
  krSubmitDisabled,
  planFormSurface,
  workSections,
  plansLoading,
  hasCurrentSpacePlans,
  onArchivePlan,
  onDeletePlan,
  onEditPlan,
  onCancelPlanEdit,
  onSubmitObjectiveReview,
  onSubmitKrReview,
}: {
  planCreating: boolean;
  globalCreate?: CreateSurfaceToolbarProps;
  sectionTitle: string;
  hideWorkSections: boolean;
  activePlan: WorkPlan | null;
  canEditPlan: boolean;
  planEditing: boolean;
  planSaveActions: FormSurfaceActionSpec[];
  canDeletePlan: boolean;
  canSubmitObjectiveReview: boolean;
  canSubmitKrReview: boolean;
  canArchivePlan: boolean;
  nodeCreating: boolean;
  planSubmitDisabled: boolean;
  krSubmitDisabled: boolean;
  planFormSurface: FormSurfaceProps;
  workSections: BodySurfaceSectionSpec[];
  plansLoading: boolean;
  hasCurrentSpacePlans: boolean;
  onArchivePlan: () => void;
  onDeletePlan: () => void;
  onEditPlan: () => void;
  onCancelPlanEdit: () => void;
  onSubmitObjectiveReview: () => void;
  onSubmitKrReview: () => void;
}): BodySurfaceSectionSpec {
  const canSavePlan = planSaveActions.length > 0;
  const isRoutinePlan = activePlan?.kind === "routine";
  const planArchived = activePlan?.isArchived === true;
  const planActions = activePlan && planEditing && !isRoutinePlan
      ? editablePlanCommands({
        planSaveActions,
        planEditing,
        canDeletePlan,
        canArchivePlan,
        planArchived,
        onArchivePlan,
        onDeletePlan,
        onCancelPlanEdit,
      })
      : undefined;
  const showPlanForm = Boolean(activePlan && !isRoutinePlan && planEditing);
  const showGlobalCreate = Boolean(globalCreate?.open && !showPlanForm);
  return createPanelSection("tasks", {
    ...(showPlanForm || showGlobalCreate ? {} : { title: sectionTitle }),
    sections: [
      ...(globalCreate && !showPlanForm ? [{
        key: "global-create",
        body: { kind: "create" as const, create: globalCreate },
      }] : []),
      ...(showPlanForm ? [createFormSection("plan-form", {
        ...planFormSurface,
        header: { title: sectionTitle },
        actions: planActions,
      })] : []),
      ...(!planCreating && activePlan ? [
        ...(isRoutinePlan || showPlanForm ? [] : [
          workPlanHeaderSection(activePlan, workPlanHeaderActions({
            canDeletePlan,
            canSubmitObjectiveReview,
            canSubmitKrReview,
            canEditPlan: canSavePlan && !planArchived && Boolean(activePlan.governance
              ? canEditPlan
              : canEditPlan || activePlan.status === "done" || activePlan.objectiveApprovedAt),
            revisionEntry: activePlan.governance
              ? activePlan.governance.facets.target.action?.runtime.executionMode === "workflow"
                && activePlan.governance.facets.target.action.kind === "objective_revise"
              : Boolean(activePlan.objectiveApprovedAt || activePlan.status === "done"),
            canArchivePlan,
            planArchived,
            nodeCreating,
            krSubmitDisabled,
            planSubmitDisabled,
            onArchivePlan,
            onDeletePlan,
            onSubmitKrReview,
            onSubmitObjectiveReview,
            onEditPlan,
          })),
        ]),
        ...(hideWorkSections ? [] : workSections),
      ] : !planCreating ? [createMessageSection("no-plan", {
        content: plansLoading ? "加载工作计划中..." : hasCurrentSpacePlans ? "展开左侧工作空间，选择一个工作计划。" : "请先新建工作计划。",
        tone: "muted" as const,
      })] : []),
    ],
  });
}

function workPlanHeaderActions({
  canDeletePlan,
  canSubmitObjectiveReview,
  canSubmitKrReview,
  canEditPlan,
  revisionEntry,
  canArchivePlan,
  planArchived,
  nodeCreating,
  krSubmitDisabled,
  planSubmitDisabled,
  onArchivePlan,
  onDeletePlan,
  onSubmitKrReview,
  onSubmitObjectiveReview,
  onEditPlan,
}: {
  canDeletePlan: boolean;
  canSubmitObjectiveReview: boolean;
  canSubmitKrReview: boolean;
  canEditPlan: boolean;
  revisionEntry: boolean;
  canArchivePlan: boolean;
  planArchived: boolean;
  nodeCreating: boolean;
  krSubmitDisabled: boolean;
  planSubmitDisabled: boolean;
  onArchivePlan: () => void;
  onDeletePlan: () => void;
  onSubmitKrReview: () => void;
  onSubmitObjectiveReview: () => void;
  onEditPlan: () => void;
}): BodySurfaceCommandSpec[] | undefined {
  if (nodeCreating) return undefined;
  const actions: BodySurfaceCommandSpec[] = [];
  if (canEditPlan) {
    actions.push({
      key: revisionEntry ? "revise-plan" : "edit-plan",
      label: revisionEntry ? "修订" : "编辑",
      icon: revisionEntry ? "revise" : "edit",
      variant: "secondary",
      onClick: onEditPlan,
    });
  }
  if (canSubmitObjectiveReview) {
    actions.push({ key: "submit-objective", label: "提交目标审查", icon: "send", variant: "primary", disabled: planSubmitDisabled, onClick: onSubmitObjectiveReview });
  }
  if (canSubmitKrReview) {
    actions.push(
      { key: "submit-kr", label: SUBMIT_WORK_REPORT_LABEL, icon: "send", variant: "primary", disabled: krSubmitDisabled, onClick: onSubmitKrReview },
    );
  }
  if (canArchivePlan) {
    actions.push(
      { key: planArchived ? "restore-plan" : "archive-plan", label: planArchived ? "恢复计划" : "归档计划", icon: planArchived ? "restore" : "archive", variant: "secondary", onClick: onArchivePlan },
    );
  }
  if (canDeletePlan) {
    actions.push(
      { key: "delete-plan", label: "删除计划", icon: "delete-bin", variant: "danger", onClick: onDeletePlan },
    );
  }
  return actions.length ? actions : undefined;
}

function editablePlanCommands({
  planSaveActions,
  planEditing,
  canDeletePlan,
  canArchivePlan,
  planArchived,
  onArchivePlan,
  onDeletePlan,
  onCancelPlanEdit,
}: {
  planSaveActions: FormSurfaceActionSpec[];
  planEditing: boolean;
  canDeletePlan: boolean;
  canArchivePlan: boolean;
  planArchived: boolean;
  onArchivePlan: () => void;
  onDeletePlan: () => void;
  onCancelPlanEdit: () => void;
}): FormSurfaceActionSpec[] {
  return [
    ...(planEditing
      ? [{ key: "cancel-plan-edit", action: "cancel" as const, label: "取消", onClick: onCancelPlanEdit }]
      : []),
    ...planSaveActions,
    ...(canArchivePlan
      ? [{ key: planArchived ? "restore-plan" : "archive-plan", action: planArchived ? "unarchive" as const : "archive" as const, label: planArchived ? "恢复计划" : "归档计划", onClick: onArchivePlan }]
      : []),
    ...(canDeletePlan
      ? [{ key: "delete-plan", action: "delete" as const, label: "删除计划", onClick: onDeletePlan }]
      : []),
  ];
}
