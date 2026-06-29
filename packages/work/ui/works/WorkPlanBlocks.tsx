"use client";

import type { BodySurfaceSectionSpec, SelectorSurfaceProps } from "@workspace/core/ui";
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

export function createWorkPlanHeaderSection(plan: WorkPlan): BodySurfaceSectionSpec {
  const source = plan.sourceType === "project"
    ? [plan.linkedProjectName, plan.linkedProjectPhaseName, plan.linkedProjectTaskName].filter(Boolean).join(" / ")
    : plan.sourceType === "meeting"
      ? [plan.sourceMeetingTitle, plan.sourceMeetingDecisionTitle, plan.sourceMeetingActionCandidateTitle].filter(Boolean).join(" / ")
      : getWorkSourceTypeLabel(plan.sourceType);
  return {
    key: "plan-header",
    header: {
      title: plan.title,
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
