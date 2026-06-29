"use client";

import { useMemo } from "react";
import { createFormSection, createPageBody, type FormSurfaceFieldSpec, type FormSurfaceProps, PageSurface } from "@workspace/core/ui";
import {
  WORK_ITEM_TYPE_OPTIONS,
  WORK_STATUS_OPTIONS,
} from "./model";
import type { WorkItem, WorkItemDraft, WorkItemType } from "./types";

export function WorkTaskForm({
  draft,
  works,
  disabled,
  excludedWorkId,
  onChange,
}: {
  draft: WorkItemDraft;
  works: WorkItem[];
  disabled: boolean;
  excludedWorkId: number | null;
  onChange: (draft: WorkItemDraft) => void;
}) {
  const surface = useWorkTaskFormSurface({
    draft,
    works,
    disabled,
    excludedWorkId,
    onChange,
  });

  return <PageSurface kind="standard" embedded body={createPageBody([createFormSection("work-task-form", surface)])} />;
}

export function useWorkTaskFormSurface({
  draft,
  works,
  disabled,
  excludedWorkId,
  onChange,
}: {
  draft: WorkItemDraft;
  works: WorkItem[];
  disabled: boolean;
  excludedWorkId: number | null;
  onChange: (draft: WorkItemDraft) => void;
  enabled?: boolean;
}): FormSurfaceProps {
  const isTask = draft.itemType === "task";
  const isKr = draft.itemType === "key_result";
  const parentOptions = useMemo(
    () => works
      .filter((work) => work.id !== excludedWorkId && parentAllowed(draft.itemType, work))
      .map((work) => ({ value: String(work.id), label: `${nodeTypeLabel(work.itemType)} · ${work.content}` })),
    [draft.itemType, excludedWorkId, works],
  );

  function patch(next: Partial<WorkItemDraft>) {
    onChange({ ...draft, ...next });
  }

  function setItemType(value: string | null) {
    const itemType = normalizeItemType(value);
    const currentParent = works.find((work) => work.id === draft.parentWorkItemId) || null;
    patch({
      itemType,
      status: itemType === "task" ? draft.status || "doing" : null,
      startDate: itemType === "task" ? draft.startDate : null,
      dueDate: itemType === "task" ? draft.dueDate : null,
      krStartValue: itemType === "key_result" ? draft.krStartValue : null,
      krTargetValue: itemType === "key_result" ? draft.krTargetValue : null,
      krCurrentValue: itemType === "key_result" ? draft.krCurrentValue : null,
      krUnit: itemType === "key_result" ? draft.krUnit : "",
      parentWorkItemId: currentParent && parentAllowed(itemType, currentParent) ? draft.parentWorkItemId : null,
      parentWorkItemContent: currentParent && parentAllowed(itemType, currentParent) ? draft.parentWorkItemContent : "",
    });
  }

  const numberValue = (value: number | null) => value === null ? "" : String(value);
  const patchNumber = (key: "krStartValue" | "krCurrentValue" | "krTargetValue") => (next: unknown) => {
    const text = String(next ?? "");
    if (!text.trim()) {
      patch({ [key]: null } as Partial<WorkItemDraft>);
      return;
    }
    const number = Number(text);
    patch({ [key]: Number.isFinite(number) ? number : null } as Partial<WorkItemDraft>);
  };

  const fields: FormSurfaceFieldSpec[] = [
    { key: "content", label: "节点内容", required: true, spec: { valueType: "string", control: "text", state: disabled ? "disabled" : "normal" }, value: draft.content, placeholder: "输入目标、关键结果或子任务", onChange: (value) => patch({ content: String(value ?? "") }) },
    { key: "itemType", label: "节点类型", spec: { valueType: "string", control: "choice", options: { source: "static", items: WORK_ITEM_TYPE_OPTIONS }, state: disabled ? "disabled" : "normal" }, value: draft.itemType, onChange: (value) => setItemType(String(value || "")) },
    { key: "parent", label: "上级节点", spec: { valueType: "string", control: "choice", options: { source: "static", items: parentOptions, visibleCount: 5 }, state: disabled || parentOptions.length === 0 ? "disabled" : "normal" }, value: draft.parentWorkItemId ? String(draft.parentWorkItemId) : "", placeholder: "计划根节点", onChange: (value) => {
      const next = String(value || "");
      const option = parentOptions.find((item) => item.value === next);
      patch({ parentWorkItemId: next ? Number(next) : null, parentWorkItemContent: option?.label || "" });
    } },
    ...(isTask ? [
      { key: "status", label: "状态", spec: { valueType: "string", control: "choice", options: { source: "static", items: WORK_STATUS_OPTIONS }, state: disabled ? "disabled" : "normal" }, value: draft.status, onChange: (value: unknown) => patch({ status: normalizeStatus(String(value || "")) }) },
      { key: "startDate", label: "开始时间", spec: { valueType: "date", control: "temporal", precision: "date", state: disabled ? "disabled" : "normal" }, value: draft.startDate, onChange: (value: unknown) => patch({ startDate: String(value || "") }), placeholder: "选择日期" },
      { key: "dueDate", label: "截止时间", spec: { valueType: "date", control: "temporal", precision: "date", state: disabled ? "disabled" : "normal" }, value: draft.dueDate, onChange: (value: unknown) => patch({ dueDate: String(value || "") }), placeholder: "选择日期" },
      { key: "importance", label: "重要度", spec: { valueType: "number", control: "rating", state: disabled ? "disabled" : "normal" }, value: draft.importance, ratingLabel: "重要度", showRatingLabel: false, onChange: (value) => patch({ importance: Number(value) }) },
      { key: "urgency", label: "紧急度", spec: { valueType: "number", control: "rating", state: disabled ? "disabled" : "normal" }, value: draft.urgency, ratingLabel: "紧急度", showRatingLabel: false, onChange: (value) => patch({ urgency: Number(value) }) },
    ] satisfies FormSurfaceFieldSpec[] : []),
    ...(isKr ? [
      { key: "krStartValue", label: "指标起点", spec: { valueType: "number", control: "number", state: disabled ? "disabled" : "normal" }, value: numberValue(draft.krStartValue), onChange: patchNumber("krStartValue") },
      { key: "krCurrentValue", label: "当前值", spec: { valueType: "number", control: "number", state: disabled ? "disabled" : "normal" }, value: numberValue(draft.krCurrentValue), onChange: patchNumber("krCurrentValue") },
      { key: "krTargetValue", label: "目标值", spec: { valueType: "number", control: "number", state: disabled ? "disabled" : "normal" }, value: numberValue(draft.krTargetValue), onChange: patchNumber("krTargetValue") },
      { key: "krUnit", label: "单位", spec: { valueType: "string", control: "text", state: disabled ? "disabled" : "normal" }, value: draft.krUnit, placeholder: "万元、项、%", onChange: (value: unknown) => patch({ krUnit: String(value ?? "") }) },
    ] satisfies FormSurfaceFieldSpec[] : []),
    { key: "description", label: "描述", span: "wide", spec: { valueType: "string", control: "text", multiline: true, state: disabled ? "disabled" : "normal" }, value: draft.description, placeholder: "描述目标口径、指标口径或子任务交付物", onChange: (value) => patch({ description: String(value ?? "") }) },
  ];

  return {
    kind: "fields",
    columns: 2,
    fields,
  };
}

function parentAllowed(itemType: WorkItemType, parent: WorkItem) {
  if (itemType === "key_result") return parent.itemType === "objective";
  if (itemType === "objective") return parent.itemType === "objective";
  return parent.itemType === "objective" || parent.itemType === "key_result";
}

function normalizeItemType(value: string | null): WorkItemType {
  if (value === "objective" || value === "key_result") return value;
  return "task";
}

function normalizeStatus(value: string | null) {
  if (value === "done" || value === "archived") return value;
  return "doing";
}

function nodeTypeLabel(itemType: WorkItemType) {
  if (itemType === "objective") return "目标";
  if (itemType === "key_result") return "关键结果";
  return "子任务";
}
