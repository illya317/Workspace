"use client";

import { createFieldsSection, createPageBody, type BodySurfaceSectionSpec, type FormSurfaceItemSpec, PageSurface, type ReferenceOption, type SurfacePickerOptionSpec } from "@workspace/core/ui";
import { PROJECT_MILESTONE_PICKER_OPTIONS, type ProjectTaskDraft, type ProjectTaskItem } from "./model";
import type { ProjectPlanPhaseItem } from "./plan-gantt-model";
import { WORK_REFERENCE_OPTIONS_ENDPOINT } from "./reference-options";

interface ProjectTaskFormProps {
  draft: ProjectTaskDraft;
  disabled: boolean;
  taskOptions: SurfacePickerOptionSpec[];
  phases: ProjectPlanPhaseItem[];
  tasks: ProjectTaskItem[];
  excludedTaskId: number | null;
  submitLabel?: string;
  onChange: (draft: ProjectTaskDraft) => void;
  onSubmit?: () => void;
  onCancel?: () => void;
}

export function createProjectTaskFormSection(
  key: string,
  {
  draft,
  disabled,
  taskOptions,
  phases,
  tasks,
  excludedTaskId,
  submitLabel,
  onChange,
  onSubmit,
  onCancel,
}: ProjectTaskFormProps): BodySurfaceSectionSpec {
  const blockedPredecessorIds = new Set(draft.predecessorTaskIds.map(String));
  if (excludedTaskId) {
    blockedPredecessorIds.add(String(excludedTaskId));
    for (const id of downstreamTaskIds(tasks, excludedTaskId)) blockedPredecessorIds.add(String(id));
  }
  const predecessorOptions = taskOptions.filter((option) => !blockedPredecessorIds.has(option.value));
  const taskLabelById = new Map(taskOptions.map((option) => [Number(option.value), option.label]));
  const phaseOptions = phases.map((phase) => ({
    value: String(phase.id),
    label: phase.name,
  }));
  const selectedPhase = phases.find((phase) => phase.id === draft.planPhaseId) ?? null;
  const phaseHint = selectedPhase
    ? `阶段范围：${selectedPhase.startDate || "未设置"} - ${selectedPhase.endDate || "未设置"}`
    : undefined;

  function patch(next: Partial<ProjectTaskDraft>) {
    onChange({ ...draft, ...next });
  }
  function setOwner(option?: ReferenceOption) {
    patch({
      ownerEmployeeId: option?.id ?? null,
      ownerEmployeeNumber: option?.subtitle ?? null,
      ownerEmployeeName: option?.name ?? null,
    });
  }
  function addPredecessor(value: string | null) {
    if (!value) return;
    const id = Number(value);
    if (!Number.isInteger(id) || draft.predecessorTaskIds.includes(id)) return;
    patch({ predecessorTaskIds: [...draft.predecessorTaskIds, id] });
  }
  function removePredecessor(id: number) {
    patch({ predecessorTaskIds: draft.predecessorTaskIds.filter((item) => item !== id) });
  }

  const fields: FormSurfaceItemSpec<number>[] = [
    { key: "name", label: "任务名称", required: true, span: "wide", spec: { valueType: "string", control: "text", state: disabled ? "disabled" : "normal" }, value: draft.name, onChange: (value) => patch({ name: String(value ?? "") }) },
    ...(phaseOptions.length > 0 ? [{ key: "phase", label: "项目阶段", hint: phaseHint, spec: { valueType: "string", control: "choice", options: { source: "static", items: phaseOptions, visibleCount: 6 }, state: disabled ? "disabled" : "normal" }, value: draft.planPhaseId ? String(draft.planPhaseId) : null, placeholder: "选择项目阶段（可选）", onChange: (value) => patch({ planPhaseId: value ? Number(value) : null }) } satisfies FormSurfaceItemSpec<number>] : []),
    { key: "owner", label: "负责人", spec: { valueType: "reference", control: "reference", options: { source: "remote", fkKey: "work.projects.member.employee", endpoint: WORK_REFERENCE_OPTIONS_ENDPOINT, returnField: "id" }, state: disabled ? "disabled" : "normal" }, value: draft.ownerEmployeeNumber || "", displayValue: draft.ownerEmployeeName || "", placeholder: "搜索负责人", onChange: (_value, option) => setOwner(option as ReferenceOption | undefined) },
    { key: "milestone", label: "里程碑", spec: { valueType: "boolean", control: "choice", options: { source: "static", items: PROJECT_MILESTONE_PICKER_OPTIONS, visibleCount: 2 }, state: disabled ? "disabled" : "normal" }, value: draft.isMilestone ? "true" : "false", onChange: (value) => patch({ isMilestone: value === "true" }) },
    { key: "baselineStartDate", label: "基线开始", spec: { valueType: "date", control: "temporal", precision: "date", state: disabled ? "disabled" : "normal" }, value: draft.baselineStartDate, onChange: (value) => patch({ baselineStartDate: String(value || "") }), placeholder: "选择日期" },
    { key: "baselineEndDate", label: "基线结束", spec: { valueType: "date", control: "temporal", precision: "date", state: disabled ? "disabled" : "normal" }, value: draft.baselineEndDate, onChange: (value) => patch({ baselineEndDate: String(value || "") }), placeholder: "选择日期" },
    { key: "startDate", label: "实际开始", spec: { valueType: "date", control: "temporal", precision: "date", state: disabled ? "disabled" : "normal" }, value: draft.startDate, onChange: (value) => patch({ startDate: String(value || "") }), placeholder: "选择日期" },
    { key: "endDate", label: "实际结束", spec: { valueType: "date", control: "temporal", precision: "date", state: disabled ? "disabled" : "normal" }, value: draft.endDate, onChange: (value) => patch({ endDate: String(value || "") }), placeholder: "选择日期" },
    { key: "description", label: "任务描述", span: "wide", spec: { valueType: "string", control: "text", multiline: true, state: disabled ? "disabled" : "normal" }, value: draft.description, onChange: (value) => patch({ description: String(value ?? "") }) },
    {
      kind: "tagList",
      key: "predecessors",
      label: "前置任务",
      span: "wide",
      items: draft.predecessorTaskIds,
      getKey: (id) => id,
      getLabel: (id) => taskLabelById.get(id) || `任务 ${id}`,
      onRemove: (_, index) => removePredecessor(draft.predecessorTaskIds[index]),
      disabled,
      confirm: false,
      append: {
        field: {
          key: "add-predecessor",
          label: "添加前置任务",
          spec: { valueType: "string", control: "choice", options: { source: "static", items: predecessorOptions, visibleCount: 6 }, state: disabled || predecessorOptions.length === 0 ? "disabled" : "normal" },
          value: null,
          placeholder: predecessorOptions.length > 0 ? "添加前置任务" : "无可选前置任务",
          onChange: (value) => addPredecessor(String(value || "")),
        },
      },
    },
  ];

  return createFieldsSection<number>(key, fields, {
    layout: { columns: 3 },
    commands: [
      ...(onCancel ? [{ key: "cancel", label: "取消", disabled, onClick: onCancel }] : []),
      ...(submitLabel && onSubmit ? [{ key: "submit", label: submitLabel, variant: "primary" as const, disabled, onClick: onSubmit }] : []),
    ],
  });
}

export function ProjectTaskForm(props: ProjectTaskFormProps) {
  return (
    <PageSurface kind="standard"
      embedded
      body={createPageBody([createProjectTaskFormSection("project-task-form", props)])}
    />
  );
}

export function ProjectTaskDetail({ task }: { task: ProjectTaskItem }) {
  const detailItems = [
    { label: "任务名称", value: task.name },
    { label: "项目阶段", value: task.planPhaseName || "未设置" },
    { label: "负责人", value: task.ownerEmployeeName || "未设置" },
    { label: "基线时间", value: [task.baselineStartDate || "未定", task.baselineEndDate || "未定"].join(" - ") },
    { label: "实际时间", value: [task.startDate || "未定", task.endDate || "未定"].join(" - ") },
    {
      label: "派生子项目",
      value: task.childProjectId
        ? [task.childProjectCode, task.childProjectName, task.childProjectStatus].filter(Boolean).join(" · ")
        : "未派生",
    },
    { label: "里程碑", value: task.isMilestone ? "是" : "否" },
    { label: "前置任务", value: task.predecessorTaskNames.length > 0 ? task.predecessorTaskNames.join("、") : "无" },
    { label: "后置任务", value: task.successorTasks.length > 0 ? task.successorTasks.map((item) => item.name).join("、") : "无" },
  ];
  return (
    <PageSurface kind="standard"
      embedded
      body={createPageBody([createFieldsSection("project-task-detail", [
        ...detailItems.map((item): FormSurfaceItemSpec => ({
          kind: "readonly",
          key: item.label,
          label: item.label,
          value: item.value,
        })),
        {
          kind: "readonly",
          key: "description",
          label: "任务描述",
          span: "wide",
          value: task.description || "未填写",
        },
      ], { kind: "detail", layout: { columns: 3 } })])}
    />
  );
}

function downstreamTaskIds(tasks: ProjectTaskItem[], taskId: number) {
  const successorsByPredecessor = new Map<number, number[]>();
  for (const task of tasks) {
    for (const predecessorId of task.predecessorTaskIds) {
      successorsByPredecessor.set(predecessorId, [...(successorsByPredecessor.get(predecessorId) || []), task.id]);
    }
  }
  const result = new Set<number>();
  const stack = [...(successorsByPredecessor.get(taskId) || [])];
  while (stack.length > 0) {
    const id = stack.pop();
    if (!id || result.has(id)) continue;
    result.add(id);
    stack.push(...(successorsByPredecessor.get(id) || []));
  }
  return result;
}
