"use client";

import type { PageSurfaceSectionSpec, SelectorSurfaceProps } from "@workspace/core/ui";
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

function planStatusClassName(status: WorkPlan["status"]) {
  if (status === "closed") return "bg-slate-100 text-slate-500";
  if (status === "archived") return "bg-amber-50 text-amber-700";
  return "bg-emerald-50 text-emerald-700";
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

export function createWorkPlanHeaderSection(plan: WorkPlan): PageSurfaceSectionSpec {
  const source = plan.sourceType === "project"
    ? [plan.linkedProjectName, plan.linkedProjectPhaseName, plan.linkedProjectTaskName].filter(Boolean).join(" / ")
    : plan.sourceType === "meeting"
      ? [plan.sourceMeetingTitle, plan.sourceMeetingDecisionTitle, plan.sourceMeetingActionCandidateTitle].filter(Boolean).join(" / ")
      : getWorkSourceTypeLabel(plan.sourceType);
  return {
    key: "plan-header",
    body: {
      kind: "section",
      surface: {
        kind: "panel" as const,
        title: plan.title,
        content: (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">OKR 计划</span>
              <span className={`rounded px-2 py-1 text-xs font-medium ${planStatusClassName(plan.status)}`}>{planStatusLabel(plan.status)}</span>
            </div>
            <div className="flex flex-wrap gap-3 text-sm text-slate-500">
              <span>{getWorkPeriodLabel(plan)}</span>
              <span>负责人：{plan.ownerEmployeeName || "未设置"}</span>
              <span>来源：{source || "未设置"}</span>
            </div>
            {plan.description ? <p className="whitespace-pre-wrap text-sm text-slate-600">{plan.description}</p> : null}
          </div>
        ),
      },
    },
  };
}
