import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";
import { isCompletedStatus, validateCompletionSchedule } from "@workspace/platform/completion-date-policy";
import {
  inferSourceKind,
  normalizeSourceKind,
  normalizeSourceType,
  stripDepartmentSourceFields,
  stripMeetingSourceFields,
  stripProjectSourceFields,
} from "./work-item-source-validation";
import {
  emptyRoutineRecurrenceFields,
  normalizeRoutineRecurrenceFields,
  recurrenceFieldNames,
} from "./work-item-routine-recurrence";
import type { WorkItemCreateCommand, WorkItemDeleteCommand, WorkItemUpdateCommand } from "./work-item-command-types";
export type { WorkItemCreateCommand, WorkItemDeleteCommand, WorkItemUpdateCommand } from "./work-item-command-types";

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
  if (value === null || value === undefined || value === "") return okCommand("active");
  const status = String(value || "active");
  if (status === "active" || status === "paused" || status === "done") return okCommand(status);
  return failCommand("工作状态无效");
}

function normalizeRoutineTaskType(value: unknown) {
  if (value === null || value === undefined || value === "") return okCommand(null);
  const type = String(value || "").trim();
  if (type === "standing" || type === "task") return okCommand(type);
  return failCommand("日常任务类型无效");
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

function stripNonTaskDateFields<T extends {
  actualStartDate?: Date | string | null;
  actualEndDate?: Date | string | null;
  plannedStartDate?: Date | string | null;
  plannedEndDate?: Date | string | null;
}>(data: T) {
  data.actualStartDate = null;
  data.actualEndDate = null;
  data.plannedStartDate = null;
  data.plannedEndDate = null;
  return data;
}

function normalizeMilestoneFields(input: {
  isMilestone?: boolean;
  milestoneDate?: Date | string | null;
}, itemType: string) {
  const isMilestone = itemType === "objective" && input.isMilestone === true;
  const milestoneDate = isMilestone ? normalizeNullableDate(input.milestoneDate, "里程碑日期") : okCommand(null);
  if (!milestoneDate.ok) return milestoneDate;
  return okCommand({ isMilestone, milestoneDate: milestoneDate.data });
}

function normalizePlannedFields(input: {
  plannedStartDate?: Date | string | null;
  plannedEndDate?: Date | string | null;
}, itemType: string) {
  const enabled = itemType === "objective" || itemType === "task";
  const plannedStartDate = enabled ? normalizeNullableDate(input.plannedStartDate, "计划开始") : okCommand(null);
  if (!plannedStartDate.ok) return plannedStartDate;
  const plannedEndDate = enabled ? normalizeNullableDate(input.plannedEndDate, "计划结束") : okCommand(null);
  if (!plannedEndDate.ok) return plannedEndDate;
  if (plannedStartDate.data && plannedEndDate.data && plannedEndDate.data < plannedStartDate.data) return failCommand("计划结束不能早于计划开始");
  return okCommand({ plannedStartDate: plannedStartDate.data, plannedEndDate: plannedEndDate.data });
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
  routineTaskType?: string | null;
  routineRecurrenceType?: string | null;
  routineRecurrenceTime?: string | null;
  routineRecurrenceWeekday?: number | null;
  routineRecurrenceMonthDay?: number | null;
  routineRecurrenceQuarterDay?: number | null;
  routineRecurrenceYearMonth?: number | null;
  routineRecurrenceYearDay?: number | null;
  ownerEmployeeId?: number | null;
  collaborationId?: number | null;
  actualStartDate?: Date | string | null;
  actualEndDate?: Date | string | null;
  plannedStartDate?: Date | string | null;
  plannedEndDate?: Date | string | null;
  isMilestone?: boolean;
  milestoneDate?: Date | string | null;
  periodType?: string | null;
  periodStart?: Date | string | null;
  periodEnd?: Date | string | null;
  sourceType?: string;
  sourceKind?: string | null;
  linkedProjectId?: number | null;
  linkedProjectPhaseId?: number | null;
  sourceMeetingId?: number | null;
  sourceMeetingDecisionId?: number | null;
  sourceMeetingActionCandidateId?: number | null;
  sourceDepartmentId?: number | null;
  parentWorkItemId?: number | null;
  parentPeriodWorkItemId?: number | null;
  previousPeriodWorkItemId?: number | null;
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
  const isObjective = itemType.data === "objective";
  const isTask = itemType.data === "task";
  const status = normalizeStatus(input.status);
  if (!status.ok) return status;
  const krStartValue = normalizeNullableNumber(input.krStartValue, "KR 起点");
  if (!krStartValue.ok) return krStartValue;
  const krTargetValue = normalizeNullableNumber(input.krTargetValue, "KR 目标");
  if (!krTargetValue.ok) return krTargetValue;
  const krCurrentValue = normalizeNullableNumber(input.krCurrentValue, "KR 当前值");
  if (!krCurrentValue.ok) return krCurrentValue;
  const routineTaskType = normalizeRoutineTaskType(input.routineTaskType);
  if (!routineTaskType.ok) return routineTaskType;
  const effectiveRoutineTaskType = category.data === "routine" && itemType.data === "task" ? routineTaskType.data || "task" : null;
  const recurrence = normalizeRoutineRecurrenceFields(input, effectiveRoutineTaskType === "task" && Boolean(input.routineRecurrenceType));
  if (!recurrence.ok) return recurrence;
  const ownerEmployeeId = normalizeNullablePositiveId(input.ownerEmployeeId, "负责人");
  if (!ownerEmployeeId.ok) return ownerEmployeeId;
  const collaborationId = normalizeNullablePositiveId(input.collaborationId, "部门协作");
  if (!collaborationId.ok) return collaborationId;
  if (category.data === "routine" && itemType.data === "task" && !ownerEmployeeId.data) return failCommand("执行责任人不能为空");
  const sourceType = normalizeSourceType(input.sourceType);
  if (!sourceType.ok) return sourceType;
  const sourceKind = normalizeSourceKind(input.sourceKind);
  if (!sourceKind.ok) return sourceKind;
  const linkedProjectId = normalizeNullablePositiveId(input.linkedProjectId, "关联项目");
  if (!linkedProjectId.ok) return linkedProjectId;
  const linkedProjectPhaseId = normalizeNullablePositiveId(input.linkedProjectPhaseId, "关联项目阶段");
  if (!linkedProjectPhaseId.ok) return linkedProjectPhaseId;
  const sourceMeetingId = normalizeNullablePositiveId(input.sourceMeetingId, "来源会议");
  if (!sourceMeetingId.ok) return sourceMeetingId;
  const sourceMeetingDecisionId = normalizeNullablePositiveId(input.sourceMeetingDecisionId, "来源会议决议");
  if (!sourceMeetingDecisionId.ok) return sourceMeetingDecisionId;
  const sourceMeetingActionCandidateId = normalizeNullablePositiveId(input.sourceMeetingActionCandidateId, "来源会议行动候选");
  if (!sourceMeetingActionCandidateId.ok) return sourceMeetingActionCandidateId;
  const sourceDepartmentId = normalizeNullablePositiveId(input.sourceDepartmentId, "来源部门");
  if (!sourceDepartmentId.ok) return sourceDepartmentId;
  const parentWorkItemId = normalizeNullablePositiveId(input.parentWorkItemId, "上级工作项");
  if (!parentWorkItemId.ok) return parentWorkItemId;
  const parentPeriodWorkItemId = normalizeNullablePositiveId(input.parentPeriodWorkItemId, "上级节点");
  if (!parentPeriodWorkItemId.ok) return parentPeriodWorkItemId;
  const previousPeriodWorkItemId = normalizeNullablePositiveId(input.previousPeriodWorkItemId, "前置节点");
  if (!previousPeriodWorkItemId.ok) return previousPeriodWorkItemId;
  const usesDateWindow = isObjective || (isTask && effectiveRoutineTaskType !== "standing");
  const actualStartDate = usesDateWindow ? normalizeNullableDate(input.actualStartDate, "实际开始") : okCommand(null);
  if (!actualStartDate.ok) return actualStartDate;
  const actualEndDate = usesDateWindow ? normalizeNullableDate(input.actualEndDate, "实际结束") : okCommand(null);
  if (!actualEndDate.ok) return actualEndDate;
  const planned = normalizePlannedFields(input, itemType.data);
  if (!planned.ok) return planned;
  const scheduleError = validateCompletionSchedule({
    status: status.data,
    actualStartDate: actualStartDate.data,
    actualEndDate: actualEndDate.data,
    ...planned.data,
  });
  if (scheduleError) return failCommand(scheduleError);
  const milestone = normalizeMilestoneFields(input, itemType.data);
  if (!milestone.ok) return milestone;
  const period = normalizePeriodFields(input);
  if (!period.ok) return period;
  const sourceData = {
    sourceType: sourceType.data,
    sourceKind: inferSourceKind({
      sourceType: sourceType.data,
      sourceKind: sourceKind.data,
      linkedProjectId: linkedProjectId.data,
      linkedProjectPhaseId: linkedProjectPhaseId.data,
    }),
    linkedProjectId: linkedProjectId.data,
    linkedProjectPhaseId: linkedProjectPhaseId.data,
    sourceMeetingId: sourceMeetingId.data,
    sourceMeetingDecisionId: sourceMeetingDecisionId.data,
    sourceMeetingActionCandidateId: sourceMeetingActionCandidateId.data,
    sourceDepartmentId: sourceDepartmentId.data,
  };
  if (sourceData.sourceType !== "project") stripProjectSourceFields(sourceData);
  if (sourceData.sourceType !== "meeting") stripMeetingSourceFields(sourceData);
  if (sourceData.sourceType !== "department") stripDepartmentSourceFields(sourceData);
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
    status: status.data,
    ...krData,
    routineTaskType: effectiveRoutineTaskType,
    ...recurrence.data,
    ownerEmployeeId: ownerEmployeeId.data,
    collaborationId: collaborationId.data,
    actualStartDate: usesDateWindow ? actualStartDate.data : null,
    actualEndDate: usesDateWindow ? actualEndDate.data : null,
    ...planned.data,
    ...milestone.data,
    periodType: period.data.periodType,
    periodStart: period.data.periodStart,
    periodEnd: period.data.periodEnd,
    ...sourceData,
    parentWorkItemId: parentWorkItemId.data,
    parentPeriodWorkItemId: parentPeriodWorkItemId.data,
    previousPeriodWorkItemId: previousPeriodWorkItemId.data,
    participants: input.participants ?? [],
    sortOrder,
  });
}

export function buildWorkItemUpdateCommand(
  workId: number,
  input: WorkItemUpdateCommand["data"],
  current: {
    category: string;
    itemType: string;
    routineTaskType?: string | null;
    routineRecurrenceType?: string | null;
    routineRecurrenceTime?: string | null;
    routineRecurrenceWeekday?: number | null;
    routineRecurrenceMonthDay?: number | null;
    routineRecurrenceQuarterDay?: number | null;
    routineRecurrenceYearMonth?: number | null;
    routineRecurrenceYearDay?: number | null;
    ownerEmployeeId?: number | null;
    status?: string | null;
    actualStartDate?: Date | null;
    actualEndDate?: Date | null;
    plannedStartDate?: Date | null;
    plannedEndDate?: Date | null;
    isMilestone?: boolean;
    milestoneDate?: Date | null;
    sourceType: string;
  },
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
    if (!isCompletedStatus(status.data)) {
      if (data.actualEndDate !== undefined && data.actualEndDate !== null && data.actualEndDate !== "") {
        return failCommand("请先选择已完成，再填写实际结束");
      }
      data.actualEndDate = null;
    }
  }
  for (const field of ["krStartValue", "krTargetValue", "krCurrentValue"] as const) {
    if (data[field] === undefined) continue;
    const number = normalizeNullableNumber(data[field], "KR 数值");
    if (!number.ok) return number;
    data[field] = number.data;
  }
  if (data.krUnit !== undefined) data.krUnit = normalizeOptionalString(data.krUnit) || null;
  if (data.routineTaskType !== undefined) {
    const routineTaskType = normalizeRoutineTaskType(data.routineTaskType);
    if (!routineTaskType.ok) return routineTaskType;
    data.routineTaskType = routineTaskType.data;
  }
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
  for (const field of ["ownerEmployeeId", "collaborationId", "linkedProjectId", "linkedProjectPhaseId", "sourceMeetingId", "sourceMeetingDecisionId", "sourceMeetingActionCandidateId", "sourceDepartmentId", "parentWorkItemId", "parentPeriodWorkItemId", "previousPeriodWorkItemId"] as const) {
    if (data[field] === undefined) continue;
    const id = normalizeNullablePositiveId(data[field], "关联对象");
    if (!id.ok) return id;
    data[field] = id.data;
  }
  for (const field of ["actualStartDate", "actualEndDate", "plannedStartDate", "plannedEndDate", "periodStart", "periodEnd", "milestoneDate"] as const) {
    if (data[field] === undefined) continue;
    const labels = {
      actualStartDate: "实际开始",
      actualEndDate: "实际结束",
      plannedStartDate: "计划开始",
      plannedEndDate: "计划结束",
      periodStart: "周期开始",
      periodEnd: "周期结束",
      milestoneDate: "里程碑日期",
    };
    const date = normalizeNullableDate(data[field], labels[field]);
    if (!date.ok) return date;
    data[field] = date.data;
  }
  if (data.periodStart && data.periodEnd && data.periodEnd < data.periodStart) return failCommand("周期结束不能早于周期开始");
  if (data.isMilestone !== undefined) data.isMilestone = data.isMilestone === true;
  const actualStartDate = data.actualStartDate !== undefined ? data.actualStartDate : current.actualStartDate;
  const actualEndDate = data.actualEndDate !== undefined ? data.actualEndDate : current.actualEndDate;
  const effectiveStatus = data.status !== undefined ? data.status : current.status;
  const plannedStartDate = data.plannedStartDate !== undefined ? data.plannedStartDate : current.plannedStartDate;
  const plannedEndDate = data.plannedEndDate !== undefined ? data.plannedEndDate : current.plannedEndDate;
  const scheduleError = validateCompletionSchedule({ status: effectiveStatus, actualStartDate, actualEndDate, plannedStartDate, plannedEndDate });
  if (scheduleError) return failCommand(scheduleError);
  if (data.participants !== undefined && !Array.isArray(data.participants)) return failCommand("参与人无效");
  if (effectiveItemType === "key_result") {
    data.actualStartDate = null; data.actualEndDate = null; data.plannedStartDate = null; data.plannedEndDate = null; data.isMilestone = false; data.milestoneDate = null;
  } else if (effectiveItemType === "task") {
    data.isMilestone = false; data.milestoneDate = null;
  } else if (data.isMilestone === false || (data.isMilestone === undefined && current.isMilestone !== true)) data.milestoneDate = null;
  if (effectiveItemType !== "objective" && effectiveItemType !== "task") stripNonTaskDateFields(data);
  if (effectiveItemType !== "key_result") stripNonKrFields(data);
  const effectiveCategory = data.category ?? current.category;
  const effectiveRoutineTaskType = data.routineTaskType ?? current.routineTaskType ?? null;
  const effectiveOwnerEmployeeId = data.ownerEmployeeId === undefined ? current.ownerEmployeeId : data.ownerEmployeeId;
  if (effectiveCategory === "routine" && effectiveItemType === "task" && !effectiveOwnerEmployeeId) return failCommand("执行责任人不能为空");
  if (effectiveCategory !== "routine" || effectiveItemType !== "task") data.routineTaskType = null;
  if (effectiveCategory === "routine" && effectiveItemType === "task" && effectiveRoutineTaskType === "standing") stripNonTaskDateFields(data);
  const recurrenceType = data.routineRecurrenceType === undefined ? current.routineRecurrenceType : data.routineRecurrenceType;
  const hasRecurrence = effectiveCategory === "routine" && effectiveItemType === "task" && effectiveRoutineTaskType === "task" && Boolean(recurrenceType);
  const ordinaryRoutineTask = effectiveCategory === "routine" && effectiveItemType === "task" && effectiveRoutineTaskType === "task";
  if (!ordinaryRoutineTask) {
    Object.assign(data, emptyRoutineRecurrenceFields());
  } else if (recurrenceFieldNames.some((field) => data[field] !== undefined) || data.routineTaskType !== undefined || data.category !== undefined || data.itemType !== undefined) {
    const recurrence = normalizeRoutineRecurrenceFields({
      routineRecurrenceType: data.routineRecurrenceType === undefined ? current.routineRecurrenceType : data.routineRecurrenceType,
      routineRecurrenceTime: data.routineRecurrenceTime === undefined ? current.routineRecurrenceTime : data.routineRecurrenceTime,
      routineRecurrenceWeekday: data.routineRecurrenceWeekday === undefined ? current.routineRecurrenceWeekday : data.routineRecurrenceWeekday,
      routineRecurrenceMonthDay: data.routineRecurrenceMonthDay === undefined ? current.routineRecurrenceMonthDay : data.routineRecurrenceMonthDay,
      routineRecurrenceQuarterDay: data.routineRecurrenceQuarterDay === undefined ? current.routineRecurrenceQuarterDay : data.routineRecurrenceQuarterDay,
      routineRecurrenceYearMonth: data.routineRecurrenceYearMonth === undefined ? current.routineRecurrenceYearMonth : data.routineRecurrenceYearMonth,
      routineRecurrenceYearDay: data.routineRecurrenceYearDay === undefined ? current.routineRecurrenceYearDay : data.routineRecurrenceYearDay,
    }, hasRecurrence);
    if (!recurrence.ok) return recurrence;
    Object.assign(data, recurrence.data);
  }
  const effectiveSourceType = data.sourceType ?? current.sourceType;
  if (effectiveSourceType !== "project") {
    stripProjectSourceFields(data);
  } else if (data.sourceKind === undefined) {
    const inferred = inferSourceKind({
      sourceType: effectiveSourceType,
      sourceKind: data.sourceKind,
      linkedProjectId: data.linkedProjectId,
      linkedProjectPhaseId: data.linkedProjectPhaseId,
    });
    if (inferred) data.sourceKind = inferred;
  }
  if (effectiveSourceType !== "meeting") stripMeetingSourceFields(data);
  if (effectiveSourceType !== "department") stripDepartmentSourceFields(data);
  return okCommand({ workId: id.data, data });
}

export function validateWorkItemDeleteCommand(workId: number): DomainValidationResult<WorkItemDeleteCommand> {
  const id = normalizePositiveId(workId, "节点 ID");
  if (!id.ok) return id;
  return okCommand({ workId: id.data });
}
