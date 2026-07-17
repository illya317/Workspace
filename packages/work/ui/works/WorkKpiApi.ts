"use client";

import { postJson, putJson, requestJson } from "@workspace/platform/ui/api-client";
import { submitWorkTaskSubmission, type WorkSubmissionMutationResult } from "./api";
import type { WorkPlan, WorkTarget } from "./types";
import type {
  WorkKpiDefinition,
  WorkKpiDefinitionDraft,
  WorkKpiResultsResponse,
  WorkKpiScorecard,
  WorkKpiScorecardEntry,
} from "./WorkKpiTypes";

export function listWorkKpiDefinitions(target: WorkTarget, ownerDepartmentId?: number | null) {
  const query = new URLSearchParams({ targetType: target.targetType, targetId: String(target.targetId) });
  if (ownerDepartmentId) query.set("ownerDepartmentId", String(ownerDepartmentId));
  return requestJson<{ definitions: WorkKpiDefinition[] }>(`/api/modules/work/tasks/kpi/definitions?${query.toString()}`, {
    fallbackMessage: "加载 KPI 指标库失败",
  });
}

export function saveWorkKpiDefinition(draft: WorkKpiDefinitionDraft) {
  const body = {
    code: draft.code,
    status: draft.status,
    name: draft.name,
    description: draft.description,
    displayType: draft.displayType,
    unit: draft.unit,
    direction: draft.direction,
    ownerDepartmentId: draft.ownerDepartmentId,
    scoringRule: draft.scoringRule,
  };
  return draft.id
    ? putJson<{ definition: WorkKpiDefinition }>(`/api/modules/work/tasks/kpi/definitions/${draft.id}`, body, "修订 KPI 指标失败")
    : postJson<{ definition: WorkKpiDefinition }>("/api/modules/work/tasks/kpi/definitions", body, "新增 KPI 指标失败");
}

export function getWorkKpiScorecard(planId: number) {
  return requestJson<WorkKpiScorecard>(`/api/modules/work/tasks/plans/${planId}/kpi-scorecard`, {
    fallbackMessage: "加载 KPI 计分卡失败",
  });
}

export function updateWorkKpiMeasurements(planId: number, entries: WorkKpiScorecardEntry[]) {
  return putJson<WorkKpiScorecard>(`/api/modules/work/tasks/plans/${planId}/kpi-measurements`, {
    measurements: entries.filter((entry) => entry.id && entry.version && entry.currentValue !== null).map((entry) => ({
      assignmentId: entry.id,
      version: entry.version,
      currentValue: entry.currentValue,
    })),
  }, "保存 KPI 实际值失败");
}

export function getWorkKpiResults(planId: number) {
  return requestJson<WorkKpiResultsResponse>(`/api/modules/work/tasks/plans/${planId}/kpi-results`, {
    fallbackMessage: "计算 KPI 结果失败",
  });
}

export async function finalizeWorkKpiScorecard(target: WorkTarget, plan: WorkPlan, entries: WorkKpiScorecardEntry[]) {
  const created = await postJson<WorkSubmissionMutationResult>("/api/modules/work/tasks/submissions", {
    entityType: "objective_plan",
    ...target,
    operation: "update",
    planId: plan.id,
    payload: {
      title: plan.title,
      expectedPlanGovernanceRevision: plan.governanceRevision,
      kpiScorecardEntries: scorecardPayload(entries),
    },
  }, "保存 KPI 计分卡失败");
  if (created.executionMode === "direct") return created;
  return submitWorkTaskSubmission(created.request.id, created.request.version);
}

export async function finalizeWorkKpiResults(target: WorkTarget, plan: WorkPlan, result: WorkKpiResultsResponse) {
  if (!result.workReport) throw new Error("请先生成包含该计划的考核结果表");
  const created = await postJson<WorkSubmissionMutationResult>("/api/modules/work/tasks/submissions", {
    entityType: "kr_review",
    ...target,
    operation: "update",
    planId: plan.id,
    payload: {
      title: plan.title,
      summary: `KPI 加权得分 ${formatNumber(result.weightedScore)}`,
      kpiResultCommit: { workReportId: result.workReport.id, adjustments: [] },
    },
  }, "确认 KPI 结果失败");
  if (created.executionMode === "direct") return created;
  return submitWorkTaskSubmission(created.request.id, created.request.version);
}

function scorecardPayload(entries: WorkKpiScorecardEntry[]) {
  return entries.map((entry) => ({
    id: entry.id,
    version: entry.version,
    definitionId: entry.definitionId,
    ownerEmployeeId: entry.ownerEmployeeId,
    objectiveWorkItemId: entry.objectiveWorkItemId,
    sourceAssignmentId: entry.sourceAssignmentId,
    relationKind: entry.relationKind,
    weight: entry.weight,
    baselineValue: entry.baselineValue,
    targetValue: entry.targetValue,
    targetLowerBound: entry.targetLowerBound,
    targetUpperBound: entry.targetUpperBound,
    scoringRule: entry.scoringRule,
  }));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value);
}
