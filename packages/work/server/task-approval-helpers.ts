import type { ApprovalOperation, ApprovalRequestDto } from "@workspace/platform/server/approvals";
import {
  businessSpaceScopeId,
  getGroupCompanyContext,
  getOperatingCommitteeDepartmentContext,
} from "@workspace/platform/server/business-space-permissions";
import { getWorkTaskPermissionResourceKey, normalizeWorkTargetType, type WorkSpaceTargetType } from "./access";

export const WORK_TASK_APPROVAL_SUBJECT = "work.task";

export type WorkTaskApprovalTargetType = Extract<WorkSpaceTargetType, "company" | "committee" | "department" | "project">;
export type WorkTaskApprovalWorkspaceTargetType = WorkTaskApprovalTargetType | "personal";
export type WorkTaskApprovalEntityType = "item" | "plan" | "report" | "objective_plan" | "kr_review" | "revision" | "collaboration";

type WorkTaskApprovalPayloadBase<TTarget extends WorkTaskApprovalWorkspaceTargetType = WorkTaskApprovalTargetType> = {
  targetType: TTarget;
  targetId: number;
  controlScopeType?: WorkTaskApprovalTargetType | null;
  controlScopeId?: number | null;
  entityType: WorkTaskApprovalEntityType;
  data: Record<string, unknown>;
};

export type WorkTaskItemApprovalPayload = WorkTaskApprovalPayloadBase<WorkTaskApprovalTargetType> & {
  entityType: "item";
  workId: number | null;
};

export type WorkTaskPlanApprovalPayload = WorkTaskApprovalPayloadBase<WorkTaskApprovalWorkspaceTargetType> & {
  entityType: "plan";
  planId: number | null;
};

export type WorkTaskObjectivePlanApprovalPayload = WorkTaskApprovalPayloadBase<WorkTaskApprovalWorkspaceTargetType> & {
  entityType: "objective_plan";
  planId: number;
};

export type WorkTaskKrReviewApprovalPayload = WorkTaskApprovalPayloadBase<WorkTaskApprovalWorkspaceTargetType> & {
  entityType: "kr_review";
  planId: number;
};

export type WorkTaskReportApprovalPayload = WorkTaskApprovalPayloadBase<WorkTaskApprovalWorkspaceTargetType> & {
  entityType: "report";
  reportId: number | null;
  periodType?: string | null;
  periodStart: string | null;
  reportStage?: "kr" | "final" | null;
};

export type WorkTaskRevisionApprovalPayload = WorkTaskApprovalPayloadBase<WorkTaskApprovalWorkspaceTargetType> & {
  entityType: "revision";
  changeTarget: "okr_plan" | "work_report";
  planId: number | null;
  reportId: number | null;
  periodType?: string | null;
  periodStart?: string | null;
  reportStage?: "kr" | "final" | null;
};

export type WorkTaskCollaborationApprovalPayload = WorkTaskApprovalPayloadBase<"department"> & {
  entityType: "collaboration";
};

export type WorkTaskApprovalPayload =
  | WorkTaskItemApprovalPayload
  | WorkTaskPlanApprovalPayload
  | WorkTaskObjectivePlanApprovalPayload
  | WorkTaskKrReviewApprovalPayload
  | WorkTaskReportApprovalPayload
  | WorkTaskRevisionApprovalPayload
  | WorkTaskCollaborationApprovalPayload;

export function normalizeApprovalTargetType(targetType: string | null | undefined): WorkTaskApprovalTargetType | null {
  const normalized = normalizeWorkTargetType(targetType || "");
  if (normalized === "company" || normalized === "committee" || normalized === "department" || normalized === "project") return normalized;
  return null;
}

export function normalizeApprovalWorkspaceTargetType(targetType: string | null | undefined): WorkTaskApprovalWorkspaceTargetType | null {
  const normalized = normalizeWorkTargetType(targetType || "");
  if (normalized === "personal" || normalized === "company" || normalized === "committee" || normalized === "department" || normalized === "project") return normalized;
  return null;
}

export function approvalControlTarget(payload: Partial<WorkTaskApprovalPayload> | null | undefined): { targetType: WorkTaskApprovalWorkspaceTargetType; targetId: number } | null {
  const scopedType = normalizeApprovalTargetType(payload?.controlScopeType);
  const scopedId = Number(payload?.controlScopeId);
  if (scopedType && Number.isInteger(scopedId) && scopedId > 0) return { targetType: scopedType, targetId: scopedId };
  const targetType = normalizeApprovalWorkspaceTargetType(payload?.targetType);
  const targetId = Number(payload?.targetId);
  return targetType && Number.isInteger(targetId) && targetId > 0 ? { targetType, targetId } : null;
}

export function getWorkTaskApprovalResourceKey(targetType: WorkTaskApprovalWorkspaceTargetType) {
  const resourceKey = getWorkTaskPermissionResourceKey(targetType);
  if (resourceKey === "work.tasks" && targetType !== "personal" && targetType !== "project") throw new Error(`Missing derived task space resource for ${targetType}`);
  return resourceKey;
}

export function targetFromScope(scopeId: string | null | undefined): Pick<WorkTaskApprovalPayload, "targetType" | "targetId"> | null {
  if (!scopeId) return null;
  const [targetType, idText] = scopeId.split(":");
  const normalized = normalizeApprovalTargetType(targetType);
  const targetId = Number(idText);
  return normalized && Number.isInteger(targetId) && targetId > 0 ? { targetType: normalized, targetId } : null;
}

export async function resolveTargetFromScope(scopeId: string | null | undefined): Promise<Pick<WorkTaskApprovalPayload, "targetType" | "targetId"> | null> {
  const numericTarget = targetFromScope(scopeId);
  if (numericTarget || !scopeId) return numericTarget;
  if (scopeId === businessSpaceScopeId("company", 0)) {
    const company = await getGroupCompanyContext();
    return company ? { targetType: "company", targetId: company.id } : null;
  }
  if (scopeId === businessSpaceScopeId("committee", 0)) {
    const committee = await getOperatingCommitteeDepartmentContext();
    return committee ? { targetType: "committee", targetId: committee.id } : null;
  }
  return null;
}

export function mergeWorkTaskSubmissionPayload(
  request: ApprovalRequestDto<WorkTaskApprovalPayload>,
  nextData: Record<string, unknown>,
): WorkTaskApprovalPayload {
  return { ...request.latestPayload, data: nextData } as WorkTaskApprovalPayload;
}

export function workSpacePath(type: WorkTaskApprovalWorkspaceTargetType, id: number) {
  if (type === "personal" || type === "company") return "/work/me";
  if (type === "project") return `/work/project/${id}/space`;
  return `/work/department/${id}/space`;
}

export function workApprovalRequestHref(payload: Partial<WorkTaskApprovalPayload>, requestId: number) {
  const targetType = normalizeApprovalWorkspaceTargetType(payload.targetType);
  const targetId = Number(payload.targetId);
  const baseHref = targetType && Number.isInteger(targetId) && targetId > 0
    ? workSpacePath(targetType, targetId)
    : "/work/me";
  return `${baseHref}?approvalId=${requestId}`;
}

export function normalizeApprovalEntityType(value: unknown): WorkTaskApprovalEntityType {
  if (value === "plan" || value === "report" || value === "objective_plan" || value === "kr_review" || value === "revision" || value === "collaboration") return value;
  return "item";
}

export function approvalEntityType(payload: Partial<WorkTaskApprovalPayload> | null | undefined): WorkTaskApprovalEntityType {
  return normalizeApprovalEntityType(payload?.entityType);
}

export type WorkOkrWorkflowActionKind = "objective_submit" | "report_submit" | "objective_revise" | "report_correct";

const WORK_OKR_BUSINESS_ACTION_KEYS = {
  department: {
    objective_submit: "work.tasks.goal.department.objective.submit",
    report_submit: "work.tasks.goal.department.report.submit",
    objective_revise: "work.tasks.goal.department.objective.revise",
    report_correct: "work.tasks.goal.department.report.correct",
  },
  personal: {
    objective_submit: "work.tasks.goal.personal.objective.submit",
    report_submit: "work.tasks.goal.personal.report.submit",
    objective_revise: "work.tasks.goal.personal.objective.revise",
    report_correct: "work.tasks.goal.personal.report.correct",
  },
} as const;

const WORK_OKR_BUSINESS_ACTION_LABELS = {
  department: {
    objective_submit: "部门期初目标提交",
    report_submit: "部门考核结果提交",
    objective_revise: "部门期初目标修订",
    report_correct: "部门考核结果修订",
  },
  project: {
    objective_submit: "项目期初目标提交",
    report_submit: "项目考核结果提交",
    objective_revise: "项目期初目标修订",
    report_correct: "项目考核结果修订",
  },
  personal: {
    objective_submit: "个人期初目标提交",
    report_submit: "个人考核结果提交",
    objective_revise: "个人期初目标修订",
    report_correct: "个人考核结果修订",
  },
} as const;

export function workOkrBusinessActionLabel(kind: WorkOkrWorkflowActionKind, workspaceTargetType: string | null | undefined) {
  const normalized = normalizeApprovalWorkspaceTargetType(workspaceTargetType);
  const family = normalized === "personal" ? "personal" : normalized === "project" ? "project" : "department";
  return WORK_OKR_BUSINESS_ACTION_LABELS[family][kind];
}

export function workOkrBaseBusinessActionKey(kind: WorkOkrWorkflowActionKind, workspaceTargetType: string | null | undefined) {
  const family = normalizeApprovalWorkspaceTargetType(workspaceTargetType) === "personal" ? "personal" : "department";
  return WORK_OKR_BUSINESS_ACTION_KEYS[family][kind];
}

export function workOkrWorkflowBusinessActionKey(input: {
  kind: WorkOkrWorkflowActionKind;
  workspaceTargetType?: string | null;
}) {
  return workOkrBaseBusinessActionKey(input.kind, input.workspaceTargetType);
}

export function workOkrWorkflowActionKindFor(
  entityType: WorkTaskApprovalEntityType,
  payload: Partial<WorkTaskApprovalPayload> | null | undefined,
): WorkOkrWorkflowActionKind | null {
  if (entityType === "objective_plan") return "objective_submit";
  if (entityType === "kr_review") return "report_submit";
  if (entityType === "report") return approvalReportStage(payload) === "kr" ? "objective_submit" : "report_submit";
  if (entityType === "revision" || entityType === "plan") {
    if (approvalChangeTarget(payload) !== "work_report") return "objective_revise";
    return approvalReportStage(payload) === "kr" ? "objective_revise" : "report_correct";
  }
  return null;
}

export function businessActionKeyFor(operation: ApprovalOperation, payload: Partial<WorkTaskApprovalPayload> | null | undefined) {
  const entityType = approvalEntityType(payload);
  if (entityType === "collaboration") {
    return "work.tasks.collaboration.submit";
  }
  const okrKind = workOkrWorkflowActionKindFor(entityType, payload);
  if (okrKind) {
    return workOkrWorkflowBusinessActionKey({
      kind: okrKind,
      workspaceTargetType: payload?.targetType,
    });
  }
  const baseKey = operation === "create" ? "work.tasks.item.create" : "work.tasks.item.update";
  return baseKey;
}

export function approvalTitle(
  operation: ApprovalOperation,
  entityType: WorkTaskApprovalEntityType,
  payload?: Partial<WorkTaskApprovalPayload> | null,
) {
  const okrKind = workOkrWorkflowActionKindFor(entityType, payload);
  if (okrKind) return workOkrBusinessActionLabel(okrKind, payload?.targetType);
  if (entityType === "objective_plan") return "目标审查";
  if (entityType === "kr_review") return "考核结果";
  if (entityType === "revision") return "修订/更正审批";
  if (entityType === "collaboration") return "部门协作提交";
  if (entityType === "plan") return operation === "create" ? "OKR 计划新建审批" : "OKR 计划修改审批";
  if (entityType === "report") return "目标/考核表保存审批";
  return operation === "create" ? "工作节点新建审批" : "工作节点修改审批";
}

export function approvalSummary(payload: WorkTaskApprovalPayload) {
  const entityType = approvalEntityType(payload);
  if (entityType === "collaboration") return String(payload.data.title || "部门协作").trim();
  if (entityType === "objective_plan") return String(payload.data.title || "目标审查").trim();
  if (entityType === "kr_review") return String(payload.data.title || payload.data.summary || "考核结果").trim();
  if (entityType === "revision") {
    const revision = payload as WorkTaskRevisionApprovalPayload;
    const target = revision.changeTarget === "work_report" ? "目标/考核表" : "工作计划";
    return `${target}修订 · ${String(payload.data.reason || payload.data.title || revision.periodStart || "待说明").trim()}`;
  }
  if (entityType === "plan") return String(payload.data.title || payload.data.description || "").trim();
  if (entityType === "report") {
    const reportPayload = payload as WorkTaskReportApprovalPayload;
    const items = Array.isArray(payload.data.items) ? payload.data.items : [];
    return `${reportPayload.periodStart || payload.data.periodStart || "本期"} · ${reportStageLabel(reportPayload.reportStage ?? payload.data.reportStage)} · ${items.length} 项`;
  }
  return String(payload.data.content || payload.data.description || "").trim();
}

export function normalizePlanApprovalData(data: Record<string, unknown>) {
  return {
    kind: data.kind,
    title: data.title,
    description: data.description,
    status: data.status,
    ownerEmployeeId: data.ownerEmployeeId,
    collaborationId: data.collaborationId,
    okrCycleId: data.okrCycleId,
    sourcePlanId: null,
    parentPeriodPlanId: data.parentPeriodPlanId,
    previousPeriodPlanId: data.previousPeriodPlanId,
    periodType: data.periodType,
    periodStart: data.periodStart,
    periodEnd: data.periodEnd,
    sourceType: "other",
    sourceKind: null,
    sourceMeetingId: null,
    sourceMeetingDecisionId: null,
    sourceMeetingActionCandidateId: null,
    sourceDepartmentId: null,
    linkedProjectId: null,
    linkedProjectPhaseId: null,
    sortOrder: data.sortOrder,
  };
}

export function hasPlanSourceReference(data: Record<string, unknown>) {
  return String(data.sourceType || "other") !== "other"
    || Boolean(nullablePositiveNumber(data.sourcePlanId))
    || Boolean(data.sourceKind)
    || Boolean(nullablePositiveNumber(data.sourceMeetingId))
    || Boolean(nullablePositiveNumber(data.sourceMeetingDecisionId))
    || Boolean(nullablePositiveNumber(data.sourceMeetingActionCandidateId))
    || Boolean(nullablePositiveNumber(data.sourceDepartmentId))
    || Boolean(nullablePositiveNumber(data.linkedProjectId))
    || Boolean(nullablePositiveNumber(data.linkedProjectPhaseId));
}

export function nullablePositiveNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

export function nullableString(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

function reportStageLabel(value: unknown) {
  return value === "kr" ? "期初目标" : "考核结果";
}

function approvalChangeTarget(payload: Partial<WorkTaskApprovalPayload> | null | undefined) {
  if (!payload) return null;
  const topLevel = "changeTarget" in payload ? payload.changeTarget : null;
  if (topLevel === "work_report" || topLevel === "okr_plan") return topLevel;
  const data = payload.data;
  const dataValue = data && typeof data === "object" && "changeTarget" in data ? data.changeTarget : null;
  return dataValue === "work_report" || dataValue === "okr_plan" ? dataValue : null;
}

function approvalReportStage(payload: Partial<WorkTaskApprovalPayload> | null | undefined) {
  if (!payload) return null;
  const topLevel = "reportStage" in payload ? payload.reportStage : null;
  if (topLevel === "kr" || topLevel === "final") return topLevel;
  const data = payload.data;
  const dataValue = data && typeof data === "object" && "reportStage" in data ? data.reportStage : null;
  return dataValue === "kr" || dataValue === "final" ? dataValue : null;
}
