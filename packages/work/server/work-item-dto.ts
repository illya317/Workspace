import { Prisma } from "@workspace/platform/server/prisma";
import { summarizeWorkResponsibilityReference, workResponsibilityReferenceSummarySelect } from "./work-responsibility-references";

export const workItemInclude = {
  participants: true,
  owner: { select: { id: true, employeeId: true, name: true } },
  collaboration: { select: { id: true, title: true, responsibleDepartment: { select: { id: true, name: true } } } },
  linkedProject: { select: { id: true, code: true, name: true } },
  linkedProjectPhase: { select: { id: true, name: true, projectId: true } },
  sourceMeeting: { select: { id: true, title: true, startAt: true } },
  sourceMeetingDecision: { select: { id: true, title: true, kind: true } },
  sourceMeetingActionCandidate: { select: { id: true, title: true } },
  sourceDepartment: { select: { id: true, code: true, name: true } },
  parentWorkItem: { select: { id: true, content: true } },
  parentPeriodWorkItem: { select: { id: true, content: true, itemType: true, krTargetValue: true, krCurrentValue: true, krUnit: true, plan: { select: { targetType: true, targetId: true, okrCycle: { select: { label: true } } } } } },
  previousPeriodWorkItem: { select: { id: true, content: true, plan: { select: { okrCycle: { select: { label: true } } } } } },
  responsibilityReferences: {
    where: { referenceRole: "execution" },
    orderBy: [{ id: "asc" as const }],
    select: workResponsibilityReferenceSummarySelect,
  },
  krEvidenceTasks: { orderBy: [{ sortOrder: "asc" as const }, { id: "asc" as const }], select: { taskWorkItemId: true, note: true, sortOrder: true } },
} satisfies Prisma.WorkItemInclude;

export function toWorkItemDto(row: Prisma.WorkItemGetPayload<{ include: typeof workItemInclude }>) {
  const status = normalizeWorkStatus(row.status);
  const responsibility = summarizeWorkResponsibilityReference(row.responsibilityReferences);
  return {
    id: row.id,
    planId: row.planId,
    targetType: row.targetType,
    targetId: row.targetId,
    category: row.category,
    itemType: row.itemType,
    content: row.content,
    description: row.description,
    importance: row.importance,
    urgency: row.urgency,
    status,
    krStartValue: row.krStartValue,
    krTargetValue: row.krTargetValue,
    krCurrentValue: row.krCurrentValue,
    krUnit: row.krUnit,
    routineTaskType: normalizeRoutineTaskType(row.routineTaskType),
    routineRecurrenceType: normalizeRoutineRecurrenceType(row.routineRecurrenceType),
    routineRecurrenceTime: row.routineRecurrenceTime,
    routineRecurrenceWeekday: row.routineRecurrenceWeekday,
    routineRecurrenceMonthDay: row.routineRecurrenceMonthDay,
    routineRecurrenceQuarterDay: row.routineRecurrenceQuarterDay,
    routineRecurrenceYearMonth: row.routineRecurrenceYearMonth,
    routineRecurrenceYearDay: row.routineRecurrenceYearDay,
    ownerEmployeeId: row.ownerEmployeeId,
    ownerEmployeeNumber: row.owner?.employeeId ?? null,
    ownerEmployeeName: row.owner?.name ?? null,
    collaborationId: row.collaborationId,
    collaborationTitle: row.collaboration?.title ?? null,
    collaborationResponsibleDepartmentId: row.collaboration?.responsibleDepartment.id ?? null,
    collaborationResponsibleDepartmentName: row.collaboration?.responsibleDepartment.name ?? null,
    actualStartDate: formatDate(row.actualStartDate),
    actualEndDate: formatDate(row.actualEndDate),
    plannedStartDate: formatDate(row.plannedStartDate),
    plannedEndDate: formatDate(row.plannedEndDate),
    isMilestone: row.isMilestone,
    milestoneDate: formatDate(row.milestoneDate),
    completedAt: row.completedAt?.toISOString() ?? null,
    periodType: row.periodType,
    periodStart: formatDate(row.periodStart),
    periodEnd: formatDate(row.periodEnd),
    sourceType: normalizeWorkSourceType(row.sourceType),
    sourceKind: row.sourceKind,
    sourceMeetingId: row.sourceMeetingId,
    sourceMeetingTitle: row.sourceMeeting?.title ?? null,
    sourceMeetingStartAt: formatDate(row.sourceMeeting?.startAt),
    sourceMeetingDecisionId: row.sourceMeetingDecisionId,
    sourceMeetingDecisionTitle: row.sourceMeetingDecision?.title ?? null,
    sourceMeetingDecisionKind: row.sourceMeetingDecision?.kind ?? null,
    sourceMeetingActionCandidateId: row.sourceMeetingActionCandidateId,
    sourceMeetingActionCandidateTitle: row.sourceMeetingActionCandidate?.title ?? null,
    sourceDepartmentId: row.sourceDepartmentId,
    sourceDepartmentName: row.sourceDepartment?.name ?? null,
    sourceDepartmentCode: row.sourceDepartment?.code ?? null,
    linkedProjectId: row.linkedProjectId,
    linkedProjectName: row.linkedProject?.name ?? null,
    linkedProjectCode: row.linkedProject?.code ?? null,
    linkedProjectPhaseId: row.linkedProjectPhaseId,
    linkedProjectPhaseName: row.linkedProjectPhase?.name ?? null,
    parentWorkItemId: row.parentWorkItemId,
    parentWorkItemContent: row.parentWorkItem?.content ?? null,
    parentPeriodWorkItemId: row.parentPeriodWorkItemId,
    parentPeriodWorkItemContent: row.parentPeriodWorkItem?.content ?? null,
    parentPeriodWorkItemType: row.parentPeriodWorkItem?.itemType ?? null,
    parentPeriodWorkItemCycleLabel: row.parentPeriodWorkItem?.plan?.okrCycle?.label ?? null,
    parentPeriodWorkItemTargetType: row.parentPeriodWorkItem?.plan?.targetType ?? null,
    parentPeriodWorkItemTargetId: row.parentPeriodWorkItem?.plan?.targetId ?? null,
    parentPeriodWorkItemKrTargetValue: row.parentPeriodWorkItem?.krTargetValue ?? null,
    parentPeriodWorkItemKrCurrentValue: row.parentPeriodWorkItem?.krCurrentValue ?? null,
    parentPeriodWorkItemKrUnit: row.parentPeriodWorkItem?.krUnit ?? null,
    previousPeriodWorkItemId: row.previousPeriodWorkItemId,
    previousPeriodWorkItemContent: row.previousPeriodWorkItem?.content ?? null,
    previousPeriodWorkItemCycleLabel: row.previousPeriodWorkItem?.plan?.okrCycle?.label ?? null,
    ...responsibility,
    evidenceTaskIds: row.krEvidenceTasks.map((evidence) => evidence.taskWorkItemId),
    evidenceTasks: row.krEvidenceTasks.map((evidence) => ({
      taskWorkItemId: evidence.taskWorkItemId,
      note: evidence.note,
      sortOrder: evidence.sortOrder,
    })),
    isArchived: row.isArchived,
    isPrivate: row.isPrivate,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    participants: row.participants.map((participant) => ({
      id: participant.id,
      workItemId: participant.workItemId,
      name: participant.name,
      wxUserId: participant.wxUserId,
      createdAt: participant.createdAt.toISOString(),
    })),
  };
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return null;
  return new Date(value).toISOString().slice(0, 10);
}

function normalizeWorkStatus(status: string | null) {
  if (status === "done" || status === "paused") return status;
  return "active";
}

function normalizeWorkSourceType(sourceType: string | null) {
  if (sourceType === "department" || sourceType === "project" || sourceType === "meeting" || sourceType === "other") return sourceType;
  return "other";
}

function normalizeRoutineTaskType(value: string | null) {
  if (value === "standing" || value === "task") return value;
  return null;
}

function normalizeRoutineRecurrenceType(value: string | null) {
  if (value === "daily" || value === "weekly" || value === "monthly" || value === "quarterly" || value === "yearly") return value;
  return null;
}
