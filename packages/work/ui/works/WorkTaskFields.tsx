"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  CalendarDateInput,
  FkFieldInput,
  FormField,
  OptionPicker,
  RatingControl,
  StatusBadge,
  TextareaField,
  TextField,
  type PickerOption,
} from "@workspace/core/ui";
import {
  listProjectTaskOptions,
  WORK_REFERENCE_OPTIONS_ENDPOINT,
} from "./api";
import {
  getStatusLabel,
  WORK_CATEGORY_OPTIONS,
  WORK_STATUS_OPTIONS,
} from "./model";
import type { WorkItem, WorkItemDraft } from "./types";
import type { WorkTargetType } from "./types";

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
  const parentOptions = useMemo(
    () => works
      .filter((work) => work.id !== excludedWorkId)
      .map((work) => ({ value: String(work.id), label: work.content })),
    [excludedWorkId, works],
  );

  useEffect(() => {
    let ignore = false;
    listProjectTaskOptions(draft.linkedProjectId)
      .then((options) => { if (!ignore) setTaskOptions(options); })
      .catch(() => { if (!ignore) setTaskOptions([]); });
    return () => { ignore = true; };
  }, [draft.linkedProjectId]);

  function patch(next: Partial<WorkItemDraft>) {
    onChange({ ...draft, ...next });
  }

  const isRoutine = draft.category === "routine";

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <FormField label="工作内容" required>
        <TextField
          value={draft.content}
          disabled={disabled}
          placeholder="输入工作内容"
          onChange={(value) => patch({ content: value })}
        />
      </FormField>
      <FormField label="工作类别">
        <OptionPicker
          value={draft.category}
          options={[...WORK_CATEGORY_OPTIONS]}
          disabled={disabled}
          onChange={(value) => {
            const category = value === "non-routine" ? "non-routine" : "routine";
            patch(category === "routine"
              ? {
                category,
                status: null,
                startDate: null,
                dueDate: null,
                linkedProjectId: null,
                linkedProjectName: "",
                linkedProjectTaskId: null,
                linkedProjectTaskName: "",
              }
              : { category, status: draft.status || "doing" });
          }}
        />
      </FormField>
      {!isRoutine && (
        <FormField label="状态">
          <OptionPicker
            value={draft.status}
            options={WORK_STATUS_OPTIONS}
            disabled={disabled}
            onChange={(value) => patch({ status: normalizeStatus(value) })}
          />
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
      <FormField label="上级工作项">
        <OptionPicker
          value={draft.parentWorkItemId ? String(draft.parentWorkItemId) : ""}
          options={parentOptions}
          disabled={disabled || parentOptions.length === 0}
          placeholder="不关联"
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
      {!isRoutine && (
        <>
          <FormField label="开始时间">
            <CalendarDateInput
              value={draft.startDate}
              disabled={disabled}
              popoverMode="fixed"
              onChange={(value) => patch({ startDate: value })}
            />
          </FormField>
          <FormField label="截止时间">
            <CalendarDateInput
              value={draft.dueDate}
              disabled={disabled}
              popoverMode="fixed"
              onChange={(value) => patch({ dueDate: value })}
            />
          </FormField>
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
                linkedProjectTaskId: null,
                linkedProjectTaskName: "",
              })}
            />
          </FormField>
          <FormField label="关联项目任务">
            <OptionPicker
              value={draft.linkedProjectTaskId ? String(draft.linkedProjectTaskId) : ""}
              options={taskOptions}
              disabled={disabled || !draft.linkedProjectId}
              placeholder={draft.linkedProjectId ? "不关联" : "先选择项目"}
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
        </>
      )}
      <FormField label="重要度">
        <RatingControl
          value={draft.importance}
          readOnly={disabled}
          label="重要度"
          showLabel={false}
          onChange={(value) => patch({ importance: value })}
        />
      </FormField>
      <FormField label="紧急度">
        <RatingControl
          value={draft.urgency}
          readOnly={disabled}
          label="紧急度"
          showLabel={false}
          onChange={(value) => patch({ urgency: value })}
        />
      </FormField>
      <FormField label="描述" className="lg:col-span-2">
        <TextareaField
          value={draft.description}
          disabled={disabled}
          rows={4}
          placeholder="描述要完成的工作、交付物或拆解口径"
          onChange={(value) => patch({ description: value })}
        />
      </FormField>
    </div>
  );
}

export function WorkTaskDetail({ work }: { work: WorkItem }) {
  const status = work.category === "routine" ? null : (work.isArchived ? "archived" : work.status);
  const showPlanFields = work.category !== "routine";
  return (
    <div className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 text-sm lg:grid-cols-2">
      <DetailItem label="工作内容" className="lg:col-span-2">
        <p className="whitespace-pre-wrap text-slate-900">{work.content}</p>
      </DetailItem>
      {work.description && (
        <DetailItem label="描述" className="lg:col-span-2">
          <p className="whitespace-pre-wrap text-slate-700">{work.description}</p>
        </DetailItem>
      )}
      {work.targetType !== "personal" && <DetailItem label="负责人">{work.ownerEmployeeName || "未设置"}</DetailItem>}
      {showPlanFields && status && <DetailItem label="状态"><StatusBadge label={getStatusLabel(status)} variant={statusVariant(status)} /></DetailItem>}
      {showPlanFields && <DetailItem label="起止时间">{dateRange(work.startDate, work.dueDate)}</DetailItem>}
      <DetailItem label="上级工作项">{work.parentWorkItemContent || "未关联"}</DetailItem>
      {showPlanFields && <DetailItem label="关联项目">{work.linkedProjectName || "未关联"}</DetailItem>}
      {showPlanFields && <DetailItem label="关联项目任务">{work.linkedProjectTaskName || "未关联"}</DetailItem>}
    </div>
  );
}

function DetailItem({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="mb-1 text-xs font-medium text-slate-400">{label}</div>
      <div className="text-slate-700">{children}</div>
    </div>
  );
}

function normalizeStatus(value: string | null) {
  if (value === "done" || value === "archived") return value;
  return "doing";
}

function statusVariant(status: string) {
  if (status === "done") return "blue";
  if (status === "archived") return "orange";
  return "green";
}

function dateRange(startDate: string | null, dueDate: string | null) {
  if (!startDate && !dueDate) return "未设置";
  if (startDate && dueDate) return `${startDate} - ${dueDate}`;
  return startDate || dueDate;
}
