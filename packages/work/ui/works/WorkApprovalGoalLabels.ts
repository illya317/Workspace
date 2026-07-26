import type { WorkTaskApprovalRequest, WorkTaskApprovalPayload } from "./types";

type WorkGoalWorkflowActionKind = "objective_submit" | "report_submit" | "objective_revise" | "report_correct";
type WorkGoalFamily = "department" | "project" | "personal";

const WORK_GOAL_LABELS = {
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

const WORK_GOAL_ACTION_KEYS = {
  department: {
    objective_submit: "work.tasks.goal.department.objective.submit",
    report_submit: "work.tasks.goal.department.report.submit",
    objective_revise: "work.tasks.goal.department.objective.revise",
    report_correct: "work.tasks.goal.department.report.correct",
  },
  project: {
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

export function workGoalOperationLabel(request: WorkTaskApprovalRequest) {
  const kind = workGoalActionKind(request);
  if (!kind) return null;
  return WORK_GOAL_LABELS[workGoalFamily(request.latestPayload)][kind];
}

export function workGoalBaseBusinessActionKey(request: WorkTaskApprovalRequest) {
  const kind = workGoalActionKind(request);
  if (!kind) return null;
  return WORK_GOAL_ACTION_KEYS[workGoalFamily(request.latestPayload)][kind];
}

function workGoalActionKind(request: WorkTaskApprovalRequest): WorkGoalWorkflowActionKind | null {
  const entityType = workApprovalEntityType(request.latestPayload);
  if (entityType === "objective_plan") return "objective_submit";
  if (entityType === "kr_review") return "report_submit";
  if (entityType === "report") return workReportStage(request.latestPayload) === "kr" ? "objective_submit" : "report_submit";
  if (entityType === "revision" || entityType === "plan") {
    if ((request.latestPayload.changeTarget || request.latestPayload.data.changeTarget) !== "work_report") return "objective_revise";
    return workReportStage(request.latestPayload) === "kr" ? "objective_revise" : "report_correct";
  }
  return null;
}

function workGoalFamily(payload: WorkTaskApprovalPayload): WorkGoalFamily {
  return payload.targetType === "personal" ? "personal" : payload.targetType === "project" ? "project" : "department";
}

function workApprovalEntityType(payload: WorkTaskApprovalPayload) {
  return payload.entityType === "plan"
    || payload.entityType === "report"
    || payload.entityType === "objective_plan"
    || payload.entityType === "kr_review"
    || payload.entityType === "revision"
    ? payload.entityType
    : "item";
}

function workReportStage(payload: WorkTaskApprovalPayload) {
  return (payload.reportStage || payload.data.reportStage) === "kr" ? "kr" : "final";
}
