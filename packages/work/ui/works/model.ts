import { workspaceBasePath } from "@workspace/core/routing";
import type { WorkItem, WorkItemDraft, WorkItemStatus, WorkItemType, WorkPeriodType, WorkPlan, WorkPlanDraft, WorkSourceKind, WorkSourceType, WorkTaskSpace, WorkTargetType } from "./types";

export const WORK_CATEGORY_OPTIONS = [
  { value: "routine", label: "日常工作" },
  { value: "non-routine", label: "非日常工作" },
] as const;

export const WORK_STATUS_OPTIONS: Array<{ value: WorkItemStatus; label: string }> = [
  { value: "doing", label: "进行中" },
  { value: "done", label: "已完成" },
  { value: "archived", label: "已归档" },
];

export const WORK_ITEM_TYPE_OPTIONS: Array<{ value: WorkItemType; label: string }> = [
  { value: "objective", label: "目标" },
  { value: "key_result", label: "关键结果" },
  { value: "task", label: "子任务" },
];

export const WORK_SOURCE_TYPE_OPTIONS: Array<{ value: WorkSourceType; label: string }> = [
  { value: "routine", label: "日常" },
  { value: "project", label: "项目" },
  { value: "meeting", label: "会议" },
  { value: "other", label: "其他" },
];

export const WORK_PROJECT_SOURCE_KIND_OPTIONS: Array<{ value: WorkSourceKind; label: string }> = [
  { value: "project", label: "项目" },
  { value: "project_phase", label: "项目阶段" },
  { value: "project_task", label: "项目任务" },
];

export const WORK_PERIOD_TYPE_OPTIONS: Array<{ value: WorkPeriodType; label: string }> = [
  { value: "daily", label: "按日" },
  { value: "weekly", label: "按周" },
  { value: "monthly", label: "按月" },
  { value: "quarterly", label: "按季度" },
  { value: "yearly", label: "按年" },
];

export const WORK_ROLE_OPTIONS = [
  { value: "viewer", label: "查看" },
  { value: "editor", label: "编辑" },
  { value: "delete", label: "删除" },
  { value: "manager", label: "管理" },
] as const;

export function getWorkSpaceLabel(type: WorkTargetType) {
  if (type === "company") return "公司";
  if (type === "department") return "部门";
  if (type === "project") return "项目";
  return "个人";
}

export function getWorkSpacePath(type: WorkTargetType, id: number) {
  if (type === "personal") return `/work/tasks/personal/${id}`;
  if (type === "company") return `/work/tasks/companies/${id}`;
  if (type === "department") return `/work/tasks/departments/${id}`;
  if (type === "project") return `/work/tasks/projects/${id}`;
  return "/work/tasks";
}

export function getWorkTargetFromPath(pathname: string, spaces: WorkTaskSpace[]) {
  const path = workspaceBasePath && pathname.startsWith(`${workspaceBasePath}/`)
    ? pathname.slice(workspaceBasePath.length)
    : pathname;
  if (path === "/work/tasks" || path === "/work/tasks/personal") return spaces.find((space) => space.targetType === "personal") || null;
  const match = path.match(/^\/work\/tasks\/(personal|companies|departments|projects)\/(\d+)$/);
  if (!match) return null;
  const targetId = Number(match[2]);
  const targetType = ({ personal: "personal", companies: "company", departments: "department", projects: "project" } as const)[match[1] as "personal" | "companies" | "departments" | "projects"];
  return spaces.find((space) => space.targetType === targetType && space.targetId === targetId) || null;
}

export function getStatusLabel(status: string) {
  if (status === "done") return "已完成";
  if (status === "archived") return "已归档";
  if (!status) return "无状态";
  return "进行中";
}

export function getWorkItemTypeLabel(itemType: string | null | undefined) {
  return WORK_ITEM_TYPE_OPTIONS.find((option) => option.value === itemType)?.label || "任务";
}

export function getWorkSourceTypeLabel(sourceType: string | null | undefined) {
  return WORK_SOURCE_TYPE_OPTIONS.find((option) => option.value === sourceType)?.label || "其他";
}

export function getPeriodTypeLabel(periodType: string | null | undefined) {
  return WORK_PERIOD_TYPE_OPTIONS.find((option) => option.value === periodType)?.label || "不限定";
}

export function getWorkPeriodLabel(work: Pick<WorkItem | WorkPlan, "periodType" | "periodStart" | "periodEnd">) {
  if (!work.periodType) return "长期";
  const typeLabel = getPeriodTypeLabel(work.periodType);
  if (work.periodStart && work.periodEnd) return `${typeLabel} · ${work.periodStart} - ${work.periodEnd}`;
  return typeLabel;
}

export function createEmptyWorkPlanDraft(sortOrder = 0): WorkPlanDraft {
  return {
    title: "",
    description: "",
    status: "active",
    ownerEmployeeId: null,
    ownerEmployeeName: "",
    periodType: null,
    periodStart: null,
    periodEnd: null,
    sourceType: "other",
    sourceKind: null,
    sourceMeetingId: null,
    sourceMeetingTitle: "",
    sourceMeetingDecisionId: null,
    sourceMeetingDecisionTitle: "",
    sourceMeetingActionCandidateId: null,
    sourceMeetingActionCandidateTitle: "",
    linkedProjectId: null,
    linkedProjectName: "",
    linkedProjectPhaseId: null,
    linkedProjectPhaseName: "",
    linkedProjectTaskId: null,
    linkedProjectTaskName: "",
    sortOrder,
  };
}

export function createWorkPlanDraft(plan: WorkPlan): WorkPlanDraft {
  return {
    title: plan.title,
    description: plan.description || "",
    status: plan.status,
    ownerEmployeeId: plan.ownerEmployeeId,
    ownerEmployeeName: plan.ownerEmployeeName || "",
    periodType: plan.periodType,
    periodStart: plan.periodStart,
    periodEnd: plan.periodEnd,
    sourceType: plan.sourceType,
    sourceKind: plan.sourceKind,
    sourceMeetingId: plan.sourceMeetingId,
    sourceMeetingTitle: plan.sourceMeetingTitle || "",
    sourceMeetingDecisionId: plan.sourceMeetingDecisionId,
    sourceMeetingDecisionTitle: plan.sourceMeetingDecisionTitle || "",
    sourceMeetingActionCandidateId: plan.sourceMeetingActionCandidateId,
    sourceMeetingActionCandidateTitle: plan.sourceMeetingActionCandidateTitle || "",
    linkedProjectId: plan.linkedProjectId,
    linkedProjectName: plan.linkedProjectName || "",
    linkedProjectPhaseId: plan.linkedProjectPhaseId,
    linkedProjectPhaseName: plan.linkedProjectPhaseName || "",
    linkedProjectTaskId: plan.linkedProjectTaskId,
    linkedProjectTaskName: plan.linkedProjectTaskName || "",
    sortOrder: plan.sortOrder,
  };
}

export function workPlanDraftPayload(draft: WorkPlanDraft) {
  const isProjectSource = draft.sourceType === "project";
  const isMeetingSource = draft.sourceType === "meeting";
  return {
    kind: "okr",
    title: draft.title,
    description: draft.description,
    status: draft.status,
    ownerEmployeeId: draft.ownerEmployeeId,
    periodType: draft.periodType,
    periodStart: draft.periodType ? draft.periodStart : null,
    periodEnd: draft.periodType ? draft.periodEnd : null,
    sourceType: draft.sourceType,
    sourceKind: isProjectSource ? inferProjectSourceKind(draft) : null,
    sourceMeetingId: isMeetingSource ? draft.sourceMeetingId : null,
    sourceMeetingDecisionId: isMeetingSource ? draft.sourceMeetingDecisionId : null,
    sourceMeetingActionCandidateId: isMeetingSource ? draft.sourceMeetingActionCandidateId : null,
    linkedProjectId: isProjectSource ? draft.linkedProjectId : null,
    linkedProjectPhaseId: isProjectSource && draft.sourceKind === "project_phase" ? draft.linkedProjectPhaseId : null,
    linkedProjectTaskId: isProjectSource && draft.sourceKind === "project_task" ? draft.linkedProjectTaskId : null,
    sortOrder: draft.sortOrder,
  };
}

export function createEmptyWorkDraft(sortOrder = 0, planId: number | null = null): WorkItemDraft {
  return {
    planId,
    category: "non-routine",
    itemType: "task",
    content: "",
    description: "",
    importance: 3,
    urgency: 3,
    status: "doing",
    krStartValue: null,
    krTargetValue: null,
    krCurrentValue: null,
    krUnit: "",
    ownerEmployeeId: null,
    ownerEmployeeName: "",
    startDate: null,
    dueDate: null,
    periodType: null,
    periodStart: null,
    periodEnd: null,
    sourceType: "other",
    sourceKind: null,
    sourceMeetingId: null,
    sourceMeetingTitle: "",
    sourceMeetingDecisionId: null,
    sourceMeetingDecisionTitle: "",
    sourceMeetingActionCandidateId: null,
    sourceMeetingActionCandidateTitle: "",
    linkedProjectId: null,
    linkedProjectName: "",
    linkedProjectPhaseId: null,
    linkedProjectPhaseName: "",
    linkedProjectTaskId: null,
    linkedProjectTaskName: "",
    parentWorkItemId: null,
    parentWorkItemContent: "",
    participants: "",
    sortOrder,
  };
}

export function createWorkDraft(work: WorkItem): WorkItemDraft {
  return {
    planId: work.planId,
    category: work.category,
    itemType: work.itemType,
    content: work.content,
    description: work.description || "",
    importance: work.importance,
    urgency: work.urgency,
    status: work.itemType === "task" ? (work.isArchived ? "archived" : work.status || "doing") : null,
    krStartValue: work.krStartValue,
    krTargetValue: work.krTargetValue,
    krCurrentValue: work.krCurrentValue,
    krUnit: work.krUnit || "",
    ownerEmployeeId: work.ownerEmployeeId,
    ownerEmployeeName: work.ownerEmployeeName || "",
    startDate: work.startDate,
    dueDate: work.dueDate,
    periodType: work.periodType,
    periodStart: work.periodStart,
    periodEnd: work.periodEnd,
    sourceType: work.sourceType,
    sourceKind: work.sourceKind,
    sourceMeetingId: work.sourceMeetingId,
    sourceMeetingTitle: work.sourceMeetingTitle || "",
    sourceMeetingDecisionId: work.sourceMeetingDecisionId,
    sourceMeetingDecisionTitle: work.sourceMeetingDecisionTitle || "",
    sourceMeetingActionCandidateId: work.sourceMeetingActionCandidateId,
    sourceMeetingActionCandidateTitle: work.sourceMeetingActionCandidateTitle || "",
    linkedProjectId: work.linkedProjectId,
    linkedProjectName: work.linkedProjectName || "",
    linkedProjectPhaseId: work.linkedProjectPhaseId,
    linkedProjectPhaseName: work.linkedProjectPhaseName || "",
    linkedProjectTaskId: work.linkedProjectTaskId,
    linkedProjectTaskName: work.linkedProjectTaskName || "",
    parentWorkItemId: work.parentWorkItemId,
    parentWorkItemContent: work.parentWorkItemContent || "",
    participants: work.participants.map((participant) => participant.name).join("、"),
    sortOrder: work.sortOrder,
  };
}

export function workDraftPayload(draft: WorkItemDraft) {
  const isTask = draft.itemType === "task";
  const isKr = draft.itemType === "key_result";
  const isProjectSource = draft.sourceType === "project";
  const isMeetingSource = draft.sourceType === "meeting";
  return {
    category: draft.category,
    planId: draft.planId,
    itemType: draft.itemType,
    content: draft.content,
    description: draft.description,
    importance: draft.importance,
    urgency: draft.urgency,
    status: isTask ? draft.status : null,
    isArchived: isTask && draft.status === "archived",
    krStartValue: isKr ? draft.krStartValue : null,
    krTargetValue: isKr ? draft.krTargetValue : null,
    krCurrentValue: isKr ? draft.krCurrentValue : null,
    krUnit: isKr ? draft.krUnit : null,
    ownerEmployeeId: draft.ownerEmployeeId,
    startDate: isTask ? draft.startDate : null,
    dueDate: isTask ? draft.dueDate : null,
    periodType: draft.periodType,
    periodStart: draft.periodType ? draft.periodStart : null,
    periodEnd: draft.periodType ? draft.periodEnd : null,
    sourceType: draft.sourceType,
    sourceKind: isProjectSource ? inferProjectSourceKind(draft) : null,
    sourceMeetingId: isMeetingSource ? draft.sourceMeetingId : null,
    sourceMeetingDecisionId: isMeetingSource ? draft.sourceMeetingDecisionId : null,
    sourceMeetingActionCandidateId: isMeetingSource ? draft.sourceMeetingActionCandidateId : null,
    linkedProjectId: isProjectSource ? draft.linkedProjectId : null,
    linkedProjectPhaseId: isProjectSource && draft.sourceKind === "project_phase" ? draft.linkedProjectPhaseId : null,
    linkedProjectTaskId: isProjectSource && draft.sourceKind === "project_task" ? draft.linkedProjectTaskId : null,
    parentWorkItemId: draft.parentWorkItemId,
    participants: draft.participants,
    sortOrder: draft.sortOrder,
  };
}

function inferProjectSourceKind(draft: Pick<WorkItemDraft | WorkPlanDraft, "sourceKind" | "linkedProjectTaskId" | "linkedProjectPhaseId" | "linkedProjectId">): WorkSourceKind | null {
  if (draft.sourceKind) return draft.sourceKind;
  if (draft.linkedProjectTaskId) return "project_task";
  if (draft.linkedProjectPhaseId) return "project_phase";
  if (draft.linkedProjectId) return "project";
  return null;
}
