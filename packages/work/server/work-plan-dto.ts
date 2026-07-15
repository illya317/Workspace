import { Prisma } from "@workspace/platform/server/prisma";
import { resolveWorkPlanMaintenance } from "./domain/work-plan-maintenance-policy";
import { effectiveWorkOkrStage } from "./work-okr-stage";
import type { WorkPlanItemStatusCounts } from "./domain/work-plan-item-state";

export const workPlanInclude = {
  owner: { select: { id: true, employeeId: true, name: true } },
  collaboration: { select: { id: true, title: true, responsibleDepartment: { select: { id: true, name: true } } } },
  okrCycle: { select: { id: true, code: true, label: true, periodType: true, startDate: true, endDate: true } },
  sourcePlan: { select: { id: true, title: true, periodType: true, actualStartDate: true, actualEndDate: true, okrCycle: { select: { label: true } } } },
  parentPeriodPlan: { select: { id: true, title: true, okrCycle: { select: { label: true } } } },
  previousPeriodPlan: { select: { id: true, title: true, okrCycle: { select: { label: true } } } },
  planAlignments: {
    where: { relationKind: "decompose" },
    orderBy: [{ sortOrder: "asc" as const }, { id: "asc" as const }],
    select: {
      sourceType: true,
      sourcePlanId: true,
      sourceWorkItemId: true,
      sourcePlan: { select: { id: true, title: true, targetType: true, targetId: true, periodType: true, actualStartDate: true, actualEndDate: true, okrCycle: { select: { label: true } } } },
      sourceWorkItem: { select: { id: true, content: true, itemType: true, targetType: true, targetId: true, krTargetValue: true, krUnit: true, plan: { select: { title: true, okrCycle: { select: { label: true } } } } } },
    },
  },
  linkedProject: { select: { id: true, code: true, name: true } },
  linkedProjectPhase: { select: { id: true, name: true, projectId: true } },
  sourceMeeting: { select: { id: true, title: true, startAt: true } },
  sourceMeetingDecision: { select: { id: true, title: true, kind: true } },
  sourceMeetingActionCandidate: { select: { id: true, title: true } },
  sourceDepartment: { select: { id: true, code: true, name: true } },
  _count: { select: { items: true } },
} satisfies Prisma.WorkPlanInclude;

export type WorkPlanRow = Prisma.WorkPlanGetPayload<{ include: typeof workPlanInclude }>;

export function toWorkPlanDto(row: WorkPlanRow, input: {
  itemStatusCounts?: WorkPlanItemStatusCounts;
} = {}) {
  const alignment = row.planAlignments[0] ?? null;
  const okrStage = effectiveWorkOkrStage(row);
  return {
    id: row.id,
    targetType: row.targetType,
    targetId: row.targetId,
    kind: row.kind,
    title: row.title,
    description: row.description,
    status: row.status,
    isArchived: row.isArchived,
    okrStage,
    maintenance: resolveWorkPlanMaintenance({
      kind: row.kind,
      stage: okrStage,
      status: row.status,
      isArchived: row.isArchived,
    }),
    objectiveSubmittedAt: row.objectiveSubmittedAt?.toISOString() ?? null,
    objectiveApprovedAt: row.objectiveApprovedAt?.toISOString() ?? null,
    objectiveApprovedByUserId: row.objectiveApprovedByUserId,
    krReviewOpensAt: row.krReviewOpensAt?.toISOString() ?? null,
    krSubmittedAt: row.krSubmittedAt?.toISOString() ?? null,
    krApprovedAt: row.krApprovedAt?.toISOString() ?? null,
    krApprovedByUserId: row.krApprovedByUserId,
    ownerEmployeeId: row.ownerEmployeeId,
    ownerEmployeeNumber: row.owner?.employeeId ?? null,
    ownerEmployeeName: row.owner?.name ?? null,
    collaborationId: row.collaborationId,
    collaborationTitle: row.collaboration?.title ?? null,
    collaborationResponsibleDepartmentId: row.collaboration?.responsibleDepartment.id ?? null,
    collaborationResponsibleDepartmentName: row.collaboration?.responsibleDepartment.name ?? null,
    isSystemGenerated: row.isSystemGenerated,
    okrCycleId: row.okrCycleId,
    okrCycleCode: row.okrCycle?.code ?? null,
    okrCycleLabel: row.okrCycle?.label ?? null,
    okrControlScopeType: row.okrControlScopeType,
    okrControlScopeId: row.okrControlScopeId,
    governanceMode: row.governanceMode,
    governanceRevision: row.governanceRevision,
    governanceActionKey: row.governanceActionKey,
    governanceWorkflowPolicyId: row.governanceWorkflowPolicyId,
    governanceWorkflowVersion: row.governanceWorkflowVersion,
    governanceActionContractVersion: row.governanceActionContractVersion,
    governanceOkrControlVersion: row.governanceOkrControlVersion,
    governanceBindingSource: row.governanceBindingSource,
    governanceBoundAt: row.governanceBoundAt?.toISOString() ?? null,
    sourcePlanId: row.sourcePlanId,
    sourcePlanTitle: row.sourcePlan?.title ?? null,
    sourcePlanCycleLabel: row.sourcePlan?.okrCycle?.label ?? getWorkPeriodLabelFromParts(row.sourcePlan?.periodType, row.sourcePlan?.actualStartDate, row.sourcePlan?.actualEndDate),
    parentPeriodPlanId: row.parentPeriodPlanId,
    parentPeriodPlanTitle: row.parentPeriodPlan?.title ?? null,
    parentPeriodPlanCycleLabel: row.parentPeriodPlan?.okrCycle?.label ?? null,
    alignmentSourceType: normalizeAlignmentSourceType(alignment?.sourceType, alignment?.sourceWorkItem?.itemType),
    alignmentSourcePlanId: alignment?.sourcePlanId ?? null,
    alignmentSourcePlanTitle: alignment?.sourcePlan?.title ?? null,
    alignmentSourcePlanTargetType: alignment?.sourcePlan?.targetType ?? null,
    alignmentSourcePlanTargetId: alignment?.sourcePlan?.targetId ?? null,
    alignmentSourcePlanCycleLabel: alignment?.sourcePlan?.okrCycle?.label ?? getWorkPeriodLabelFromParts(alignment?.sourcePlan?.periodType, alignment?.sourcePlan?.actualStartDate, alignment?.sourcePlan?.actualEndDate),
    alignmentSourceWorkItemId: alignment?.sourceWorkItemId ?? null,
    alignmentSourceWorkItemContent: alignment?.sourceWorkItem?.content ?? null,
    alignmentSourceWorkItemTargetType: alignment?.sourceWorkItem?.targetType ?? null,
    alignmentSourceWorkItemTargetId: alignment?.sourceWorkItem?.targetId ?? null,
    alignmentSourceWorkItemCycleLabel: alignment?.sourceWorkItem?.plan?.okrCycle?.label ?? null,
    alignmentSourceWorkItemPlanTitle: alignment?.sourceWorkItem?.plan?.title ?? null,
    alignmentSourceWorkItemKrTargetValue: alignment?.sourceWorkItem?.krTargetValue ?? null,
    alignmentSourceWorkItemKrUnit: alignment?.sourceWorkItem?.krUnit ?? null,
    previousPeriodPlanId: row.previousPeriodPlanId,
    previousPeriodPlanTitle: row.previousPeriodPlan?.title ?? null,
    previousPeriodPlanCycleLabel: row.previousPeriodPlan?.okrCycle?.label ?? null,
    objectiveApprovalSnapshotJson: row.objectiveApprovalSnapshotJson,
    krApprovalSnapshotJson: row.krApprovalSnapshotJson,
    periodType: row.periodType,
    actualStartDate: formatDate(row.actualStartDate),
    actualEndDate: formatDate(row.actualEndDate),
    plannedStartDate: formatDate(row.plannedStartDate),
    plannedEndDate: formatDate(row.plannedEndDate),
    isMilestone: row.isMilestone,
    milestoneDate: formatDate(row.milestoneDate),
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
    itemCount: row._count.items,
    itemStatusCounts: input.itemStatusCounts ?? { active: 0, done: 0, archived: 0 },
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function normalizeAlignmentSourceType(sourceType: string | null | undefined, itemType: string | null | undefined) {
  if (sourceType === "plan") return "plan";
  if (sourceType === "objective" || itemType === "objective") return "objective";
  if (sourceType === "key_result" || itemType === "key_result") return "key_result";
  return null;
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return null;
  return new Date(value).toISOString().slice(0, 10);
}

function getWorkPeriodLabelFromParts(periodType: string | null | undefined, actualStartDate: Date | null | undefined, actualEndDate: Date | null | undefined) {
  if (!periodType) return null;
  const start = formatDate(actualStartDate);
  const end = formatDate(actualEndDate);
  return [periodType, start && end ? `${start} - ${end}` : null].filter(Boolean).join(" · ");
}

function normalizeWorkSourceType(sourceType: string | null | undefined) {
  if (sourceType === "department" || sourceType === "project" || sourceType === "meeting" || sourceType === "other") return sourceType;
  return "other";
}
