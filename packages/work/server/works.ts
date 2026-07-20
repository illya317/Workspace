import { Prisma, prisma } from "@workspace/platform/server/prisma";
import type { DomainServiceResult } from "@workspace/platform/server/domain-validation";
import { runSerializableTransaction } from "@workspace/platform/server/serializable-transaction";
import {
  buildWorkItemCreateCommand,
  buildWorkItemUpdateCommand,
  validateWorkItemDeleteCommand,
  type WorkItemUpdateCommand,
} from "./domain/work-item-validation";
import { validateWorkItemRelations } from "./domain/work-item-relation-validation";
import { effectiveWorkItemRelationInput, sourcePatchTouched } from "./domain/work-item-relation-state";
import { normalizeEvidenceTaskIds, replaceKrEvidenceTasks, WorkKrEvidenceValidationError } from "./work-kr-evidence";
import { toWorkItemDto, workItemInclude } from "./work-item-dto";
import { assertWorkItemStageAllowed } from "./work-okr-stage";
import { replaceWorkResponsibilityReference } from "./work-responsibility-references";
import { buildStatusPatch, validateWorkItemPeriodPatch, validateWorkItemResponsibility } from "./work-item-service-helpers";
import { validateWorkItemPeriodRelations } from "./work-period-relations";
import { archiveWorkItem, deleteWorkItemRecord, restoreArchivedWorkItem } from "./work-item-archive";
import { assertWorkItemMutationCommitAllowed, type WorkItemMutationAuthorization } from "./work-item-mutation-guard";
import { closeOkrPlanIfAllItemsComplete, shouldRecalculateOkrPlanCompletion } from "./domain/work-plan-item-state";
export function parseParticipants(input?: string): string[] {
  if (!input) return [];
  return input
    .split(/,|，/)
    .map((name) => name.trim())
    .filter(Boolean);
}
import {
  validateWorkItemCompletion,
  validateWorkItemParentStateInvariant,
  WorkCompletionPolicyError,
} from "./domain/work-completion-policy";
import {
  buildAuditedWorkMutationImpactEngine,
  mutationImpactServiceError,
  workItemMutationRoot,
  type WorkMutationImpactContext,
} from "./work-mutation-impact";
export async function getWorkItems(opts: {
  planId?: number | null;
  targetType: string;
  targetId: number;
  category?: string;
  periodType?: string | null;
  periodStart?: string | null;
  includeArchived?: boolean;
}) {
  const where: { planId?: number; targetType: string; targetId: number; category?: string; periodType?: string | null; periodStart?: Date; isArchived?: boolean } = {
    targetType: opts.targetType,
    targetId: opts.targetId,
  };
  if (opts.planId) where.planId = opts.planId;
  if (opts.category) where.category = opts.category;
  if (opts.periodType !== undefined) where.periodType = opts.periodType || null;
  if (opts.periodStart) where.periodStart = new Date(opts.periodStart);
  if (!opts.includeArchived) where.isArchived = false;
  const rows = await prisma.workItem.findMany({
    where,
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    include: workItemInclude,
  });
  return rows.map(toWorkItemDto);
}

type WorkItemServiceCreateInput = Parameters<typeof buildWorkItemCreateCommand>[0] & {
  actorUserId?: number | null;
  ownerEligibilityUserId?: number | null;
  mutationAuthorization?: WorkItemMutationAuthorization;
  evidenceTaskIds?: number[];
};

export async function createWorkItem(opts: WorkItemServiceCreateInput): Promise<DomainServiceResult<unknown>> {
  const command = buildWorkItemCreateCommand(opts);
  if (!command.ok) return { ok: false, error: command.issue.message, status: command.issue.status };
  const workflowGuard = await assertWorkItemMutationCommitAllowed({ operation: "create", actorUserId: opts.actorUserId, targetType: command.data.targetType, targetId: command.data.targetId, authorization: opts.mutationAuthorization });
  if (!workflowGuard.ok) return workflowGuard;
  const relationError = await validateWorkItemRelations({
    ...command.data,
    actorUserId: opts.actorUserId,
    ownerEligibilityUserId: opts.ownerEligibilityUserId,
  });
  if (relationError) return { ok: false, error: relationError, status: 400 };
  const periodRelationError = await validateWorkItemPeriodRelations({
    ...command.data,
    actorUserId: opts.actorUserId,
  });
  if (periodRelationError) return { ok: false, error: periodRelationError, status: 400 };
  const stageGuard = await assertWorkItemStageAllowed({
    action: "create",
    planId: command.data.planId,
    itemType: command.data.itemType,
    actorUserId: opts.actorUserId,
    changesKrCurrentValue: command.data.itemType === "key_result" && command.data.krCurrentValue !== null,
  });
  if (!stageGuard.ok) return stageGuard;
  const evidenceTaskIds = normalizeEvidenceTaskIds(opts.evidenceTaskIds);
  if (evidenceTaskIds !== undefined && command.data.itemType !== "key_result") {
    return { ok: false, error: "只有 KR 可以关联任务证据", status: 400 };
  }
  const responsibilityError = await validateWorkItemResponsibility({
    planId: command.data.planId,
    itemType: command.data.itemType,
    category: command.data.category,
    routineTaskType: command.data.routineTaskType,
    ownerEmployeeId: command.data.ownerEmployeeId,
    responsibilityNodeId: command.data.responsibilityNodeId,
    responsibilityPositionId: command.data.responsibilityPositionId,
    responsibilityTouched: true,
  });
  if (responsibilityError) return { ok: false, error: responsibilityError, status: 400 };
  const data: Prisma.WorkItemUncheckedCreateInput = {
    planId: command.data.planId,
    targetType: command.data.targetType,
    targetId: command.data.targetId,
    category: command.data.category,
    itemType: command.data.itemType,
    content: command.data.content,
    description: command.data.description,
    importance: command.data.importance,
    urgency: command.data.urgency,
    status: command.data.status,
    completedAt: command.data.status === "done" ? new Date() : null,
    krStartValue: command.data.krStartValue,
    krTargetValue: command.data.krTargetValue,
    krCurrentValue: command.data.krCurrentValue,
    krUnit: command.data.krUnit,
    routineTaskType: command.data.routineTaskType,
    routineRecurrenceType: command.data.routineRecurrenceType,
    routineRecurrenceTime: command.data.routineRecurrenceTime,
    routineRecurrenceWeekday: command.data.routineRecurrenceWeekday,
    routineRecurrenceMonthDay: command.data.routineRecurrenceMonthDay,
    routineRecurrenceQuarterDay: command.data.routineRecurrenceQuarterDay,
    routineRecurrenceYearMonth: command.data.routineRecurrenceYearMonth,
    routineRecurrenceYearDay: command.data.routineRecurrenceYearDay,
    ownerEmployeeId: command.data.ownerEmployeeId,
    collaborationId: command.data.collaborationId,
    actualStartDate: command.data.actualStartDate,
    actualEndDate: command.data.actualEndDate,
    plannedStartDate: command.data.plannedStartDate,
    plannedEndDate: command.data.plannedEndDate,
    isMilestone: command.data.isMilestone,
    milestoneDate: command.data.milestoneDate,
    periodType: command.data.periodType,
    periodStart: command.data.periodStart,
    periodEnd: command.data.periodEnd,
    sourceType: command.data.sourceType,
    sourceKind: command.data.sourceKind,
    sourceMeetingId: command.data.sourceMeetingId,
    sourceMeetingDecisionId: command.data.sourceMeetingDecisionId,
    sourceMeetingActionCandidateId: command.data.sourceMeetingActionCandidateId,
    sourceDepartmentId: command.data.sourceDepartmentId,
    linkedProjectId: command.data.linkedProjectId,
    linkedProjectPhaseId: command.data.linkedProjectPhaseId,
    parentWorkItemId: command.data.parentWorkItemId,
    parentPeriodWorkItemId: command.data.parentPeriodWorkItemId,
    previousPeriodWorkItemId: command.data.previousPeriodWorkItemId,
    isArchived: false,
    sortOrder: command.data.sortOrder,
  };
  try {
    const work = await runSerializableTransaction(async (tx) => {
      const invariantError = await validateWorkItemParentStateInvariant(tx, {
        planId: command.data.planId,
        parentWorkItemId: command.data.parentWorkItemId,
        targetType: command.data.targetType,
        targetId: command.data.targetId,
        status: command.data.status,
      });
      if (invariantError) throw new WorkCompletionPolicyError(invariantError);
      const created = await tx.workItem.create({
        data: {
          ...data,
          participants:
            command.data.participants.length > 0
              ? { create: command.data.participants.map((name) => ({ name })) }
              : undefined,
        },
        select: { id: true },
      });
      const evidenceError = await replaceKrEvidenceTasks(tx, {
        krWorkItemId: created.id,
        planId: command.data.planId,
        objectiveId: command.data.parentWorkItemId,
        evidenceTaskIds,
      });
      if (evidenceError) throw new WorkKrEvidenceValidationError(evidenceError);
      if (command.data.status === "done") {
        const completionError = await validateWorkItemCompletion(tx, created.id);
        if (completionError) throw new WorkCompletionPolicyError(completionError);
      }
      await replaceWorkResponsibilityReference(tx, {
        targetKind: "work_item",
        referenceRole: "execution",
        workItemId: created.id,
      }, {
        responsibilityNodeId: command.data.responsibilityNodeId,
        ownerEmployeeId: command.data.ownerEmployeeId,
        positionId: command.data.responsibilityPositionId,
      });
      if (command.data.status === "done" && command.data.planId) {
        await closeOkrPlanIfAllItemsComplete(tx, command.data.planId);
      }
      return tx.workItem.findUniqueOrThrow({
        where: { id: created.id },
        include: workItemInclude,
      });
    });
    return { ok: true, data: toWorkItemDto(work) };
  } catch (error) {
    if (error instanceof WorkKrEvidenceValidationError) return { ok: false, error: error.message, status: 400 };
    if (error instanceof WorkCompletionPolicyError) return { ok: false, error: error.message, status: 409 };
    const impactError = mutationImpactServiceError(error);
    if (impactError) return impactError;
    throw error;
  }
}
export async function getWorkItemTargetMetadata(workId: number) {
  return prisma.workItem.findUnique({
    where: { id: workId },
    select: {
      targetType: true,
      targetId: true,
      planId: true,
    },
  });
}
export async function updateWorkItem(
  workId: number,
  opts: WorkItemUpdateCommand["data"] & {
    actorUserId?: number | null;
    ownerEligibilityUserId?: number | null;
    mutationAuthorization?: WorkItemMutationAuthorization;
    evidenceTaskIds?: number[];
    isArchived?: boolean;
  },
): Promise<DomainServiceResult<unknown>> {
  const { actorUserId, ownerEligibilityUserId, mutationAuthorization, ...itemPatch } = opts;
  const existing = await prisma.workItem.findUnique({
    where: { id: workId },
    select: {
      targetType: true,
      targetId: true,
      planId: true,
      category: true,
      itemType: true,
      routineTaskType: true,
      routineRecurrenceType: true,
      routineRecurrenceTime: true,
      routineRecurrenceWeekday: true,
      routineRecurrenceMonthDay: true,
      routineRecurrenceQuarterDay: true,
      routineRecurrenceYearMonth: true,
      routineRecurrenceYearDay: true,
      actualStartDate: true,
      actualEndDate: true,
      plannedStartDate: true,
      plannedEndDate: true,
      sourceType: true,
      sourceKind: true,
      sourceMeetingId: true,
      sourceMeetingDecisionId: true,
      sourceMeetingActionCandidateId: true,
      sourceDepartmentId: true,
      linkedProjectId: true,
      linkedProjectPhaseId: true,
      parentWorkItemId: true,
      parentPeriodWorkItemId: true,
      previousPeriodWorkItemId: true,
      periodType: true,
      periodStart: true,
      periodEnd: true,
      ownerEmployeeId: true,
      collaborationId: true,
      status: true, completedAt: true,
      content: true, isArchived: true, updatedAt: true, krCurrentValue: true,
      isMilestone: true,
      milestoneDate: true,
    },
  });
  if (!existing?.targetId) return { ok: false, error: "工作项不存在", status: 404 };
  if (isArchiveLifecycleOnlyWorkItemPatch(itemPatch)) {
    const archive = itemPatch.isArchived as boolean;
    if (archive) {
      if (!actorUserId) return { ok: false, error: "归档工作项缺少操作人", status: 401 };
      const archiveResult = await archiveWorkItem(workId, actorUserId);
      if (!archiveResult.ok) return archiveResult;
    } else {
      if (!actorUserId) return { ok: false, error: "恢复工作项缺少操作人", status: 401 };
      const restoreResult = await restoreArchivedWorkItem(workId, actorUserId);
      if (!restoreResult.ok) return restoreResult;
    }
    const work = await prisma.workItem.findUniqueOrThrow({
      where: { id: workId },
      include: workItemInclude,
    });
    return { ok: true, data: toWorkItemDto(work) };
  }
  const workflowGuard = await assertWorkItemMutationCommitAllowed({ operation: "update", actorUserId, targetType: existing.targetType, targetId: existing.targetId, authorization: mutationAuthorization });
  if (!workflowGuard.ok) return workflowGuard;
  const command = buildWorkItemUpdateCommand(workId, itemPatch, existing);
  if (!command.ok) return { ok: false, error: command.issue.message, status: command.issue.status };
  const effective = effectiveWorkItemRelationInput(existing, command.data.data);
  if (sourcePatchTouched(command.data.data) && command.data.data.sourceKind === undefined) {
    command.data.data.sourceKind = effective.sourceKind;
  }
  const relationError = await validateWorkItemRelations({
    targetType: existing.targetType,
    targetId: existing.targetId,
    currentWorkId: command.data.workId,
    status: command.data.data.status === undefined ? existing.status : command.data.data.status,
    ownerEmployeeId: command.data.data.ownerEmployeeId,
    collaborationId: command.data.data.collaborationId === undefined ? existing.collaborationId : command.data.data.collaborationId,
    actorUserId,
    ownerEligibilityUserId,
    ...effective,
  });
  if (relationError) return { ok: false, error: relationError, status: 400 };
  const periodRelationError = await validateWorkItemPeriodRelations({
    actorUserId,
    targetType: existing.targetType,
    targetId: existing.targetId,
    currentWorkId: command.data.workId,
    planId: effective.planId,
    category: command.data.data.category ?? existing.category,
    itemType: effective.itemType,
    parentWorkItemId: effective.parentWorkItemId,
    parentPeriodWorkItemId: command.data.data.parentPeriodWorkItemId === undefined ? existing.parentPeriodWorkItemId : command.data.data.parentPeriodWorkItemId,
    previousPeriodWorkItemId: command.data.data.previousPeriodWorkItemId === undefined ? existing.previousPeriodWorkItemId : command.data.data.previousPeriodWorkItemId,
  });
  if (periodRelationError) return { ok: false, error: periodRelationError, status: 400 };
  const stageGuard = await assertWorkItemStageAllowed({
    action: "update",
    planId: effective.planId,
    itemType: effective.itemType,
    actorUserId,
    changesKrCurrentValue: effective.itemType === "key_result"
      && command.data.data.krCurrentValue !== undefined
      && command.data.data.krCurrentValue !== existing.krCurrentValue,
  });
  if (!stageGuard.ok) return stageGuard;
  const evidenceTaskIds = normalizeEvidenceTaskIds(opts.evidenceTaskIds);
  if (evidenceTaskIds !== undefined && effective.itemType !== "key_result") {
    return { ok: false, error: "只有 KR 可以关联任务证据", status: 400 };
  }
  const responsibilityTouched = Object.prototype.hasOwnProperty.call(command.data.data, "responsibilityNodeId");
  const responsibilityError = await validateWorkItemResponsibility({
    planId: effective.planId,
    itemType: effective.itemType,
    category: command.data.data.category ?? existing.category,
    routineTaskType: command.data.data.routineTaskType ?? existing.routineTaskType,
    ownerEmployeeId: command.data.data.ownerEmployeeId === undefined ? existing.ownerEmployeeId : command.data.data.ownerEmployeeId,
    responsibilityNodeId: command.data.data.responsibilityNodeId,
    responsibilityPositionId: command.data.data.responsibilityPositionId,
    responsibilityTouched,
  });
  if (responsibilityError) return { ok: false, error: responsibilityError, status: 400 };
  const periodError = validateWorkItemPeriodPatch(existing, command.data.data);
  if (periodError) return { ok: false, error: periodError, status: 400 };
  const statusPatch = buildStatusPatch(command.data.data.status, command.data.data.isArchived, existing);
  const data: Prisma.WorkItemUncheckedUpdateInput = {
    ...(command.data.data.category !== undefined && { category: command.data.data.category }),
    ...(command.data.data.planId !== undefined && { planId: command.data.data.planId }),
    ...(command.data.data.itemType !== undefined && { itemType: command.data.data.itemType }),
    ...(command.data.data.content !== undefined && { content: command.data.data.content }),
    ...(command.data.data.description !== undefined && { description: command.data.data.description }),
    ...(command.data.data.importance !== undefined && { importance: command.data.data.importance }),
    ...(command.data.data.urgency !== undefined && { urgency: command.data.data.urgency }),
    ...(command.data.data.krStartValue !== undefined && { krStartValue: command.data.data.krStartValue }),
    ...(command.data.data.krTargetValue !== undefined && { krTargetValue: command.data.data.krTargetValue }),
    ...(command.data.data.krCurrentValue !== undefined && { krCurrentValue: command.data.data.krCurrentValue }),
    ...(command.data.data.krUnit !== undefined && { krUnit: command.data.data.krUnit }),
    ...(command.data.data.routineTaskType !== undefined && { routineTaskType: command.data.data.routineTaskType }),
    ...(command.data.data.routineRecurrenceType !== undefined && { routineRecurrenceType: command.data.data.routineRecurrenceType }),
    ...(command.data.data.routineRecurrenceTime !== undefined && { routineRecurrenceTime: command.data.data.routineRecurrenceTime }),
    ...(command.data.data.routineRecurrenceWeekday !== undefined && { routineRecurrenceWeekday: command.data.data.routineRecurrenceWeekday }),
    ...(command.data.data.routineRecurrenceMonthDay !== undefined && { routineRecurrenceMonthDay: command.data.data.routineRecurrenceMonthDay }),
    ...(command.data.data.routineRecurrenceQuarterDay !== undefined && { routineRecurrenceQuarterDay: command.data.data.routineRecurrenceQuarterDay }),
    ...(command.data.data.routineRecurrenceYearMonth !== undefined && { routineRecurrenceYearMonth: command.data.data.routineRecurrenceYearMonth }),
    ...(command.data.data.routineRecurrenceYearDay !== undefined && { routineRecurrenceYearDay: command.data.data.routineRecurrenceYearDay }),
    ...(command.data.data.ownerEmployeeId !== undefined && { ownerEmployeeId: command.data.data.ownerEmployeeId }),
    ...(command.data.data.collaborationId !== undefined && { collaborationId: command.data.data.collaborationId }),
    ...(command.data.data.actualStartDate !== undefined && { actualStartDate: command.data.data.actualStartDate }),
    ...(command.data.data.actualEndDate !== undefined && { actualEndDate: command.data.data.actualEndDate }),
    ...(command.data.data.plannedStartDate !== undefined && { plannedStartDate: command.data.data.plannedStartDate }),
    ...(command.data.data.plannedEndDate !== undefined && { plannedEndDate: command.data.data.plannedEndDate }),
    ...(command.data.data.isMilestone !== undefined && { isMilestone: command.data.data.isMilestone }),
    ...(command.data.data.milestoneDate !== undefined && { milestoneDate: command.data.data.milestoneDate }),
    ...(command.data.data.periodType !== undefined && { periodType: command.data.data.periodType }),
    ...(command.data.data.periodStart !== undefined && { periodStart: command.data.data.periodStart }),
    ...(command.data.data.periodEnd !== undefined && { periodEnd: command.data.data.periodEnd }),
    ...(command.data.data.sourceType !== undefined && { sourceType: command.data.data.sourceType }),
    ...(command.data.data.sourceKind !== undefined && { sourceKind: command.data.data.sourceKind }),
    ...(command.data.data.sourceMeetingId !== undefined && { sourceMeetingId: command.data.data.sourceMeetingId }),
    ...(command.data.data.sourceMeetingDecisionId !== undefined && { sourceMeetingDecisionId: command.data.data.sourceMeetingDecisionId }),
    ...(command.data.data.sourceMeetingActionCandidateId !== undefined && { sourceMeetingActionCandidateId: command.data.data.sourceMeetingActionCandidateId }),
    ...(command.data.data.sourceDepartmentId !== undefined && { sourceDepartmentId: command.data.data.sourceDepartmentId }),
    ...(command.data.data.linkedProjectId !== undefined && { linkedProjectId: command.data.data.linkedProjectId }),
    ...(command.data.data.linkedProjectPhaseId !== undefined && { linkedProjectPhaseId: command.data.data.linkedProjectPhaseId }),
    ...(command.data.data.parentWorkItemId !== undefined && { parentWorkItemId: command.data.data.parentWorkItemId }),
    ...(command.data.data.parentPeriodWorkItemId !== undefined && { parentPeriodWorkItemId: command.data.data.parentPeriodWorkItemId }),
    ...(command.data.data.previousPeriodWorkItemId !== undefined && { previousPeriodWorkItemId: command.data.data.previousPeriodWorkItemId }),
    ...(command.data.data.sortOrder !== undefined && { sortOrder: command.data.data.sortOrder }),
    ...statusPatch,
  };
  if (command.data.data.participants !== undefined) {
    data.participants = {
      deleteMany: {},
      create: command.data.data.participants.map((name) => ({ name })),
    };
  }
  const nextStatus = command.data.data.status === undefined ? existing.status : command.data.data.status;
  const completingItem = shouldRecalculateOkrPlanCompletion(existing.status, nextStatus);
  try {
    const work = await runSerializableTransaction(async (tx) => {
      const commit = async () => {
        const invariantError = await validateWorkItemParentStateInvariant(tx, {
          planId: effective.planId,
          parentWorkItemId: effective.parentWorkItemId,
          targetType: existing.targetType,
          targetId: Number(existing.targetId),
          status: nextStatus,
        });
        if (invariantError) throw new WorkCompletionPolicyError(invariantError);
        await tx.workItem.update({
          where: completingItem
            ? { id: command.data.workId, updatedAt: existing.updatedAt }
            : { id: command.data.workId },
          data,
        });
        const evidenceError = await replaceKrEvidenceTasks(tx, {
          krWorkItemId: command.data.workId,
          planId: effective.planId,
          objectiveId: effective.parentWorkItemId,
          evidenceTaskIds,
        });
        if (evidenceError) throw new WorkKrEvidenceValidationError(evidenceError);
        if (responsibilityTouched) {
          await replaceWorkResponsibilityReference(tx, {
            targetKind: "work_item",
            referenceRole: "execution",
            workItemId: command.data.workId,
          }, {
            responsibilityNodeId: command.data.data.responsibilityNodeId,
            ownerEmployeeId: command.data.data.ownerEmployeeId === undefined ? existing.ownerEmployeeId : command.data.data.ownerEmployeeId,
            positionId: command.data.data.responsibilityPositionId,
          });
        }
        if (completingItem && effective.planId) {
          await closeOkrPlanIfAllItemsComplete(tx, effective.planId);
        }
        return tx.workItem.findUniqueOrThrow({
          where: { id: command.data.workId },
          include: workItemInclude,
        });
      };
      if (!completingItem) return commit();
      const context: WorkMutationImpactContext = {
        tx,
        actorUserId: actorUserId ?? null,
        scopeType: existing.targetType,
        scopeId: String(existing.targetId),
        pendingEvidenceTaskIds: evidenceTaskIds,
      };
      return buildAuditedWorkMutationImpactEngine(context).execute({
        context,
        actorKey: actorUserId ? `user:${actorUserId}` : "system",
        scopeKey: `${existing.targetType}:${existing.targetId}`,
        root: workItemMutationRoot({ item: { id: command.data.workId, ...existing } }),
        commitRoot: commit,
      });
    });
    return { ok: true, data: toWorkItemDto(work) };
  } catch (error) {
    if (error instanceof WorkKrEvidenceValidationError) return { ok: false, error: error.message, status: 400 };
    if (error instanceof WorkCompletionPolicyError) return { ok: false, error: error.message, status: 409 };
    const impactError = mutationImpactServiceError(error);
    if (impactError) return impactError;
    throw error;
  }
}
function isArchiveLifecycleOnlyWorkItemPatch(patch: Record<string, unknown>) {
  return typeof patch.isArchived === "boolean" && Object.keys(patch).every((key) => key === "isArchived");
}
export async function deleteWorkItem(workId: number, actorUserId: number): Promise<DomainServiceResult<{ success: true }>> {
  const command = validateWorkItemDeleteCommand(workId);
  if (!command.ok) return { ok: false, error: command.issue.message, status: command.issue.status };
  const existing = await prisma.workItem.findUnique({
    where: { id: command.data.workId },
    select: { planId: true, itemType: true },
  });
  if (!existing) return { ok: false, error: "工作项不存在", status: 404 };
  const stageGuard = await assertWorkItemStageAllowed({ action: "delete", planId: existing.planId, itemType: existing.itemType, actorUserId });
  if (!stageGuard.ok) return stageGuard;
  const deleteResult = await deleteWorkItemRecord(command.data.workId, actorUserId);
  if (!deleteResult.ok) return deleteResult;
  return { ok: true, data: { success: true } };
}
