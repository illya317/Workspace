"use client";

import { useEffect, useMemo, useState } from "react";
import {
  FormSurface,
  type FormSurfaceFieldSpec,
  type FormSurfaceProps,
  type PickerOption,
} from "@workspace/core/ui";
import {
  listProjectPhaseOptions,
  listProjectTaskOptions,
  WORK_REFERENCE_OPTIONS_ENDPOINT,
} from "./api";
import {
  WORK_ITEM_TYPE_OPTIONS,
  WORK_PERIOD_TYPE_OPTIONS,
  WORK_PROJECT_SOURCE_KIND_OPTIONS,
  WORK_SOURCE_TYPE_OPTIONS,
  WORK_STATUS_OPTIONS,
} from "./model";
import type { WorkItem, WorkItemDraft, WorkItemType, WorkPeriodType, WorkSourceKind, WorkSourceType, WorkTargetType } from "./types";

const FORM_SOURCE_TYPE_OPTIONS = WORK_SOURCE_TYPE_OPTIONS.filter((option) => option.value !== "meeting");

export function WorkTaskForm({
  draft,
  works,
  disabled,
  excludedWorkId,
  targetType,
  onChange,
}: {
  draft: WorkItemDraft;
  works: WorkItem[];
  disabled: boolean;
  excludedWorkId: number | null;
  targetType?: WorkTargetType;
  onChange: (draft: WorkItemDraft) => void;
}) {
  const surface = useWorkTaskFormSurface({
    draft,
    works,
    disabled,
    excludedWorkId,
    targetType,
    onChange,
  });

  return <FormSurface {...surface} />;
}

export function useWorkTaskFormSurface({
  draft,
  works,
  disabled,
  excludedWorkId,
  targetType,
  onChange,
  enabled = true,
}: {
  draft: WorkItemDraft;
  works: WorkItem[];
  disabled: boolean;
  excludedWorkId: number | null;
  targetType?: WorkTargetType;
  onChange: (draft: WorkItemDraft) => void;
  enabled?: boolean;
}): FormSurfaceProps {
  const [taskOptions, setTaskOptions] = useState<PickerOption[]>([]);
  const [phaseOptions, setPhaseOptions] = useState<PickerOption[]>([]);
  const isTask = draft.itemType === "task";
  const isKr = draft.itemType === "key_result";
  const isProjectSource = draft.sourceType === "project";
  const sourceTypeOptions = draft.sourceType === "meeting" ? WORK_SOURCE_TYPE_OPTIONS : FORM_SOURCE_TYPE_OPTIONS;
  const parentOptions = useMemo(
    () => works
      .filter((work) => work.id !== excludedWorkId && parentAllowed(draft.itemType, work))
      .map((work) => ({ value: String(work.id), label: work.content })),
    [draft.itemType, excludedWorkId, works],
  );

  useEffect(() => {
    if (!enabled) {
      setTaskOptions([]);
      setPhaseOptions([]);
      return;
    }
    let ignore = false;
    Promise.all([
      listProjectTaskOptions(draft.linkedProjectId),
      listProjectPhaseOptions(draft.linkedProjectId),
    ])
      .then(([tasks, phases]) => {
        if (!ignore) {
          setTaskOptions(tasks);
          setPhaseOptions(phases);
        }
      })
      .catch(() => {
        if (!ignore) {
          setTaskOptions([]);
          setPhaseOptions([]);
        }
      });
    return () => { ignore = true; };
  }, [draft.linkedProjectId, enabled]);

  function patch(next: Partial<WorkItemDraft>) {
    onChange({ ...draft, ...next });
  }

  function setItemType(value: string | null) {
    const itemType = normalizeItemType(value);
    const currentParent = works.find((work) => work.id === draft.parentWorkItemId) || null;
    patch({
      itemType,
      category: "non-routine",
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

  function setSourceType(value: string | null) {
    const sourceType = normalizeSourceType(value);
    patch(sourceType === "project" ? {
      sourceType,
      sourceKind: draft.sourceKind || "project",
    } : {
      sourceType,
      sourceKind: null,
      linkedProjectId: null,
      linkedProjectName: "",
      linkedProjectPhaseId: null,
      linkedProjectPhaseName: "",
      linkedProjectTaskId: null,
      linkedProjectTaskName: "",
    });
  }

  function setSourceKind(value: string | null) {
    const sourceKind = normalizeSourceKind(value);
    patch({
      sourceKind,
      linkedProjectPhaseId: sourceKind === "project_phase" ? draft.linkedProjectPhaseId : null,
      linkedProjectPhaseName: sourceKind === "project_phase" ? draft.linkedProjectPhaseName : "",
      linkedProjectTaskId: sourceKind === "project_task" ? draft.linkedProjectTaskId : null,
      linkedProjectTaskName: sourceKind === "project_task" ? draft.linkedProjectTaskName : "",
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
    { key: "content", label: "节点内容", required: true, spec: { valueType: "string", editor: "input", state: disabled ? "disabled" : "normal" }, value: draft.content, placeholder: "输入目标、结果或执行任务", onChange: (value) => patch({ content: String(value ?? "") }) },
    { key: "itemType", label: "节点类型", spec: { valueType: "string", editor: "select", options: { source: "static", items: WORK_ITEM_TYPE_OPTIONS }, state: disabled ? "disabled" : "normal" }, value: draft.itemType, onChange: (value) => setItemType(String(value || "")) },
    { key: "periodType", label: "计划周期", spec: { valueType: "string", editor: "select", options: { source: "static", items: WORK_PERIOD_TYPE_OPTIONS, unsetLabel: "未设置" }, state: disabled ? "disabled" : "normal" }, value: draft.periodType, placeholder: "长期", onChange: (value) => {
      const periodType = normalizePeriodType(String(value || ""));
      patch({ periodType, periodStart: periodType ? draft.periodStart : null, periodEnd: periodType ? draft.periodEnd : null });
    } },
    ...(draft.periodType ? [
      { key: "periodStart", label: "周期开始", spec: { valueType: "date", editor: "datePicker", state: disabled ? "disabled" : "normal" }, value: draft.periodStart, onChange: (value: unknown) => patch({ periodStart: String(value || "") }), placeholder: "选择日期" },
      { key: "periodEnd", label: "周期结束", spec: { valueType: "date", editor: "datePicker", state: disabled ? "disabled" : "normal" }, value: draft.periodEnd, onChange: (value: unknown) => patch({ periodEnd: String(value || "") }), placeholder: "选择日期" },
    ] satisfies FormSurfaceFieldSpec[] : []),
    ...(isTask ? [
      { key: "status", label: "状态", spec: { valueType: "string", editor: "select", options: { source: "static", items: WORK_STATUS_OPTIONS }, state: disabled ? "disabled" : "normal" }, value: draft.status, onChange: (value: unknown) => patch({ status: normalizeStatus(String(value || "")) }) },
    ] satisfies FormSurfaceFieldSpec[] : []),
    ...(targetType !== "personal" ? [
      { key: "owner", label: "负责人", spec: { valueType: "reference", editor: "autocomplete", options: { source: "remote", fkKey: "work.tasks.owner.employee", endpoint: WORK_REFERENCE_OPTIONS_ENDPOINT, returnField: "id" }, state: disabled ? "disabled" : "normal" }, value: draft.ownerEmployeeId ? String(draft.ownerEmployeeId) : "", displayValue: draft.ownerEmployeeName, placeholder: "搜索员工", onChange: (value: unknown, option: unknown) => patch({
        ownerEmployeeId: typeof option === "object" && option && "id" in option ? Number(option.id) : (value ? draft.ownerEmployeeId : null),
        ownerEmployeeName: typeof option === "object" && option && "name" in option ? String(option.name) : (value ? String(value) : ""),
      }) },
    ] satisfies FormSurfaceFieldSpec[] : []),
    { key: "parent", label: "上级节点", spec: { valueType: "string", editor: "select", options: { source: "static", items: parentOptions, visibleCount: 5 }, state: disabled || parentOptions.length === 0 ? "disabled" : "normal" }, value: draft.parentWorkItemId ? String(draft.parentWorkItemId) : "", placeholder: "根节点", onChange: (value) => {
      const next = String(value || "");
      const option = parentOptions.find((item) => item.value === next);
      patch({ parentWorkItemId: next ? Number(next) : null, parentWorkItemContent: option?.label || "" });
    } },
    ...(isKr ? [
      { key: "krStartValue", label: "结果起点", spec: { valueType: "number", editor: "number", state: disabled ? "disabled" : "normal" }, value: numberValue(draft.krStartValue), onChange: patchNumber("krStartValue") },
      { key: "krCurrentValue", label: "结果当前", spec: { valueType: "number", editor: "number", state: disabled ? "disabled" : "normal" }, value: numberValue(draft.krCurrentValue), onChange: patchNumber("krCurrentValue") },
      { key: "krTargetValue", label: "结果目标", spec: { valueType: "number", editor: "number", state: disabled ? "disabled" : "normal" }, value: numberValue(draft.krTargetValue), onChange: patchNumber("krTargetValue") },
      { key: "krUnit", label: "单位", spec: { valueType: "string", editor: "input", state: disabled ? "disabled" : "normal" }, value: draft.krUnit, placeholder: "万元、项、%", onChange: (value: unknown) => patch({ krUnit: String(value ?? "") }) },
    ] satisfies FormSurfaceFieldSpec[] : []),
    ...(isTask ? [
      { key: "startDate", label: "开始时间", spec: { valueType: "date", editor: "datePicker", state: disabled ? "disabled" : "normal" }, value: draft.startDate, onChange: (value: unknown) => patch({ startDate: String(value || "") }), placeholder: "选择日期" },
      { key: "dueDate", label: "截止时间", spec: { valueType: "date", editor: "datePicker", state: disabled ? "disabled" : "normal" }, value: draft.dueDate, onChange: (value: unknown) => patch({ dueDate: String(value || "") }), placeholder: "选择日期" },
    ] satisfies FormSurfaceFieldSpec[] : []),
    { key: "sourceType", label: "来源类型", spec: { valueType: "string", editor: "select", options: { source: "static", items: sourceTypeOptions }, state: disabled ? "disabled" : "normal" }, value: draft.sourceType, onChange: (value) => setSourceType(String(value || "")) },
    ...(isProjectSource ? [
      { key: "linkedProject", label: "关联项目", spec: { valueType: "reference", editor: "autocomplete", options: { source: "remote", fkKey: "work.tasks.linked.project", endpoint: WORK_REFERENCE_OPTIONS_ENDPOINT, returnField: "id" }, state: disabled ? "disabled" : "normal" }, value: draft.linkedProjectId ? String(draft.linkedProjectId) : "", displayValue: draft.linkedProjectName, placeholder: "搜索项目", onChange: (value: unknown, option: unknown) => patch({
        linkedProjectId: typeof option === "object" && option && "id" in option ? Number(option.id) : (value ? draft.linkedProjectId : null),
        linkedProjectName: typeof option === "object" && option && "name" in option ? String(option.name) : (value ? String(value) : ""),
        sourceKind: option ? draft.sourceKind || "project" : null,
        linkedProjectPhaseId: null,
        linkedProjectPhaseName: "",
        linkedProjectTaskId: null,
        linkedProjectTaskName: "",
      }) },
      { key: "sourceKind", label: "项目来源层级", spec: { valueType: "string", editor: "select", options: { source: "static", items: WORK_PROJECT_SOURCE_KIND_OPTIONS }, state: disabled || !draft.linkedProjectId ? "disabled" : "normal" }, value: draft.sourceKind, onChange: (value: unknown) => setSourceKind(String(value || "")) },
      ...(draft.sourceKind === "project_phase" ? [{ key: "linkedProjectPhase", label: "关联项目阶段", spec: { valueType: "string", editor: "select", options: { source: "static", items: phaseOptions, visibleCount: 5 }, state: disabled || !draft.linkedProjectId ? "disabled" : "normal" }, value: draft.linkedProjectPhaseId ? String(draft.linkedProjectPhaseId) : "", placeholder: draft.linkedProjectId ? "选择阶段" : "先选择项目", onChange: (value: unknown) => {
        const next = String(value || "");
        const option = phaseOptions.find((item) => item.value === next);
        patch({ linkedProjectPhaseId: next ? Number(next) : null, linkedProjectPhaseName: option?.label || "" });
      } }] satisfies FormSurfaceFieldSpec[] : []),
      ...(draft.sourceKind === "project_task" ? [{ key: "linkedProjectTask", label: "关联项目任务", spec: { valueType: "string", editor: "select", options: { source: "static", items: taskOptions, visibleCount: 5 }, state: disabled || !draft.linkedProjectId ? "disabled" : "normal" }, value: draft.linkedProjectTaskId ? String(draft.linkedProjectTaskId) : "", placeholder: draft.linkedProjectId ? "选择任务" : "先选择项目", onChange: (value: unknown) => {
        const next = String(value || "");
        const option = taskOptions.find((item) => item.value === next);
        patch({ linkedProjectTaskId: next ? Number(next) : null, linkedProjectTaskName: option?.label || "" });
      } }] satisfies FormSurfaceFieldSpec[] : []),
    ] satisfies FormSurfaceFieldSpec[] : []),
    { key: "importance", label: "重要度", spec: { valueType: "number", editor: "rating", state: disabled ? "disabled" : "normal" }, value: draft.importance, ratingLabel: "重要度", showRatingLabel: false, onChange: (value) => patch({ importance: Number(value) }) },
    { key: "urgency", label: "紧急度", spec: { valueType: "number", editor: "rating", state: disabled ? "disabled" : "normal" }, value: draft.urgency, ratingLabel: "紧急度", showRatingLabel: false, onChange: (value) => patch({ urgency: Number(value) }) },
    { key: "description", label: "描述", span: "wide", spec: { valueType: "string", editor: "textarea", state: disabled ? "disabled" : "normal" }, value: draft.description, placeholder: "描述目标、结果口径、交付物或拆解口径", onChange: (value) => patch({ description: String(value ?? "") }) },
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
  return true;
}

function normalizeItemType(value: string | null): WorkItemType {
  if (value === "objective" || value === "key_result") return value;
  return "task";
}

function normalizeSourceType(value: string | null): WorkSourceType {
  if (value === "routine" || value === "project" || value === "meeting" || value === "import") return value;
  return "manual";
}

function normalizeSourceKind(value: string | null): WorkSourceKind {
  if (value === "project_phase" || value === "project_task") return value;
  return "project";
}

function normalizeStatus(value: string | null) {
  if (value === "done" || value === "archived") return value;
  return "doing";
}

function normalizePeriodType(value: string | null): WorkPeriodType | null {
  if (value === "daily" || value === "weekly" || value === "monthly" || value === "quarterly" || value === "yearly") return value;
  return null;
}
