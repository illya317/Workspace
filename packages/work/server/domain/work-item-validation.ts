import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";
import {
  inferSourceKind,
  normalizeSourceKind,
  normalizeSourceType,
  stripMeetingSourceFields,
  stripProjectSourceFields,
} from "./work-item-source-validation";

export interface WorkItemCreateCommand {
  planId: number;
  targetType: string;
  targetId: number;
  category: string;
  itemType: string;
  content: string;
  description: string;
  importance: number;
  urgency: number;
  status: string | null;
  krStartValue: number | null;
  krTargetValue: number | null;
  krCurrentValue: number | null;
  krUnit: string | null;
  ownerEmployeeId: number | null;
  startDate: Date | null;
  dueDate: Date | null;
  periodType: string | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  sourceType: string;
  sourceKind: string | null;
  sourceMeetingId: number | null;
  sourceMeetingDecisionId: number | null;
  sourceMeetingActionCandidateId: number | null;
  linkedProjectId: number | null;
  linkedProjectPhaseId: number | null;
  linkedProjectTaskId: number | null;
  parentWorkItemId: number | null;
  participants: string[];
  sortOrder: number;
}

export interface WorkItemUpdateCommand {
  workId: number;
  data: {
    planId?: number | null;
    category?: string;
    itemType?: string;
    content?: string;
    description?: string;
    importance?: number;
    urgency?: number;
    status?: string | null;
    krStartValue?: number | null;
    krTargetValue?: number | null;
    krCurrentValue?: number | null;
    krUnit?: string | null;
    ownerEmployeeId?: number | null;
    startDate?: Date | string | null;
    dueDate?: Date | string | null;
    periodType?: string | null;
    periodStart?: Date | string | null;
    periodEnd?: Date | string | null;
    sourceType?: string;
    sourceKind?: string | null;
    sourceMeetingId?: number | null;
    sourceMeetingDecisionId?: number | null;
    sourceMeetingActionCandidateId?: number | null;
    linkedProjectId?: number | null;
    linkedProjectPhaseId?: number | null;
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

function normalizeItemType(value: unknown) {
  if (value === null || value === undefined || value === "") return okCommand("task");
  const itemType = String(value || "").trim();
  if (itemType === "objective" || itemType === "key_result" || itemType === "task") return okCommand(itemType);
  return failCommand("节点类型无效");
}

function normalizeNumber(value: unknown, fallback: number) {
  if (value === null || value === undefined || value === "") return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : Number.NaN;
}

function normalizeNullableNumber(value: unknown, label: string) {
  if (value === null || value === undefined || value === "") return okCommand(null);
  const number = Number(value);
  if (!Number.isFinite(number)) return failCommand(`${label}无效`);
  return okCommand(number);
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

function normalizePeriodType(value: unknown) {
  if (value === null || value === undefined || value === "") return okCommand(null);
  const periodType = String(value || "").trim();
  if (periodType === "daily" || periodType === "weekly" || periodType === "monthly" || periodType === "quarterly" || periodType === "yearly") {
    return okCommand(periodType);
  }
  return failCommand("计划周期类型无效");
}

function normalizePeriodFields(input: {
  periodType?: string | null;
  periodStart?: Date | string | null;
  periodEnd?: Date | string | null;
}) {
  const periodType = normalizePeriodType(input.periodType);
  if (!periodType.ok) return periodType;
  const periodStart = normalizeNullableDate(input.periodStart, "周期开始");
  if (!periodStart.ok) return periodStart;
  const periodEnd = normalizeNullableDate(input.periodEnd, "周期结束");
  if (!periodEnd.ok) return periodEnd;

  if (!periodType.data) {
    if (periodStart.data || periodEnd.data) return failCommand("设置周期起止时必须选择周期类型");
    return okCommand({ periodType: null, periodStart: null, periodEnd: null });
  }
  if (!periodStart.data || !periodEnd.data) return failCommand("计划周期起止不能为空");
  if (periodEnd.data < periodStart.data) return failCommand("周期结束不能早于周期开始");
  return okCommand({ periodType: periodType.data, periodStart: periodStart.data, periodEnd: periodEnd.data });
}

function stripNonExecutableFields<T extends {
  status?: string | null;
  startDate?: Date | string | null;
  dueDate?: Date | string | null;
}>(data: T) {
  data.status = null;
  data.startDate = null;
  data.dueDate = null;
  return data;
}

function stripNonKrFields<T extends {
  krStartValue?: number | null;
  krTargetValue?: number | null;
  krCurrentValue?: number | null;
  krUnit?: string | null;
}>(data: T) {
  data.krStartValue = null;
  data.krTargetValue = null;
  data.krCurrentValue = null;
  data.krUnit = null;
  return data;
}

export function buildWorkItemCreateCommand(input: {
  planId?: number | null;
  targetType: string;
  targetId: number;
  category?: string;
  itemType?: string;
  content: string;
  description?: string;
  importance?: number;
  urgency?: number;
  status?: string | null;
  krStartValue?: number | null;
  krTargetValue?: number | null;
  krCurrentValue?: number | null;
  krUnit?: string | null;
  ownerEmployeeId?: number | null;
  startDate?: Date | string | null;
  dueDate?: Date | string | null;
  periodType?: string | null;
  periodStart?: Date | string | null;
  periodEnd?: Date | string | null;
  sourceType?: string;
  sourceKind?: string | null;
  linkedProjectId?: number | null;
  linkedProjectPhaseId?: number | null;
  linkedProjectTaskId?: number | null;
  sourceMeetingId?: number | null;
  sourceMeetingDecisionId?: number | null;
  sourceMeetingActionCandidateId?: number | null;
  parentWorkItemId?: number | null;
  participants?: string[];
  sortOrder?: number;
}): DomainValidationResult<WorkItemCreateCommand> {
  const planId = normalizePositiveId(input.planId, "工作计划");
  if (!planId.ok) return planId;
  const category = normalizeCategory(input.category || "non-routine");
  if (!category.ok) return category;
  const itemType = normalizeItemType(input.itemType);
  if (!itemType.ok) return itemType;
  const content = normalizeRequiredString(input.content, "节点内容");
  if (!content.ok) return content;
  const targetId = normalizePositiveId(input.targetId, "目标");
  if (!targetId.ok) return targetId;
  const importance = normalizeNumber(input.importance, 3);
  const urgency = normalizeNumber(input.urgency, 3);
  const sortOrder = normalizeNumber(input.sortOrder, 0);
  if ([importance, urgency, sortOrder].some(Number.isNaN)) return failCommand("工作项数值无效");
  const isTask = itemType.data === "task";
  const status = isTask ? normalizeStatus(input.status) : okCommand(null);
  if (!status.ok) return status;
  const krStartValue = normalizeNullableNumber(input.krStartValue, "KR 起点");
  if (!krStartValue.ok) return krStartValue;
  const krTargetValue = normalizeNullableNumber(input.krTargetValue, "KR 目标");
  if (!krTargetValue.ok) return krTargetValue;
  const krCurrentValue = normalizeNullableNumber(input.krCurrentValue, "KR 当前值");
  if (!krCurrentValue.ok) return krCurrentValue;
  const ownerEmployeeId = normalizeNullablePositiveId(input.ownerEmployeeId, "负责人");
  if (!ownerEmployeeId.ok) return ownerEmployeeId;
  const sourceType = normalizeSourceType(input.sourceType);
  if (!sourceType.ok) return sourceType;
  const sourceKind = normalizeSourceKind(input.sourceKind);
  if (!sourceKind.ok) return sourceKind;
  const linkedProjectId = normalizeNullablePositiveId(input.linkedProjectId, "关联项目");
  if (!linkedProjectId.ok) return linkedProjectId;
  const linkedProjectPhaseId = normalizeNullablePositiveId(input.linkedProjectPhaseId, "关联项目阶段");
  if (!linkedProjectPhaseId.ok) return linkedProjectPhaseId;
  const linkedProjectTaskId = normalizeNullablePositiveId(input.linkedProjectTaskId, "关联项目任务");
  if (!linkedProjectTaskId.ok) return linkedProjectTaskId;
  const sourceMeetingId = normalizeNullablePositiveId(input.sourceMeetingId, "来源会议");
  if (!sourceMeetingId.ok) return sourceMeetingId;
  const sourceMeetingDecisionId = normalizeNullablePositiveId(input.sourceMeetingDecisionId, "来源会议决议");
  if (!sourceMeetingDecisionId.ok) return sourceMeetingDecisionId;
  const sourceMeetingActionCandidateId = normalizeNullablePositiveId(input.sourceMeetingActionCandidateId, "来源会议行动候选");
  if (!sourceMeetingActionCandidateId.ok) return sourceMeetingActionCandidateId;
  const parentWorkItemId = normalizeNullablePositiveId(input.parentWorkItemId, "上级工作项");
  if (!parentWorkItemId.ok) return parentWorkItemId;
  const startDate = isTask ? normalizeNullableDate(input.startDate, "开始时间") : okCommand(null);
  if (!startDate.ok) return startDate;
  const dueDate = isTask ? normalizeNullableDate(input.dueDate, "截止时间") : okCommand(null);
  if (!dueDate.ok) return dueDate;
  const period = normalizePeriodFields(input);
  if (!period.ok) return period;
  const sourceData = {
    sourceType: sourceType.data,
    sourceKind: inferSourceKind({
      sourceType: sourceType.data,
      sourceKind: sourceKind.data,
      linkedProjectId: linkedProjectId.data,
      linkedProjectPhaseId: linkedProjectPhaseId.data,
      linkedProjectTaskId: linkedProjectTaskId.data,
    }),
    linkedProjectId: linkedProjectId.data,
    linkedProjectPhaseId: linkedProjectPhaseId.data,
    linkedProjectTaskId: linkedProjectTaskId.data,
    sourceMeetingId: sourceMeetingId.data,
    sourceMeetingDecisionId: sourceMeetingDecisionId.data,
    sourceMeetingActionCandidateId: sourceMeetingActionCandidateId.data,
  };
  if (sourceData.sourceType !== "project") stripProjectSourceFields(sourceData);
  if (sourceData.sourceType !== "meeting") stripMeetingSourceFields(sourceData);
  const krData = {
    krStartValue: krStartValue.data,
    krTargetValue: krTargetValue.data,
    krCurrentValue: krCurrentValue.data,
    krUnit: normalizeOptionalString(input.krUnit) || null,
  };
  if (itemType.data !== "key_result") stripNonKrFields(krData);

  return okCommand({
    planId: planId.data,
    targetType: input.targetType || "department",
    targetId: targetId.data,
    category: category.data,
    itemType: itemType.data,
    content: content.data,
    description: normalizeOptionalString(input.description),
    importance,
    urgency,
    status: isTask ? status.data : null,
    ...krData,
    ownerEmployeeId: ownerEmployeeId.data,
    startDate: startDate.data,
    dueDate: dueDate.data,
    periodType: period.data.periodType,
    periodStart: period.data.periodStart,
    periodEnd: period.data.periodEnd,
    ...sourceData,
    parentWorkItemId: parentWorkItemId.data,
    participants: input.participants ?? [],
    sortOrder,
  });
}

export function buildWorkItemUpdateCommand(
  workId: number,
  input: WorkItemUpdateCommand["data"],
  current: { category: string; itemType: string; sourceType: string },
): DomainValidationResult<WorkItemUpdateCommand> {
  const id = normalizePositiveId(workId, "节点 ID");
  if (!id.ok) return id;
  const data = { ...input };
  if (data.category !== undefined) {
    const category = normalizeCategory(data.category);
    if (!category.ok) return category;
    data.category = category.data;
  }
  if (data.planId !== undefined) {
    const planId = normalizePositiveId(data.planId, "工作计划");
    if (!planId.ok) return planId;
    data.planId = planId.data;
  }
  if (data.itemType !== undefined) {
    const itemType = normalizeItemType(data.itemType);
    if (!itemType.ok) return itemType;
    data.itemType = itemType.data;
  }
  const effectiveItemType = data.itemType ?? current.itemType;
  if (data.content !== undefined) {
    const content = normalizeRequiredString(data.content, "节点内容");
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
  for (const field of ["krStartValue", "krTargetValue", "krCurrentValue"] as const) {
    if (data[field] === undefined) continue;
    const number = normalizeNullableNumber(data[field], "KR 数值");
    if (!number.ok) return number;
    data[field] = number.data;
  }
  if (data.krUnit !== undefined) data.krUnit = normalizeOptionalString(data.krUnit) || null;
  if (data.periodType !== undefined) {
    const periodType = normalizePeriodType(data.periodType);
    if (!periodType.ok) return periodType;
    data.periodType = periodType.data;
    if (periodType.data === null) {
      data.periodStart = null;
      data.periodEnd = null;
    }
  }
  if (data.sourceType !== undefined) {
    const sourceType = normalizeSourceType(data.sourceType);
    if (!sourceType.ok) return sourceType;
    data.sourceType = sourceType.data;
  }
  if (data.sourceKind !== undefined) {
    const sourceKind = normalizeSourceKind(data.sourceKind);
    if (!sourceKind.ok) return sourceKind;
    data.sourceKind = sourceKind.data;
  }
  for (const field of ["ownerEmployeeId", "linkedProjectId", "linkedProjectPhaseId", "linkedProjectTaskId", "sourceMeetingId", "sourceMeetingDecisionId", "sourceMeetingActionCandidateId", "parentWorkItemId"] as const) {
    if (data[field] === undefined) continue;
    const id = normalizeNullablePositiveId(data[field], "关联对象");
    if (!id.ok) return id;
    data[field] = id.data;
  }
  for (const field of ["startDate", "dueDate", "periodStart", "periodEnd"] as const) {
    if (data[field] === undefined) continue;
    const labels = {
      startDate: "开始时间",
      dueDate: "截止时间",
      periodStart: "周期开始",
      periodEnd: "周期结束",
    };
    const date = normalizeNullableDate(data[field], labels[field]);
    if (!date.ok) return date;
    data[field] = date.data;
  }
  if (data.periodStart && data.periodEnd && data.periodEnd < data.periodStart) return failCommand("周期结束不能早于周期开始");
  if (data.participants !== undefined && !Array.isArray(data.participants)) return failCommand("参与人无效");
  if (effectiveItemType !== "task") stripNonExecutableFields(data);
  if (effectiveItemType !== "key_result") stripNonKrFields(data);
  const effectiveSourceType = data.sourceType ?? current.sourceType;
  if (effectiveSourceType !== "project") {
    stripProjectSourceFields(data);
  } else if (data.sourceKind === undefined) {
    const inferred = inferSourceKind({
      sourceType: effectiveSourceType,
      sourceKind: data.sourceKind,
      linkedProjectId: data.linkedProjectId,
      linkedProjectPhaseId: data.linkedProjectPhaseId,
      linkedProjectTaskId: data.linkedProjectTaskId,
    });
    if (inferred) data.sourceKind = inferred;
  }
  if (effectiveSourceType !== "meeting") stripMeetingSourceFields(data);
  return okCommand({ workId: id.data, data });
}

export function validateWorkItemDeleteCommand(workId: number): DomainValidationResult<WorkItemDeleteCommand> {
  const id = normalizePositiveId(workId, "节点 ID");
  if (!id.ok) return id;
  return okCommand({ workId: id.data });
}
