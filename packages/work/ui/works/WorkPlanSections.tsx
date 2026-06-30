"use client";

import { createFormSection, createMessageSection, createSectionSection } from "@workspace/core/ui";
import type { BodySurfaceCommandSpec, BodySurfaceSectionSpec, FormSurfaceProps, SelectorSurfaceProps } from "@workspace/core/ui";
import { getWorkPeriodLabel, getWorkSourceTypeLabel, getWorkSpaceLabel } from "./model";
import type { WorkPlan, WorkTaskSpace, WorkTarget } from "./types";

function targetKey(target: WorkTarget) {
  return `${target.targetType}:${target.targetId}`;
}

function planStatusLabel(status: WorkPlan["status"]) {
  if (status === "closed") return "已关闭";
  if (status === "archived") return "已归档";
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
    title: "OKR 计划",
    loading: plansLoading,
    loadingText: "加载中...",
    emptyText: "暂无 OKR 计划",
    items: plans,
    selectedId: activePlanId,
    onSelect,
    getKey: (plan: WorkPlan) => plan.id,
    renderItem: (plan: WorkPlan) => ({
      title: plan.title,
      code: planStatusLabel(plan.status),
      subtitle: `${getWorkPeriodLabel(plan)} · ${spaceSubtitleForPlan(plan, spacesByKey)}`,
      trailing: plan.itemCount,
      meta: [
        "OKR",
        spaceLabelForPlan(plan, spacesByKey),
        plan.ownerEmployeeName || "未设置负责人",
        plan.linkedProjectTaskName || plan.linkedProjectName || getWorkSourceTypeLabel(plan.sourceType),
      ].filter(Boolean),
      archived: plan.status === "archived",
    }),
  };
}

export function createWorkPlanHeaderSection(plan: WorkPlan, actions?: BodySurfaceCommandSpec[]): BodySurfaceSectionSpec {
  const source = plan.sourceType === "project"
    ? [plan.linkedProjectName, plan.linkedProjectPhaseName, plan.linkedProjectTaskName].filter(Boolean).join(" / ")
    : plan.sourceType === "meeting"
      ? [plan.sourceMeetingTitle, plan.sourceMeetingDecisionTitle, plan.sourceMeetingActionCandidateTitle].filter(Boolean).join(" / ")
      : getWorkSourceTypeLabel(plan.sourceType);
  return {
    key: "plan-header",
    header: {
      title: plan.title,
      actions,
      badges: [
        { key: "type", label: "OKR 计划", tone: "success" },
        {
          key: "status",
          label: planStatusLabel(plan.status),
          tone: plan.status === "closed" ? "muted" : plan.status === "archived" ? "warning" : "success",
        },
      ],
    },
    body: {
      kind: "form",
      form: {
        kind: "detail",
        content: {
          layout: { columns: 3 },
          items: [
            { kind: "readonly", key: "period", label: "周期", value: getWorkPeriodLabel(plan) },
            { kind: "readonly", key: "owner", label: "负责人", value: plan.ownerEmployeeName || "未设置" },
            { kind: "readonly", key: "source", label: "来源", value: source || "未设置" },
            { kind: "readonly", key: "description", label: "描述", span: "wide", value: plan.description || "未填写" },
          ],
        },
      },
    },
  };
}

export function createWorkPlanContentSection({
  planCreating,
  planEditing,
  activePlan,
  canEditPlan,
  canDeletePlan,
  nodeCreating,
  createNodeDisabled,
  nodeSaveDisabled,
  planSaveDisabled,
  planFormSurface,
  createTaskSurface,
  taskTableSection,
  plansLoading,
  hasCurrentSpacePlans,
  onCreateNode,
  onEditPlan,
  onArchivePlan,
  onDeletePlan,
  onSavePlan,
  onCancelPlanEdit,
  onSaveNode,
  onCancelNodeCreate,
}: {
  planCreating: boolean;
  planEditing: boolean;
  activePlan: WorkPlan | null;
  canEditPlan: boolean;
  canDeletePlan: boolean;
  nodeCreating: boolean;
  createNodeDisabled: boolean;
  nodeSaveDisabled: boolean;
  planSaveDisabled: boolean;
  planFormSurface: FormSurfaceProps;
  createTaskSurface: FormSurfaceProps;
  taskTableSection: BodySurfaceSectionSpec;
  plansLoading: boolean;
  hasCurrentSpacePlans: boolean;
  onCreateNode: () => void;
  onEditPlan: () => void;
  onArchivePlan: () => void;
  onDeletePlan: () => void;
  onSavePlan: () => void;
  onCancelPlanEdit: () => void;
  onSaveNode: () => void;
  onCancelNodeCreate: () => void;
}): BodySurfaceSectionSpec {
  return createSectionSection("tasks", {
    title: "OKR 计划",
    sections: [
      ...(planCreating ? [createFormSection("plan-form", planFormSurface)] : []),
      ...(!planCreating && activePlan ? [
        createWorkPlanHeaderSection(activePlan, createWorkPlanHeaderActions({
          canEditPlan,
          canDeletePlan,
          planEditing,
          nodeCreating,
          createNodeDisabled,
          nodeSaveDisabled,
          planSaveDisabled,
          onCreateNode,
          onEditPlan,
          onArchivePlan,
          onDeletePlan,
          onSavePlan,
          onCancelPlanEdit,
          onSaveNode,
          onCancelNodeCreate,
        })),
        ...(planEditing ? [createFormSection("plan-form", planFormSurface)] : []),
        ...(!planEditing && nodeCreating ? [createFormSection("create-task", createTaskSurface)] : []),
        ...(!planEditing ? [taskTableSection] : []),
      ] : !planCreating ? [createMessageSection("no-plan", {
        content: plansLoading ? "加载 OKR 计划中..." : hasCurrentSpacePlans ? "展开左侧工作空间，选择一个 OKR 计划。" : "请先新建 OKR 计划，再添加目标、关键结果和子任务。",
        tone: "muted" as const,
      })] : []),
    ],
  });
}

function createWorkPlanHeaderActions({
  canEditPlan,
  canDeletePlan,
  planEditing,
  nodeCreating,
  createNodeDisabled,
  nodeSaveDisabled,
  planSaveDisabled,
  onCreateNode,
  onEditPlan,
  onArchivePlan,
  onDeletePlan,
  onSavePlan,
  onCancelPlanEdit,
  onSaveNode,
  onCancelNodeCreate,
}: {
  canEditPlan: boolean;
  canDeletePlan: boolean;
  planEditing: boolean;
  nodeCreating: boolean;
  createNodeDisabled: boolean;
  nodeSaveDisabled: boolean;
  planSaveDisabled: boolean;
  onCreateNode: () => void;
  onEditPlan: () => void;
  onArchivePlan: () => void;
  onDeletePlan: () => void;
  onSavePlan: () => void;
  onCancelPlanEdit: () => void;
  onSaveNode: () => void;
  onCancelNodeCreate: () => void;
}): BodySurfaceCommandSpec[] | undefined {
  if (planEditing) return [
    { key: "save-plan", label: "保存计划修改", icon: "check", variant: "primary", disabled: planSaveDisabled, onClick: onSavePlan },
    { key: "cancel-plan", label: "取消计划编辑", icon: "cancel", variant: "secondary", onClick: onCancelPlanEdit },
  ];
  if (nodeCreating) return [
    { key: "save-node", label: "保存节点", icon: "check", variant: "primary", disabled: nodeSaveDisabled, onClick: onSaveNode },
    { key: "cancel-node", label: "取消新增", icon: "cancel", variant: "secondary", onClick: onCancelNodeCreate },
  ];
  const actions: BodySurfaceCommandSpec[] = [];
  if (canEditPlan) {
    actions.push(
      { key: "create-node", label: "新增节点", icon: "add", variant: "primary", disabled: createNodeDisabled, onClick: onCreateNode },
      { key: "edit-plan", label: "编辑计划", icon: "edit", variant: "secondary", onClick: onEditPlan },
    );
  }
  if (canDeletePlan) {
    actions.push(
      { key: "archive-plan", label: "归档计划", icon: "archive", variant: "secondary", onClick: onArchivePlan },
      { key: "delete-plan", label: "删除计划", icon: "delete-bin", variant: "danger", onClick: onDeletePlan },
    );
  }
  return actions.length ? actions : undefined;
}
