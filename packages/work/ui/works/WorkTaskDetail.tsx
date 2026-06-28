"use client";

import { PageSurface, createPageFieldsBlock, type FormSurfaceFieldSpec } from "@workspace/core/ui";
import { getStatusLabel, getWorkItemTypeLabel, getWorkPeriodLabel, getWorkSourceTypeLabel } from "./model";
import type { WorkItem } from "./types";

export function WorkTaskDetail({ work }: { work: WorkItem }) {
  const status = work.itemType === "task" ? (work.isArchived ? "archived" : work.status) : null;
  const readonlySpec = { valueType: "string" as const, control: "text" as const, multiline: true, state: "readonly" as const };
  const fields: FormSurfaceFieldSpec[] = [
    { key: "content", label: "节点内容", span: "wide", spec: readonlySpec, value: work.content },
    ...(work.description ? [{ key: "description", label: "描述", span: "wide" as const, spec: readonlySpec, value: work.description }] satisfies FormSurfaceFieldSpec[] : []),
    { key: "itemType", label: "节点类型", spec: readonlySpec, value: getWorkItemTypeLabel(work.itemType) },
    { key: "source", label: "来源", spec: readonlySpec, value: getWorkSourceTypeLabel(work.sourceType) },
    ...(work.targetType !== "personal" ? [{ key: "owner", label: "负责人", spec: readonlySpec, value: work.ownerEmployeeName || "未设置" }] satisfies FormSurfaceFieldSpec[] : []),
    ...(status ? [{ key: "status", label: "状态", spec: readonlySpec, value: getStatusLabel(status) }] satisfies FormSurfaceFieldSpec[] : []),
    { key: "period", label: "计划周期", spec: readonlySpec, value: getWorkPeriodLabel(work) },
    ...(work.itemType === "task" ? [{ key: "dates", label: "起止时间", spec: readonlySpec, value: dateRange(work.startDate, work.dueDate) }] satisfies FormSurfaceFieldSpec[] : []),
    ...(work.itemType === "key_result" ? [{ key: "kr", label: "结果", spec: readonlySpec, value: krRange(work) }] satisfies FormSurfaceFieldSpec[] : []),
    { key: "parent", label: "上级节点", spec: readonlySpec, value: work.parentWorkItemContent || "根节点" },
    ...(work.sourceType === "project" ? [
      { key: "project", label: "关联项目", spec: readonlySpec, value: work.linkedProjectName || "未关联" },
      { key: "projectPhase", label: "关联项目阶段", spec: readonlySpec, value: work.linkedProjectPhaseName || "未关联" },
      { key: "projectTask", label: "关联项目任务", spec: readonlySpec, value: work.linkedProjectTaskName || "未关联" },
    ] satisfies FormSurfaceFieldSpec[] : []),
    ...(work.sourceType === "meeting" ? [
      { key: "meeting", label: "来源会议", spec: readonlySpec, value: work.sourceMeetingTitle || "未关联" },
      { key: "meetingDecision", label: "会议决议", spec: readonlySpec, value: work.sourceMeetingDecisionTitle || "未关联" },
      { key: "meetingCandidate", label: "行动候选", spec: readonlySpec, value: work.sourceMeetingActionCandidateTitle || "未关联" },
    ] satisfies FormSurfaceFieldSpec[] : []),
  ];
  return (
    <PageSurface embedded kind="detail" blocks={[createPageFieldsBlock("work-task-detail", fields, { kind: "detail", columns: 2, className: "p-4" })]} />
  );
}

function dateRange(startDate: string | null, dueDate: string | null) {
  if (!startDate && !dueDate) return "未设置";
  if (startDate && dueDate) return `${startDate} - ${dueDate}`;
  return startDate || dueDate;
}

function krRange(work: WorkItem) {
  const unit = work.krUnit || "";
  const value = (number: number | null) => number === null ? "未填" : `${number}${unit}`;
  return `${value(work.krStartValue)} / ${value(work.krCurrentValue)} / ${value(work.krTargetValue)}`;
}
