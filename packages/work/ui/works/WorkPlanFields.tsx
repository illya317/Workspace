"use client";

import { useEffect, useState } from "react";
import { createFormBlock, createPageBody, type FormSurfaceFieldSpec, type FormSurfaceProps, PageSurface, type SurfacePickerOptionSpec } from "@workspace/core/ui";
import {
  listProjectPhaseOptions,
  listProjectTaskOptions,
  WORK_REFERENCE_OPTIONS_ENDPOINT,
} from "./api";
import {
  WORK_PERIOD_TYPE_OPTIONS,
  WORK_PROJECT_SOURCE_KIND_OPTIONS,
  WORK_SOURCE_TYPE_OPTIONS,
} from "./model";
import type { WorkPlanDraft, WorkSourceKind, WorkSourceType } from "./types";

export function WorkPlanForm({
  draft,
  disabled,
  onChange,
}: {
  draft: WorkPlanDraft;
  disabled: boolean;
  onChange: (draft: WorkPlanDraft) => void;
}) {
  const surface = useWorkPlanFormSurface({ draft, disabled, onChange });
  return <PageSurface embedded kind="detail" body={createPageBody([createFormBlock("work-plan-form", surface)])} />;
}

export function useWorkPlanFormSurface({
  draft,
  disabled,
  onChange,
}: {
  draft: WorkPlanDraft;
  disabled: boolean;
  onChange: (draft: WorkPlanDraft) => void;
}): FormSurfaceProps {
  const [taskOptions, setTaskOptions] = useState<SurfacePickerOptionSpec[]>([]);
  const [phaseOptions, setPhaseOptions] = useState<SurfacePickerOptionSpec[]>([]);
  const isProjectSource = draft.sourceType === "project";
  const isMeetingSource = draft.sourceType === "meeting";

  useEffect(() => {
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
  }, [draft.linkedProjectId]);

  function patch(next: Partial<WorkPlanDraft>) {
    onChange({ ...draft, ...next });
  }

  function setSourceType(value: string | null) {
    const sourceType = normalizeSourceType(value);
    patch(sourceType === "project" ? {
      sourceType,
      sourceKind: draft.sourceKind || "project",
      sourceMeetingId: null,
      sourceMeetingTitle: "",
      sourceMeetingDecisionId: null,
      sourceMeetingDecisionTitle: "",
      sourceMeetingActionCandidateId: null,
      sourceMeetingActionCandidateTitle: "",
    } : {
      sourceType,
      sourceKind: null,
      linkedProjectId: null,
      linkedProjectName: "",
      linkedProjectPhaseId: null,
      linkedProjectPhaseName: "",
      linkedProjectTaskId: null,
      linkedProjectTaskName: "",
      ...(sourceType === "meeting" ? {} : {
        sourceMeetingId: null,
        sourceMeetingTitle: "",
        sourceMeetingDecisionId: null,
        sourceMeetingDecisionTitle: "",
        sourceMeetingActionCandidateId: null,
        sourceMeetingActionCandidateTitle: "",
      }),
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

  const fields: FormSurfaceFieldSpec[] = [
    { key: "title", label: "OKR 计划", required: true, span: "wide", spec: { valueType: "string", control: "text", state: disabled ? "disabled" : "normal" }, value: draft.title, placeholder: "例如：2026 Q3 交付质量 OKR", onChange: (value) => patch({ title: String(value ?? "") }) },
    { key: "periodType", label: "计划周期", spec: { valueType: "string", control: "choice", options: { source: "static", items: WORK_PERIOD_TYPE_OPTIONS, unsetLabel: "未设置" }, state: disabled ? "disabled" : "normal" }, value: draft.periodType, placeholder: "长期", onChange: (value) => {
      const periodType = normalizePeriodType(String(value || ""));
      patch({ periodType, periodStart: periodType ? draft.periodStart : null, periodEnd: periodType ? draft.periodEnd : null });
    } },
    ...(draft.periodType ? [
      { key: "periodStart", label: "计划开始", spec: { valueType: "date", control: "temporal", precision: "date", state: disabled ? "disabled" : "normal" }, value: draft.periodStart, onChange: (value: unknown) => patch({ periodStart: String(value || "") }), placeholder: "选择日期" },
      { key: "periodEnd", label: "计划结束", spec: { valueType: "date", control: "temporal", precision: "date", state: disabled ? "disabled" : "normal" }, value: draft.periodEnd, onChange: (value: unknown) => patch({ periodEnd: String(value || "") }), placeholder: "选择日期" },
    ] satisfies FormSurfaceFieldSpec[] : []),
    { key: "owner", label: "负责人", spec: { valueType: "reference", control: "reference", options: { source: "remote", fkKey: "work.tasks.owner.employee", endpoint: WORK_REFERENCE_OPTIONS_ENDPOINT, returnField: "id" }, state: disabled ? "disabled" : "normal" }, value: draft.ownerEmployeeId ? String(draft.ownerEmployeeId) : "", displayValue: draft.ownerEmployeeName, placeholder: "搜索员工", onChange: (value: unknown, option: unknown) => patch({
      ownerEmployeeId: typeof option === "object" && option && "id" in option ? Number(option.id) : (value ? draft.ownerEmployeeId : null),
      ownerEmployeeName: typeof option === "object" && option && "name" in option ? String(option.name) : (value ? String(value) : ""),
    }) },
    { key: "sourceType", label: "来源类型", spec: { valueType: "string", control: "choice", options: { source: "static", items: WORK_SOURCE_TYPE_OPTIONS }, state: disabled ? "disabled" : "normal" }, value: draft.sourceType, onChange: (value) => setSourceType(String(value || "")) },
    ...(isProjectSource ? [
      { key: "linkedProject", label: "关联项目", spec: { valueType: "reference", control: "reference", options: { source: "remote", fkKey: "work.tasks.linked.project", endpoint: WORK_REFERENCE_OPTIONS_ENDPOINT, returnField: "id" }, state: disabled ? "disabled" : "normal" }, value: draft.linkedProjectId ? String(draft.linkedProjectId) : "", displayValue: draft.linkedProjectName, placeholder: "搜索项目", onChange: (value: unknown, option: unknown) => patch({
        linkedProjectId: typeof option === "object" && option && "id" in option ? Number(option.id) : (value ? draft.linkedProjectId : null),
        linkedProjectName: typeof option === "object" && option && "name" in option ? String(option.name) : (value ? String(value) : ""),
        sourceKind: option ? draft.sourceKind || "project" : null,
        linkedProjectPhaseId: null,
        linkedProjectPhaseName: "",
        linkedProjectTaskId: null,
        linkedProjectTaskName: "",
      }) },
      { key: "sourceKind", label: "项目来源层级", spec: { valueType: "string", control: "choice", options: { source: "static", items: WORK_PROJECT_SOURCE_KIND_OPTIONS }, state: disabled || !draft.linkedProjectId ? "disabled" : "normal" }, value: draft.sourceKind, onChange: (value: unknown) => setSourceKind(String(value || "")) },
      ...(draft.sourceKind === "project_phase" ? [{ key: "linkedProjectPhase", label: "关联项目阶段", spec: { valueType: "string", control: "choice", options: { source: "static", items: phaseOptions, visibleCount: 5 }, state: disabled || !draft.linkedProjectId ? "disabled" : "normal" }, value: draft.linkedProjectPhaseId ? String(draft.linkedProjectPhaseId) : "", placeholder: draft.linkedProjectId ? "选择阶段" : "先选择项目", onChange: (value: unknown) => {
        const next = String(value || "");
        const option = phaseOptions.find((item) => item.value === next);
        patch({ linkedProjectPhaseId: next ? Number(next) : null, linkedProjectPhaseName: option?.label || "" });
      } }] satisfies FormSurfaceFieldSpec[] : []),
      ...(draft.sourceKind === "project_task" ? [{ key: "linkedProjectTask", label: "关联项目任务", spec: { valueType: "string", control: "choice", options: { source: "static", items: taskOptions, visibleCount: 5 }, state: disabled || !draft.linkedProjectId ? "disabled" : "normal" }, value: draft.linkedProjectTaskId ? String(draft.linkedProjectTaskId) : "", placeholder: draft.linkedProjectId ? "选择项目任务" : "先选择项目", onChange: (value: unknown) => {
        const next = String(value || "");
        const option = taskOptions.find((item) => item.value === next);
        patch({ linkedProjectTaskId: next ? Number(next) : null, linkedProjectTaskName: option?.label || "" });
      } }] satisfies FormSurfaceFieldSpec[] : []),
    ] satisfies FormSurfaceFieldSpec[] : []),
    ...(isMeetingSource ? [
      { key: "sourceMeeting", label: "来源会议", spec: { valueType: "reference", control: "reference", options: { source: "remote", fkKey: "work.tasks.source.meeting", endpoint: WORK_REFERENCE_OPTIONS_ENDPOINT, returnField: "id" }, state: disabled ? "disabled" : "normal" }, value: draft.sourceMeetingId ? String(draft.sourceMeetingId) : "", displayValue: draft.sourceMeetingTitle, placeholder: "搜索会议", onChange: (value: unknown, option: unknown) => patch({
        sourceMeetingId: typeof option === "object" && option && "id" in option ? Number(option.id) : (value ? draft.sourceMeetingId : null),
        sourceMeetingTitle: typeof option === "object" && option && "name" in option ? String(option.name) : (value ? String(value) : ""),
        sourceMeetingDecisionId: null,
        sourceMeetingDecisionTitle: "",
        sourceMeetingActionCandidateId: null,
        sourceMeetingActionCandidateTitle: "",
      }) },
    ] satisfies FormSurfaceFieldSpec[] : []),
    { key: "description", label: "说明", span: "wide", spec: { valueType: "string", control: "text", multiline: true, state: disabled ? "disabled" : "normal" }, value: draft.description, placeholder: "说明计划背景、边界或达成口径", onChange: (value) => patch({ description: String(value ?? "") }) },
  ];

  return {
    kind: "fields",
    columns: 2,
    fields,
  };
}

function normalizePeriodType(value: string | null) {
  if (value === "daily" || value === "weekly" || value === "monthly" || value === "quarterly" || value === "yearly") return value;
  return null;
}

function normalizeSourceType(value: string | null): WorkSourceType {
  if (value === "routine" || value === "project" || value === "meeting") return value;
  return "other";
}

function normalizeSourceKind(value: string | null): WorkSourceKind {
  if (value === "project_phase" || value === "project_task") return value;
  return "project";
}
