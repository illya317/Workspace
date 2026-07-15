"use client";

import {
  createFieldsSection,
  createFormSection,
  createRecordSection,
  type BodySurfaceSectionSpec,
  type FormSurfaceReadOnlyFieldSpec,
} from "@workspace/core/ui";
import {
  actionRuntimeCommands,
  getWorkflowStatusLabel,
  normalizeWorkflowStatus,
  type WorkflowActionViewModel,
  type WorkflowRequestTimelineEvent,
} from "@workspace/platform/ui";
import { resolveActionRuntime } from "@workspace/platform/workflow-action-runtime";
import { createEmptyWorkDraft, getStatusLabel, getWorkItemTypeLabel, getWorkPlanKindLabel } from "./model";
import { workGoalBaseBusinessActionKey, workGoalOperationLabel } from "./WorkApprovalGoalLabels";
import { revisionDiffSections, revisionReadonlyFields } from "./WorkApprovalRevisionDisplay";
import type { useWorkTaskFormSurface } from "./WorkTaskFields";
import type { WorkItemDraft, WorkTaskApprovalRequest } from "./types";

export function approvalDetailSections({
  request,
  canEditPayload,
  saving,
  commentText,
  approvalFormSurface,
  timelineSection,
  onCommentChange,
  onSubmitComment,
}: {
  request: WorkTaskApprovalRequest;
  canEditPayload: boolean;
  saving: boolean;
  commentText: string;
  approvalFormSurface: ReturnType<typeof useWorkTaskFormSurface>;
  timelineSection?: BodySurfaceSectionSpec;
  onCommentChange: (value: string) => void;
  onSubmitComment: () => void;
}): BodySurfaceSectionSpec[] {
  return [
    createFieldsSection("approval-detail", approvalReadonlyFields(request), { kind: "detail", layout: { columns: 3 } }),
    ...okrApprovalSnapshotSections(request),
    ...revisionDiffSections(request),
    ...(canEditPayload ? [createFormSection("approval-payload-form", approvalFormSurface)] : []),
    timelineSection
      ?? createRecordSection("approval-events", {
          records: request.events.map((event) => ({
            key: String(event.id),
            expanded: Boolean(event.comment),
            onToggle: () => undefined,
            header: { kind: "text", value: `${event.actorName} · ${eventLabel(event.eventType)} · ${formatDateTime(event.createdAt)}` },
            detail: event.comment ? { kind: "text", value: event.comment } : { kind: "empty", content: "无备注" },
          })),
          empty: "暂无流转记录",
        }),
    createFieldsSection("approval-comment", [{
      key: "comment",
      label: "备注或评论",
      spec: { valueType: "string", control: "text", multiline: true, state: saving || request.status === "cancelled" ? "disabled" : "normal" },
      value: commentText,
      placeholder: "填写审批备注或自由评论",
      onChange: (value) => onCommentChange(String(value ?? "")),
      span: "wide",
    }], {
      layout: { columns: 1 },
      actions: [{
        key: "submit-comment",
        action: "send",
        label: "评论",
        disabled: saving || !commentText.trim() || request.status === "cancelled",
        onClick: onSubmitComment,
      }],
    }),
  ];
}

export function approvalReadonlyFields(request: WorkTaskApprovalRequest): FormSurfaceReadOnlyFieldSpec[] {
  const entityType = approvalEntityType(request);
  const common = [
    readonlyField("operation", "类型", requestOperationLabel(request)),
    readonlyField("status", "状态", getWorkflowStatusLabel(request.status)),
    readonlyField("submitter", "发起人", request.submitterName),
    readonlyField("version", "版本", `v${request.version}`),
  ];
  if (entityType === "plan") {
    return [
      ...common,
      readonlyField("title", "计划", String(request.latestPayload.data.title || "未命名计划")),
      readonlyField("planStatus", "计划状态", planStatusLabel(String(request.latestPayload.data.status || "active"))),
      readonlyField("updatedAt", "更新时间", formatDateTime(request.updatedAt)),
    ];
  }
  if (entityType === "objective_plan") {
    return [
      ...common,
      readonlyField("title", request.latestPayload.data.packageOnly ? "工作包审查" : workGoalOperationLabel(request) ?? "期初目标提交", String(request.latestPayload.data.title || "未命名计划")),
      ...okrApprovalSnapshotFields(request),
      readonlyField("updatedAt", "更新时间", formatDateTime(request.updatedAt)),
    ];
  }
  if (entityType === "kr_review") {
    return [
      ...common,
      readonlyField("title", workGoalOperationLabel(request) ?? "考核结果提交", String(request.latestPayload.data.title || "未命名计划")),
      ...okrApprovalSnapshotFields(request),
      readonlyField("updatedAt", "更新时间", formatDateTime(request.updatedAt)),
    ];
  }
  if (entityType === "report") {
    const items = Array.isArray(request.latestPayload.data.items) ? request.latestPayload.data.items : [];
    return [
      ...common,
      readonlyField("stage", "阶段", reportStageLabel(request.latestPayload.reportStage || request.latestPayload.data.reportStage)),
      readonlyField("period", "汇报周期", String(request.latestPayload.periodStart || request.latestPayload.data.periodStart || "-")),
      readonlyField("items", "汇报事项", `${items.length} 项`),
      readonlyField("updatedAt", "更新时间", formatDateTime(request.updatedAt)),
    ];
  }
  if (entityType === "revision") return revisionReadonlyFields(request, common, formatDateTime(request.updatedAt));
  return [
    ...common,
    readonlyField("content", "节点", String(request.latestPayload.data.content || "未填写")),
    readonlyField("itemType", "节点类型", getWorkItemTypeLabel(String(request.latestPayload.data.itemType || "task"))),
    readonlyField("itemStatus", "节点状态", getStatusLabel(String(request.latestPayload.data.status || "active"))),
    readonlyField("updatedAt", "更新时间", formatDateTime(request.updatedAt)),
  ];
}

function okrApprovalSnapshotFields(request: WorkTaskApprovalRequest): FormSurfaceReadOnlyFieldSpec[] {
  const snapshot = approvalSnapshot(request);
  const plan = objectValue(snapshot?.plan);
  const cycle = objectValue(snapshot?.cycle);
  const items = Array.isArray(snapshot?.items) ? snapshot.items : [];
  const packagePlans = workPackagePlans(snapshot);
  return [
    readonlyField("cycle", "周期", stringValue(cycle?.label) || stringValue(cycle?.code) || "-"),
    readonlyField("period", "期间", [stringValue(plan?.periodStart), stringValue(plan?.periodEnd)].filter(Boolean).join(" 至 ") || "-"),
    readonlyField("items", "节点", packagePlans.length ? `${packagePlans.length} 个计划 / ${items.length} 个当前节点` : `${items.length} 项`),
  ];
}

function okrApprovalSnapshotSections(request: WorkTaskApprovalRequest): BodySurfaceSectionSpec[] {
  const entityType = approvalEntityType(request);
  if (entityType !== "objective_plan" && entityType !== "kr_review") return [];
  const snapshot = approvalSnapshot(request);
  const packagePlans = workPackagePlans(snapshot);
  const items = packagePlans.length
    ? packagePlans
    : [{ id: "current", kind: "okr", title: "当前计划", items: Array.isArray(snapshot?.items) ? snapshot.items : [] }];
  return [
    createRecordSection("okr-approval-snapshot", {
      records: items.map((plan, index) => {
        const planItems = Array.isArray(plan.items) ? plan.items.map(objectValue).filter(isRecord) : [];
        return {
          key: String(plan.id ?? index),
          expanded: false,
          onToggle: () => undefined,
          header: { kind: "stack", items: [`${getWorkPlanKindLabel(stringValue(plan.kind))} · ${stringValue(plan.title) || "未命名计划"}`, `${planItems.length} 个节点`], gap: "xs" },
          detail: { kind: "text", value: snapshotPlanDetail(planItems) },
        };
      }),
      empty: "暂无周期工作包快照",
    }),
  ];
}

function approvalSnapshot(request: WorkTaskApprovalRequest) {
  return objectValue(request.latestPayload.data.approvalSnapshot);
}

function workPackagePlans(snapshot: Record<string, unknown> | null) {
  const pkg = objectValue(snapshot?.package);
  return Array.isArray(pkg?.plans) ? pkg.plans.map(objectValue).filter(isRecord) : [];
}

function snapshotPlanDetail(items: Record<string, unknown>[]) {
  return items.length ? items.map((item) => `${workItemTypeLabel(stringValue(item.itemType))} · ${stringValue(item.content) || "未命名节点"} · ${itemStatusText(item)}`).join("\n") : "暂无节点";
}

function objectValue(value: unknown): Record<string, unknown> | null { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }

function isRecord(value: Record<string, unknown> | null): value is Record<string, unknown> { return Boolean(value); }

function stringValue(value: unknown) { return typeof value === "string" ? value.trim() : ""; }

function workItemTypeLabel(value: string) {
  if (value === "objective") return "目标";
  if (value === "key_result") return "KR";
  return "任务";
}

function itemStatusText(item: Record<string, unknown>) {
  const values = [
    stringValue(item.status),
    numberText("当前", item.krCurrentValue),
    numberText("目标", item.krTargetValue),
    stringValue(item.krUnit),
  ].filter(Boolean);
  return values.length ? values.join(" · ") : "未填写进度";
}

function numberText(label: string, value: unknown) { return typeof value === "number" && Number.isFinite(value) ? `${label} ${value}` : ""; }

export function approvalEntityType(request: WorkTaskApprovalRequest) {
  return request.latestPayload.entityType === "plan"
    || request.latestPayload.entityType === "report"
    || request.latestPayload.entityType === "objective_plan"
    || request.latestPayload.entityType === "kr_review"
    || request.latestPayload.entityType === "revision"
    ? request.latestPayload.entityType
    : "item";
}

export function requestTitle(request: WorkTaskApprovalRequest) {
  const entityType = approvalEntityType(request);
  if (entityType === "plan") return `${workGoalOperationLabel(request) ?? (request.operation === "create" ? "新建目标计划" : "提交目标修订")} · ${request.latestPayload.data.title || "未命名计划"}`;
  if (entityType === "objective_plan") return `${request.latestPayload.data.packageOnly ? "工作包审查" : workGoalOperationLabel(request) ?? "期初目标提交"} · ${request.latestPayload.data.title || "未命名计划"}`;
  if (entityType === "kr_review") return `${workGoalOperationLabel(request) ?? "考核结果提交"} · ${request.latestPayload.data.title || "未命名计划"}`;
  if (entityType === "report") return `${workGoalOperationLabel(request) ?? reportStageLabel(request.latestPayload.reportStage || request.latestPayload.data.reportStage)} · ${request.latestPayload.periodStart || request.latestPayload.data.periodStart || "本期"}`;
  if (entityType === "revision") return `${workGoalOperationLabel(request) ?? `${revisionTargetLabel(request)}修订`} · ${request.latestPayload.data.reason || request.latestPayload.data.title || request.latestPayload.periodStart || "待说明"}`;
  return `${request.operation === "create" ? "新建" : "修改"} · ${request.latestPayload.data.content || "未命名节点"}`;
}

export function requestDetail(request: WorkTaskApprovalRequest) {
  const entityType = approvalEntityType(request);
  if (entityType === "plan") return workGoalOperationLabel(request) ?? "目标计划";
  if (entityType === "objective_plan") return request.latestPayload.data.packageOnly ? "工作包审查" : workGoalOperationLabel(request) ?? "期初目标提交";
  if (entityType === "kr_review") return workGoalOperationLabel(request) ?? "考核结果提交";
  if (entityType === "report") {
    const items = Array.isArray(request.latestPayload.data.items) ? request.latestPayload.data.items.length : 0;
    return `${workGoalOperationLabel(request) ?? "考核结果提交"} · ${reportStageLabel(request.latestPayload.reportStage || request.latestPayload.data.reportStage)} · ${items} 项`;
  }
  if (entityType === "revision") return workGoalOperationLabel(request) ?? `${revisionTargetLabel(request)} · 修订/更正`;
  return getWorkItemTypeLabel(String(request.latestPayload.data.itemType || "task"));
}

export function approvalActionViewModel({
  request,
  currentUserId,
  canEditPayload,
  saving,
  onAction,
}: {
  request: WorkTaskApprovalRequest;
  currentUserId: number;
  canEditPayload: boolean;
  saving: boolean;
  onAction: (action: "submit" | "withdraw" | "cancel" | "approve" | "reject") => void;
}): WorkflowActionViewModel {
  const runtime = approvalRuntime(request, currentUserId);
  return {
    businessActionKey: workBusinessActionKey(request),
    flowType: "approval",
    mode: "workflow",
    status: normalizeWorkflowStatus(request.status),
    requestId: request.id,
    title: requestTitle(request),
    summary: `#${request.id} · ${requestDetail(request)} · ${request.version} 版`,
    placement: "formFooter",
    payloadMode: runtime.editability === "editable" ? "editable" : "readonly",
    commands: actionRuntimeCommands(runtime, {
      ...(!canEditPayload ? {
        "workflow.request.submit": { disabled: saving, onClick: () => onAction("submit") },
        "workflow.request.resubmit": { disabled: saving, onClick: () => onAction("submit") },
      } : {}),
      "workflow.request.withdraw": { disabled: saving, onClick: () => onAction("withdraw") },
      "workflow.request.cancel": { disabled: saving, onClick: () => onAction("cancel") },
      "workflow.request.approve": { disabled: saving, onClick: () => onAction("approve") },
      "workflow.request.reject": { disabled: saving, onClick: () => onAction("reject") },
    }),
  };
}

export function approvalTimelineEvents(request: WorkTaskApprovalRequest): WorkflowRequestTimelineEvent[] {
  return request.events.map((event) => ({
    id: event.id,
    actor: event.actorName,
    type: eventLabel(event.eventType),
    at: formatDateTime(event.createdAt),
    comment: event.comment || undefined,
  }));
}

export function canEditApprovalPayload(
  request: WorkTaskApprovalRequest,
  currentUserId: number,
) {
  return approvalRuntime(request, currentUserId).editability === "editable";
}

export function draftFromApproval(request: WorkTaskApprovalRequest): WorkItemDraft {
  const data = request.latestPayload.data;
  const base = createEmptyWorkDraft();
  const status = String(data.status || "");
  return {
    ...base,
    planId: numberOrNull(data.planId),
    category: data.category === "routine" ? "routine" : "non-routine",
    itemType: data.itemType === "objective" || data.itemType === "key_result" || data.itemType === "task" ? data.itemType : "task",
    content: String(data.content || ""),
    description: String(data.description || ""),
    importance: numberOrFallback(data.importance, 3),
    urgency: numberOrFallback(data.urgency, 3),
    status: status === "done" || status === "paused" ? status : "active",
    krStartValue: nullableNumber(data.krStartValue),
    krTargetValue: nullableNumber(data.krTargetValue),
    krCurrentValue: nullableNumber(data.krCurrentValue),
    krUnit: String(data.krUnit || ""),
    ownerEmployeeId: numberOrNull(data.ownerEmployeeId),
    ownerEmployeeName: String(data.ownerEmployeeName || ""),
    actualStartDate: dateOnly(data.actualStartDate),
    actualEndDate: dateOnly(data.actualEndDate),
    periodType: periodTypeValue(data.periodType),
    periodStart: dateOnly(data.periodStart),
    periodEnd: dateOnly(data.periodEnd),
    sourceType: sourceTypeValue(data.sourceType),
    sourceKind: sourceKindValue(data.sourceKind),
    sourceMeetingId: numberOrNull(data.sourceMeetingId),
    sourceMeetingTitle: String(data.sourceMeetingTitle || ""),
    sourceMeetingDecisionId: numberOrNull(data.sourceMeetingDecisionId),
    sourceMeetingDecisionTitle: String(data.sourceMeetingDecisionTitle || ""),
    sourceMeetingActionCandidateId: numberOrNull(data.sourceMeetingActionCandidateId),
    sourceMeetingActionCandidateTitle: String(data.sourceMeetingActionCandidateTitle || ""),
    sourceDepartmentId: numberOrNull(data.sourceDepartmentId),
    sourceDepartmentName: String(data.sourceDepartmentName || ""),
    sourceDepartmentCode: String(data.sourceDepartmentCode || ""),
    linkedProjectId: numberOrNull(data.linkedProjectId),
    linkedProjectName: String(data.linkedProjectName || ""),
    linkedProjectPhaseId: numberOrNull(data.linkedProjectPhaseId),
    linkedProjectPhaseName: String(data.linkedProjectPhaseName || ""),
    parentWorkItemId: numberOrNull(data.parentWorkItemId),
    parentWorkItemContent: String(data.parentWorkItemContent || ""),
    parentPeriodWorkItemId: numberOrNull(data.parentPeriodWorkItemId),
    parentPeriodWorkItemContent: String(data.parentPeriodWorkItemContent || ""),
    parentPeriodWorkItemType: null,
    parentPeriodRelationKind: null,
    parentPeriodWorkItemCycleLabel: String(data.parentPeriodWorkItemCycleLabel || ""),
    previousPeriodWorkItemId: numberOrNull(data.previousPeriodWorkItemId),
    previousPeriodWorkItemContent: String(data.previousPeriodWorkItemContent || ""),
    previousPeriodWorkItemCycleLabel: String(data.previousPeriodWorkItemCycleLabel || ""),
    evidenceTaskIds: Array.isArray(data.evidenceTaskIds) ? data.evidenceTaskIds.map(Number).filter((id) => Number.isInteger(id) && id > 0) : [],
    participants: Array.isArray(data.participants) ? data.participants.join("，") : String(data.participants || ""),
    sortOrder: numberOrFallback(data.sortOrder, base.sortOrder),
  };
}

export function actionSuccessLabel(action: string) {
  if (action === "submit") return "审批已提交";
  if (action === "withdraw") return "审批已撤回";
  if (action === "cancel") return "请求已删除";
  if (action === "approve") return "审批已通过";
  if (action === "reject") return "审批已驳回";
  return "审批动作已完成";
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function requestOperationLabel(request: WorkTaskApprovalRequest) {
  const entityType = approvalEntityType(request);
  const goalLabel = workGoalOperationLabel(request);
  if (goalLabel) return goalLabel;
  if (entityType === "plan") return request.operation === "create" ? "新建目标计划" : "提交目标修订";
  if (entityType === "objective_plan") return "期初目标提交";
  if (entityType === "kr_review") return "考核结果提交";
  if (entityType === "report") return "考核结果提交";
  if (entityType === "revision") return "目标修订/更正";
  return request.operation === "create" ? "新建工作节点" : "修改工作节点";
}

function approvalRuntime(request: WorkTaskApprovalRequest, currentUserId: number) {
  return resolveActionRuntime({
    businessActionKey: workBusinessActionKey(request),
    workflowPolicyMode: "required",
    workflowWhenDisabled: "unavailable",
    actor: {
      userId: currentUserId,
      canProcessWorkflow: request.canProcess === true,
    },
    request: {
      id: request.id,
      status: request.status,
      submitterUserId: request.submitterUserId,
      handlerCanRevise: request.handlerCanRevise,
      requestCanWithdraw: request.requestCanWithdraw,
      requestCanResubmit: request.requestCanResubmit,
      requestCanCancel: request.requestCanCancel,
      requestCanRevise: request.requestCanRevise,
    },
  });
}

function workBusinessActionKey(request: WorkTaskApprovalRequest) {
  if (request.businessActionKey) return request.businessActionKey;
  const goalKey = workGoalBaseBusinessActionKey(request);
  if (goalKey) return goalKey;
  return request.operation === "create" ? "work.tasks.item.create" : "work.tasks.item.update";
}

function planStatusLabel(status: string) {
  if (status === "done") return "已完成";
  if (status === "archived") return "已归档";
  return "进行中";
}

function reportStageLabel(value: unknown) { return value === "kr" ? "期初目标" : "考核结果"; }

function revisionTargetLabel(request: WorkTaskApprovalRequest) {
  const target = request.latestPayload.changeTarget || request.latestPayload.data.changeTarget;
  return target === "work_report" ? "目标/考核表" : "工作计划";
}

function readonlyField(key: string, label: string, value: string): FormSurfaceReadOnlyFieldSpec { return { kind: "readonly", key, label, value }; }

function eventLabel(eventType: string) {
  if (eventType === "create_draft") return "创建草稿";
  if (eventType === "submit") return "提交审批";
  if (eventType === "withdraw") return "撤回";
  if (eventType === "revise") return "修订";
  if (eventType === "review_update") return "审核修改";
  if (eventType === "approve") return "同意";
  if (eventType === "reject") return "驳回";
  if (eventType === "cancel") return "删除请求";
  if (eventType === "comment") return "评论";
  if (eventType === "commit_failed") return "提交正式数据失败";
  return eventType;
}

function numberOrNull(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function numberOrFallback(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function periodTypeValue(value: unknown): WorkItemDraft["periodType"] {
  return value === "daily" || value === "weekly" || value === "monthly" || value === "quarterly" || value === "yearly" ? value : null;
}

function sourceTypeValue(value: unknown): WorkItemDraft["sourceType"] {
  return value === "department" || value === "project" || value === "meeting" || value === "other" ? value : "other";
}

function sourceKindValue(value: unknown): WorkItemDraft["sourceKind"] {
  return value === "project" || value === "project_phase" ? value : null;
}

function dateOnly(value: unknown) { return value ? String(value).slice(0, 10) : null; }
