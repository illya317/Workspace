"use client";

import { createFormSection, createMessageSection, createPanelSection } from "@workspace/core/ui";
import type { BodySurfaceCommandSpec, BodySurfaceSectionSpec, CreateSurfaceProps, FormSurfaceActionSpec, FormSurfaceProps, SelectorSurfaceProps } from "@workspace/core/ui";
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
  canDeletePlan,
  canSubmitPlanApproval,
  canSubmitObjectiveReview,
  canSubmitKrReview,
  canArchivePlan,
  canAdjustKrReview,
  krUnlocked,
  nodeCreating,
  nodeCreateInline,
  planSaveDisabled,
  planSubmitDisabled,
  krSubmitDisabled,
  planFormSurface,
  createSurfaceAnchor,
  workSections,
  plansLoading,
  hasCurrentSpacePlans,
  onArchivePlan,
  onDeletePlan,
  onSavePlan,
  onSubmitObjectiveReview,
  onSubmitKrReview,
  onToggleKrReviewLock,
}: {
  planCreating: boolean;
  globalCreate?: CreateSurfaceProps;
  sectionTitle: string;
  hideWorkSections: boolean;
  activePlan: WorkPlan | null;
  canEditPlan: boolean;
  canDeletePlan: boolean;
  canSubmitPlanApproval: boolean;
  canSubmitObjectiveReview: boolean;
  canSubmitKrReview: boolean;
  canArchivePlan: boolean;
  canAdjustKrReview: boolean;
  krUnlocked: boolean;
  nodeCreating: boolean;
  nodeCreateInline: boolean;
  planSaveDisabled: boolean;
  planSubmitDisabled: boolean;
  krSubmitDisabled: boolean;
  planFormSurface: FormSurfaceProps;
  createSurfaceAnchor?: string;
  workSections: BodySurfaceSectionSpec[];
  plansLoading: boolean;
  hasCurrentSpacePlans: boolean;
  onArchivePlan: () => void;
  onDeletePlan: () => void;
  onSavePlan: () => void;
  onSubmitObjectiveReview: () => void;
  onSubmitKrReview: () => void;
  onToggleKrReviewLock: () => void;
}): BodySurfaceSectionSpec {
  const canEditPlanDraft = canEditPlan || canSubmitPlanApproval || canSubmitObjectiveReview;
  const isRoutinePlan = activePlan?.kind === "routine";
  const planArchived = activePlan?.isArchived === true;
  const planActions = activePlan && (canEditPlanDraft || canArchivePlan) && !isRoutinePlan
      ? editablePlanCommands({
        canEditPlan,
        canDeletePlan,
        canSubmitPlanApproval,
        canSubmitObjectiveReview,
        canSubmitKrReview,
        canArchivePlan,
        planArchived,
        canAdjustKrReview,
        krUnlocked,
        planSaveDisabled,
        planSubmitDisabled,
        krSubmitDisabled,
        onArchivePlan,
        onDeletePlan,
        onSavePlan,
        onSubmitObjectiveReview,
        onSubmitKrReview,
        onToggleKrReviewLock,
      })
      : undefined;
  const showPlanForm = Boolean(activePlan && !isRoutinePlan && (canEditPlanDraft || canArchivePlan));
  return createPanelSection("tasks", {
    ...(showPlanForm ? {} : { title: sectionTitle }),
    sections: [
      ...(globalCreate ? [{
        key: "global-create",
        chrome: "plain" as const,
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
            canSubmitKrReview,
            canArchivePlan,
            planArchived,
            canAdjustKrReview,
            krUnlocked,
            nodeCreating,
            krSubmitDisabled,
            onArchivePlan,
            onDeletePlan,
            onSubmitKrReview,
            onToggleKrReviewLock,
          })),
        ]),
        ...(nodeCreating && !nodeCreateInline && !hideWorkSections ? [
          {
            key: "create-task",
            chrome: "plain" as const,
            body: { kind: "create-anchor" as const, anchor: createSurfaceAnchor ?? "work-node-create" },
          },
        ] : []),
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
  canSubmitKrReview,
  canArchivePlan,
  planArchived,
  canAdjustKrReview,
  krUnlocked,
  nodeCreating,
  krSubmitDisabled,
  onArchivePlan,
  onDeletePlan,
  onSubmitKrReview,
  onToggleKrReviewLock,
}: {
  canDeletePlan: boolean;
  canSubmitKrReview: boolean;
  canArchivePlan: boolean;
  planArchived: boolean;
  canAdjustKrReview: boolean;
  krUnlocked: boolean;
  nodeCreating: boolean;
  krSubmitDisabled: boolean;
  onArchivePlan: () => void;
  onDeletePlan: () => void;
  onSubmitKrReview: () => void;
  onToggleKrReviewLock: () => void;
}): BodySurfaceCommandSpec[] | undefined {
  if (nodeCreating) return undefined;
  const actions: BodySurfaceCommandSpec[] = [];
  if (canAdjustKrReview) {
    actions.push(
      { key: "toggle-kr-lock", label: krUnlocked ? "锁定KR" : "解锁KR", icon: krUnlocked ? "lock" : "unlock", variant: "secondary", onClick: onToggleKrReviewLock },
    );
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
  canEditPlan,
  canDeletePlan,
  canSubmitPlanApproval,
  canSubmitObjectiveReview,
  canSubmitKrReview,
  canArchivePlan,
  planArchived,
  canAdjustKrReview,
  krUnlocked,
  planSaveDisabled,
  planSubmitDisabled,
  krSubmitDisabled,
  onArchivePlan,
  onDeletePlan,
  onSavePlan,
  onSubmitObjectiveReview,
  onSubmitKrReview,
  onToggleKrReviewLock,
}: {
  canEditPlan: boolean;
  canDeletePlan: boolean;
  canSubmitPlanApproval: boolean;
  canSubmitObjectiveReview: boolean;
  canSubmitKrReview: boolean;
  canArchivePlan: boolean;
  planArchived: boolean;
  canAdjustKrReview: boolean;
  krUnlocked: boolean;
  planSaveDisabled: boolean;
  planSubmitDisabled: boolean;
  krSubmitDisabled: boolean;
  onArchivePlan: () => void;
  onDeletePlan: () => void;
  onSavePlan: () => void;
  onSubmitObjectiveReview: () => void;
  onSubmitKrReview: () => void;
  onToggleKrReviewLock: () => void;
}): FormSurfaceActionSpec[] {
  return [
    ...(canEditPlan || canSubmitPlanApproval
      ? [{ key: "save-plan", action: canSubmitPlanApproval ? "revise" as const : "save" as const, label: canSubmitPlanApproval ? "提交修订" : "保存计划修改", disabled: planSaveDisabled, onClick: onSavePlan }]
      : []),
    ...(canArchivePlan
      ? [{ key: planArchived ? "restore-plan" : "archive-plan", action: planArchived ? "unarchive" as const : "archive" as const, label: planArchived ? "恢复计划" : "归档计划", onClick: onArchivePlan }]
      : []),
    ...(canSubmitObjectiveReview
      ? [{ key: "submit-objective", action: "submit" as const, label: "提交目标审查", disabled: planSubmitDisabled, onClick: onSubmitObjectiveReview }]
      : []),
    ...(canAdjustKrReview
      ? [
          { key: "toggle-kr-lock", action: krUnlocked ? "lock" as const : "unlock" as const, label: krUnlocked ? "锁定KR" : "解锁KR", onClick: onToggleKrReviewLock },
        ]
      : []),
    ...(canSubmitKrReview
      ? [{ key: "submit-kr", action: "submit" as const, label: SUBMIT_WORK_REPORT_LABEL, disabled: krSubmitDisabled, onClick: onSubmitKrReview }]
      : []),
    ...(canDeletePlan
      ? [{ key: "delete-plan", action: "delete" as const, label: "删除计划", onClick: onDeletePlan }]
      : []),
  ];
}
