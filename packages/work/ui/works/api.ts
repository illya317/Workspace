import { workspacePath } from "@workspace/core/routing";
import type {
  WorkItem,
  WorkAssignedPlanGroup,
  WorkItemDraft,
  WorkPlan,
  WorkPlanDraft,
  WorkOkrControlResponse,
  WorkOkrPeriodType,
  WorkReportCollectionResponse,
  WorkReportDraftResponse,
  WorkReportItem,
  WorkTaskApprovalRequest,
  WorkTaskSpace,
  WorkTarget,
} from "./types";
import type { WorkPeriodCollectionResponse } from "./period-collection-types";
import { workDraftPayload, workPlanDraftPayload } from "./model";
import { workReportItemsPayload, type WorkReportStage } from "./WorkReportPayload";

export const WORK_REFERENCE_OPTIONS_ENDPOINT = "/api/modules/work/tasks/reference-options";

export type WorkItemMutationResult =
  | { executionMode: "direct"; work: WorkItem }
  | { executionMode: "workflow"; request: WorkTaskApprovalRequest };

export type WorkPeriodScheduleCreateResult = {
  planId: number;
  workId: number;
  plan: WorkPlan;
  item: WorkItem;
  planCycleId: number;
  planCycleLabel: string;
  overlapCycleIds: number[];
  planOverlapCycleIds: number[];
};

export type WorkPeriodScheduleMutationResult =
  | { executionMode: "direct"; schedule: WorkPeriodScheduleCreateResult }
  | { executionMode: "workflow"; request: WorkTaskApprovalRequest };

export type WorkSubmissionMutationResult =
  | { executionMode: "direct"; result: { entityType: string; entityId: string | number } }
  | { executionMode: "workflow"; request: WorkTaskApprovalRequest };

async function readJson<T>(response: Response, fallbackError: string): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || fallbackError);
  return data as T;
}

export async function listTaskSpaces() {
  const response = await fetch(workspacePath("/api/modules/work/tasks/spaces"));
  const data = await readJson<{ spaces?: WorkTaskSpace[]; preferredDepartmentIds?: number[]; preferredProjectIds?: number[] }>(response, "加载工作空间失败");
  return {
    spaces: data.spaces || [],
    preferredDepartmentIds: data.preferredDepartmentIds || [],
    preferredProjectIds: data.preferredProjectIds || [],
  };
}

export async function listWorkPlans(target: WorkTarget) {
  const params = new URLSearchParams({
    targetType: target.targetType,
    targetId: String(target.targetId),
    includeArchived: "true",
  });
  const response = await fetch(workspacePath(`/api/modules/work/tasks/plans?${params.toString()}`));
  const data = await readJson<{ plans?: WorkPlan[] }>(response, "加载工作计划失败");
  return data.plans || [];
}

export async function listWorkOkrCycleOptions() {
  const data = await getWorkOkrControlResponse();
  return data.cycles || [];
}

export async function getWorkOkrControlResponse() {
  const response = await fetch(workspacePath("/api/modules/work/tasks/okr-control"));
  return readJson<WorkOkrControlResponse>(response, "加载 OKR 周期失败");
}

export async function createWorkPlan(target: WorkTarget, draft: WorkPlanDraft) {
  const response = await fetch(workspacePath("/api/modules/work/tasks/plans"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...workPlanDraftPayload(draft), ...target }),
  });
  return readJson<{ plan: WorkPlan }>(response, "新建工作计划失败");
}

export async function updateWorkPlan(id: number, draft: WorkPlanDraft) {
  const response = await fetch(workspacePath(`/api/modules/work/tasks/plans/${id}`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(workPlanDraftPayload(draft)),
  });
  return readJson<{ plan: WorkPlan }>(response, "保存工作计划失败");
}

export async function archiveWorkPlan(id: number) {
  const response = await fetch(workspacePath(`/api/modules/work/tasks/plans/${id}`), { method: "DELETE" });
  return readJson<{ success: true }>(response, "归档工作计划失败");
}

export async function deleteWorkPlan(id: number) {
  const response = await fetch(workspacePath(`/api/modules/work/tasks/plans/${id}/delete`), { method: "DELETE" });
  return readJson<{ success: true }>(response, "删除工作计划失败");
}

export async function listWorkItems(target: WorkTarget, planId: number | null) {
  const params = new URLSearchParams({
    targetType: target.targetType,
    targetId: String(target.targetId),
    includeArchived: "true",
  });
  if (planId) params.set("planId", String(planId));
  const response = await fetch(workspacePath(`/api/modules/work/tasks?${params.toString()}`));
  const data = await readJson<{ works?: WorkItem[] }>(response, "加载工作计划失败");
  return data.works || [];
}

export async function fetchWorkPeriodCollection(
  target: WorkTarget,
  cycleId: number,
  options: { displayPeriodType?: WorkOkrPeriodType | null; includeItems?: boolean } = {},
) {
  const params = new URLSearchParams({
    targetType: target.targetType,
    targetId: String(target.targetId),
    cycleId: String(cycleId),
  });
  if (options.displayPeriodType) params.set("displayPeriodType", options.displayPeriodType);
  if (options.includeItems) params.set("includeItems", "true");
  const response = await fetch(workspacePath(`/api/modules/work/tasks/period-collection?${params.toString()}`));
  return readJson<WorkPeriodCollectionResponse>(response, "加载时间安排失败");
}

export async function postWorkPeriodScheduleItem(input: {
  rootPlanId: number;
  cycleId: number;
  sourceItemId: number;
  itemType: "objective" | "key_result";
  content: string;
  description?: string | null;
  status?: string | null;
  importance?: number | null;
  urgency?: number | null;
  ownerEmployeeId?: number | null;
  actualStartDate?: string | null;
  actualEndDate?: string | null;
  plannedStartDate?: string | null;
  plannedEndDate?: string | null;
  responsibilityPositionId?: number | null;
  responsibilityNodeId?: number | null;
  krUnit?: string | null;
}) {
  const response = await fetch(workspacePath("/api/modules/work/tasks/period-schedule"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return readJson<WorkPeriodScheduleMutationResult>(response, "新增时间安排失败");
}

export async function listAssignedDepartmentWorkItems() {
  const response = await fetch(workspacePath("/api/modules/work/tasks/assigned"));
  const data = await readJson<{ works?: WorkItem[] }>(response, "加载负责事项失败");
  return data.works || [];
}

export async function listAssignedWorkItems() {
  const response = await fetch(workspacePath("/api/modules/work/tasks/assigned"));
  return readJson<{ works?: WorkItem[]; collaborationWorks?: WorkItem[]; planGroups?: WorkAssignedPlanGroup[]; collaborationPlanGroups?: WorkAssignedPlanGroup[] }>(response, "加载负责事项失败");
}

export async function createWorkItem(target: WorkTarget, draft: WorkItemDraft) {
  const response = await fetch(workspacePath("/api/modules/work/tasks"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...workDraftPayload(draft), ...target }),
  });
  return readJson<WorkItemMutationResult>(response, "新建工作项失败");
}

export async function updateWorkItem(id: number, draft: Partial<WorkItemDraft> | Record<string, unknown>) {
  const response = await fetch(workspacePath(`/api/modules/work/tasks/${id}`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify("content" in draft ? workDraftPayload(draft as WorkItemDraft) : draft),
  });
  return readJson<WorkItemMutationResult>(response, "保存工作项失败");
}

export async function archiveWorkItem(id: number) {
  const response = await fetch(workspacePath(`/api/modules/work/tasks/${id}`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isArchived: true }),
  });
  return readJson<{ work: WorkItem }>(response, "归档任务失败");
}

export async function restoreWorkItem(id: number) {
  const response = await fetch(workspacePath(`/api/modules/work/tasks/${id}`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isArchived: false }),
  });
  return readJson<{ work: WorkItem }>(response, "恢复任务失败");
}

export async function deleteWorkItem(id: number) {
  const response = await fetch(workspacePath(`/api/modules/work/tasks/${id}`), { method: "DELETE" });
  return readJson<{ success: true }>(response, "删除工作项失败");
}

export async function listWorkTaskSubmissions(target: WorkTarget, status?: string) {
  const params = new URLSearchParams({
    targetType: target.targetType,
    targetId: String(target.targetId),
  });
  if (status) params.set("status", status);
  const response = await fetch(workspacePath(`/api/modules/work/tasks/submissions?${params.toString()}`));
  const data = await readJson<{ requests?: WorkTaskApprovalRequest[] }>(response, "加载审批单失败");
  return data.requests || [];
}

export async function listMyWorkTaskSubmissions(status?: string, filter?: "all" | "todo" | "originated") {
  const params = new URLSearchParams({ view: "mine" });
  if (status) params.set("status", status);
  if (filter) params.set("filter", filter);
  const response = await fetch(workspacePath(`/api/modules/work/tasks/submissions?${params.toString()}`));
  const data = await readJson<{ requests?: WorkTaskApprovalRequest[] }>(response, "加载我的审批失败");
  return data.requests || [];
}

export async function fetchWorkTaskSubmission(id: number) {
  const response = await fetch(workspacePath(`/api/modules/work/tasks/submissions/${id}`));
  const data = await readJson<{ request?: WorkTaskApprovalRequest }>(response, "加载审批失败");
  if (!data.request) throw new Error("审批单不存在");
  return data.request;
}

export async function saveWorkTaskSubmissionDraft(
  target: WorkTarget,
  operation: "create" | "update",
  draft: WorkItemDraft,
  workId?: number | null,
  comment?: string | null,
) {
  const response = await fetch(workspacePath("/api/modules/work/tasks/submissions"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      entityType: "item",
      ...target,
      operation,
      workId: workId ?? null,
      payload: workDraftPayload(draft),
      comment,
    }),
  });
  return readJson<WorkSubmissionMutationResult>(response, "创建审批草稿失败");
}

export async function saveWorkPlanRevisionSubmissionDraft(
  target: WorkPlan,
  draft: WorkPlanDraft,
  planId: number,
  comment?: string | null,
) {
  const response = await fetch(workspacePath("/api/modules/work/tasks/submissions"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      entityType: "revision",
      ...target,
      operation: "update",
      planId,
      payload: {
        changeTarget: "okr_plan",
        beforeSnapshot: workPlanBeforeSnapshot(target),
        ...workPlanDraftPayload(draft),
      },
      comment,
    }),
  });
  return readJson<WorkSubmissionMutationResult>(response, "创建计划修订审批草稿失败");
}

export async function saveObjectivePlanSubmissionDraft(
  target: WorkTarget,
  plan: WorkPlan,
  comment?: string | null,
) {
  const response = await fetch(workspacePath("/api/modules/work/tasks/submissions"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      entityType: "objective_plan",
      ...target,
      operation: "update",
      planId: plan.id,
      payload: { title: plan.title },
      comment,
    }),
  });
  return readJson<WorkSubmissionMutationResult>(response, "创建目标审查草稿失败");
}

export async function reviseWorkTaskSubmission(id: number, draft: WorkItemDraft, version?: number | null, comment?: string | null) {
  const response = await fetch(workspacePath(`/api/modules/work/tasks/submissions/${id}`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payload: workDraftPayload(draft), version, comment }),
  });
  return readJson<{ request: WorkTaskApprovalRequest }>(response, "保存审批草稿失败");
}

export async function submitWorkTaskSubmission(id: number, version?: number | null, comment?: string | null) {
  return runWorkTaskSubmissionAction(id, "submit", { version, comment }, "提交审批失败");
}

export async function withdrawWorkTaskSubmission(id: number, version?: number | null, comment?: string | null) {
  return runWorkTaskSubmissionAction(id, "withdraw", { version, comment }, "撤回审批失败");
}

export async function cancelWorkTaskSubmission(id: number, version?: number | null, comment?: string | null) {
  return runWorkTaskSubmissionAction(id, "cancel", { version, comment }, "取消审批失败");
}

export async function commentWorkTaskSubmission(id: number, comment: string, version?: number | null) {
  return runWorkTaskSubmissionAction(id, "comment", { version, comment }, "提交评论失败");
}

export async function approveWorkTaskSubmission(id: number, version?: number | null, comment?: string | null, draft?: WorkItemDraft | null) {
  return runWorkTaskSubmissionAction(
    id,
    "approve",
    { version, comment, ...(draft ? { payload: workDraftPayload(draft) } : {}) },
    "同意审批失败",
  );
}

export async function rejectWorkTaskSubmission(id: number, version?: number | null, comment?: string | null) {
  return runWorkTaskSubmissionAction(id, "reject", { version, comment }, "驳回审批失败");
}

async function runWorkTaskSubmissionAction(
  id: number,
  action: "submit" | "withdraw" | "cancel" | "comment" | "approve" | "reject",
  body: Record<string, unknown>,
  fallbackError: string,
) {
  const response = await fetch(workspacePath(`/api/modules/work/tasks/submissions/${id}/${action}`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return readJson<{ request: WorkTaskApprovalRequest }>(response, fallbackError);
}


export async function listProjectPhaseOptions(projectId: number | null) {
  if (!projectId) return [];
  const response = await fetch(workspacePath(`/api/modules/work/projects/${projectId}/plan-phases`));
  const data = await readJson<{ phases?: Array<{ id: number; name?: string }> }>(response, "加载项目阶段失败");
  return (data.phases || []).map((phase) => ({
    value: String(phase.id),
    label: phase.name || `阶段 ${phase.id}`,
  }));
}

export async function getWorkReportDraft(target: WorkTarget, periodType: string, periodStart: string, reportStage: WorkReportStage) {
  const params = new URLSearchParams({
    targetType: target.targetType,
    targetId: String(target.targetId),
    periodType,
    periodStart,
    reportStage,
  });
  const response = await fetch(workspacePath(`/api/modules/work/tasks/reports?${params.toString()}`));
  return readJson<WorkReportDraftResponse>(response, "加载目标/考核表失败");
}

export async function saveWorkReport(target: WorkTarget, periodType: string, periodStart: string, reportStage: WorkReportStage, items: WorkReportItem[]) {
  const response = await fetch(workspacePath("/api/modules/work/tasks/reports"), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...target,
      periodType,
      periodStart,
      reportStage,
      items: workReportItemsPayload(items),
    }),
  });
  return readJson<
    | { executionMode: "direct"; report: WorkReportDraftResponse }
    | { executionMode: "workflow"; request: WorkTaskApprovalRequest }
  >(response, "保存目标/考核表失败");
}

function workPlanBeforeSnapshot(plan: WorkPlan) {
  return {
    title: plan.title,
    actualStartDate: plan.actualStartDate,
    actualEndDate: plan.actualEndDate,
    ownerEmployeeId: plan.ownerEmployeeId,
    alignmentSourceType: plan.alignmentSourceType,
    alignmentSourcePlanId: plan.alignmentSourcePlanId,
    alignmentSourcePlanTitle: plan.alignmentSourcePlanTitle,
    alignmentSourcePlanTargetType: plan.alignmentSourcePlanTargetType,
    alignmentSourcePlanTargetId: plan.alignmentSourcePlanTargetId,
    alignmentSourceWorkItemId: plan.alignmentSourceWorkItemId,
    alignmentSourceWorkItemContent: plan.alignmentSourceWorkItemContent,
    alignmentSourceWorkItemTargetType: plan.alignmentSourceWorkItemTargetType,
    alignmentSourceWorkItemTargetId: plan.alignmentSourceWorkItemTargetId,
    sourceType: plan.sourceType,
    linkedProjectId: plan.linkedProjectId,
    sourceDepartmentId: plan.sourceDepartmentId,
    description: plan.description,
  };
}

export async function listWorkReportCollection(periodType: string, periodStart: string) {
  const params = new URLSearchParams({ periodType, periodStart });
  const response = await fetch(workspacePath(`/api/modules/work/tasks/reports/collection?${params.toString()}`));
  return readJson<WorkReportCollectionResponse>(response, "加载汇报汇总失败");
}
