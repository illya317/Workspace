"use client";

import { type ReactNode, useMemo } from "react";
import { createFormSection, createPageBody, type FormSurfaceActionSpec, type FormSurfaceFieldSpec, type FormSurfaceProps, BodySurface } from "@workspace/core/ui";
import { actualEndDateForStatus, canEditActualEndDate, todayDateString } from "@workspace/platform/completion-date-policy";
import {
  getRoutineTaskTypeLabel,
  OPTIONAL_ROUTINE_RECURRENCE_TYPE_OPTIONS,
  ROUTINE_MONTH_OPTIONS,
  ROUTINE_WEEKDAY_OPTIONS,
  WORK_ITEM_TYPE_OPTIONS,
} from "./model";
import { WORK_REFERENCE_OPTIONS_ENDPOINT } from "./api";
import type { RoutineRecurrenceType, WorkItem, WorkItemDraft, WorkItemType, WorkTarget } from "./types";
import { workItemStatusOptions } from "./work-completion-options";
import { useWorkResponsibilityFields } from "./work-responsibility-fields";
export function WorkTaskForm({
  draft,
  works,
  disabled,
  excludedWorkId,
  allowedItemTypes,
  target,
  actions,
  onChange,
}: {
  draft: WorkItemDraft;
  works: WorkItem[];
  disabled: boolean;
  excludedWorkId: number | null;
  allowedItemTypes?: WorkItemType[];
  target?: WorkTarget | null;
  actions?: FormSurfaceActionSpec[];
  onChange: (draft: WorkItemDraft) => void;
}) {
  const surface = useWorkTaskFormSurface({
    draft,
    works,
    disabled,
    excludedWorkId,
    allowedItemTypes,
    target,
    onChange,
  });

  return <BodySurface {...createPageBody([createFormSection("work-task-form", { ...surface, actions })])} />;
}
export function useWorkTaskFormSurface({
  draft,
  works,
  disabled,
  excludedWorkId,
  allowedItemTypes,
  target,
  enabled = true,
  onChange,
}: {
  draft: WorkItemDraft;
  works: WorkItem[];
  disabled: boolean;
  excludedWorkId: number | null;
  allowedItemTypes?: WorkItemType[];
  target?: WorkTarget | null;
  onChange: (draft: WorkItemDraft) => void;
  enabled?: boolean;
}): FormSurfaceProps {
  const isTask = draft.itemType === "task";
  const isObjective = draft.itemType === "objective";
  const isKr = draft.itemType === "key_result";
  const isRoutineTask = isTask && draft.category === "routine";
  const isStandingResponsibility = isRoutineTask && draft.routineTaskType === "standing";
  const isOrdinaryRoutineTask = isRoutineTask && draft.routineTaskType === "task";
  const showHierarchyFields = !isRoutineTask;
  const showAssignedAlignmentField = !isRoutineTask;
  const showOwnerField = true;
  const ownerLabel = draft.itemType === "objective" ? "目标负责人" : isKr ? "结果责任人" : "执行责任人";
  const showResponsibilityFields = isStandingResponsibility;
  const showScheduleFields = isObjective || (isTask && !isStandingResponsibility);
  const responsibilityIsRequired = isStandingResponsibility;
  const statusOptions = workItemStatusOptions({ draft, works, excludedWorkId, isStandingResponsibility });
  const itemTypeOptions = useMemo(
    () => WORK_ITEM_TYPE_OPTIONS.filter((option) => !allowedItemTypes || allowedItemTypes.includes(option.value)),
    [allowedItemTypes],
  );
  const parentOptions = useMemo(
    () => works
      .filter((work) => work.id !== excludedWorkId && parentAllowed(draft.itemType, work))
      .map((work) => ({ value: String(work.id), label: `${nodeTypeLabel(work.itemType)} · ${work.content}` })),
    [draft.itemType, excludedWorkId, works],
  );
  const standingResponsibilityOptions = useMemo(
    () => works
      .filter((work) => work.id !== excludedWorkId && !work.parentWorkItemId && work.routineTaskType === "standing" && work.status === "active" && !work.isArchived)
      .map((work) => ({ value: String(work.id), label: work.content })),
    [excludedWorkId, works],
  );
  const evidenceOptions = useMemo(
    () => works
      .filter((work) => work.itemType === "task" && work.parentWorkItemId === draft.parentWorkItemId)
      .map((work) => ({ value: String(work.id), label: work.content })),
    [draft.parentWorkItemId, works],
  );
  const responsibilityFields = useWorkResponsibilityFields<WorkItemDraft>({
    draft,
    disabled,
    target,
    enabled: enabled && showResponsibilityFields,
    responsibilityFkKey: "work.tasks.item.responsibility",
    responsibilityRequired: responsibilityIsRequired,
    ownerLabel,
    responsibilitySpan: "wide",
    responsibilityOptionLabel: "职责小项",
    responsibilityPlaceholder: "选择职责小项",
    responsibilityDisabledPlaceholder: "先选择执行责任人",
    responsibilityEmptyText: "暂无可选职责",
    onPatch: patch,
  });

  function patch(next: Partial<WorkItemDraft>) {
    onChange({ ...draft, ...next });
  }

  function setItemType(value: string | null) {
    const itemType = normalizeItemType(value);
    const currentParent = works.find((work) => work.id === draft.parentWorkItemId) || null;
    const keepResponsibility = itemType === draft.itemType && itemType === "task" && draft.category === "routine" && draft.routineTaskType === "standing";
    const keepSchedule = itemType === draft.itemType && (itemType === "objective" || itemType === "task");
    patch({
      itemType,
      status: draft.status || "active",
      actualStartDate: keepSchedule ? draft.actualStartDate : null,
      actualEndDate: keepSchedule ? draft.actualEndDate : null,
      plannedStartDate: keepSchedule ? draft.plannedStartDate : null,
      plannedEndDate: keepSchedule ? draft.plannedEndDate : null,
      isMilestone: itemType === "objective" && keepSchedule ? draft.isMilestone : false,
      milestoneDate: itemType === "objective" && keepSchedule ? draft.milestoneDate : null,
      krStartValue: itemType === "key_result" ? draft.krStartValue : null,
      krTargetValue: itemType === "key_result" ? draft.krTargetValue : null,
      krCurrentValue: itemType === "key_result" ? draft.krCurrentValue : null,
      krUnit: itemType === "key_result" ? draft.krUnit : "",
      routineTaskType: itemType === "task" && draft.category === "routine" ? draft.routineTaskType || "task" : null,
      ...(itemType === "task" && draft.category === "routine" ? {} : emptyRecurrencePatch()),
      ownerEmployeeId: draft.ownerEmployeeId,
      ownerEmployeeName: draft.ownerEmployeeName,
      responsibilityPositionId: keepResponsibility ? draft.responsibilityPositionId : null,
      responsibilityPositionName: keepResponsibility ? draft.responsibilityPositionName : "",
      responsibilityNodeId: keepResponsibility ? draft.responsibilityNodeId : null,
      responsibilityLabel: keepResponsibility ? draft.responsibilityLabel : "",
      parentWorkItemId: currentParent && parentAllowed(itemType, currentParent) ? draft.parentWorkItemId : null,
      parentWorkItemContent: currentParent && parentAllowed(itemType, currentParent) ? draft.parentWorkItemContent : "",
      parentPeriodWorkItemId: itemType === draft.itemType ? draft.parentPeriodWorkItemId : null,
      parentPeriodWorkItemContent: itemType === draft.itemType ? draft.parentPeriodWorkItemContent : "",
      parentPeriodWorkItemType: itemType === draft.itemType ? draft.parentPeriodWorkItemType : null,
      parentPeriodRelationKind: itemType === draft.itemType ? draft.parentPeriodRelationKind : null,
      parentPeriodWorkItemCycleLabel: itemType === draft.itemType ? draft.parentPeriodWorkItemCycleLabel : "",
      previousPeriodWorkItemId: itemType === draft.itemType ? draft.previousPeriodWorkItemId : null,
      previousPeriodWorkItemContent: itemType === draft.itemType ? draft.previousPeriodWorkItemContent : "",
      previousPeriodWorkItemCycleLabel: itemType === draft.itemType ? draft.previousPeriodWorkItemCycleLabel : "",
      evidenceTaskIds: itemType === "key_result" ? draft.evidenceTaskIds : [],
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
  const patchInteger = (
    key: "routineRecurrenceWeekday" | "routineRecurrenceMonthDay" | "routineRecurrenceQuarterDay" | "routineRecurrenceYearMonth" | "routineRecurrenceYearDay",
  ) => (next: unknown) => {
    const text = String(next ?? "");
    if (!text.trim()) {
      patch({ [key]: null } as Partial<WorkItemDraft>);
      return;
    }
    const number = Number(text);
    patch({ [key]: Number.isInteger(number) ? number : null } as Partial<WorkItemDraft>);
  };

  const fields: FormSurfaceFieldSpec[] = [
    { key: "content", label: "内容", required: true, spec: { valueType: "string", control: "text", state: disabled ? "disabled" : "normal" }, value: draft.content, placeholder: isRoutineTask ? `输入${getRoutineTaskTypeLabel(draft.routineTaskType)}` : "输入目标、任务或关键结果", onChange: (value) => patch({ content: String(value ?? "") }) },
    ...(showHierarchyFields ? [
      { key: "itemType", label: "类型", spec: { valueType: "string", control: "choice", options: { source: "static", items: itemTypeOptions }, state: disabled || itemTypeOptions.length <= 1 ? "disabled" : "normal" }, value: draft.itemType, onChange: (value) => setItemType(String(value || "")) },
      { key: "parent", label: labelWithInfo("所属目标", "本期内部归属：KR 或任务挂在哪个本期目标下；目标本身为根目标。"), spec: { valueType: "string", control: "choice", options: { source: "static", items: parentOptions, visibleCount: 5 }, state: disabled || draft.itemType === "objective" || parentOptions.length === 0 ? "disabled" : "normal" }, value: draft.parentWorkItemId ? String(draft.parentWorkItemId) : "", placeholder: draft.itemType === "objective" ? "根目标" : "选择目标", onChange: (value) => {
      const next = String(value || "");
      const option = parentOptions.find((item) => item.value === next);
      patch({ parentWorkItemId: next ? Number(next) : null, parentWorkItemContent: option?.label || "", evidenceTaskIds: [] });
      } },
      ...periodRelationFields(draft, target, disabled || !draft.planId, patch),
      ...(showAssignedAlignmentField ? [assignedAlignmentField(draft, target, disabled, patch)] : []),
    ] satisfies FormSurfaceFieldSpec[] : []),
    ...(!showHierarchyFields && showAssignedAlignmentField ? [assignedAlignmentField(draft, target, disabled, patch)] satisfies FormSurfaceFieldSpec[] : []),
    ...(isOrdinaryRoutineTask ? [
      { key: "standingResponsibility", label: "常设职责", spec: { valueType: "string", control: "choice", options: { source: "static", items: standingResponsibilityOptions, visibleCount: 6 }, state: disabled ? "disabled" : "normal" }, value: draft.parentWorkItemId ? String(draft.parentWorkItemId) : "", placeholder: "选填；不选择则为独立任务", emptyText: "暂无生效中的常设职责", onChange: (value: unknown) => {
        const next = String(value || "");
        const option = standingResponsibilityOptions.find((item) => item.value === next);
        patch({ parentWorkItemId: next ? Number(next) : null, parentWorkItemContent: option?.label || "" });
      } },
    ] satisfies FormSurfaceFieldSpec[] : []),
    { key: "status", label: "状态", spec: { valueType: "string", control: "choice", options: { source: "static", items: statusOptions }, state: disabled ? "disabled" : "normal" }, value: draft.status || "active", onChange: (value: unknown) => {
      const status = normalizeStatus(String(value || ""));
      patch({ status, actualEndDate: actualEndDateForStatus(status, draft.actualEndDate) });
    } },
    ...(showOwnerField ? [
      ...(target?.targetType === "department" && isTask ? [collaborationField(draft, target, disabled, patch)] : []),
      responsibilityFields.ownerField,
    ] satisfies FormSurfaceFieldSpec[] : []),
    ...(showResponsibilityFields ? [
      responsibilityFields.positionField,
      responsibilityFields.responsibilityField,
    ] satisfies FormSurfaceFieldSpec[] : []),
    ...(showScheduleFields ? dateWindowFields(draft, disabled, patch, { required: false, showMilestone: isObjective }) : []),
    ...(isTask ? [
      ...(isOrdinaryRoutineTask ? optionalRecurrenceFields(draft, disabled, patch, patchInteger) : []),
      ...(!isStandingResponsibility ? [
        { key: "importance", label: "重要度", spec: { valueType: "number", control: "rating", state: disabled ? "disabled" : "normal" }, value: draft.importance, ratingLabel: "重要度", showRatingLabel: false, onChange: (value) => patch({ importance: Number(value) }) },
        { key: "urgency", label: "紧急度", spec: { valueType: "number", control: "rating", state: disabled ? "disabled" : "normal" }, value: draft.urgency, ratingLabel: "紧急度", showRatingLabel: false, onChange: (value) => patch({ urgency: Number(value) }) },
      ] satisfies FormSurfaceFieldSpec[] : []),
    ] satisfies FormSurfaceFieldSpec[] : []),
    ...(isKr ? [
      { key: "krStartValue", label: "指标起点", spec: { valueType: "number", control: "number", state: disabled ? "disabled" : "normal" }, value: numberValue(draft.krStartValue), onChange: patchNumber("krStartValue") },
      { key: "krCurrentValue", label: "当前值", spec: { valueType: "number", control: "number", state: disabled ? "disabled" : "normal" }, value: numberValue(draft.krCurrentValue), onChange: patchNumber("krCurrentValue") },
      { key: "krTargetValue", label: "目标值", spec: { valueType: "number", control: "number", state: disabled ? "disabled" : "normal" }, value: numberValue(draft.krTargetValue), onChange: patchNumber("krTargetValue") },
      { key: "krUnit", label: "单位", spec: { valueType: "string", control: "text", state: disabled ? "disabled" : "normal" }, value: draft.krUnit, placeholder: "万元、项、%", onChange: (value: unknown) => patch({ krUnit: String(value ?? "") }) },
      { key: "evidenceTaskIds", label: "任务证据", span: "wide", spec: { valueType: "array", control: "choice", multiple: true, options: { source: "static", items: evidenceOptions, visibleCount: 6 }, state: disabled || evidenceOptions.length === 0 ? "disabled" : "normal" }, value: draft.evidenceTaskIds.map(String), placeholder: "选择同一目标下的任务", onChange: (value: unknown) => {
        const values = Array.isArray(value) ? value : [];
        patch({ evidenceTaskIds: values.map(Number).filter((id) => Number.isInteger(id) && id > 0) });
      } },
    ] satisfies FormSurfaceFieldSpec[] : []),
    { key: "description", label: "描述", span: "wide", spec: { valueType: "string", control: "text", multiline: true, state: disabled ? "disabled" : "normal" }, value: draft.description, placeholder: "描述目标口径、指标口径或子任务交付物", onChange: (value) => patch({ description: String(value ?? "") }) },
  ];

  return {
    kind: "fields",
    content: { items: fields, layout: { columns: 2 } },
  };
}

function collaborationField(
  draft: WorkItemDraft,
  target: WorkTarget,
  disabled: boolean,
  patch: (next: Partial<WorkItemDraft>) => void,
): FormSurfaceFieldSpec {
  return {
    key: "collaboration",
    label: "关联协作",
    spec: {
      valueType: "reference",
      control: "reference",
      options: {
        source: "remote",
        fkKey: "work.tasks.collaboration",
        endpoint: WORK_REFERENCE_OPTIONS_ENDPOINT,
        returnField: "id",
        queryParams: { targetType: target.targetType, targetId: target.targetId },
      },
      state: disabled ? "disabled" : "normal",
    },
    value: draft.collaborationId ? String(draft.collaborationId) : "",
    displayValue: draft.collaborationTitle,
    placeholder: "选填；关联部门协作",
    onChange: (value: unknown, option: unknown) => patch({
      collaborationId: optionId(option) ?? (value ? draft.collaborationId : null),
      collaborationTitle: optionName(option) || (value ? draft.collaborationTitle : ""),
      ownerEmployeeId: null,
      ownerEmployeeName: "",
      responsibilityPositionId: null,
      responsibilityPositionName: "",
      responsibilityNodeId: null,
      responsibilityLabel: "",
    }),
  };
}

function parentAllowed(itemType: WorkItemType, parent: WorkItem) {
  if (itemType === "key_result") return parent.itemType === "objective";
  if (itemType === "objective") return false;
  return parent.itemType === "objective";
}

function periodRelationFields(
  draft: WorkItemDraft,
  target: WorkTarget | null | undefined,
  disabled: boolean,
  patch: (next: Partial<WorkItemDraft>) => void,
): FormSurfaceFieldSpec[] {
  if (draft.itemType !== "objective" && draft.itemType !== "key_result") return [];
  const isKr = draft.itemType === "key_result";
  const state = disabled ? "disabled" as const : "normal" as const;
  const queryParams = {
    targetType: target?.targetType,
    targetId: target?.targetId,
    planId: draft.planId,
    currentWorkItemId: draft.id,
    itemType: draft.itemType,
  };
  return [
    {
      key: "parentPeriodWorkItem",
      label: labelWithInfo(isKr ? "上级 KR" : "上级目标", isKr ? "上级周期关系：本期 KR 承接哪个上级周期 KR。" : "上级周期关系：本期目标承接哪个上级周期目标。"),
      spec: { valueType: "reference", control: "reference", options: { source: "remote", fkKey: "work.tasks.parent.item", endpoint: WORK_REFERENCE_OPTIONS_ENDPOINT, returnField: "id", queryParams }, state },
      value: draft.parentPeriodRelationKind === "upper" && draft.parentPeriodWorkItemId ? String(draft.parentPeriodWorkItemId) : "",
      displayValue: draft.parentPeriodRelationKind === "upper" ? draft.parentPeriodWorkItemContent : "",
      placeholder: draft.planId ? (isKr ? "搜索上级 KR" : "搜索上级目标") : "先选择计划",
      onChange: (value: unknown, option: unknown) => patch(itemRelationPatch("parent", value, option, "upper")),
    },
    {
      key: "previousPeriodWorkItem",
      label: labelWithInfo(isKr ? "前置 KR" : "前置目标", isKr ? "前置依赖：选择完成后本期才能继续的前期 KR。" : "前置依赖：选择完成后本期才能继续的前期目标。"),
      spec: { valueType: "reference", control: "reference", options: { source: "remote", fkKey: "work.tasks.previous.item", endpoint: WORK_REFERENCE_OPTIONS_ENDPOINT, returnField: "id", queryParams }, state },
      value: draft.previousPeriodWorkItemId ? String(draft.previousPeriodWorkItemId) : "",
      displayValue: draft.previousPeriodWorkItemContent,
      placeholder: draft.planId ? (isKr ? "搜索前置 KR" : "搜索前置目标") : "先选择计划",
      onChange: (value: unknown, option: unknown) => patch(itemRelationPatch("previous", value, option)),
    },
  ];
}

function assignedAlignmentField(
  draft: WorkItemDraft,
  target: WorkTarget | null | undefined,
  disabled: boolean,
  patch: (next: Partial<WorkItemDraft>) => void,
): FormSurfaceFieldSpec {
  const queryParams = {
    targetType: target?.targetType,
    targetId: target?.targetId,
    currentWorkItemId: draft.id,
  };
  return {
    key: "assignedAlignmentWorkItem",
    label: labelWithInfo("对齐到", "外部关系：选择其他人或其他空间派发给我的、尚未被我对齐的承接/协作内容。"),
    spec: { valueType: "reference", control: "reference", options: { source: "remote", fkKey: "work.tasks.assigned.alignment.item", endpoint: WORK_REFERENCE_OPTIONS_ENDPOINT, returnField: "id", queryParams }, state: disabled ? "disabled" : "normal" },
    value: draft.parentPeriodRelationKind === "external" && draft.parentPeriodWorkItemId ? String(draft.parentPeriodWorkItemId) : "",
    displayValue: draft.parentPeriodRelationKind === "external" ? draft.parentPeriodWorkItemContent : "",
    placeholder: "搜索未完成的承接/协作内容",
    onChange: (value: unknown, option: unknown) => patch(itemRelationPatch("parent", value, option, "external")),
  };
}

function labelWithInfo(label: ReactNode, info: string) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span className="min-w-0">{label}</span>
      <span
        aria-label={info}
        title={info}
        className="inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-slate-300 text-[10px] font-semibold leading-none text-slate-500"
      >
        i
      </span>
    </span>
  );
}

function itemRelationPatch(kind: "parent" | "previous", value: unknown, option: unknown, relationKind?: "upper" | "external"): Partial<WorkItemDraft> {
  const fk = referenceOption(option);
  const id = fk?.id ?? (value ? null : null);
  if (kind === "parent") {
    return { parentPeriodWorkItemId: id, parentPeriodWorkItemContent: fk?.name ?? "", parentPeriodWorkItemType: null, parentPeriodRelationKind: id ? relationKind ?? null : null, parentPeriodWorkItemCycleLabel: fk?.subtitle ?? "" };
  }
  return { previousPeriodWorkItemId: id, previousPeriodWorkItemContent: fk?.name ?? "", previousPeriodWorkItemCycleLabel: fk?.subtitle ?? "" };
}

function referenceOption(option: unknown) {
  if (!option || typeof option !== "object" || !("id" in option)) return null;
  const item = option as { id?: unknown; name?: unknown; subtitle?: unknown };
  const id = Number(item.id);
  return Number.isInteger(id) && id > 0
    ? { id, name: String(item.name ?? ""), subtitle: String(item.subtitle ?? "") }
    : null;
}

function normalizeItemType(value: string | null): WorkItemType {
  if (value === "objective" || value === "key_result") return value;
  return "task";
}

function normalizeStatus(value: string | null) {
  if (value === "paused" || value === "done") return value;
  return "active";
}

function normalizeRoutineRecurrenceType(value: string | null): RoutineRecurrenceType {
  if (value === "weekly" || value === "monthly" || value === "quarterly" || value === "yearly") return value;
  return "daily";
}

function defaultRecurrencePatch(type: RoutineRecurrenceType | null): Partial<WorkItemDraft> {
  return {
    routineRecurrenceType: type || "daily",
    routineRecurrenceTime: "",
    routineRecurrenceWeekday: 1,
    routineRecurrenceMonthDay: 1,
    routineRecurrenceQuarterDay: 1,
    routineRecurrenceYearMonth: 1,
    routineRecurrenceYearDay: 1,
  };
}

function emptyRecurrencePatch(): Partial<WorkItemDraft> {
  return {
    routineRecurrenceType: null,
    routineRecurrenceTime: "",
    routineRecurrenceWeekday: null,
    routineRecurrenceMonthDay: null,
    routineRecurrenceQuarterDay: null,
    routineRecurrenceYearMonth: null,
    routineRecurrenceYearDay: null,
  };
}

function dateWindowFields(
  draft: WorkItemDraft,
  disabled: boolean,
  patch: (next: Partial<WorkItemDraft>) => void,
  opts: { required: boolean; showMilestone: boolean },
): FormSurfaceFieldSpec[] {
  const state = disabled ? "disabled" as const : "normal" as const;
  const patchDate = (key: "plannedStartDate" | "plannedEndDate" | "actualStartDate" | "actualEndDate" | "milestoneDate") => (value: unknown) => {
    const date = normalizeDateValue(value);
    patch({ [key]: date } as Partial<WorkItemDraft>);
  };
  return [
    { key: "plannedStartDate", label: "计划开始", required: opts.required, spec: { valueType: "date", control: "temporal", precision: "date", state }, value: draft.plannedStartDate, placeholder: "选择日期", onChange: patchDate("plannedStartDate") },
    { key: "plannedEndDate", label: "计划结束", required: opts.required, spec: { valueType: "date", control: "temporal", precision: "date", state }, value: draft.plannedEndDate, placeholder: "选择日期", onChange: patchDate("plannedEndDate") },
    { key: "actualStartDate", label: "实际开始", spec: { valueType: "date", control: "temporal", precision: "date", state, validation: { maxDate: todayDateString() } }, value: draft.actualStartDate, placeholder: "选择日期", onChange: patchDate("actualStartDate") },
    { key: "actualEndDate", label: "实际结束", spec: { valueType: "date", control: "temporal", precision: "date", state: canEditActualEndDate(draft.status, disabled) ? "normal" : "disabled", validation: { maxDate: todayDateString() } }, value: draft.actualEndDate, placeholder: draft.status === "done" ? "选择日期" : "请先选择已完成", onChange: patchDate("actualEndDate") },
    ...(opts.showMilestone ? [
      { key: "isMilestone", label: "里程碑", spec: { valueType: "string", control: "choice", options: { source: "static", items: MILESTONE_OPTIONS, visibleCount: 2 }, state }, value: draft.isMilestone ? "yes" : "no", onChange: (value: unknown) => patch({ isMilestone: value === "yes", milestoneDate: value === "yes" ? draft.milestoneDate : null }) },
      ...(draft.isMilestone ? [{ key: "milestoneDate", label: "里程碑日期", spec: { valueType: "date", control: "temporal", precision: "date", state }, value: draft.milestoneDate, placeholder: "选择日期", onChange: patchDate("milestoneDate") }] satisfies FormSurfaceFieldSpec[] : []),
    ] satisfies FormSurfaceFieldSpec[] : []),
  ];
}

function optionalRecurrenceFields(
  draft: WorkItemDraft,
  disabled: boolean,
  patch: (next: Partial<WorkItemDraft>) => void,
  patchInteger: (
    key: "routineRecurrenceWeekday" | "routineRecurrenceMonthDay" | "routineRecurrenceQuarterDay" | "routineRecurrenceYearMonth" | "routineRecurrenceYearDay",
  ) => (next: unknown) => void,
): FormSurfaceFieldSpec[] {
  const recurrenceType = draft.routineRecurrenceType ? normalizeRoutineRecurrenceType(draft.routineRecurrenceType) : null;
  const state = disabled ? "disabled" as const : "normal" as const;
  return [
    { key: "routineRecurrenceType", label: "周期", spec: { valueType: "string", control: "choice", options: { source: "static", items: OPTIONAL_ROUTINE_RECURRENCE_TYPE_OPTIONS }, state }, value: recurrenceType || "", placeholder: "选填", onChange: (value: unknown) => {
      const next = String(value || "");
      patch(next ? { ...defaultRecurrencePatch(normalizeRoutineRecurrenceType(next)), routineRecurrenceType: normalizeRoutineRecurrenceType(next) } : { ...emptyRecurrencePatch(), routineRecurrenceTime: draft.routineRecurrenceTime });
    } },
    { key: "routineRecurrenceTime", label: "时间", spec: { valueType: "string", control: "text", state }, value: draft.routineRecurrenceTime || "", placeholder: "选填，如 09:00", onChange: (value: unknown) => patch({ routineRecurrenceTime: String(value ?? "") }) },
    ...(recurrenceType === "weekly" ? [
      { key: "routineRecurrenceWeekday", label: "星期", spec: { valueType: "string", control: "choice", options: { source: "static", items: ROUTINE_WEEKDAY_OPTIONS }, state }, value: String(draft.routineRecurrenceWeekday || 1), onChange: patchInteger("routineRecurrenceWeekday") },
    ] satisfies FormSurfaceFieldSpec[] : []),
    ...(recurrenceType === "monthly" ? [
      { key: "routineRecurrenceMonthDay", label: "日期", spec: { valueType: "number", control: "number", state }, value: String(draft.routineRecurrenceMonthDay || 1), onChange: patchInteger("routineRecurrenceMonthDay") },
    ] satisfies FormSurfaceFieldSpec[] : []),
    ...(recurrenceType === "quarterly" ? [
      { key: "routineRecurrenceQuarterDay", label: "季度第几天", spec: { valueType: "number", control: "number", state }, value: String(draft.routineRecurrenceQuarterDay || 1), onChange: patchInteger("routineRecurrenceQuarterDay") },
    ] satisfies FormSurfaceFieldSpec[] : []),
    ...(recurrenceType === "yearly" ? [
      { key: "routineRecurrenceYearMonth", label: "月份", spec: { valueType: "string", control: "choice", options: { source: "static", items: ROUTINE_MONTH_OPTIONS }, state }, value: String(draft.routineRecurrenceYearMonth || 1), onChange: patchInteger("routineRecurrenceYearMonth") },
      { key: "routineRecurrenceYearDay", label: "日期", spec: { valueType: "number", control: "number", state }, value: String(draft.routineRecurrenceYearDay || 1), onChange: patchInteger("routineRecurrenceYearDay") },
    ] satisfies FormSurfaceFieldSpec[] : []),
  ];
}

function nodeTypeLabel(itemType: WorkItemType) {
  if (itemType === "objective") return "目标";
  if (itemType === "key_result") return "关键结果";
  return "子任务";
}

const MILESTONE_OPTIONS = [
  { value: "yes", label: "是" },
  { value: "no", label: "否" },
];

function normalizeDateValue(value: unknown) {
  const text = String(value || "");
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function optionId(option: unknown) {
  if (!option || typeof option !== "object" || !("id" in option)) return null;
  const id = Number(option.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function optionName(option: unknown) {
  return option && typeof option === "object" && "name" in option ? String(option.name ?? "") : "";
}
