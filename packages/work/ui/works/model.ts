import { workspaceBasePath } from "@workspace/core/routing";
import type { WorkItem, WorkItemDraft, WorkItemStatus, WorkPeriodType, WorkTaskSpace, WorkTargetType } from "./types";

export const WORK_CATEGORY_OPTIONS = [
  { value: "routine", label: "日常工作" },
  { value: "non-routine", label: "非日常工作" },
] as const;

export const WORK_STATUS_OPTIONS: Array<{ value: WorkItemStatus; label: string }> = [
  { value: "doing", label: "进行中" },
  { value: "done", label: "已完成" },
  { value: "archived", label: "已归档" },
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
  if (type === "company") return `/work/tasks/companies/${id}`;
  if (type === "department") return `/work/tasks/departments/${id}`;
  if (type === "project") return `/work/tasks/projects/${id}`;
  return "/work/tasks/personal";
}

export function getWorkTargetFromPath(pathname: string, spaces: WorkTaskSpace[]) {
  const path = workspaceBasePath && pathname.startsWith(`${workspaceBasePath}/`)
    ? pathname.slice(workspaceBasePath.length)
    : pathname;
  if (path === "/work/tasks" || path === "/work/tasks/personal") return spaces.find((space) => space.targetType === "personal") || null;
  const match = path.match(/^\/work\/tasks\/(companies|departments|projects)\/(\d+)$/);
  if (!match) return null;
  const targetId = Number(match[2]);
  const targetType = ({ companies: "company", departments: "department", projects: "project" } as const)[match[1] as "companies" | "departments" | "projects"];
  return spaces.find((space) => space.targetType === targetType && space.targetId === targetId) || null;
}

export function getStatusLabel(status: string) {
  if (status === "done") return "已完成";
  if (status === "archived") return "已归档";
  if (!status) return "无状态";
  return "进行中";
}

export function getPeriodTypeLabel(periodType: string | null | undefined) {
  return WORK_PERIOD_TYPE_OPTIONS.find((option) => option.value === periodType)?.label || "不限定";
}

export function getWorkPeriodLabel(work: Pick<WorkItem, "periodType" | "periodStart" | "periodEnd">) {
  if (!work.periodType) return "长期";
  const typeLabel = getPeriodTypeLabel(work.periodType);
  if (work.periodStart && work.periodEnd) return `${typeLabel} · ${work.periodStart} - ${work.periodEnd}`;
  return typeLabel;
}

export function createEmptyWorkDraft(sortOrder = 0): WorkItemDraft {
  return {
    category: "routine",
    content: "",
    description: "",
    importance: 3,
    urgency: 3,
    status: null,
    ownerEmployeeId: null,
    ownerEmployeeName: "",
    startDate: null,
    dueDate: null,
    periodType: null,
    periodStart: null,
    periodEnd: null,
    linkedProjectId: null,
    linkedProjectName: "",
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
    category: work.category,
    content: work.content,
    description: work.description || "",
    importance: work.importance,
    urgency: work.urgency,
    status: work.category === "routine" ? null : (work.isArchived ? "archived" : work.status),
    ownerEmployeeId: work.ownerEmployeeId,
    ownerEmployeeName: work.ownerEmployeeName || "",
    startDate: work.startDate,
    dueDate: work.dueDate,
    periodType: work.periodType,
    periodStart: work.periodStart,
    periodEnd: work.periodEnd,
    linkedProjectId: work.linkedProjectId,
    linkedProjectName: work.linkedProjectName || "",
    linkedProjectTaskId: work.linkedProjectTaskId,
    linkedProjectTaskName: work.linkedProjectTaskName || "",
    parentWorkItemId: work.parentWorkItemId,
    parentWorkItemContent: work.parentWorkItemContent || "",
    participants: work.participants.map((participant) => participant.name).join("、"),
    sortOrder: work.sortOrder,
  };
}

export function workDraftPayload(draft: WorkItemDraft) {
  const isRoutine = draft.category === "routine";
  return {
    category: draft.category,
    content: draft.content,
    description: draft.description,
    importance: draft.importance,
    urgency: draft.urgency,
    status: isRoutine ? null : draft.status,
    isArchived: !isRoutine && draft.status === "archived",
    ownerEmployeeId: draft.ownerEmployeeId,
    startDate: isRoutine ? null : draft.startDate,
    dueDate: isRoutine ? null : draft.dueDate,
    periodType: draft.periodType,
    periodStart: draft.periodType ? draft.periodStart : null,
    periodEnd: draft.periodType ? draft.periodEnd : null,
    linkedProjectId: isRoutine ? null : draft.linkedProjectId,
    linkedProjectTaskId: isRoutine ? null : draft.linkedProjectTaskId,
    parentWorkItemId: draft.parentWorkItemId,
    participants: draft.participants,
    sortOrder: draft.sortOrder,
  };
}
