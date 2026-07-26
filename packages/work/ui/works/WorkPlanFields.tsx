"use client";

import { type ReactNode, useCallback, useMemo } from "react";
import { createFormSection, createPageBody, type FormSurfaceFieldSpec, type FormSurfaceItemSpec, type FormSurfaceProps, BodySurface } from "@workspace/core/ui";
import { actualEndDateForStatus, canEditActualEndDate, todayDateString } from "@workspace/platform/completion-date-policy";
import { WORK_REFERENCE_OPTIONS_ENDPOINT } from "./api";
import { OKR_PLAN_PERIOD_TYPE_OPTIONS } from "./model";
import type { WorkItem, WorkPlanAlignmentSourceType, WorkPlanDraft, WorkTarget } from "./types";

export function WorkPlanForm({
  draft,
  works = [],
  disabled,
  autoFocusTitle = true,
  target,
  onChange,
}: {
  draft: WorkPlanDraft;
  works?: WorkItem[];
  disabled: boolean;
  autoFocusTitle?: boolean;
  target?: WorkTarget | null;
  onChange: (draft: WorkPlanDraft) => void;
}) {
  const surface = useWorkPlanFormSurface({ draft, works, disabled, autoFocusTitle, target, onChange });
  return <BodySurface {...createPageBody([createFormSection("work-plan-form", surface)])} />;
}

export function useWorkPlanFormSurface({
  draft,
  works = [],
  disabled,
  autoFocusTitle = false,
  target,
  onChange,
}: {
  draft: WorkPlanDraft;
  works?: WorkItem[];
  disabled: boolean;
  autoFocusTitle?: boolean;
  target?: WorkTarget | null;
  onChange: (draft: WorkPlanDraft) => void;
}): FormSurfaceProps {
  const isOkrPlan = draft.kind === "okr";
  const isRoutinePlan = draft.kind === "routine";

  const patch = useCallback((next: Partial<WorkPlanDraft>) => {
    onChange({ ...draft, ...next });
  }, [draft, onChange]);

  const ownerField = workPlanOwnerField({ draft, disabled, target, patch });
  const collaborationField = workPlanCollaborationField({ draft, disabled, target, patch });
  const titleLocked = disabled || isRoutinePlan || (isOkrPlan && draft.isSystemGenerated);
  const systemGeneratedPlanLocked = disabled || (isOkrPlan && draft.isSystemGenerated);
  const completionBlockers = useMemo(
    () => draft.status === "done" ? [] : works.filter((work) => !work.isArchived && work.status !== "done"),
    [draft.status, works],
  );
  const planStatusOptions = useMemo(() => [
    { value: "active", label: "进行中" },
    {
      value: "done",
      label: "已完成",
      disabled: completionBlockers.length > 0,
      description: completionBlockers.length > 0
        ? `${completionBlockers.slice(0, 3).map((work) => `${workItemTypeLabel(work.itemType)}「${work.content}」`).join("、")}尚未完成`
        : undefined,
    },
  ], [completionBlockers]);
  const titleValue = isOkrPlan
    ? draft.isSystemGenerated ? standardOkrPlanTitleFromDraft(draft) || draft.title : draft.title
    : draft.title || (isRoutinePlan ? "日常工作" : "");
  const fixedCycleFields: FormSurfaceFieldSpec[] = draft.isSystemGenerated ? [
    { key: "periodType", label: "计划周期", required: true, spec: { valueType: "string", control: "choice", options: { source: "static", items: OKR_PLAN_PERIOD_TYPE_OPTIONS, visibleCount: 4 }, state: systemGeneratedPlanLocked ? "disabled" : "normal" }, value: draft.periodType ?? "", onChange: (value: unknown) => patch({ periodType: OKR_PLAN_PERIOD_TYPE_OPTIONS.find((option) => option.value === value)?.value ?? null }) },
    ...alignmentSourceFields(draft, target, disabled, patch),
  ] : [];

  const fields: FormSurfaceItemSpec[] = [
    { key: "title", label: isOkrPlan ? "OKR 计划" : "日常工作", required: true, span: "wide", spec: { valueType: "string", control: "text", state: titleLocked ? "disabled" : "normal" }, value: titleValue, placeholder: isOkrPlan ? "输入 OKR 计划名称" : "日常工作", autoFocus: autoFocusTitle && !titleLocked, onChange: (value) => patch({ title: String(value ?? "") }) },
    ...(isOkrPlan ? [
      ...fixedCycleFields,
      { key: "plannedStartDate", label: "计划开始", required: true, spec: { valueType: "date", control: "temporal", precision: "date", state: systemGeneratedPlanLocked ? "disabled" : "normal" }, value: draft.plannedStartDate, placeholder: "请选择", onChange: (value: unknown) => patch({ plannedStartDate: normalizeDateValue(value) }) },
      { key: "plannedEndDate", label: "计划结束", required: true, spec: { valueType: "date", control: "temporal", precision: "date", state: systemGeneratedPlanLocked ? "disabled" : "normal" }, value: draft.plannedEndDate, placeholder: "请选择", onChange: (value: unknown) => patch({ plannedEndDate: normalizeDateValue(value) }) },
      { key: "status", label: "状态", spec: { valueType: "string", control: "choice", options: { source: "static", items: planStatusOptions }, state: disabled ? "disabled" : "normal" }, value: draft.status, onChange: (value: unknown) => {
        const status = value === "done" ? "done" : "active";
        patch({ status, actualEndDate: actualEndDateForStatus(status, draft.actualEndDate) });
      } },
      { key: "actualStartDate", label: "实际开始", spec: { valueType: "date", control: "temporal", precision: "date", state: disabled ? "disabled" : "normal", validation: { maxDate: todayDateString() } }, value: draft.actualStartDate, placeholder: "请选择", onChange: (value: unknown) => patch({ actualStartDate: normalizeDateValue(value) }) },
      { key: "actualEndDate", label: "实际结束", spec: { valueType: "date", control: "temporal", precision: "date", state: canEditActualEndDate(draft.status, disabled) ? "normal" : "disabled", validation: { maxDate: todayDateString() } }, value: draft.actualEndDate, placeholder: draft.status === "done" ? "请选择" : "请先选择已完成", onChange: (value: unknown) => patch({ actualEndDate: normalizeDateValue(value) }) },
      { key: "isMilestone", label: "里程碑", spec: { valueType: "string", control: "choice", options: { source: "static", items: MILESTONE_OPTIONS, visibleCount: 2 }, state: disabled ? "disabled" : "normal" }, value: draft.isMilestone ? "yes" : "no", onChange: (value: unknown) => patch({ isMilestone: value === "yes", milestoneDate: value === "yes" ? draft.milestoneDate : null }) },
      ...(draft.isMilestone ? [{ key: "milestoneDate", label: "里程碑日期", spec: { valueType: "date", control: "temporal", precision: "date", state: disabled ? "disabled" : "normal" }, value: draft.milestoneDate, placeholder: "请选择", onChange: (value: unknown) => patch({ milestoneDate: normalizeDateValue(value) }) }] satisfies FormSurfaceFieldSpec[] : []),
    ] satisfies FormSurfaceFieldSpec[] : []),
    ...(collaborationField ? [collaborationField] : []),
    ownerField,
    { key: "description", label: "描述", span: "wide", spec: { valueType: "string", control: "text", multiline: true, state: disabled ? "disabled" : "normal" }, value: draft.description, rows: 3, placeholder: "描述计划背景、边界或达成口径", onChange: (value) => patch({ description: String(value ?? "") }) },
  ];

  return {
    kind: "fields",
    content: { items: fields, layout: { columns: 3, density: "compact" } },
  };
}

function workPlanOwnerField({
  draft,
  disabled,
  target,
  patch,
}: {
  draft: WorkPlanDraft;
  disabled: boolean;
  target: WorkTarget | null | undefined;
  patch: (next: Partial<WorkPlanDraft>) => void;
}): FormSurfaceFieldSpec {
  return {
    key: "owner",
    label: "负责人",
    required: true,
    spec: {
      valueType: "reference",
      control: "reference",
      options: {
        source: "remote",
        fkKey: "work.tasks.owner.employee",
        endpoint: WORK_REFERENCE_OPTIONS_ENDPOINT,
        returnField: "id",
        queryParams: { targetType: target?.targetType, targetId: target?.targetId, collaborationId: draft.collaborationId ?? undefined },
      },
      state: disabled ? "disabled" : "normal",
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

function workPlanCollaborationField({
  draft,
  disabled,
  target,
  patch,
}: {
  draft: WorkPlanDraft;
  disabled: boolean;
  target: WorkTarget | null | undefined;
  patch: (next: Partial<WorkPlanDraft>) => void;
}): FormSurfaceFieldSpec | null {
  if (target?.targetType !== "department" || draft.kind !== "okr") return null;
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
    placeholder: "选填；关联已建立的部门协作",
    onChange: (value: unknown, option: unknown) => patch({
      collaborationId: optionId(option) ?? (value ? draft.collaborationId : null),
      collaborationTitle: optionName(option) || (value ? draft.collaborationTitle : ""),
      ownerEmployeeId: null,
      ownerEmployeeName: "",
    }),
  };
}

const MILESTONE_OPTIONS = [
  { value: "yes", label: "是" },
  { value: "no", label: "否" },
];

function normalizeDateValue(value: unknown) {
  const text = String(value || "");
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function standardOkrPlanTitleFromDraft(draft: Pick<WorkPlanDraft, "title" | "okrCycleLabel" | "periodType" | "actualStartDate">) {
  if (!draft.okrCycleLabel && !draft.actualStartDate) return "";
  return standardOkrPlanTitleFromCycle({
    periodType: draft.periodType,
    name: draft.okrCycleLabel,
    startDate: draft.actualStartDate || "",
  });
}

function workItemTypeLabel(itemType: WorkItem["itemType"]) {
  if (itemType === "objective") return "目标";
  if (itemType === "key_result") return "KR";
  return "任务";
}

function standardOkrPlanTitleFromCycle(cycle: { periodType: string | null | undefined; name: string; startDate: string }) {
  const year = Number(cycle.startDate.slice(0, 4)) || Number(cycle.name.match(/\d{4}/)?.[0]);
  if (!year) return cycle.name ? `${cycle.name.trim()}计划` : "";
  if (cycle.periodType === "yearly") return `${year}年度计划`;
  if (cycle.periodType === "half_year") return `${year}年${cycle.name.includes("H2") || cycle.startDate.slice(5, 7) === "07" ? "下" : "上"}半年计划`;
  if (cycle.periodType === "quarterly") {
    const quarter = Number(cycle.name.match(/Q([1-4])/)?.[1]) || Math.floor((Number(cycle.startDate.slice(5, 7)) - 1) / 3) + 1;
    return `${year}年第${quarter}季度计划`;
  }
  if (cycle.periodType === "monthly") {
    const month = cycle.startDate.slice(5, 7) || cycle.name.match(/\d{4}-(\d{2})/)?.[1] || "";
    return month ? `${year}年${month}月计划` : `${cycle.name.trim()}计划`;
  }
  return `${cycle.name.trim()}计划`;
}

function alignmentSourceFields(
  draft: WorkPlanDraft,
  target: WorkTarget | null | undefined,
  disabled: boolean,
  patch: (next: Partial<WorkPlanDraft>) => void,
): FormSurfaceFieldSpec[] {
  const state = disabled ? "disabled" as const : "normal" as const;
  const queryParams = {
    targetType: target?.targetType,
    targetId: target?.targetId,
    okrCycleId: draft.okrCycleId,
    currentPlanId: draft.id,
  };
  return [
    {
      key: "alignmentSource",
      label: labelWithInfo("对齐到", "外部关系：选择其他人或其他空间派发给我的、尚未被我对齐的承接/协作内容。"),
      spec: { valueType: "reference", control: "reference", options: { source: "remote", fkKey: "work.tasks.plan.alignment", endpoint: WORK_REFERENCE_OPTIONS_ENDPOINT, returnField: "id", queryParams }, state },
      value: alignmentSourceValue(draft, "external"),
      displayValue: alignmentSourceDisplay(draft, "external"),
      placeholder: "搜索未完成的承接/协作内容",
      onChange: (_value: unknown, option: unknown) => patch(alignmentSourcePatch(option, "external")),
    },
    {
      key: "upperAlignmentSource",
      label: labelWithInfo("上级", "上级周期关系：可以选择上级计划、目标或 KR。"),
      spec: { valueType: "reference", control: "reference", options: { source: "remote", fkKey: "work.tasks.plan.upper-alignment", endpoint: WORK_REFERENCE_OPTIONS_ENDPOINT, returnField: "id", queryParams }, state },
      value: alignmentSourceValue(draft, "upper"),
      displayValue: alignmentSourceDisplay(draft, "upper"),
      placeholder: draft.okrCycleId ? "搜索上级" : "先选择所属周期",
      onChange: (_value: unknown, option: unknown) => patch(alignmentSourcePatch(option, "upper")),
    },
  ];
}

function alignmentSourceValue(draft: WorkPlanDraft, relationKind: "upper" | "external") {
  if (draft.alignmentRelationKind !== relationKind) return "";
  if (draft.alignmentSourceType === "plan" && draft.alignmentSourcePlanId) return String(draft.alignmentSourcePlanId);
  if ((draft.alignmentSourceType === "objective" || draft.alignmentSourceType === "key_result") && draft.alignmentSourceWorkItemId) return String(-draft.alignmentSourceWorkItemId);
  return "";
}

function alignmentSourceDisplay(draft: WorkPlanDraft, relationKind: "upper" | "external") {
  if (draft.alignmentRelationKind !== relationKind) return "";
  if (draft.alignmentSourceType === "plan") return draft.alignmentSourcePlanTitle;
  if (draft.alignmentSourceType === "objective" || draft.alignmentSourceType === "key_result") return draft.alignmentSourceWorkItemContent;
  return "";
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

function clearAlignmentSource(): Partial<WorkPlanDraft> {
  return {
    alignmentSourceType: null,
    alignmentSourcePlanId: null,
    alignmentSourcePlanTitle: "",
    alignmentSourcePlanTargetType: null,
    alignmentSourcePlanTargetId: null,
    alignmentSourcePlanCycleLabel: "",
    alignmentSourceWorkItemId: null,
    alignmentSourceWorkItemContent: "",
    alignmentSourceWorkItemTargetType: null,
    alignmentSourceWorkItemTargetId: null,
    alignmentSourceWorkItemCycleLabel: "",
    alignmentSourceWorkItemPlanTitle: "",
    alignmentSourceWorkItemKrTargetValue: null,
    alignmentSourceWorkItemKrUnit: "",
    alignmentRelationKind: null,
    parentPeriodPlanId: null,
    parentPeriodPlanTitle: "",
    parentPeriodPlanCycleLabel: "",
  };
}

function alignmentSourcePatch(option: unknown, relationKind: "upper" | "external"): Partial<WorkPlanDraft> {
  const fk = alignmentReferenceOption(option);
  if (!fk) return clearAlignmentSource();
  if (fk.sourceType === "plan") {
    return {
      ...clearAlignmentSource(),
      alignmentSourceType: "plan",
      alignmentSourcePlanId: fk.sourcePlanId,
      alignmentSourcePlanTitle: fk.name,
      alignmentSourcePlanCycleLabel: fk.subtitle,
      alignmentRelationKind: relationKind,
      parentPeriodPlanId: fk.sourcePlanId,
      parentPeriodPlanTitle: fk.name,
      parentPeriodPlanCycleLabel: fk.subtitle,
    };
  }
  return {
    ...clearAlignmentSource(),
    alignmentSourceType: fk.sourceType,
    alignmentSourceWorkItemId: fk.sourceWorkItemId,
    alignmentSourceWorkItemContent: fk.name,
    alignmentSourceWorkItemCycleLabel: fk.subtitle,
    alignmentRelationKind: relationKind,
  };
}

function alignmentReferenceOption(option: unknown) {
  if (!option || typeof option !== "object") return null;
  const item = option as { name?: unknown; subtitle?: unknown; sourceType?: unknown; sourcePlanId?: unknown; sourceWorkItemId?: unknown };
  const sourceType = normalizeAlignmentSourceType(item.sourceType);
  if (!sourceType) return null;
  const sourcePlanId = Number(item.sourcePlanId);
  const sourceWorkItemId = Number(item.sourceWorkItemId);
  if (sourceType === "plan" && Number.isInteger(sourcePlanId) && sourcePlanId > 0) {
    return { sourceType, sourcePlanId, sourceWorkItemId: null, name: String(item.name ?? ""), subtitle: String(item.subtitle ?? "") };
  }
  if ((sourceType === "objective" || sourceType === "key_result") && Number.isInteger(sourceWorkItemId) && sourceWorkItemId > 0) {
    return { sourceType, sourcePlanId: null, sourceWorkItemId, name: String(item.name ?? ""), subtitle: String(item.subtitle ?? "") };
  }
  return null;
}

function normalizeAlignmentSourceType(value: unknown): WorkPlanAlignmentSourceType | null {
  return value === "plan" || value === "objective" || value === "key_result" ? value : null;
}

function optionId(option: unknown) {
  if (!option || typeof option !== "object" || !("id" in option)) return null;
  const id = Number(option.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function optionName(option: unknown) {
  return option && typeof option === "object" && "name" in option ? String(option.name ?? "") : "";
}
