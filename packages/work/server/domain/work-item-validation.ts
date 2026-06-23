import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";

export interface WorkItemCreateCommand {
  targetType: string;
  targetId: number;
  category: string;
  content: string;
  description: string;
  importance: number;
  urgency: number;
  status: string | null;
  ownerEmployeeId: number | null;
  startDate: Date | null;
  dueDate: Date | null;
  linkedProjectId: number | null;
  linkedProjectTaskId: number | null;
  parentWorkItemId: number | null;
  participants: string[];
  sortOrder: number;
}

export interface WorkItemUpdateCommand {
  workId: number;
  data: {
    category?: string;
    content?: string;
    description?: string;
    importance?: number;
    urgency?: number;
    status?: string | null;
    ownerEmployeeId?: number | null;
    startDate?: Date | string | null;
    dueDate?: Date | string | null;
    linkedProjectId?: number | null;
    linkedProjectTaskId?: number | null;
    parentWorkItemId?: number | null;
    participants?: string[];
    sortOrder?: number;
    isArchived?: boolean;
  };
}

export interface WorkItemDeleteCommand {
  workId: number;
}

function normalizeRequiredString(value: unknown, label: string) {
  const text = String(value || "").trim();
  return text ? okCommand(text) : failCommand(`${label}不能为空`);
}

function normalizeOptionalString(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeCategory(value: unknown) {
  const category = String(value || "").trim();
  if (category === "routine" || category === "non-routine") return okCommand(category);
  return failCommand("工作类别无效");
}

function normalizeNumber(value: unknown, fallback: number) {
  if (value === null || value === undefined || value === "") return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : Number.NaN;
}

function normalizePositiveId(value: unknown, label: string) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) return failCommand(`${label}无效`);
  return okCommand(id);
}

function normalizeNullablePositiveId(value: unknown, label: string) {
  if (value === null || value === undefined || value === "") return okCommand(null);
  return normalizePositiveId(value, label);
}

function normalizeNullableDate(value: unknown, label: string) {
  if (value === null || value === undefined || value === "") return okCommand(null);
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return failCommand(`${label}无效`);
  return okCommand(date);
}

function normalizeStatus(value: unknown) {
  if (value === null || value === undefined || value === "") return okCommand("doing");
  const status = String(value || "doing");
  if (status === "done" || status === "archived") return okCommand(status);
  if (status === "todo" || status === "doing" || status === "paused") return okCommand("doing");
  return failCommand("工作状态无效");
}

function stripRoutinePlanFields<T extends {
  status?: string | null;
  startDate?: Date | string | null;
  dueDate?: Date | string | null;
  linkedProjectId?: number | null;
  linkedProjectTaskId?: number | null;
}>(data: T) {
  data.status = null;
  data.startDate = null;
  data.dueDate = null;
  data.linkedProjectId = null;
  data.linkedProjectTaskId = null;
  return data;
}

export function buildWorkItemCreateCommand(input: {
  targetType: string;
  targetId: number;
  category: string;
  content: string;
  description?: string;
  importance?: number;
  urgency?: number;
  status?: string | null;
  ownerEmployeeId?: number | null;
  startDate?: Date | string | null;
  dueDate?: Date | string | null;
  linkedProjectId?: number | null;
  linkedProjectTaskId?: number | null;
  parentWorkItemId?: number | null;
  participants?: string[];
  sortOrder?: number;
}): DomainValidationResult<WorkItemCreateCommand> {
  const category = normalizeCategory(input.category);
  if (!category.ok) return category;
  const content = normalizeRequiredString(input.content, "工作内容");
  if (!content.ok) return content;
  const targetId = normalizePositiveId(input.targetId, "目标");
  if (!targetId.ok) return targetId;
  const importance = normalizeNumber(input.importance, 3);
  const urgency = normalizeNumber(input.urgency, 3);
  const sortOrder = normalizeNumber(input.sortOrder, 0);
  if ([importance, urgency, sortOrder].some(Number.isNaN)) return failCommand("工作项数值无效");
  const isRoutine = category.data === "routine";
  const status = isRoutine ? okCommand(null) : normalizeStatus(input.status);
  if (!status.ok) return status;
  const ownerEmployeeId = normalizeNullablePositiveId(input.ownerEmployeeId, "负责人");
  if (!ownerEmployeeId.ok) return ownerEmployeeId;
  const linkedProjectId = isRoutine ? okCommand(null) : normalizeNullablePositiveId(input.linkedProjectId, "关联项目");
  if (!linkedProjectId.ok) return linkedProjectId;
  const linkedProjectTaskId = isRoutine ? okCommand(null) : normalizeNullablePositiveId(input.linkedProjectTaskId, "关联项目任务");
  if (!linkedProjectTaskId.ok) return linkedProjectTaskId;
  const parentWorkItemId = normalizeNullablePositiveId(input.parentWorkItemId, "上级工作项");
  if (!parentWorkItemId.ok) return parentWorkItemId;
  const startDate = isRoutine ? okCommand(null) : normalizeNullableDate(input.startDate, "开始时间");
  if (!startDate.ok) return startDate;
  const dueDate = isRoutine ? okCommand(null) : normalizeNullableDate(input.dueDate, "截止时间");
  if (!dueDate.ok) return dueDate;

  return okCommand({
    targetType: input.targetType || "department",
    targetId: targetId.data,
    category: category.data,
    content: content.data,
    description: normalizeOptionalString(input.description),
    importance,
    urgency,
    status: isRoutine ? null : status.data,
    ownerEmployeeId: ownerEmployeeId.data,
    startDate: startDate.data,
    dueDate: dueDate.data,
    linkedProjectId: linkedProjectId.data,
    linkedProjectTaskId: linkedProjectTaskId.data,
    parentWorkItemId: parentWorkItemId.data,
    participants: input.participants ?? [],
    sortOrder,
  });
}

export function buildWorkItemUpdateCommand(
  workId: number,
  input: WorkItemUpdateCommand["data"],
  currentCategory: string,
): DomainValidationResult<WorkItemUpdateCommand> {
  const id = normalizePositiveId(workId, "工作项 ID");
  if (!id.ok) return id;
  const data = { ...input };
  if (data.category !== undefined) {
    const category = normalizeCategory(data.category);
    if (!category.ok) return category;
    data.category = category.data;
  }
  const effectiveCategory = data.category ?? currentCategory;
  if (data.content !== undefined) {
    const content = normalizeRequiredString(data.content, "工作内容");
    if (!content.ok) return content;
    data.content = content.data;
  }
  if (data.description !== undefined) data.description = normalizeOptionalString(data.description);
  for (const field of ["importance", "urgency", "sortOrder"] as const) {
    if (data[field] === undefined) continue;
    const number = Number(data[field]);
    if (!Number.isFinite(number)) return failCommand("工作项数值无效");
    data[field] = number;
  }
  if (data.status !== undefined) {
    const status = normalizeStatus(data.status);
    if (!status.ok) return status;
    data.status = status.data;
  }
  for (const field of ["ownerEmployeeId", "linkedProjectId", "linkedProjectTaskId", "parentWorkItemId"] as const) {
    if (data[field] === undefined) continue;
    const id = normalizeNullablePositiveId(data[field], "关联对象");
    if (!id.ok) return id;
    data[field] = id.data;
  }
  for (const field of ["startDate", "dueDate"] as const) {
    if (data[field] === undefined) continue;
    const date = normalizeNullableDate(data[field], field === "startDate" ? "开始时间" : "截止时间");
    if (!date.ok) return date;
    data[field] = date.data;
  }
  if (data.participants !== undefined && !Array.isArray(data.participants)) return failCommand("参与人无效");
  if (effectiveCategory === "routine") stripRoutinePlanFields(data);
  return okCommand({ workId: id.data, data });
}

export function validateWorkItemDeleteCommand(workId: number): DomainValidationResult<WorkItemDeleteCommand> {
  const id = normalizePositiveId(workId, "工作项 ID");
  if (!id.ok) return id;
  return okCommand({ workId: id.data });
}
