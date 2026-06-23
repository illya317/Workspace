import type { WorkItem, WorkItemDraft, WorkItemStatus, WorkTargetType } from "./types";

export const WORK_CATEGORY_OPTIONS = [
  { value: "routine", label: "日常工作" },
  { value: "non-routine", label: "非日常工作" },
] as const;

export const WORK_STATUS_OPTIONS: Array<{ value: WorkItemStatus; label: string }> = [
  { value: "doing", label: "进行中" },
  { value: "done", label: "已完成" },
  { value: "archived", label: "已归档" },
];

export const WORK_ROLE_OPTIONS = [
  { value: "viewer", label: "查看" },
  { value: "editor", label: "编辑" },
  { value: "delete", label: "删除" },
  { value: "manager", label: "管理" },
] as const;

export function getWorkSpaceLabel(type: WorkTargetType) {
  if (type === "department") return "部门";
  if (type === "project") return "项目";
  return "个人";
}

export function getWorkSpacePath(type: WorkTargetType, id: number) {
  if (type === "department") return `/work/tasks/departments/${id}`;
  if (type === "project") return `/work/tasks/projects/${id}`;
  return "/work/tasks/personal";
}

export function getStatusLabel(status: string) {
  if (status === "done") return "已完成";
  if (status === "archived") return "已归档";
  if (!status) return "无状态";
  return "进行中";
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
    linkedProjectId: isRoutine ? null : draft.linkedProjectId,
    linkedProjectTaskId: isRoutine ? null : draft.linkedProjectTaskId,
    parentWorkItemId: draft.parentWorkItemId,
    participants: draft.participants,
    sortOrder: draft.sortOrder,
  };
}
