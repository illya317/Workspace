"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarDateInput,
  FkFieldInput,
  FormField,
  OptionPicker,
  RatingControl,
  TextareaField,
  TextField,
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

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <FormField label="节点内容" required>
        <TextField
          value={draft.content}
          disabled={disabled}
          placeholder="输入目标、结果或执行任务"
          onChange={(value) => patch({ content: value })}
        />
      </FormField>
      <FormField label="节点类型">
        <OptionPicker
          value={draft.itemType}
          options={WORK_ITEM_TYPE_OPTIONS}
          disabled={disabled}
          onChange={setItemType}
        />
      </FormField>
      <FormField label="计划周期">
        <OptionPicker
          value={draft.periodType}
          options={WORK_PERIOD_TYPE_OPTIONS}
          disabled={disabled}
          placeholder="长期"
          unsetLabel="未设置"
          onChange={(value) => {
            const periodType = normalizePeriodType(value);
            patch({
              periodType,
              periodStart: periodType ? draft.periodStart : null,
              periodEnd: periodType ? draft.periodEnd : null,
            });
          }}
        />
      </FormField>
      {draft.periodType && (
        <>
          <FormField label="周期开始">
            <CalendarDateInput value={draft.periodStart} disabled={disabled} popoverMode="fixed" onChange={(value) => patch({ periodStart: value })} />
          </FormField>
          <FormField label="周期结束">
            <CalendarDateInput value={draft.periodEnd} disabled={disabled} popoverMode="fixed" onChange={(value) => patch({ periodEnd: value })} />
          </FormField>
        </>
      )}
      {isTask && (
        <FormField label="状态">
          <OptionPicker value={draft.status} options={WORK_STATUS_OPTIONS} disabled={disabled} onChange={(value) => patch({ status: normalizeStatus(value) })} />
        </FormField>
      )}
      {targetType !== "personal" && (
        <FormField label="负责人">
          <FkFieldInput
            fkKey="work.tasks.owner.employee"
            endpoint={WORK_REFERENCE_OPTIONS_ENDPOINT}
            value={draft.ownerEmployeeId ? String(draft.ownerEmployeeId) : ""}
            displayValue={draft.ownerEmployeeName}
            disabled={disabled}
            placeholder="搜索员工"
            onChange={(value, option) => patch({
              ownerEmployeeId: option?.id ?? (value ? draft.ownerEmployeeId : null),
              ownerEmployeeName: option?.name ?? (value ? value : ""),
            })}
          />
        </FormField>
      )}
      <FormField label="上级节点">
        <OptionPicker
          value={draft.parentWorkItemId ? String(draft.parentWorkItemId) : ""}
          options={parentOptions}
          disabled={disabled || parentOptions.length === 0}
          placeholder="根节点"
          visibleCount={5}
          onChange={(value) => {
            const option = parentOptions.find((item) => item.value === value);
            patch({
              parentWorkItemId: value ? Number(value) : null,
              parentWorkItemContent: option?.label || "",
            });
          }}
        />
      </FormField>
      {isKr && (
        <>
          <FormField label="结果起点">
            <NumberTextField value={draft.krStartValue} disabled={disabled} onChange={(value) => patch({ krStartValue: value })} />
          </FormField>
          <FormField label="结果当前">
            <NumberTextField value={draft.krCurrentValue} disabled={disabled} onChange={(value) => patch({ krCurrentValue: value })} />
          </FormField>
          <FormField label="结果目标">
            <NumberTextField value={draft.krTargetValue} disabled={disabled} onChange={(value) => patch({ krTargetValue: value })} />
          </FormField>
          <FormField label="单位">
            <TextField value={draft.krUnit} disabled={disabled} placeholder="万元、项、%" onChange={(value) => patch({ krUnit: value })} />
          </FormField>
        </>
      )}
      {isTask && (
        <>
          <FormField label="开始时间">
            <CalendarDateInput value={draft.startDate} disabled={disabled} popoverMode="fixed" onChange={(value) => patch({ startDate: value })} />
          </FormField>
          <FormField label="截止时间">
            <CalendarDateInput value={draft.dueDate} disabled={disabled} popoverMode="fixed" onChange={(value) => patch({ dueDate: value })} />
          </FormField>
        </>
      )}
      <FormField label="来源类型">
        <OptionPicker value={draft.sourceType} options={sourceTypeOptions} disabled={disabled} onChange={setSourceType} />
      </FormField>
      {isProjectSource && (
        <>
          <FormField label="关联项目">
            <FkFieldInput
              fkKey="work.tasks.linked.project"
              endpoint={WORK_REFERENCE_OPTIONS_ENDPOINT}
              value={draft.linkedProjectId ? String(draft.linkedProjectId) : ""}
              displayValue={draft.linkedProjectName}
              disabled={disabled}
              placeholder="搜索项目"
              onChange={(value, option) => patch({
                linkedProjectId: option?.id ?? (value ? draft.linkedProjectId : null),
                linkedProjectName: option?.name ?? (value ? value : ""),
                sourceKind: option ? draft.sourceKind || "project" : null,
                linkedProjectPhaseId: null,
                linkedProjectPhaseName: "",
                linkedProjectTaskId: null,
                linkedProjectTaskName: "",
              })}
            />
          </FormField>
          <FormField label="项目来源层级">
            <OptionPicker
              value={draft.sourceKind}
              options={WORK_PROJECT_SOURCE_KIND_OPTIONS}
              disabled={disabled || !draft.linkedProjectId}
              onChange={setSourceKind}
            />
          </FormField>
          {draft.sourceKind === "project_phase" && (
            <FormField label="关联项目阶段">
              <OptionPicker
                value={draft.linkedProjectPhaseId ? String(draft.linkedProjectPhaseId) : ""}
                options={phaseOptions}
                disabled={disabled || !draft.linkedProjectId}
                placeholder={draft.linkedProjectId ? "选择阶段" : "先选择项目"}
                visibleCount={5}
                onChange={(value) => {
                  const option = phaseOptions.find((item) => item.value === value);
                  patch({
                    linkedProjectPhaseId: value ? Number(value) : null,
                    linkedProjectPhaseName: option?.label || "",
                  });
                }}
              />
            </FormField>
          )}
          {draft.sourceKind === "project_task" && (
            <FormField label="关联项目任务">
              <OptionPicker
                value={draft.linkedProjectTaskId ? String(draft.linkedProjectTaskId) : ""}
                options={taskOptions}
                disabled={disabled || !draft.linkedProjectId}
                placeholder={draft.linkedProjectId ? "选择任务" : "先选择项目"}
                visibleCount={5}
                onChange={(value) => {
                  const option = taskOptions.find((item) => item.value === value);
                  patch({
                    linkedProjectTaskId: value ? Number(value) : null,
                    linkedProjectTaskName: option?.label || "",
                  });
                }}
              />
            </FormField>
          )}
        </>
      )}
      <FormField label="重要度">
        <RatingControl value={draft.importance} readOnly={disabled} label="重要度" showLabel={false} onChange={(value) => patch({ importance: value })} />
      </FormField>
      <FormField label="紧急度">
        <RatingControl value={draft.urgency} readOnly={disabled} label="紧急度" showLabel={false} onChange={(value) => patch({ urgency: value })} />
      </FormField>
      <FormField label="描述" className="lg:col-span-2">
        <TextareaField value={draft.description} disabled={disabled} rows={4} placeholder="描述目标、结果口径、交付物或拆解口径" onChange={(value) => patch({ description: value })} />
      </FormField>
    </div>
  );
}

function NumberTextField({ value, disabled, onChange }: { value: number | null; disabled: boolean; onChange: (value: number | null) => void }) {
  return (
    <TextField
      type="number"
      step="any"
      value={value === null ? "" : String(value)}
      disabled={disabled}
      onChange={(next) => {
        if (!next.trim()) {
          onChange(null);
          return;
        }
        const number = Number(next);
        onChange(Number.isFinite(number) ? number : null);
      }}
    />
  );
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
