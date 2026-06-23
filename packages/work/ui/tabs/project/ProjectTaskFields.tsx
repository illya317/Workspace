"use client";

import {
  ActionButton,
  FkFieldInput,
  FormField,
  OptionPicker,
  RemovableTag,
  TextareaField,
  TextField,
  getFieldInputClassName,
  type FkFieldOption,
  type PickerOption,
} from "@workspace/core/ui";
import CalendarDateInput from "@workspace/core/ui/CalendarDateInput";
import {
  PROJECT_MILESTONE_PICKER_OPTIONS,
  type ProjectTaskDraft,
  type ProjectTaskItem,
} from "./model";
import type { ProjectPlanPhaseItem } from "./plan-gantt-model";
import { WORK_REFERENCE_OPTIONS_ENDPOINT } from "./reference-options";

const inputClassName = getFieldInputClassName("h-10");
const pickerButtonClassName = `${inputClassName} text-left`;
const pickerPopoverClassName = "absolute left-0 top-[calc(100%+0.35rem)] z-50 w-full min-w-64 rounded-lg border border-slate-200 bg-white p-3 shadow-xl";

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
  const phaseOptions = phases.map((phase) => ({ value: String(phase.id), label: phase.name }));
  const selectedPhase = phases.find((phase) => phase.id === draft.planPhaseId) ?? null;
  const phaseHint = selectedPhase
    ? `阶段范围：${selectedPhase.startDate || "未设置"} - ${selectedPhase.endDate || "未设置"}`
    : phaseOptions.length > 0 ? "请选择任务所属项目阶段" : "请先在上方建立项目阶段";

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
    <div className={framed ? "rounded-lg border border-slate-200 bg-white p-3" : ""}>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
        <FormField label="任务名称" required className="lg:col-span-2">
          <TextField value={draft.name} disabled={disabled} className={inputClassName} onChange={(value) => patch({ name: value })} unstyled />
        </FormField>
        <FormField label="项目阶段" required>
          <OptionPicker
            value={draft.planPhaseId ? String(draft.planPhaseId) : null}
            options={phaseOptions}
            disabled={disabled || phaseOptions.length === 0}
            placeholder={phaseOptions.length > 0 ? "选择项目阶段" : "请先建立项目阶段"}
            onChange={(value) => patch({ planPhaseId: value ? Number(value) : null })}
            visibleCount={6}
            buttonClassName={pickerButtonClassName}
            popoverClassName={pickerPopoverClassName}
          />
          <p className="mt-1 text-xs font-medium text-slate-400">{phaseHint}</p>
        </FormField>
        <FormField label="负责人">
          <FkFieldInput
            fkKey="work.projects.member.employee"
            endpoint={WORK_REFERENCE_OPTIONS_ENDPOINT}
            value={draft.ownerEmployeeNumber || ""}
            displayValue={draft.ownerEmployeeName || ""}
            disabled={disabled}
            placeholder="搜索负责人"
            onChange={(_label, option) => setOwner(option)}
          />
        </FormField>
        <FormField label="里程碑">
          <OptionPicker
            value={draft.isMilestone ? "true" : "false"}
            options={PROJECT_MILESTONE_PICKER_OPTIONS}
            disabled={disabled}
            onChange={(value) => patch({ isMilestone: value === "true" })}
            visibleCount={2}
            buttonClassName={pickerButtonClassName}
            popoverClassName={pickerPopoverClassName}
          />
        </FormField>
        <DateField label="基线开始" value={draft.baselineStartDate} disabled={disabled} onChange={(value) => patch({ baselineStartDate: value })} />
        <DateField label="基线结束" value={draft.baselineEndDate} disabled={disabled} onChange={(value) => patch({ baselineEndDate: value })} />
        <DateField label="实际开始" value={draft.startDate} disabled={disabled} onChange={(value) => patch({ startDate: value })} />
        <DateField label="实际结束" value={draft.endDate} disabled={disabled} onChange={(value) => patch({ endDate: value })} />
        <FormField label="任务描述" className="lg:col-span-4">
          <TextareaField value={draft.description} disabled={disabled} rows={2} className="text-sm" onChange={(value) => patch({ description: value })} />
        </FormField>
        <FormField label="前置任务" className="lg:col-span-4">
          <div className="space-y-2">
            <OptionPicker
              value={null}
              options={predecessorOptions}
              disabled={disabled || predecessorOptions.length === 0}
              placeholder={predecessorOptions.length > 0 ? "添加前置任务" : "无可选前置任务"}
              onChange={addPredecessor}
              visibleCount={6}
              buttonClassName={pickerButtonClassName}
              popoverClassName={pickerPopoverClassName}
            />
            {draft.predecessorTaskIds.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {draft.predecessorTaskIds.map((id) => (
                  <RemovableTag
                    key={id}
                    disabled={disabled}
                    label={`移除前置任务 ${taskLabelById.get(id) || id}`}
                    onRemove={() => removePredecessor(id)}
                  >
                    {taskLabelById.get(id) || `任务 ${id}`}
                  </RemovableTag>
                ))}
              </div>
            )}
          </div>
        </FormField>
      </div>
      {(onCancel || (submitLabel && onSubmit)) && (
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          {onCancel && <ActionButton disabled={disabled} onClick={onCancel}>取消</ActionButton>}
          {submitLabel && onSubmit && <ActionButton variant="primary" disabled={disabled} onClick={onSubmit}>{submitLabel}</ActionButton>}
        </div>
      )}
    </div>
  );
}

export function ProjectTaskDetail({ task }: { task: ProjectTaskItem }) {
  const detailItems = [
    { label: "任务名称", value: task.name },
    { label: "项目阶段", value: task.planPhaseName || "未设置" },
    { label: "负责人", value: task.ownerEmployeeName || "未设置" },
    { label: "基线时间", value: [task.baselineStartDate || "未定", task.baselineEndDate || "未定"].join(" - ") },
    { label: "实际时间", value: [task.startDate || "未定", task.endDate || "未定"].join(" - ") },
    { label: "里程碑", value: task.isMilestone ? "是" : "否" },
    { label: "前置任务", value: task.predecessorTaskNames.length > 0 ? task.predecessorTaskNames.join("、") : "无" },
    { label: "后置任务", value: task.successorTasks.length > 0 ? task.successorTasks.map((item) => item.name).join("、") : "无" },
  ];

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2 xl:grid-cols-3">
        {detailItems.map((item) => (
          <div key={item.label} className="min-w-0">
            <div className="text-xs font-medium text-slate-400">{item.label}</div>
            <div className="mt-1 min-w-0 break-words text-slate-800">{item.value}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 border-t border-slate-100 pt-3">
        <div className="text-xs font-medium text-slate-400">任务描述</div>
        <div className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-800">{task.description || "未填写"}</div>
      </div>
    </div>
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

function DateField({ label, value, disabled, onChange }: { label: string; value: string | null; disabled: boolean; onChange: (value: string | null) => void }) {
  return (
    <FormField label={label}>
      <CalendarDateInput value={value} disabled={disabled} onChange={onChange} className={inputClassName} popoverMode="fixed" />
    </FormField>
  );
}
