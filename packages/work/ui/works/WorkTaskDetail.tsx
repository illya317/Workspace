"use client";

import { createFieldsSection, createPageBody, type FormSurfaceFieldSpec, PageSurface } from "@workspace/core/ui";
import { getStatusLabel, getWorkItemTypeLabel } from "./model";
import type { WorkItem } from "./types";

export function WorkTaskDetail({ work }: { work: WorkItem }) {
  const status = work.itemType === "task" ? (work.isArchived ? "archived" : work.status) : null;
  const readonlySpec = { valueType: "string" as const, control: "text" as const, multiline: true, state: "readonly" as const };
  const fields: FormSurfaceFieldSpec[] = [
    { key: "content", label: "节点内容", span: "wide", spec: readonlySpec, value: work.content },
    ...(work.description ? [{ key: "description", label: "描述", span: "wide" as const, spec: readonlySpec, value: work.description }] satisfies FormSurfaceFieldSpec[] : []),
    { key: "itemType", label: "节点类型", spec: readonlySpec, value: getWorkItemTypeLabel(work.itemType) },
    ...(status ? [{ key: "status", label: "子任务状态", spec: readonlySpec, value: getStatusLabel(status) }] satisfies FormSurfaceFieldSpec[] : []),
    ...(work.itemType === "task" ? [{ key: "dates", label: "起止时间", spec: readonlySpec, value: dateRange(work.startDate, work.dueDate) }] satisfies FormSurfaceFieldSpec[] : []),
    ...(work.itemType === "key_result" ? [{ key: "kr", label: "关键结果指标", spec: readonlySpec, value: krRange(work) }] satisfies FormSurfaceFieldSpec[] : []),
    { key: "parent", label: "上级节点", spec: readonlySpec, value: work.parentWorkItemContent || "根节点" },
  ];
  return (
    <PageSurface kind="standard" embedded body={createPageBody([createFieldsSection("work-task-detail", fields, { kind: "detail", layout: { columns: 2 } })])} />
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
