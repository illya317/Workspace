import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";

export interface WorkItemCreateCommand {
  targetType: string;
  targetId: number;
  category: string;
  content: string;
  importance: number;
  urgency: number;
  participants: string[];
  sortOrder: number;
}

export interface WorkItemUpdateCommand {
  workId: number;
  data: {
    category?: string;
    content?: string;
    importance?: number;
    urgency?: number;
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

export function buildWorkItemCreateCommand(input: {
  targetType: string;
  targetId: number;
  category: string;
  content: string;
  importance?: number;
  urgency?: number;
  participants?: string[];
  sortOrder?: number;
}): DomainValidationResult<WorkItemCreateCommand> {
  const category = normalizeRequiredString(input.category, "工作类别");
  if (!category.ok) return category;
  const content = normalizeRequiredString(input.content, "工作内容");
  if (!content.ok) return content;
  const targetId = normalizePositiveId(input.targetId, "目标");
  if (!targetId.ok) return targetId;
  const importance = normalizeNumber(input.importance, 3);
  const urgency = normalizeNumber(input.urgency, 3);
  const sortOrder = normalizeNumber(input.sortOrder, 0);
  if ([importance, urgency, sortOrder].some(Number.isNaN)) return failCommand("工作项数值无效");

  return okCommand({
    targetType: input.targetType || "department",
    targetId: targetId.data,
    category: category.data,
    content: content.data,
    importance,
    urgency,
    participants: input.participants ?? [],
    sortOrder,
  });
}

export function buildWorkItemUpdateCommand(
  workId: number,
  input: WorkItemUpdateCommand["data"],
): DomainValidationResult<WorkItemUpdateCommand> {
  const id = normalizePositiveId(workId, "工作项 ID");
  if (!id.ok) return id;
  const data = { ...input };
  if (data.category !== undefined) {
    const category = normalizeRequiredString(data.category, "工作类别");
    if (!category.ok) return category;
    data.category = category.data;
  }
  if (data.content !== undefined) {
    const content = normalizeRequiredString(data.content, "工作内容");
    if (!content.ok) return content;
    data.content = content.data;
  }
  for (const field of ["importance", "urgency", "sortOrder"] as const) {
    if (data[field] === undefined) continue;
    const number = Number(data[field]);
    if (!Number.isFinite(number)) return failCommand("工作项数值无效");
    data[field] = number;
  }
  if (data.participants !== undefined && !Array.isArray(data.participants)) return failCommand("参与人无效");
  return okCommand({ workId: id.data, data });
}

export function validateWorkItemDeleteCommand(workId: number): DomainValidationResult<WorkItemDeleteCommand> {
  const id = normalizePositiveId(workId, "工作项 ID");
  if (!id.ok) return id;
  return okCommand({ workId: id.data });
}
