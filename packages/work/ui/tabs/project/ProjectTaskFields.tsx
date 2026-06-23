"use client";

import {
  ActionButton,
  FkFieldInput,
  FormField,
  OptionPicker,
  TextareaField,
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
import { WORK_REFERENCE_OPTIONS_ENDPOINT } from "./reference-options";

const inputClassName = getFieldInputClassName("h-10");
const pickerButtonClassName = `${inputClassName} text-left`;
const pickerPopoverClassName = "absolute left-0 top-[calc(100%+0.35rem)] z-50 w-full min-w-64 rounded-lg border border-slate-200 bg-white p-3 shadow-xl";

export function ProjectTaskForm({
  draft,
  disabled,
  taskOptions,
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
  excludedTaskId: number | null;
  submitLabel?: string;
  onChange: (draft: ProjectTaskDraft) => void;
  onSubmit?: () => void;
  onCancel?: () => void;
  framed?: boolean;
}) {
  const predecessorOptions = taskOptions.filter((option) => option.value !== String(excludedTaskId));

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

  return (
    <div className={framed ? "rounded-lg border border-slate-200 bg-white p-3" : ""}>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
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
        <DateField label="开始时间" value={draft.startDate} disabled={disabled} onChange={(value) => patch({ startDate: value })} />
        <DateField label="完成时间" value={draft.endDate} disabled={disabled} onChange={(value) => patch({ endDate: value })} />
        <FormField label="任务描述" required className="lg:col-span-4">
          <TextareaField value={draft.description} disabled={disabled} rows={2} className="text-sm" onChange={(value) => patch({ description: value })} />
        </FormField>
        <FormField label="前置任务" className="lg:col-span-4">
          <OptionPicker
            value={draft.predecessorTaskIds[0] ? String(draft.predecessorTaskIds[0]) : null}
            options={predecessorOptions}
            disabled={disabled || predecessorOptions.length === 0}
            placeholder="无"
            onChange={(value) => patch({ predecessorTaskIds: value ? [Number(value)] : [] })}
            visibleCount={6}
            buttonClassName={pickerButtonClassName}
            popoverClassName={pickerPopoverClassName}
          />
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
    { label: "负责人", value: task.ownerEmployeeName || "未设置" },
    { label: "开始时间", value: task.startDate || "未定" },
    { label: "完成时间", value: task.endDate || "未定" },
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
        <div className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-800">{task.description}</div>
      </div>
    </div>
  );
}

function DateField({ label, value, disabled, onChange }: { label: string; value: string | null; disabled: boolean; onChange: (value: string | null) => void }) {
  return (
    <FormField label={label}>
      <CalendarDateInput value={value} disabled={disabled} onChange={onChange} className={inputClassName} popoverMode="fixed" />
    </FormField>
  );
}
