import { workspaceBasePath } from "@workspace/core/routing";
import { businessSpaceKindLabel } from "@workspace/platform/permissions";
import type { RoutineRecurrenceType, RoutineTaskType, WorkItem, WorkItemDraft, WorkItemStatus, WorkItemType, WorkOkrStage, WorkPeriodType, WorkPlan, WorkPlanDraft, WorkPlanKind, WorkSourceKind, WorkSourceType, WorkTaskSpace, WorkTargetType } from "./types";

export const WORK_CATEGORY_OPTIONS = [
  { value: "routine", label: "日常工作" },
  { value: "non-routine", label: "非日常工作" },
] as const;

export const WORK_STATUS_OPTIONS: Array<{ value: WorkItemStatus; label: string }> = [{ value: "active", label: "进行中" }, { value: "paused", label: "已暂停" }, { value: "done", label: "已完成" }];

export const STANDING_RESPONSIBILITY_STATUS_OPTIONS: Array<{ value: WorkItemStatus; label: string }> = [{ value: "active", label: "生效中" }, { value: "paused", label: "已暂停" }, { value: "done", label: "已失效" }];

export const WORK_PLAN_KIND_OPTIONS: Array<{ value: WorkPlanKind; label: string }> = [
  { value: "okr", label: "目标计划" },
  { value: "routine", label: "日常工作" },
];

export const WORK_ITEM_TYPE_OPTIONS: Array<{ value: WorkItemType; label: string }> = [
  { value: "objective", label: "目标" },
  { value: "key_result", label: "关键结果" },
  { value: "task", label: "任务" },
];

export const ROUTINE_TASK_TYPE_OPTIONS: Array<{ value: RoutineTaskType; label: string }> = [
  { value: "standing", label: "常设职责" },
  { value: "task", label: "任务" },
];

export const ROUTINE_RECURRENCE_TYPE_OPTIONS: Array<{ value: RoutineRecurrenceType; label: string }> = [
  { value: "daily", label: "每日" },
  { value: "weekly", label: "每周" },
  { value: "monthly", label: "每月" },
  { value: "quarterly", label: "每季度" },
  { value: "yearly", label: "每年" },
];

export const OPTIONAL_ROUTINE_RECURRENCE_TYPE_OPTIONS = [
  { value: "", label: "不设置" },
  ...ROUTINE_RECURRENCE_TYPE_OPTIONS,
];

export const ROUTINE_WEEKDAY_OPTIONS = [
  { value: "1", label: "周一" },
  { value: "2", label: "周二" },
  { value: "3", label: "周三" },
  { value: "4", label: "周四" },
  { value: "5", label: "周五" },
  { value: "6", label: "周六" },
  { value: "7", label: "周日" },
];

export const ROUTINE_MONTH_OPTIONS = Array.from({ length: 12 }, (_, index) => ({ value: String(index + 1), label: `${index + 1}月` }));

export const WORK_OKR_STAGE_STEPS: Array<{ value: WorkOkrStage; label: string }> = [
  { value: "objective_draft", label: "目标草稿" },
  { value: "objective_submitted", label: "目标待审" },
  { value: "executing", label: "执行中" },
  { value: "kr_open", label: "KR开放" },
  { value: "kr_submitted", label: "KR待核查" },
  { value: "closed", label: "已关闭" },
];

export const WORK_SOURCE_TYPE_OPTIONS: Array<{ value: WorkSourceType; label: string }> = [
  { value: "department", label: "部门" },
  { value: "project", label: "项目" },
  { value: "other", label: "其他" },
];

export const WORK_PROJECT_SOURCE_KIND_OPTIONS: Array<{ value: WorkSourceKind; label: string }> = [
  { value: "project", label: "项目" },
  { value: "project_phase", label: "项目阶段" },
];

export const WORK_PERIOD_TYPE_OPTIONS: Array<{ value: WorkPeriodType; label: string }> = [
  { value: "daily", label: "按日" },
  { value: "weekly", label: "按周" },
  { value: "monthly", label: "按月" },
  { value: "quarterly", label: "按季度" },
  { value: "half_year", label: "按半年" },
  { value: "yearly", label: "按年" },
];

export const OKR_PLAN_PERIOD_TYPE_OPTIONS: Array<{ value: WorkPeriodType; label: string }> = [
  { value: "monthly", label: "月" },
  { value: "quarterly", label: "季" },
  { value: "half_year", label: "半年" },
  { value: "yearly", label: "年" },
];

export function getWorkSpaceLabel(type: WorkTargetType) {
  return businessSpaceKindLabel(type, "work");
}

export function getWorkSpacePath(type: WorkTargetType, id: number) {
  if (type === "personal") return "/work/me";
  if (type === "department" || type === "committee") return `/work/department/${id}/space`;
  if (type === "project") return `/work/project/${id}`;
  return "/work/me";
}

export function getWorkTargetFromPath(pathname: string, spaces: WorkTaskSpace[]) {
  const path = workspaceBasePath && pathname.startsWith(`${workspaceBasePath}/`)
    ? pathname.slice(workspaceBasePath.length)
    : pathname;
  if (path === "/work/me") return spaces.find((space) => space.targetType === "personal") || null;
  const match = path.match(/^\/work\/(department|departments|project|projects)\/(\d+)(?:\/space)?$/);
  if (!match) return null;
  const targetId = Number(match[2]);
  const targetType = ({
    department: "department",
    departments: "department",
    project: "project",
    projects: "project",
  } as const)[match[1] as "department" | "departments" | "project" | "projects"];
  return spaces.find((space) => space.targetType === targetType && space.targetId === targetId) || null;
}

export function getStatusLabel(status: string, kind: "task" | "standing" = "task") {
  if (status === "done") return kind === "standing" ? "已失效" : "已完成";
  if (status === "paused") return "已暂停";
  if (status === "archived") return "已归档";
  if (!status) return "无状态";
  return kind === "standing" ? "生效中" : "进行中";
}

export function getWorkItemTypeLabel(itemType: string | null | undefined) {
  return WORK_ITEM_TYPE_OPTIONS.find((option) => option.value === itemType)?.label || "任务";
}

export function getRoutineTaskTypeLabel(type: string | null | undefined) {
  return ROUTINE_TASK_TYPE_OPTIONS.find((option) => option.value === type)?.label || "未分类";
}

export function getRoutineRecurrenceTypeLabel(type: string | null | undefined) {
  return ROUTINE_RECURRENCE_TYPE_OPTIONS.find((option) => option.value === type)?.label || "每日";
}

export function getWorkOkrStageLabel(stage: WorkOkrStage | string | null | undefined) {
  return WORK_OKR_STAGE_STEPS.find((option) => option.value === stage)?.label || "目标草稿";
}

export function getWorkPlanKindLabel(kind: WorkPlanKind | string | null | undefined) {
  return WORK_PLAN_KIND_OPTIONS.find((option) => option.value === kind)?.label || "目标计划";
}

export function canEditObjectivePlan(stage: WorkOkrStage | string | null | undefined) {
  return stage === "objective_draft";
}

export function canMaintainTask(stage: WorkOkrStage | string | null | undefined) {
  return stage === "executing" || stage === "kr_open";
}

export function canMaintainKr(stage: WorkOkrStage | string | null | undefined) {
  return stage === "executing" || stage === "kr_open";
}

export function defaultWorkItemTypeForStage(stage: WorkOkrStage | string | null | undefined): WorkItemType {
  if (stage === "objective_draft") return "objective";
  if (stage === "kr_open") return "key_result";
  return "task";
}

export function getWorkSourceTypeLabel(sourceType: string | null | undefined) {
  return WORK_SOURCE_TYPE_OPTIONS.find((option) => option.value === sourceType)?.label || "其他";
}

export function getPeriodTypeLabel(periodType: string | null | undefined) {
  return WORK_PERIOD_TYPE_OPTIONS.find((option) => option.value === periodType)?.label || "不限定";
}

export function formatWorkDate(value: string | null | undefined) {
  if (!value) return "";
  const text = String(value);
  const dateOnly = text.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (dateOnly) return dateOnly;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return date.toISOString().slice(0, 10);
}

export function getWorkPeriodLabel(work: Pick<WorkItem, "periodType" | "periodStart" | "periodEnd"> | Pick<WorkPlan, "periodType" | "actualStartDate" | "actualEndDate">) {
  const startDate = "actualStartDate" in work ? work.actualStartDate : work.periodStart;
  const endDate = "actualEndDate" in work ? work.actualEndDate : work.periodEnd;
  if (!work.periodType) {
    const start = formatWorkDate(startDate);
    const end = formatWorkDate(endDate);
    if (start && end) return `${start} - ${end}`;
    if (start) return `${start} 起`;
    return "长期";
  }
  const typeLabel = getPeriodTypeLabel(work.periodType);
  const start = formatWorkDate(startDate);
  const end = formatWorkDate(endDate);
  if (start && end) return `${typeLabel} · ${start} - ${end}`;
  return typeLabel;
}

export function createEmptyWorkPlanDraft(sortOrder = 0): WorkPlanDraft {
  return {
    id: null,
    kind: "okr",
    title: "",
    description: "",
    status: "active",
    ownerEmployeeId: null,
    ownerEmployeeName: "", isSystemGenerated: false,
    collaborationId: null,
    collaborationTitle: "",
    okrCycleId: null,
    okrCycleLabel: "",
    sourcePlanId: null,
    sourcePlanTitle: "",
    sourcePlanCycleLabel: "",
    parentPeriodPlanId: null,
    parentPeriodPlanTitle: "",
    parentPeriodPlanCycleLabel: "",
    alignmentSourceType: null, alignmentSourcePlanId: null, alignmentSourcePlanTitle: "", alignmentSourcePlanTargetType: null, alignmentSourcePlanTargetId: null, alignmentSourcePlanCycleLabel: "",
    alignmentSourceWorkItemId: null, alignmentSourceWorkItemContent: "", alignmentSourceWorkItemTargetType: null, alignmentSourceWorkItemTargetId: null, alignmentSourceWorkItemCycleLabel: "",
    alignmentSourceWorkItemPlanTitle: "", alignmentSourceWorkItemKrTargetValue: null, alignmentSourceWorkItemKrUnit: "",
    alignmentRelationKind: null,
    previousPeriodPlanId: null,
    previousPeriodPlanTitle: "",
    previousPeriodPlanCycleLabel: "",
    periodType: null,
    actualStartDate: null,
    actualEndDate: null,
    plannedStartDate: null,
    plannedEndDate: null,
    isMilestone: false,
    milestoneDate: null,
    sourceType: "other",
    sourceKind: null,
    sourceMeetingId: null,
    sourceMeetingTitle: "",
    sourceMeetingDecisionId: null,
    sourceMeetingDecisionTitle: "",
    sourceMeetingActionCandidateId: null,
    sourceMeetingActionCandidateTitle: "",
    sourceDepartmentId: null,
    sourceDepartmentName: "",
    sourceDepartmentCode: "",
    linkedProjectId: null,
    linkedProjectName: "",
    linkedProjectPhaseId: null,
    linkedProjectPhaseName: "",
    sortOrder,
  };
}

export function createWorkPlanDraft(plan: WorkPlan): WorkPlanDraft {
  return {
    id: plan.id,
    kind: plan.kind,
    title: plan.title,
    description: plan.description || "",
    status: plan.status,
    ownerEmployeeId: plan.ownerEmployeeId,
    ownerEmployeeName: plan.ownerEmployeeName || "", isSystemGenerated: plan.isSystemGenerated,
    collaborationId: plan.collaborationId,
    collaborationTitle: plan.collaborationTitle || "",
    okrCycleId: plan.okrCycleId,
    okrCycleLabel: plan.okrCycleLabel || getWorkPeriodLabel(plan),
    sourcePlanId: plan.sourcePlanId,
    sourcePlanTitle: plan.sourcePlanTitle || "",
    sourcePlanCycleLabel: plan.sourcePlanCycleLabel || "",
    parentPeriodPlanId: plan.parentPeriodPlanId,
    parentPeriodPlanTitle: plan.parentPeriodPlanTitle || "",
    parentPeriodPlanCycleLabel: plan.parentPeriodPlanCycleLabel || "",
    alignmentSourceType: plan.alignmentSourceType, alignmentSourcePlanId: plan.alignmentSourcePlanId,
    alignmentSourcePlanTitle: plan.alignmentSourcePlanTitle || "", alignmentSourcePlanTargetType: plan.alignmentSourcePlanTargetType, alignmentSourcePlanTargetId: plan.alignmentSourcePlanTargetId, alignmentSourcePlanCycleLabel: plan.alignmentSourcePlanCycleLabel || "",
    alignmentSourceWorkItemId: plan.alignmentSourceWorkItemId, alignmentSourceWorkItemContent: plan.alignmentSourceWorkItemContent || "",
    alignmentSourceWorkItemTargetType: plan.alignmentSourceWorkItemTargetType, alignmentSourceWorkItemTargetId: plan.alignmentSourceWorkItemTargetId, alignmentSourceWorkItemCycleLabel: plan.alignmentSourceWorkItemCycleLabel || "", alignmentSourceWorkItemPlanTitle: plan.alignmentSourceWorkItemPlanTitle || "",
    alignmentSourceWorkItemKrTargetValue: plan.alignmentSourceWorkItemKrTargetValue, alignmentSourceWorkItemKrUnit: plan.alignmentSourceWorkItemKrUnit || "",
    alignmentRelationKind: planAlignmentRelationKind(plan),
    previousPeriodPlanId: plan.previousPeriodPlanId,
    previousPeriodPlanTitle: plan.previousPeriodPlanTitle || "",
    previousPeriodPlanCycleLabel: plan.previousPeriodPlanCycleLabel || "",
    periodType: plan.periodType,
    actualStartDate: plan.actualStartDate,
    actualEndDate: plan.actualEndDate,
    plannedStartDate: plan.plannedStartDate,
    plannedEndDate: plan.plannedEndDate,
    isMilestone: plan.isMilestone,
    milestoneDate: plan.milestoneDate,
    sourceType: plan.sourceType,
    sourceKind: plan.sourceKind,
    sourceMeetingId: plan.sourceMeetingId,
    sourceMeetingTitle: plan.sourceMeetingTitle || "",
    sourceMeetingDecisionId: plan.sourceMeetingDecisionId,
    sourceMeetingDecisionTitle: plan.sourceMeetingDecisionTitle || "",
    sourceMeetingActionCandidateId: plan.sourceMeetingActionCandidateId,
    sourceMeetingActionCandidateTitle: plan.sourceMeetingActionCandidateTitle || "",
    sourceDepartmentId: plan.sourceDepartmentId,
    sourceDepartmentName: plan.sourceDepartmentName || "",
    sourceDepartmentCode: plan.sourceDepartmentCode || "",
    linkedProjectId: plan.linkedProjectId,
    linkedProjectName: plan.linkedProjectName || "",
    linkedProjectPhaseId: plan.linkedProjectPhaseId,
    linkedProjectPhaseName: plan.linkedProjectPhaseName || "",
    sortOrder: plan.sortOrder,
  };
}

export function workPlanDraftPayload(draft: WorkPlanDraft) {
  const isOkr = draft.kind === "okr";
  return {
    kind: draft.kind,
    title: draft.title,
    description: draft.description,
    status: draft.status,
    ownerEmployeeId: draft.ownerEmployeeId,
    collaborationId: draft.collaborationId,
    okrCycleId: isOkr ? draft.okrCycleId : null,
    sourcePlanId: null,
    parentPeriodPlanId: isOkr && draft.alignmentSourceType === "plan" ? draft.alignmentSourcePlanId : null,
    alignmentSourceType: isOkr ? draft.alignmentSourceType : null,
    alignmentSourcePlanId: isOkr && draft.alignmentSourceType === "plan" ? draft.alignmentSourcePlanId : null,
    alignmentSourceWorkItemId: isOkr && draft.alignmentSourceType !== "plan" ? draft.alignmentSourceWorkItemId : null,
    alignmentRelationKind: isOkr ? draft.alignmentRelationKind : null,
    previousPeriodPlanId: isOkr ? draft.previousPeriodPlanId : null,
    periodType: isOkr ? draft.periodType : null,
    actualStartDate: isOkr ? draft.actualStartDate : null,
    actualEndDate: isOkr ? draft.actualEndDate : null,
    plannedStartDate: isOkr ? draft.plannedStartDate : null,
    plannedEndDate: isOkr ? draft.plannedEndDate : null,
    isMilestone: isOkr ? draft.isMilestone : false,
    milestoneDate: isOkr && draft.isMilestone ? draft.milestoneDate : null,
    sourceType: "other" as WorkSourceType,
    sourceKind: null,
    sourceMeetingId: null,
    sourceMeetingDecisionId: null,
    sourceMeetingActionCandidateId: null,
    sourceDepartmentId: null,
    linkedProjectId: null,
    linkedProjectPhaseId: null,
    sortOrder: draft.sortOrder,
  };
}

function planAlignmentRelationKind(plan: WorkPlan) {
  if (plan.alignmentSourceType === "plan" && plan.alignmentSourcePlanId) {
    return plan.alignmentSourcePlanTargetType && (plan.alignmentSourcePlanTargetType !== plan.targetType || plan.alignmentSourcePlanTargetId !== plan.targetId) ? "external" : "upper";
  }
  if ((plan.alignmentSourceType === "objective" || plan.alignmentSourceType === "key_result") && plan.alignmentSourceWorkItemId) {
    return plan.alignmentSourceWorkItemTargetType && (plan.alignmentSourceWorkItemTargetType !== plan.targetType || plan.alignmentSourceWorkItemTargetId !== plan.targetId) ? "external" : "upper";
  }
  return null;
}

export function isWorkPlanDraftDirty(initial: WorkPlanDraft | null | undefined, current: WorkPlanDraft | null | undefined) {
  if (!initial || !current) return false;
  return stableSnapshot(workPlanDraftPayload(initial)) !== stableSnapshot(workPlanDraftPayload(current));
}

export function createEmptyWorkDraft(sortOrder = 0, planId: number | null = null, itemType: WorkItemType = "task"): WorkItemDraft {
  return {
    id: null,
    planId,
    category: "non-routine",
    itemType,
    content: "",
    description: "",
    importance: 3,
    urgency: 3,
    status: "active",
    krStartValue: null,
    krTargetValue: null,
    krCurrentValue: null,
    krUnit: "",
    routineTaskType: null,
    routineRecurrenceType: null,
    routineRecurrenceTime: "",
    routineRecurrenceWeekday: 1,
    routineRecurrenceMonthDay: 1,
    routineRecurrenceQuarterDay: 1,
    routineRecurrenceYearMonth: 1,
    routineRecurrenceYearDay: 1,
    ownerEmployeeId: null,
    ownerEmployeeName: "",
    collaborationId: null,
    collaborationTitle: "",
    actualStartDate: null,
    actualEndDate: null,
    plannedStartDate: null,
    plannedEndDate: null,
    isMilestone: false,
    milestoneDate: null,
    periodType: null,
    periodStart: null,
    periodEnd: null,
    sourceType: "other",
    sourceKind: null,
    sourceMeetingId: null, sourceMeetingTitle: "",
    sourceMeetingDecisionId: null, sourceMeetingDecisionTitle: "",
    sourceMeetingActionCandidateId: null, sourceMeetingActionCandidateTitle: "",
    sourceDepartmentId: null, sourceDepartmentName: "", sourceDepartmentCode: "",
    linkedProjectId: null, linkedProjectName: "",
    linkedProjectPhaseId: null, linkedProjectPhaseName: "",
    parentWorkItemId: null, parentWorkItemContent: "",
    parentPeriodWorkItemId: null, parentPeriodWorkItemContent: "",
    parentPeriodWorkItemType: null, parentPeriodRelationKind: null, parentPeriodWorkItemCycleLabel: "",
    previousPeriodWorkItemId: null, previousPeriodWorkItemContent: "", previousPeriodWorkItemCycleLabel: "",
    responsibilityNodeId: null, responsibilityLabel: "",
    responsibilityPositionId: null, responsibilityPositionName: "",
    evidenceTaskIds: [],
    participants: "",
    sortOrder,
  };
}

export function createWorkDraft(work: WorkItem): WorkItemDraft {
  return {
    id: work.id,
    planId: work.planId,
    category: work.category,
    itemType: work.itemType,
    content: work.content,
    description: work.description || "",
    importance: work.importance,
    urgency: work.urgency,
    status: work.status || "active",
    krStartValue: work.krStartValue,
    krTargetValue: work.krTargetValue,
    krCurrentValue: work.krCurrentValue,
    krUnit: work.krUnit || "",
    routineTaskType: work.routineTaskType,
    routineRecurrenceType: work.routineRecurrenceType,
    routineRecurrenceTime: work.routineRecurrenceTime || "",
    routineRecurrenceWeekday: work.routineRecurrenceWeekday,
    routineRecurrenceMonthDay: work.routineRecurrenceMonthDay,
    routineRecurrenceQuarterDay: work.routineRecurrenceQuarterDay,
    routineRecurrenceYearMonth: work.routineRecurrenceYearMonth,
    routineRecurrenceYearDay: work.routineRecurrenceYearDay,
    ownerEmployeeId: work.ownerEmployeeId,
    ownerEmployeeName: work.ownerEmployeeName || "",
    collaborationId: work.collaborationId,
    collaborationTitle: work.collaborationTitle || "",
    actualStartDate: work.actualStartDate,
    actualEndDate: work.actualEndDate,
    plannedStartDate: work.plannedStartDate,
    plannedEndDate: work.plannedEndDate,
    isMilestone: work.isMilestone,
    milestoneDate: work.milestoneDate,
    periodType: work.periodType,
    periodStart: work.periodStart,
    periodEnd: work.periodEnd,
    sourceType: work.sourceType,
    sourceKind: work.sourceKind,
    sourceMeetingId: work.sourceMeetingId, sourceMeetingTitle: work.sourceMeetingTitle || "",
    sourceMeetingDecisionId: work.sourceMeetingDecisionId, sourceMeetingDecisionTitle: work.sourceMeetingDecisionTitle || "",
    sourceMeetingActionCandidateId: work.sourceMeetingActionCandidateId, sourceMeetingActionCandidateTitle: work.sourceMeetingActionCandidateTitle || "",
    sourceDepartmentId: work.sourceDepartmentId, sourceDepartmentName: work.sourceDepartmentName || "", sourceDepartmentCode: work.sourceDepartmentCode || "",
    linkedProjectId: work.linkedProjectId, linkedProjectName: work.linkedProjectName || "",
    linkedProjectPhaseId: work.linkedProjectPhaseId, linkedProjectPhaseName: work.linkedProjectPhaseName || "",
    parentWorkItemId: work.parentWorkItemId, parentWorkItemContent: work.parentWorkItemContent || "",
    parentPeriodWorkItemId: work.parentPeriodWorkItemId, parentPeriodWorkItemContent: work.parentPeriodWorkItemContent || "",
    parentPeriodWorkItemType: work.parentPeriodWorkItemType, parentPeriodRelationKind: parentPeriodRelationKind(work), parentPeriodWorkItemCycleLabel: work.parentPeriodWorkItemCycleLabel || "",
    previousPeriodWorkItemId: work.previousPeriodWorkItemId, previousPeriodWorkItemContent: work.previousPeriodWorkItemContent || "", previousPeriodWorkItemCycleLabel: work.previousPeriodWorkItemCycleLabel || "",
    responsibilityNodeId: work.responsibilityNodeId, responsibilityLabel: work.responsibilityLabel || "",
    responsibilityPositionId: work.responsibilityPositionId, responsibilityPositionName: work.responsibilityPositionName || "",
    evidenceTaskIds: work.evidenceTaskIds || [],
    participants: work.participants.map((participant) => participant.name).join("、"),
    sortOrder: work.sortOrder,
  };
}

function parentPeriodRelationKind(work: WorkItem) {
  if (!work.parentPeriodWorkItemId) return null;
  if (work.parentPeriodWorkItemTargetType && (work.parentPeriodWorkItemTargetType !== work.targetType || work.parentPeriodWorkItemTargetId !== work.targetId)) return "external";
  return work.itemType === "task" ? "external" : "upper";
}

export function workDraftPayload(draft: WorkItemDraft) {
  const isTask = draft.itemType === "task";
  const isObjective = draft.itemType === "objective";
  const isKr = draft.itemType === "key_result";
  const routineTaskType = draft.category === "routine" && isTask ? draft.routineTaskType || "task" : null;
  const hasRoutineRecurrence = routineTaskType === "task" && Boolean(draft.routineRecurrenceType);
  const usesDirectResponsibility = isTask && routineTaskType === "standing";
  const usesDateWindow = isObjective || (isTask && routineTaskType !== "standing");
  const isProjectSource = draft.sourceType === "project";
  const isMeetingSource = draft.sourceType === "meeting";
  const isDepartmentSource = draft.sourceType === "department";
  return {
    category: draft.category,
    planId: draft.planId,
    itemType: draft.itemType,
    content: draft.content,
    description: draft.description,
    importance: draft.importance,
    urgency: draft.urgency,
    status: draft.status,
    krStartValue: isKr ? draft.krStartValue : null,
    krTargetValue: isKr ? draft.krTargetValue : null,
    krCurrentValue: isKr ? draft.krCurrentValue : null,
    krUnit: isKr ? draft.krUnit : null,
    routineTaskType,
    routineRecurrenceType: hasRoutineRecurrence ? draft.routineRecurrenceType : null,
    routineRecurrenceTime: routineTaskType === "task" ? draft.routineRecurrenceTime || null : null,
    routineRecurrenceWeekday: hasRoutineRecurrence ? draft.routineRecurrenceWeekday ?? 1 : null,
    routineRecurrenceMonthDay: hasRoutineRecurrence ? draft.routineRecurrenceMonthDay ?? 1 : null,
    routineRecurrenceQuarterDay: hasRoutineRecurrence ? draft.routineRecurrenceQuarterDay ?? 1 : null,
    routineRecurrenceYearMonth: hasRoutineRecurrence ? draft.routineRecurrenceYearMonth ?? 1 : null,
    routineRecurrenceYearDay: hasRoutineRecurrence ? draft.routineRecurrenceYearDay ?? 1 : null,
    ownerEmployeeId: draft.ownerEmployeeId,
    collaborationId: draft.collaborationId,
    actualStartDate: usesDateWindow ? draft.actualStartDate : null,
    actualEndDate: usesDateWindow ? draft.actualEndDate : null,
    plannedStartDate: isObjective || isTask ? draft.plannedStartDate : null,
    plannedEndDate: isObjective || isTask ? draft.plannedEndDate : null,
    isMilestone: isObjective ? draft.isMilestone : false,
    milestoneDate: isObjective && draft.isMilestone ? draft.milestoneDate : null,
    periodType: draft.periodType,
    periodStart: draft.periodType ? draft.periodStart : null,
    periodEnd: draft.periodType ? draft.periodEnd : null,
    sourceType: draft.sourceType,
    sourceKind: isProjectSource ? inferProjectSourceKind(draft) : null,
    sourceMeetingId: isMeetingSource ? draft.sourceMeetingId : null,
    sourceMeetingDecisionId: isMeetingSource ? draft.sourceMeetingDecisionId : null,
    sourceMeetingActionCandidateId: isMeetingSource ? draft.sourceMeetingActionCandidateId : null,
    sourceDepartmentId: isDepartmentSource ? draft.sourceDepartmentId : null,
    linkedProjectId: isProjectSource ? draft.linkedProjectId : null,
    linkedProjectPhaseId: isProjectSource && draft.sourceKind === "project_phase" ? draft.linkedProjectPhaseId : null,
    parentWorkItemId: draft.parentWorkItemId,
    parentPeriodWorkItemId: isObjective || isKr || isTask ? draft.parentPeriodWorkItemId : null,
    previousPeriodWorkItemId: isObjective || isKr ? draft.previousPeriodWorkItemId : null,
    responsibilityNodeId: usesDirectResponsibility ? draft.responsibilityNodeId : null,
    responsibilityPositionId: usesDirectResponsibility ? draft.responsibilityPositionId : null,
    ...(isKr ? { evidenceTaskIds: draft.evidenceTaskIds } : {}),
    participants: draft.participants,
    sortOrder: draft.sortOrder,
  };
}

export function isWorkDraftDirty(initial: WorkItem | null | undefined, current: WorkItemDraft | null | undefined) {
  return Boolean(initial && current && stableSnapshot(workDraftPayload(createWorkDraft(initial))) !== stableSnapshot(workDraftPayload(current)));
}

function inferProjectSourceKind(draft: Pick<WorkItemDraft | WorkPlanDraft, "sourceKind" | "linkedProjectPhaseId" | "linkedProjectId">): WorkSourceKind | null {
  return draft.sourceKind || (draft.linkedProjectPhaseId ? "project_phase" : draft.linkedProjectId ? "project" : null);
}

function stableSnapshot(value: unknown): string { return JSON.stringify(stabilize(value)); }
function stabilize(value: unknown): unknown {
  return Array.isArray(value) ? value.map(stabilize) : !value || typeof value !== "object" ? value : Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, stabilize(item)]));
}
