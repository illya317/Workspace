"use client";

import { createFieldsSection, createPageBody, type FormSurfaceFieldSpec, type FormSurfaceProps, BodySurface } from "@workspace/core/ui";
import { getRoutineTaskTypeLabel, getStatusLabel, getWorkItemTypeLabel } from "./model";
import type { WorkItem } from "./types";
import { shouldShowWorkOwner } from "./work-target-presentation";

export function WorkTaskDetail({ work }: { work: WorkItem }) {
  return <BodySurface {...createPageBody([createFieldsSection("work-task-detail", createWorkTaskDetailForm(work).content.items, { kind: "detail", layout: { columns: 2 } })])} />;
}

export function createWorkTaskDetailForm(work: WorkItem): Extract<FormSurfaceProps, { kind: "detail" }> {
  const status = work.itemType === "task" ? (work.isArchived ? "archived" : work.status) : null;
  const isRoutineTask = work.itemType === "task" && Boolean(work.routineTaskType);
  const isOrdinaryRoutineTask = isRoutineTask && work.routineTaskType === "task";
  const showDateRange = work.itemType === "objective" || (work.itemType === "task" && work.routineTaskType !== "standing");
  const readonlySpec = { valueType: "string" as const, control: "text" as const, multiline: true, state: "readonly" as const };
  const fields: FormSurfaceFieldSpec[] = [
    { key: "content", label: "内容", span: "wide", spec: readonlySpec, value: work.content },
    ...(work.description ? [{ key: "description", label: "描述", span: "wide" as const, spec: readonlySpec, value: work.description }] satisfies FormSurfaceFieldSpec[] : []),
    ...(isStandingResponsibility(work) ? [{ key: "responsibility", label: "关联职责", spec: readonlySpec, value: work.responsibilityPathLabel || work.responsibilityLabel || "未关联" }] satisfies FormSurfaceFieldSpec[] : []),
    { key: "itemType", label: "类型", spec: readonlySpec, value: isRoutineTask ? getRoutineTaskTypeLabel(work.routineTaskType) : getWorkItemTypeLabel(work.itemType) },
    ...(work.routineRecurrenceType || work.routineRecurrenceTime ? [{ key: "recurrence", label: "周期 / 时间", spec: readonlySpec, value: recurrenceLabel(work) }] satisfies FormSurfaceFieldSpec[] : []),
    ...(shouldShowWorkOwner(work) ? [{ key: "owner", label: work.itemType === "objective" ? "目标负责人" : work.itemType === "key_result" ? "结果责任人" : "执行责任人", spec: readonlySpec, value: work.ownerEmployeeName || "未落实" }] satisfies FormSurfaceFieldSpec[] : []),
    ...(status ? [{ key: "status", label: isStandingResponsibility(work) ? "职责状态" : "任务状态", spec: readonlySpec, value: getStatusLabel(status, isStandingResponsibility(work) ? "standing" : "task") }] satisfies FormSurfaceFieldSpec[] : []),
    ...(showDateRange ? [{ key: "plannedDates", label: "计划时间", spec: readonlySpec, value: dateRange(work.plannedStartDate, work.plannedEndDate) }] satisfies FormSurfaceFieldSpec[] : []),
    ...(showDateRange ? [{ key: "actualDates", label: "实际时间", spec: readonlySpec, value: dateRange(work.actualStartDate, work.actualEndDate) }] satisfies FormSurfaceFieldSpec[] : []),
    ...(work.itemType === "objective" && work.isMilestone ? [{ key: "milestone", label: "里程碑", spec: readonlySpec, value: work.milestoneDate || "未设置日期" }] satisfies FormSurfaceFieldSpec[] : []),
    ...(work.itemType === "key_result" ? [{ key: "kr", label: "关键结果指标", spec: readonlySpec, value: krRange(work) }] satisfies FormSurfaceFieldSpec[] : []),
    ...(work.itemType === "key_result" && work.parentPeriodWorkItemContent ? [{ key: "allocation", label: "指标分配", spec: readonlySpec, value: allocationLabel(work) }] satisfies FormSurfaceFieldSpec[] : []),
    ...(work.itemType === "key_result" ? [{ key: "evidence", label: "任务证据", spec: readonlySpec, value: work.evidenceTaskIds.length > 0 ? `${work.evidenceTaskIds.length} 个任务` : "未关联" }] satisfies FormSurfaceFieldSpec[] : []),
    ...(!isRoutineTask ? [{ key: "parent", label: "所属目标", spec: readonlySpec, value: work.parentWorkItemContent || "根目标" }] satisfies FormSurfaceFieldSpec[] : []),
    ...(isOrdinaryRoutineTask ? [{ key: "standingResponsibility", label: "常设职责", spec: readonlySpec, value: work.parentWorkItemContent || "未关联" }] satisfies FormSurfaceFieldSpec[] : []),
    ...(work.parentPeriodWorkItemContent ? [{ key: "parentPeriod", label: parentPeriodRelationLabel(work), spec: readonlySpec, value: periodRelationLabel(work.parentPeriodWorkItemContent, work.parentPeriodWorkItemCycleLabel) }] satisfies FormSurfaceFieldSpec[] : []),
    ...(work.itemType === "objective" || work.itemType === "key_result" ? [{ key: "previousPeriod", label: work.itemType === "key_result" ? "前置 KR" : "前置目标", spec: readonlySpec, value: periodRelationLabel(work.previousPeriodWorkItemContent, work.previousPeriodWorkItemCycleLabel) }] satisfies FormSurfaceFieldSpec[] : []),
  ];
  return { kind: "detail", content: { items: fields, layout: { columns: 2 } } };
}

function isStandingResponsibility(work: WorkItem) {
  return work.routineTaskType === "standing";
}

function dateRange(actualStartDate: string | null, actualEndDate: string | null) {
  if (!actualStartDate && !actualEndDate) return "未设置";
  if (actualStartDate && actualEndDate) return `${actualStartDate} - ${actualEndDate}`;
  return actualStartDate || actualEndDate;
}

function recurrenceLabel(work: WorkItem) {
  const time = work.routineRecurrenceTime ? ` · ${work.routineRecurrenceTime}` : "";
  if (work.routineRecurrenceType === "weekly") return `每周${weekdayLabel(work.routineRecurrenceWeekday)}`;
  if (work.routineRecurrenceType === "monthly") return `每月 ${work.routineRecurrenceMonthDay || 1} 号`;
  if (work.routineRecurrenceType === "quarterly") return `每季度第 ${work.routineRecurrenceQuarterDay || 1} 天`;
  if (work.routineRecurrenceType === "yearly") return `每年 ${work.routineRecurrenceYearMonth || 1} 月 ${work.routineRecurrenceYearDay || 1} 日`;
  if (work.routineRecurrenceType === "daily") return `每日${time}`;
  return work.routineRecurrenceTime || "未设置";
}

function weekdayLabel(value: number | null) {
  if (value === 2) return "周二";
  if (value === 3) return "周三";
  if (value === 4) return "周四";
  if (value === 5) return "周五";
  if (value === 6) return "周六";
  if (value === 7) return "周日";
  return "周一";
}

function krRange(work: WorkItem) {
  const unit = work.krUnit || "";
  const value = (number: number | null) => number === null ? "未填" : `${number}${unit}`;
  return `${value(work.krStartValue)} / ${value(work.krCurrentValue)} / ${value(work.krTargetValue)}`;
}

function allocationLabel(work: WorkItem) {
  const unit = work.krUnit || work.parentPeriodWorkItemKrUnit || "";
  const assigned = work.krTargetValue === null ? "未填" : `${work.krTargetValue}${unit}`;
  const parentTotal = work.parentPeriodWorkItemKrTargetValue === null ? "未填" : `${work.parentPeriodWorkItemKrTargetValue}${work.parentPeriodWorkItemKrUnit || unit}`;
  const parentCurrent = work.parentPeriodWorkItemKrCurrentValue === null ? null : `上级当前 ${work.parentPeriodWorkItemKrCurrentValue}${work.parentPeriodWorkItemKrUnit || unit}`;
  return [`分配 ${assigned}`, `上级指标 ${parentTotal}`, parentCurrent].filter(Boolean).join(" / ");
}

function periodRelationLabel(content: string | null, cycleLabel: string | null) {
  if (!content) return "未关联";
  return [content, cycleLabel].filter(Boolean).join(" · ");
}

function parentPeriodRelationLabel(work: WorkItem) {
  if (work.parentPeriodWorkItemTargetType && (work.parentPeriodWorkItemTargetType !== work.targetType || work.parentPeriodWorkItemTargetId !== work.targetId)) return "对齐到";
  if (work.itemType === "objective") return "上级目标";
  if (work.itemType === "key_result") return "上级 KR";
  return "对齐到";
}
