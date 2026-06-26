"use client";

import type { ReactNode } from "react";
import {
  CalendarDateInput,
  CommandButton,
  FieldGrid,
  FkFieldInput,
  OptionPicker,
  PanelCard,
  ReadOnlyField,
  TagListInput,
  TextareaField,
  TextField,
  type FkFieldOption,
  type PickerOption,
} from "@workspace/core/ui";
import { PROJECT_MILESTONE_PICKER_OPTIONS, type ProjectTaskDraft, type ProjectTaskItem } from "./model";
import type { ProjectPlanPhaseItem } from "./plan-gantt-model";
import { WORK_REFERENCE_OPTIONS_ENDPOINT } from "./reference-options";

export function ProjectTaskForm({
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
  framed = true,
}: {
  draft: ProjectTaskDraft;
  disabled: boolean;
  taskOptions: PickerOption[];
  phases: ProjectPlanPhaseItem[];
  tasks: ProjectTaskItem[];
  excludedTaskId: number | null;
  submitLabel?: string;
  onChange: (draft: ProjectTaskDraft) => void;
  onSubmit?: () => void;
  onCancel?: () => void;
  framed?: boolean;
}) {
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
  function setOwner(option?: FkFieldOption) {
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

  return (
    <FormWrapper framed={framed}>
      <FieldGrid columns={3} mode="mixed">
        <FieldGrid.Cell label="任务名称" required span="wide">
          <TextField value={draft.name} disabled={disabled} onChange={(value) => patch({ name: value })} />
        </FieldGrid.Cell>
        <FieldGrid.Cell label="项目阶段" hint={phaseHint}>
          <OptionPicker
            value={draft.planPhaseId ? String(draft.planPhaseId) : null}
            options={phaseOptions}
            disabled={disabled || phaseOptions.length === 0}
            placeholder={phaseOptions.length > 0 ? "选择项目阶段（可选）" : "无项目阶段"}
            onChange={(value) => patch({ planPhaseId: value ? Number(value) : null })}
            visibleCount={6}
          />
        </FieldGrid.Cell>
        <FieldGrid.Cell label="负责人">
          <FkFieldInput
            fkKey="work.projects.member.employee"
            endpoint={WORK_REFERENCE_OPTIONS_ENDPOINT}
            value={draft.ownerEmployeeNumber || ""}
            displayValue={draft.ownerEmployeeName || ""}
            disabled={disabled}
            placeholder="搜索负责人"
            onChange={(_label, option) => setOwner(option)}
          />
        </FieldGrid.Cell>
        <FieldGrid.Cell label="里程碑">
          <OptionPicker
            value={draft.isMilestone ? "true" : "false"}
            options={PROJECT_MILESTONE_PICKER_OPTIONS}
            disabled={disabled}
            onChange={(value) => patch({ isMilestone: value === "true" })}
            visibleCount={2}
          />
        </FieldGrid.Cell>
        <FieldGrid.Cell label="基线开始">
          <CalendarDateInput value={draft.baselineStartDate} disabled={disabled} onChange={(value) => patch({ baselineStartDate: value })} popoverMode="fixed" />
        </FieldGrid.Cell>
        <FieldGrid.Cell label="基线结束">
          <CalendarDateInput value={draft.baselineEndDate} disabled={disabled} onChange={(value) => patch({ baselineEndDate: value })} popoverMode="fixed" />
        </FieldGrid.Cell>
        <FieldGrid.Cell label="实际开始">
          <CalendarDateInput value={draft.startDate} disabled={disabled} onChange={(value) => patch({ startDate: value })} popoverMode="fixed" />
        </FieldGrid.Cell>
        <FieldGrid.Cell label="实际结束">
          <CalendarDateInput value={draft.endDate} disabled={disabled} onChange={(value) => patch({ endDate: value })} popoverMode="fixed" />
        </FieldGrid.Cell>
        <FieldGrid.Cell label="任务描述" span="wide">
          <TextareaField value={draft.description} disabled={disabled} rows={2} onChange={(value) => patch({ description: value })} />
        </FieldGrid.Cell>
        <FieldGrid.Cell label="前置任务" span="wide">
          <div className="space-y-2">
            <OptionPicker
              value={null}
              options={predecessorOptions}
              disabled={disabled || predecessorOptions.length === 0}
              placeholder={predecessorOptions.length > 0 ? "添加前置任务" : "无可选前置任务"}
              onChange={addPredecessor}
              visibleCount={6}
            />
            {draft.predecessorTaskIds.length > 0 && (
              <TagListInput
                items={draft.predecessorTaskIds}
                getKey={(id) => id}
                getLabel={(id) => taskLabelById.get(id) || `任务 ${id}`}
                onRemove={(_, index) => removePredecessor(draft.predecessorTaskIds[index])}
                disabled={disabled}
                confirm={false}
              />
            )}
          </div>
        </FieldGrid.Cell>
      </FieldGrid>
      {(onCancel || (submitLabel && onSubmit)) && (
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          {onCancel && <CommandButton disabled={disabled} onClick={onCancel}>取消</CommandButton>}
          {submitLabel && onSubmit && (
            <CommandButton variant="primary" disabled={disabled} onClick={onSubmit}>{submitLabel}</CommandButton>
          )}
        </div>
      )}
    </FormWrapper>
  );
}

function FormWrapper({ framed, children }: { framed: boolean; children: ReactNode }) {
  if (!framed) return <>{children}</>;
  return <PanelCard className="shadow-none" bodyClassName="p-3">{children}</PanelCard>;
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
    <PanelCard className="shadow-none" bodyClassName="p-3">
      <FieldGrid columns={3} mode="view">
        {detailItems.map((item) => (
          <FieldGrid.Cell key={item.label} label={item.label}>
            <ReadOnlyField value={item.value} />
          </FieldGrid.Cell>
        ))}
        <FieldGrid.Cell label="任务描述" span="wide">
          <ReadOnlyField value={task.description || "未填写"} />
        </FieldGrid.Cell>
      </FieldGrid>
    </PanelCard>
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
