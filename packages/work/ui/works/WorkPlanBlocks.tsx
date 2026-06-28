"use client";

import type { PageSurfaceBlockSpec } from "@workspace/core/ui";
import { getWorkPeriodLabel, getWorkSourceTypeLabel } from "./model";
import type { WorkPlan } from "./types";

export function createWorkPlanSelectorBlock({
  plans,
  activePlanId,
  plansLoading,
  onSelect,
}: {
  plans: WorkPlan[];
  activePlanId: number | null;
  plansLoading: boolean;
  onSelect: (plan: WorkPlan) => void;
}): PageSurfaceBlockSpec {
  return {
    kind: "navigation" as const,
    key: "plan-list",
    surface: {
      kind: "selector" as const,
      selector: {
        title: "OKR 计划",
        bodyClassName: "max-h-[calc(100vh-18rem)] overflow-y-auto p-2",
        loading: plansLoading,
        loadingText: "加载中...",
        emptyText: "暂无 OKR 计划",
        items: plans,
        selectedId: activePlanId,
        onSelect,
        getKey: (plan: WorkPlan) => plan.id,
        contentClassName: "space-y-2",
        renderItem: (plan: WorkPlan) => ({
          title: plan.title,
          subtitle: getWorkPeriodLabel(plan),
          trailing: <span className="shrink-0 rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{plan.itemCount}</span>,
          meta: [plan.ownerEmployeeName || "未设置负责人", plan.linkedProjectTaskName || plan.linkedProjectName || getWorkSourceTypeLabel(plan.sourceType)].filter(Boolean),
        }),
      },
    },
  };
}

export function PlanHeader({ plan }: { plan: WorkPlan }) {
  const source = plan.sourceType === "project"
    ? [plan.linkedProjectName, plan.linkedProjectPhaseName, plan.linkedProjectTaskName].filter(Boolean).join(" / ")
    : plan.sourceType === "meeting"
      ? [plan.sourceMeetingTitle, plan.sourceMeetingDecisionTitle, plan.sourceMeetingActionCandidateTitle].filter(Boolean).join(" / ")
      : getWorkSourceTypeLabel(plan.sourceType);
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="rounded bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">OKR 计划</span>
            <span className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">{plan.status === "closed" ? "已关闭" : plan.status === "archived" ? "已归档" : "进行中"}</span>
          </div>
          <h2 className="truncate text-xl font-semibold text-slate-950">{plan.title}</h2>
          <div className="mt-2 flex flex-wrap gap-3 text-sm text-slate-500">
            <span>{getWorkPeriodLabel(plan)}</span>
            <span>负责人：{plan.ownerEmployeeName || "未设置"}</span>
            <span>来源：{source || "未设置"}</span>
          </div>
          {plan.description && <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600">{plan.description}</p>}
        </div>
      </div>
    </div>
  );
}
