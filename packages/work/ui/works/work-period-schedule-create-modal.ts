"use client";

import { createFieldsSection, type CreateSurfaceProps, type FormSurfaceFieldSpec } from "@workspace/core/ui";
import { actualEndDateForStatus, canEditActualEndDate, todayDateString } from "@workspace/platform/completion-date-policy";
import { WORK_REFERENCE_OPTIONS_ENDPOINT } from "./api";
import { formatWorkDate, WORK_STATUS_OPTIONS } from "./model";
import type { WorkItem, WorkItemType, WorkPlan } from "./types";
import type { WorkPeriodCollectionCycle } from "./period-collection-types";

export type WorkPeriodScheduleCreateDraft = {
  content: string;
  description: string;
  status: string;
  importance: number;
  urgency: number;
  ownerEmployeeId: number | null;
  ownerEmployeeName: string;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  actualStartDate: string | null;
  actualEndDate: string | null;
  krUnit: string;
};

export type WorkPeriodScheduleCreateContext = {
  cycle: WorkPeriodCollectionCycle;
  sourceItem: WorkItem;
  itemType: Extract<WorkItemType, "objective" | "key_result">;
  parentObjective: WorkItem | null;
};

export type WorkPeriodScheduleCreateInput = WorkPeriodScheduleCreateContext & WorkPeriodScheduleCreateDraft;

function scheduleCreateFormSpec({
  pendingCreate,
  createDraft,
  rootPlan,
  savingKey,
  onCreateDraftChange,
}: {
  pendingCreate?: WorkPeriodScheduleCreateContext | null;
  createDraft: WorkPeriodScheduleCreateDraft | null;
  rootPlan: WorkPlan | null;
  savingKey?: string | null;
  onCreateDraftChange?: (draft: WorkPeriodScheduleCreateDraft) => void;
}) {
  if (!pendingCreate || !createDraft || !onCreateDraftChange) return null;
  if (!isTaskScheduleCycle(rootPlan, pendingCreate.cycle)) {
    if (pendingCreate.itemType === "key_result") {
      return krScheduleCreateFormSpec({ pendingCreate, createDraft, rootPlan, savingKey, onCreateDraftChange });
    }
    return objectiveScheduleCreateFormSpec({ pendingCreate, createDraft, rootPlan, savingKey, onCreateDraftChange });
  }
  return taskScheduleCreateFormSpec({ pendingCreate, createDraft, rootPlan, savingKey, onCreateDraftChange });
}

export function scheduleCreateSurfaceSpec({
  context,
  open,
  createDraft,
  rootPlan,
  savingKey,
  submitAction,
  disabled,
  onCreateDraftChange,
  onConfirmCreate,
  onCancelCreate,
  onStartCreate,
}: {
  context: WorkPeriodScheduleCreateContext;
  open: boolean;
  createDraft: WorkPeriodScheduleCreateDraft | null;
  rootPlan: WorkPlan | null;
  savingKey?: string | null;
  submitAction: "save" | "submit";
  disabled: boolean;
  onCreateDraftChange: (draft: WorkPeriodScheduleCreateDraft) => void;
  onConfirmCreate: () => void | Promise<void>;
  onCancelCreate: () => void;
  onStartCreate: (input: WorkPeriodScheduleCreateContext) => void;
}): Extract<CreateSurfaceProps, { trigger: "surface" }> {
  const draft = open && createDraft ? createDraft : createScheduleCreateDraft(context, rootPlan);
  const modal = scheduleCreateFormSpec({
    pendingCreate: context,
    createDraft: draft,
    rootPlan,
    savingKey,
    onCreateDraftChange,
  });
  const section = modal?.sections[0];
  if (!modal || !section || section.body.kind !== "form" || section.body.form.kind !== "fields") {
    throw new Error("周期排程新建必须声明 fields FormSurface");
  }
  const layout = section.body.form.content.layout;
  return {
    id: modal.key,
    trigger: "surface",
    presentation: "modal",
    title: modal.title,
    open,
    disabled,
    content: { kind: "form", form: {
      items: section.body.form.content.items,
      layout: { columns: layout?.columns, density: layout?.density },
    } },
    submission: {
      action: submitAction,
      disabled: disabled || !draft.content.trim(),
      execute: onConfirmCreate,
    },
    feedback: { saved: "时间安排已新增", submitted: "时间安排已提交审核", error: "新增时间安排失败" },
    onOpenChange: (nextOpen: boolean) => { if (nextOpen) onStartCreate(context); else onCancelCreate(); },
  };
}

function objectiveScheduleCreateFormSpec({
  pendingCreate,
  createDraft,
  rootPlan,
  savingKey,
  onCreateDraftChange,
}: {
  pendingCreate: WorkPeriodScheduleCreateContext;
  createDraft: WorkPeriodScheduleCreateDraft;
  rootPlan: WorkPlan | null;
  savingKey?: string | null;
  onCreateDraftChange: (draft: WorkPeriodScheduleCreateDraft) => void;
}) {
  const saving = savingKey === scheduleCreateKey(pendingCreate.sourceItem.id, pendingCreate.cycle.id, pendingCreate.itemType);
  const state = saving ? "disabled" as const : "normal" as const;
  const patch = (next: Partial<WorkPeriodScheduleCreateDraft>) => onCreateDraftChange({ ...createDraft, ...next });
  return {
    key: "work-period-schedule-create-objective-modal",
    open: true,
    title: "新增本期目标",
    size: "md" as const,
    sections: [
      createFieldsSection("work-period-schedule-create-objective-fields", [
        {
          kind: "readonly",
          key: "parentObjective",
          label: "上级目标",
          required: true,
          span: "wide",
          value: pendingCreate.sourceItem.content,
        },
        ownerField({ draft: createDraft, rootPlan, state, patch, label: "负责人" }),
        dateField({ key: "plannedStartDate", label: "计划开始", value: createDraft.plannedStartDate, state, onChange: (value) => patch({ plannedStartDate: normalizeDateValue(value) }) }),
        dateField({ key: "plannedEndDate", label: "计划结束", value: createDraft.plannedEndDate, state, onChange: (value) => patch({ plannedEndDate: normalizeDateValue(value) }) }),
        contentField({ label: "子目标内容", value: createDraft.content, state, placeholder: "输入本期目标", multiline: true, onChange: (value) => patch({ content: value }) }),
      ], {
        layout: { columns: 2 },
      }),
    ],
  };
}

function krScheduleCreateFormSpec({
  pendingCreate,
  createDraft,
  rootPlan,
  savingKey,
  onCreateDraftChange,
}: {
  pendingCreate: WorkPeriodScheduleCreateContext;
  createDraft: WorkPeriodScheduleCreateDraft;
  rootPlan: WorkPlan | null;
  savingKey?: string | null;
  onCreateDraftChange: (draft: WorkPeriodScheduleCreateDraft) => void;
}) {
  const saving = savingKey === scheduleCreateKey(pendingCreate.sourceItem.id, pendingCreate.cycle.id, pendingCreate.itemType);
  const state = saving ? "disabled" as const : "normal" as const;
  const patch = (next: Partial<WorkPeriodScheduleCreateDraft>) => onCreateDraftChange({ ...createDraft, ...next });
  return {
    key: "work-period-schedule-create-kr-modal",
    open: true,
    title: "新增本期 KR",
    size: "md" as const,
    sections: [
      createFieldsSection("work-period-schedule-create-kr-fields", [
        {
          kind: "readonly",
          key: "parentKr",
          label: "上级 KR",
          required: true,
          span: "wide",
          value: pendingCreate.sourceItem.content,
        },
        ownerField({ draft: createDraft, rootPlan, state, patch, label: "结果责任人" }),
        {
          key: "krUnit",
          label: "单位",
          spec: { valueType: "string", control: "text", state },
          value: createDraft.krUnit,
          placeholder: "万元、项、%",
          onChange: (value: unknown) => patch({ krUnit: String(value ?? "") }),
        },
        contentField({ label: "子 KR 内容", value: createDraft.content, state, placeholder: "输入本期 KR", multiline: true, onChange: (value) => patch({ content: value }) }),
      ], {
        layout: { columns: 2 },
      }),
    ],
  };
}

function taskScheduleCreateFormSpec({
  pendingCreate,
  createDraft,
  rootPlan,
  savingKey,
  onCreateDraftChange,
}: {
  pendingCreate: WorkPeriodScheduleCreateContext;
  createDraft: WorkPeriodScheduleCreateDraft;
  rootPlan: WorkPlan | null;
  savingKey?: string | null;
  onCreateDraftChange: (draft: WorkPeriodScheduleCreateDraft) => void;
}) {
  const saving = savingKey === scheduleCreateKey(pendingCreate.sourceItem.id, pendingCreate.cycle.id, pendingCreate.itemType);
  const state = saving ? "disabled" as const : "normal" as const;
  const patch = (next: Partial<WorkPeriodScheduleCreateDraft>) => onCreateDraftChange({ ...createDraft, ...next });
  return {
    key: "work-period-schedule-create-task-modal",
    open: true,
    title: "新增任务",
    size: "md" as const,
    sections: [
      createFieldsSection("work-period-schedule-create-task-fields", [
        contentField({ label: "内容", value: createDraft.content, state, placeholder: "输入任务内容", onChange: (value) => patch({ content: value }) }),
        {
          kind: "readonly",
          key: "itemType",
          label: "类型",
          value: "执行任务",
        },
        {
          kind: "readonly",
          key: "sourceItem",
          label: pendingCreate.itemType === "key_result" ? "关联 KR" : "关联目标",
          required: true,
          span: "wide",
          value: pendingCreate.sourceItem.content,
        },
        statusField({ draft: createDraft, state, patch }),
        ownerField({ draft: createDraft, rootPlan, state, patch, label: "负责人" }),
        dateField({ key: "plannedStartDate", label: "计划开始", value: createDraft.plannedStartDate, state, onChange: (value) => patch({ plannedStartDate: normalizeDateValue(value) }) }),
        dateField({ key: "plannedEndDate", label: "计划结束", value: createDraft.plannedEndDate, state, onChange: (value) => patch({ plannedEndDate: normalizeDateValue(value) }) }),
        dateField({ key: "actualStartDate", label: "实际开始", value: createDraft.actualStartDate, state, required: false, maxDate: todayDateString(), onChange: (value) => patch({ actualStartDate: normalizeDateValue(value) }) }),
        dateField({ key: "actualEndDate", label: "实际结束", value: createDraft.actualEndDate, state: canEditActualEndDate(createDraft.status, state === "disabled") ? "normal" : "disabled", required: false, maxDate: todayDateString(), onChange: (value) => patch({ actualEndDate: normalizeDateValue(value) }) }),
        ratingField({ key: "importance", label: "重要度", value: createDraft.importance, state, onChange: (value) => patch({ importance: Number(value) || 3 }) }),
        ratingField({ key: "urgency", label: "紧急度", value: createDraft.urgency, state, onChange: (value) => patch({ urgency: Number(value) || 3 }) }),
        descriptionField({ value: createDraft.description, state, onChange: (value) => patch({ description: value }) }),
      ], {
        layout: { columns: 2 },
      }),
    ],
  };
}

export function createScheduleCreateDraft(input: WorkPeriodScheduleCreateContext, rootPlan: WorkPlan | null): WorkPeriodScheduleCreateDraft {
  return {
    content: "",
    description: "",
    status: "active",
    importance: 3,
    urgency: 3,
    ownerEmployeeId: input.sourceItem.ownerEmployeeId ?? rootPlan?.ownerEmployeeId ?? null,
    ownerEmployeeName: input.sourceItem.ownerEmployeeName || rootPlan?.ownerEmployeeName || "",
    plannedStartDate: formatWorkDate(input.cycle.startDate) || null,
    plannedEndDate: formatWorkDate(input.cycle.endDate) || null,
    actualStartDate: null,
    actualEndDate: null,
    krUnit: input.sourceItem.krUnit || "",
  };
}

function ownerField({
  draft,
  rootPlan,
  state,
  patch,
  label,
}: {
  draft: WorkPeriodScheduleCreateDraft;
  rootPlan: WorkPlan | null;
  state: "normal" | "disabled";
  patch: (next: Partial<WorkPeriodScheduleCreateDraft>) => void;
  label: string;
}): FormSurfaceFieldSpec {
  return {
    key: "owner",
    label,
    required: true,
    spec: {
      valueType: "reference",
      control: "reference",
      options: { source: "remote", fkKey: "work.tasks.owner.employee", endpoint: WORK_REFERENCE_OPTIONS_ENDPOINT, returnField: "id", queryParams: targetQueryParams(rootPlan) },
      state,
    },
    value: draft.ownerEmployeeId ? String(draft.ownerEmployeeId) : "",
    displayValue: draft.ownerEmployeeName,
    placeholder: "搜索员工",
    onChange: (value: unknown, option: unknown) => patch({
      ownerEmployeeId: optionId(option) ?? (value ? draft.ownerEmployeeId : null),
      ownerEmployeeName: optionName(option) || (value ? draft.ownerEmployeeName : ""),
    }),
  };
}

function dateField({
  key,
  label,
  value,
  state,
  required = true,
  maxDate,
  onChange,
}: {
  key: "plannedStartDate" | "plannedEndDate" | "actualStartDate" | "actualEndDate";
  label: string;
  value: string | null;
  state: "normal" | "disabled";
  required?: boolean;
  maxDate?: string;
  onChange: (value: unknown) => void;
}): FormSurfaceFieldSpec {
  return {
    key,
    label,
    required,
    spec: { valueType: "date", control: "temporal", precision: "date", state, validation: maxDate ? { maxDate } : undefined },
    value,
    placeholder: "选择日期",
    onChange,
  };
}

function statusField({
  draft,
  state,
  patch,
}: {
  draft: WorkPeriodScheduleCreateDraft;
  state: "normal" | "disabled";
  patch: (next: Partial<WorkPeriodScheduleCreateDraft>) => void;
}): FormSurfaceFieldSpec {
  return {
    key: "status",
    label: "状态",
    spec: { valueType: "string", control: "choice", options: { source: "static", items: WORK_STATUS_OPTIONS }, state },
    value: draft.status || "active",
    onChange: (value: unknown) => {
      const status = normalizeStatus(String(value || ""));
      patch({ status, actualEndDate: actualEndDateForStatus(status, draft.actualEndDate) });
    },
  };
}

function ratingField({
  key,
  label,
  value,
  state,
  onChange,
}: {
  key: "importance" | "urgency";
  label: string;
  value: number;
  state: "normal" | "disabled";
  onChange: (value: unknown) => void;
}): FormSurfaceFieldSpec {
  return {
    key,
    label,
    spec: { valueType: "number", control: "rating", state },
    value,
    ratingLabel: label,
    showRatingLabel: false,
    onChange,
  };
}

function contentField({
  label,
  value,
  state,
  placeholder,
  multiline = false,
  onChange,
}: {
  label: string;
  value: string;
  state: "normal" | "disabled";
  placeholder: string;
  multiline?: boolean;
  onChange: (value: string) => void;
}): FormSurfaceFieldSpec {
  return {
    key: "content",
    label,
    required: true,
    span: "wide",
    spec: { valueType: "string", control: "text", multiline, state },
    value,
    placeholder,
    rows: multiline ? 4 : undefined,
    autoFocus: true,
    onChange: (next: unknown) => onChange(String(next ?? "")),
  };
}

function descriptionField({
  value,
  state,
  onChange,
}: {
  value: string;
  state: "normal" | "disabled";
  onChange: (value: string) => void;
}): FormSurfaceFieldSpec {
  return {
    key: "description",
    label: "描述",
    span: "wide",
    spec: { valueType: "string", control: "text", multiline: true, state },
    value,
    placeholder: "描述任务交付物、口径或依赖",
    rows: 3,
    onChange: (next: unknown) => onChange(String(next ?? "")),
  };
}

function targetQueryParams(rootPlan: WorkPlan | null) {
  return { targetType: rootPlan?.targetType, targetId: rootPlan?.targetId, collaborationId: rootPlan?.collaborationId ?? undefined };
}

function optionId(option: unknown) {
  if (!option || typeof option !== "object" || !("id" in option)) return null;
  const id = Number(option.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function optionName(option: unknown) {
  return option && typeof option === "object" && "name" in option ? String(option.name ?? "") : "";
}

function normalizeDateValue(value: unknown) {
  const text = String(value || "");
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function normalizeStatus(value: string) {
  if (value === "paused" || value === "done") return value;
  return "active";
}

function isTaskScheduleCycle(rootPlan: WorkPlan | null, cycle: WorkPeriodCollectionCycle) {
  return rootPlan?.periodType === "monthly" && cycle.periodType === "weekly";
}

export function scheduleCreateKey(sourceItemId: number, cycleId: number, itemType: Extract<WorkItemType, "objective" | "key_result">) {
  return `schedule-create:${itemType}:${sourceItemId}:${cycleId}`;
}
