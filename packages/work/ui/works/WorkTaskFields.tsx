"use client";

import { useEffect, useMemo, useState } from "react";
import {
  FormField,
  InputControl,
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
        <InputControl
          spec={{ valueType: "string", editor: "input", state: disabled ? "disabled" : "normal" }}
          value={draft.content}
          placeholder="输入目标、结果或执行任务"
          onChange={(value) => patch({ content: String(value ?? "") })}
        />
      </FormField>
      <FormField label="节点类型">
        <InputControl
          spec={{ valueType: "string", editor: "select", options: { source: "static", items: WORK_ITEM_TYPE_OPTIONS }, state: disabled ? "disabled" : "normal" }}
          value={draft.itemType}
          onChange={(value) => setItemType(String(value || ""))}
        />
      </FormField>
      <FormField label="计划周期">
        <InputControl
          spec={{ valueType: "string", editor: "select", options: { source: "static", items: WORK_PERIOD_TYPE_OPTIONS, unsetLabel: "未设置" }, state: disabled ? "disabled" : "normal" }}
          value={draft.periodType}
          placeholder="长期"
          onChange={(value) => {
            const periodType = normalizePeriodType(String(value || ""));
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
            <InputControl spec={{ valueType: "date", editor: "datePicker", state: disabled ? "disabled" : "normal" }} value={draft.periodStart} onChange={(value) => patch({ periodStart: String(value || "") })} placeholder="选择日期" />
          </FormField>
          <FormField label="周期结束">
            <InputControl spec={{ valueType: "date", editor: "datePicker", state: disabled ? "disabled" : "normal" }} value={draft.periodEnd} onChange={(value) => patch({ periodEnd: String(value || "") })} placeholder="选择日期" />
          </FormField>
        </>
      )}
      {isTask && (
        <FormField label="状态">
          <InputControl spec={{ valueType: "string", editor: "select", options: { source: "static", items: WORK_STATUS_OPTIONS }, state: disabled ? "disabled" : "normal" }} value={draft.status} onChange={(value) => patch({ status: normalizeStatus(String(value || "")) })} />
        </FormField>
      )}
      {targetType !== "personal" && (
        <FormField label="负责人">
          <InputControl
            spec={{ valueType: "reference", editor: "autocomplete", options: { source: "remote", fkKey: "work.tasks.owner.employee", endpoint: WORK_REFERENCE_OPTIONS_ENDPOINT, returnField: "id" }, state: disabled ? "disabled" : "normal" }}
            value={draft.ownerEmployeeId ? String(draft.ownerEmployeeId) : ""}
            displayValue={draft.ownerEmployeeName}
            placeholder="搜索员工"
            onChange={(value, option) => patch({
              ownerEmployeeId: typeof option === "object" && option && "id" in option ? Number(option.id) : (value ? draft.ownerEmployeeId : null),
              ownerEmployeeName: typeof option === "object" && option && "name" in option ? String(option.name) : (value ? String(value) : ""),
            })}
          />
        </FormField>
      )}
      <FormField label="上级节点">
        <InputControl
          spec={{ valueType: "string", editor: "select", options: { source: "static", items: parentOptions, visibleCount: 5 }, state: disabled || parentOptions.length === 0 ? "disabled" : "normal" }}
          value={draft.parentWorkItemId ? String(draft.parentWorkItemId) : ""}
          placeholder="根节点"
          onChange={(value) => {
            const next = String(value || "");
            const option = parentOptions.find((item) => item.value === next);
            patch({
              parentWorkItemId: next ? Number(next) : null,
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
            <InputControl spec={{ valueType: "string", editor: "input", state: disabled ? "disabled" : "normal" }} value={draft.krUnit} placeholder="万元、项、%" onChange={(value) => patch({ krUnit: String(value ?? "") })} />
          </FormField>
        </>
      )}
      {isTask && (
        <>
          <FormField label="开始时间">
            <InputControl spec={{ valueType: "date", editor: "datePicker", state: disabled ? "disabled" : "normal" }} value={draft.startDate} onChange={(value) => patch({ startDate: String(value || "") })} placeholder="选择日期" />
          </FormField>
          <FormField label="截止时间">
            <InputControl spec={{ valueType: "date", editor: "datePicker", state: disabled ? "disabled" : "normal" }} value={draft.dueDate} onChange={(value) => patch({ dueDate: String(value || "") })} placeholder="选择日期" />
          </FormField>
        </>
      )}
      <FormField label="来源类型">
        <InputControl spec={{ valueType: "string", editor: "select", options: { source: "static", items: sourceTypeOptions }, state: disabled ? "disabled" : "normal" }} value={draft.sourceType} onChange={(value) => setSourceType(String(value || ""))} />
      </FormField>
      {isProjectSource && (
        <>
          <FormField label="关联项目">
            <InputControl
              spec={{ valueType: "reference", editor: "autocomplete", options: { source: "remote", fkKey: "work.tasks.linked.project", endpoint: WORK_REFERENCE_OPTIONS_ENDPOINT, returnField: "id" }, state: disabled ? "disabled" : "normal" }}
              value={draft.linkedProjectId ? String(draft.linkedProjectId) : ""}
              displayValue={draft.linkedProjectName}
              placeholder="搜索项目"
              onChange={(value, option) => patch({
                linkedProjectId: typeof option === "object" && option && "id" in option ? Number(option.id) : (value ? draft.linkedProjectId : null),
                linkedProjectName: typeof option === "object" && option && "name" in option ? String(option.name) : (value ? String(value) : ""),
                sourceKind: option ? draft.sourceKind || "project" : null,
                linkedProjectPhaseId: null,
                linkedProjectPhaseName: "",
                linkedProjectTaskId: null,
                linkedProjectTaskName: "",
              })}
            />
          </FormField>
          <FormField label="项目来源层级">
            <InputControl
              spec={{ valueType: "string", editor: "select", options: { source: "static", items: WORK_PROJECT_SOURCE_KIND_OPTIONS }, state: disabled || !draft.linkedProjectId ? "disabled" : "normal" }}
              value={draft.sourceKind}
              onChange={(value) => setSourceKind(String(value || ""))}
            />
          </FormField>
          {draft.sourceKind === "project_phase" && (
            <FormField label="关联项目阶段">
              <InputControl
                spec={{ valueType: "string", editor: "select", options: { source: "static", items: phaseOptions, visibleCount: 5 }, state: disabled || !draft.linkedProjectId ? "disabled" : "normal" }}
                value={draft.linkedProjectPhaseId ? String(draft.linkedProjectPhaseId) : ""}
                placeholder={draft.linkedProjectId ? "选择阶段" : "先选择项目"}
                onChange={(value) => {
                  const next = String(value || "");
                  const option = phaseOptions.find((item) => item.value === next);
                  patch({
                    linkedProjectPhaseId: next ? Number(next) : null,
                    linkedProjectPhaseName: option?.label || "",
                  });
                }}
              />
            </FormField>
          )}
          {draft.sourceKind === "project_task" && (
            <FormField label="关联项目任务">
              <InputControl
                spec={{ valueType: "string", editor: "select", options: { source: "static", items: taskOptions, visibleCount: 5 }, state: disabled || !draft.linkedProjectId ? "disabled" : "normal" }}
                value={draft.linkedProjectTaskId ? String(draft.linkedProjectTaskId) : ""}
                placeholder={draft.linkedProjectId ? "选择任务" : "先选择项目"}
                onChange={(value) => {
                  const next = String(value || "");
                  const option = taskOptions.find((item) => item.value === next);
                  patch({
                    linkedProjectTaskId: next ? Number(next) : null,
                    linkedProjectTaskName: option?.label || "",
                  });
                }}
              />
            </FormField>
          )}
        </>
      )}
      <FormField label="重要度">
        <InputControl spec={{ valueType: "number", editor: "rating", state: disabled ? "disabled" : "normal" }} value={draft.importance} ratingLabel="重要度" showRatingLabel={false} onChange={(value) => patch({ importance: Number(value) })} />
      </FormField>
      <FormField label="紧急度">
        <InputControl spec={{ valueType: "number", editor: "rating", state: disabled ? "disabled" : "normal" }} value={draft.urgency} ratingLabel="紧急度" showRatingLabel={false} onChange={(value) => patch({ urgency: Number(value) })} />
      </FormField>
      <FormField label="描述" className="lg:col-span-2">
        <InputControl spec={{ valueType: "string", editor: "textarea", state: disabled ? "disabled" : "normal" }} value={draft.description} placeholder="描述目标、结果口径、交付物或拆解口径" onChange={(value) => patch({ description: String(value ?? "") })} />
      </FormField>
    </div>
  );
}

function NumberTextField({ value, disabled, onChange }: { value: number | null; disabled: boolean; onChange: (value: number | null) => void }) {
  return (
    <InputControl
      spec={{ valueType: "number", editor: "number", state: disabled ? "disabled" : "normal" }}
      value={value === null ? "" : String(value)}
      onChange={(next) => {
        const text = String(next ?? "");
        if (!text.trim()) {
          onChange(null);
          return;
        }
        const number = Number(text);
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
