import { Prisma, prisma } from "@workspace/platform/server/prisma";
import type { DomainServiceResult } from "@workspace/platform/server/domain-validation";
import {
  buildWorkItemCreateCommand,
  buildWorkItemUpdateCommand,
  validateWorkItemDeleteCommand,
} from "./domain/work-item-validation";
import { validateWorkItemRelations } from "./domain/work-item-relation-validation";

export function parseParticipants(input?: string): string[] {
  if (!input) return [];
  return input
    .split(/,|，/)
    .map((name) => name.trim())
    .filter(Boolean);
}

export async function getWorkItems(opts: {
  targetType: string;
  targetId: number;
  category?: string;
  periodType?: string | null;
  periodStart?: string | null;
  includeArchived?: boolean;
}) {
  const where: { targetType: string; targetId: number; category?: string; periodType?: string | null; periodStart?: Date; isArchived?: boolean } = {
    targetType: opts.targetType,
    targetId: opts.targetId,
  };
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

const workItemInclude = {
  participants: true,
  owner: { select: { id: true, employeeId: true, name: true } },
  linkedProject: { select: { id: true, code: true, name: true } },
  linkedProjectPhase: { select: { id: true, name: true, projectId: true } },
  linkedProjectTask: { select: { id: true, name: true, description: true, projectId: true } },
  sourceMeeting: { select: { id: true, title: true, startAt: true } },
  sourceMeetingDecision: { select: { id: true, title: true, kind: true } },
  sourceMeetingActionCandidate: { select: { id: true, title: true } },
  parentWorkItem: { select: { id: true, content: true } },
} satisfies Prisma.WorkItemInclude;

function formatDate(value: Date | string | null | undefined) {
  if (!value) return null;
  return new Date(value).toISOString().slice(0, 10);
}

function toWorkItemDto(row: Prisma.WorkItemGetPayload<{ include: typeof workItemInclude }>) {
  const status = row.itemType === "task" ? (row.isArchived ? "archived" : normalizeWorkStatus(row.status)) : null;
  return {
    id: row.id,
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
    ownerEmployeeId: row.ownerEmployeeId,
    ownerEmployeeNumber: row.owner?.employeeId ?? null,
    ownerEmployeeName: row.owner?.name ?? null,
    startDate: formatDate(row.startDate),
    dueDate: formatDate(row.dueDate),
    periodType: row.periodType,
    periodStart: formatDate(row.periodStart),
    periodEnd: formatDate(row.periodEnd),
    sourceType: row.sourceType,
    sourceKind: row.sourceKind,
    sourceMeetingId: row.sourceMeetingId,
    sourceMeetingTitle: row.sourceMeeting?.title ?? null,
    sourceMeetingStartAt: formatDate(row.sourceMeeting?.startAt),
    sourceMeetingDecisionId: row.sourceMeetingDecisionId,
    sourceMeetingDecisionTitle: row.sourceMeetingDecision?.title ?? null,
    sourceMeetingDecisionKind: row.sourceMeetingDecision?.kind ?? null,
    sourceMeetingActionCandidateId: row.sourceMeetingActionCandidateId,
    sourceMeetingActionCandidateTitle: row.sourceMeetingActionCandidate?.title ?? null,
    linkedProjectId: row.linkedProjectId,
    linkedProjectName: row.linkedProject?.name ?? null,
    linkedProjectCode: row.linkedProject?.code ?? null,
    linkedProjectPhaseId: row.linkedProjectPhaseId,
    linkedProjectPhaseName: row.linkedProjectPhase?.name ?? null,
    linkedProjectTaskId: row.linkedProjectTaskId,
    linkedProjectTaskName: row.linkedProjectTask?.name || row.linkedProjectTask?.description || null,
    parentWorkItemId: row.parentWorkItemId,
    parentWorkItemContent: row.parentWorkItem?.content ?? null,
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

function normalizeWorkStatus(status: string | null) {
  if (status === "done" || status === "archived") return status;
  return "doing";
}

export async function createWorkItem(opts: {
  targetType: string;
  targetId: number;
  category?: string;
  itemType?: string;
  content: string;
  description?: string;
  importance?: number;
  urgency?: number;
  status?: string | null;
  krStartValue?: number | null;
  krTargetValue?: number | null;
  krCurrentValue?: number | null;
  krUnit?: string | null;
  ownerEmployeeId?: number | null;
  startDate?: Date | string | null;
  dueDate?: Date | string | null;
  periodType?: string | null;
  periodStart?: Date | string | null;
  periodEnd?: Date | string | null;
  sourceType?: string;
  sourceKind?: string | null;
  sourceMeetingId?: number | null;
  sourceMeetingDecisionId?: number | null;
  sourceMeetingActionCandidateId?: number | null;
  linkedProjectId?: number | null;
  linkedProjectPhaseId?: number | null;
  linkedProjectTaskId?: number | null;
  parentWorkItemId?: number | null;
  participants?: string[];
  sortOrder?: number;
}): Promise<DomainServiceResult<unknown>> {
  const command = buildWorkItemCreateCommand(opts);
  if (!command.ok) return { ok: false, error: command.issue.message, status: command.issue.status };
  const relationError = await validateWorkItemRelations(command.data);
  if (relationError) return { ok: false, error: relationError, status: 400 };
  const data: Prisma.WorkItemUncheckedCreateInput = {
    targetType: command.data.targetType,
    targetId: command.data.targetId,
    category: command.data.category,
    itemType: command.data.itemType,
    content: command.data.content,
    description: command.data.description,
    importance: command.data.importance,
    urgency: command.data.urgency,
    status: command.data.status,
    krStartValue: command.data.krStartValue,
    krTargetValue: command.data.krTargetValue,
    krCurrentValue: command.data.krCurrentValue,
    krUnit: command.data.krUnit,
    ownerEmployeeId: command.data.ownerEmployeeId,
    startDate: command.data.startDate,
    dueDate: command.data.dueDate,
    periodType: command.data.periodType,
    periodStart: command.data.periodStart,
    periodEnd: command.data.periodEnd,
    sourceType: command.data.sourceType,
    sourceKind: command.data.sourceKind,
    sourceMeetingId: command.data.sourceMeetingId,
    sourceMeetingDecisionId: command.data.sourceMeetingDecisionId,
    sourceMeetingActionCandidateId: command.data.sourceMeetingActionCandidateId,
    linkedProjectId: command.data.linkedProjectId,
    linkedProjectPhaseId: command.data.linkedProjectPhaseId,
    linkedProjectTaskId: command.data.linkedProjectTaskId,
    parentWorkItemId: command.data.parentWorkItemId,
    isArchived: command.data.itemType === "task" && command.data.status === "archived",
    sortOrder: command.data.sortOrder,
  };
  const work = await prisma.workItem.create({
    data: {
      ...data,
      participants:
        command.data.participants.length > 0
          ? { create: command.data.participants.map((name) => ({ name })) }
          : undefined,
    },
    include: workItemInclude,
  });
  return { ok: true, data: toWorkItemDto(work) };
}

export async function getWorkItemAccessMetadata(workId: number) {
  return prisma.workItem.findUnique({
    where: { id: workId },
    select: {
      targetType: true,
      targetId: true,
    },
  });
}

export async function updateWorkItem(
  workId: number,
  opts: {
    category?: string;
    itemType?: string;
    content?: string;
    description?: string;
    importance?: number;
    urgency?: number;
    status?: string | null;
    krStartValue?: number | null;
    krTargetValue?: number | null;
    krCurrentValue?: number | null;
    krUnit?: string | null;
    ownerEmployeeId?: number | null;
    startDate?: Date | string | null;
    dueDate?: Date | string | null;
    periodType?: string | null;
    periodStart?: Date | string | null;
    periodEnd?: Date | string | null;
    sourceType?: string;
    sourceKind?: string | null;
    sourceMeetingId?: number | null;
    sourceMeetingDecisionId?: number | null;
    sourceMeetingActionCandidateId?: number | null;
    linkedProjectId?: number | null;
    linkedProjectPhaseId?: number | null;
    linkedProjectTaskId?: number | null;
    parentWorkItemId?: number | null;
    participants?: string[];
    sortOrder?: number;
    isArchived?: boolean;
  },
): Promise<DomainServiceResult<unknown>> {
  const existing = await prisma.workItem.findUnique({
    where: { id: workId },
    select: {
      targetType: true,
      targetId: true,
      category: true,
      itemType: true,
      sourceType: true,
      sourceKind: true,
      sourceMeetingId: true,
      sourceMeetingDecisionId: true,
      sourceMeetingActionCandidateId: true,
      linkedProjectId: true,
      linkedProjectPhaseId: true,
      linkedProjectTaskId: true,
      parentWorkItemId: true,
      periodType: true,
      periodStart: true,
      periodEnd: true,
    },
  });
  if (!existing?.targetId) return { ok: false, error: "工作项不存在", status: 404 };
  const command = buildWorkItemUpdateCommand(workId, opts, existing);
  if (!command.ok) return { ok: false, error: command.issue.message, status: command.issue.status };
  const effective = effectiveRelationInput(existing, command.data.data);
  if (sourcePatchTouched(command.data.data) && command.data.data.sourceKind === undefined) {
    command.data.data.sourceKind = effective.sourceKind;
  }
  const relationError = await validateWorkItemRelations({
    targetType: existing.targetType,
    targetId: existing.targetId,
    currentWorkId: command.data.workId,
    ownerEmployeeId: command.data.data.ownerEmployeeId,
    ...effective,
  });
  if (relationError) return { ok: false, error: relationError, status: 400 };
  const periodError = validateWorkItemPeriodPatch(existing, command.data.data);
  if (periodError) return { ok: false, error: periodError, status: 400 };
  const statusPatch = buildStatusPatch(command.data.data.status, command.data.data.isArchived);
  const data: Prisma.WorkItemUncheckedUpdateInput = {
    ...(command.data.data.category !== undefined && { category: command.data.data.category }),
    ...(command.data.data.itemType !== undefined && { itemType: command.data.data.itemType }),
    ...(command.data.data.content !== undefined && { content: command.data.data.content }),
    ...(command.data.data.description !== undefined && { description: command.data.data.description }),
    ...(command.data.data.importance !== undefined && { importance: command.data.data.importance }),
    ...(command.data.data.urgency !== undefined && { urgency: command.data.data.urgency }),
    ...(command.data.data.krStartValue !== undefined && { krStartValue: command.data.data.krStartValue }),
    ...(command.data.data.krTargetValue !== undefined && { krTargetValue: command.data.data.krTargetValue }),
    ...(command.data.data.krCurrentValue !== undefined && { krCurrentValue: command.data.data.krCurrentValue }),
    ...(command.data.data.krUnit !== undefined && { krUnit: command.data.data.krUnit }),
    ...(command.data.data.ownerEmployeeId !== undefined && { ownerEmployeeId: command.data.data.ownerEmployeeId }),
    ...(command.data.data.startDate !== undefined && { startDate: command.data.data.startDate }),
    ...(command.data.data.dueDate !== undefined && { dueDate: command.data.data.dueDate }),
    ...(command.data.data.periodType !== undefined && { periodType: command.data.data.periodType }),
    ...(command.data.data.periodStart !== undefined && { periodStart: command.data.data.periodStart }),
    ...(command.data.data.periodEnd !== undefined && { periodEnd: command.data.data.periodEnd }),
    ...(command.data.data.sourceType !== undefined && { sourceType: command.data.data.sourceType }),
    ...(command.data.data.sourceKind !== undefined && { sourceKind: command.data.data.sourceKind }),
    ...(command.data.data.sourceMeetingId !== undefined && { sourceMeetingId: command.data.data.sourceMeetingId }),
    ...(command.data.data.sourceMeetingDecisionId !== undefined && { sourceMeetingDecisionId: command.data.data.sourceMeetingDecisionId }),
    ...(command.data.data.sourceMeetingActionCandidateId !== undefined && { sourceMeetingActionCandidateId: command.data.data.sourceMeetingActionCandidateId }),
    ...(command.data.data.linkedProjectId !== undefined && { linkedProjectId: command.data.data.linkedProjectId }),
    ...(command.data.data.linkedProjectPhaseId !== undefined && { linkedProjectPhaseId: command.data.data.linkedProjectPhaseId }),
    ...(command.data.data.linkedProjectTaskId !== undefined && { linkedProjectTaskId: command.data.data.linkedProjectTaskId }),
    ...(command.data.data.parentWorkItemId !== undefined && { parentWorkItemId: command.data.data.parentWorkItemId }),
    ...(command.data.data.sortOrder !== undefined && { sortOrder: command.data.data.sortOrder }),
    ...statusPatch,
  };

  if (command.data.data.participants !== undefined) {
    data.participants = {
      deleteMany: {},
      create: command.data.data.participants.map((name) => ({ name })),
    };
  }

  const work = await prisma.workItem.update({
    where: { id: command.data.workId },
    data,
    include: workItemInclude,
  });
  return { ok: true, data: toWorkItemDto(work) };
}

function sourcePatchTouched(patch: {
  sourceType?: string;
  sourceKind?: string | null;
  sourceMeetingId?: number | null;
  sourceMeetingDecisionId?: number | null;
  sourceMeetingActionCandidateId?: number | null;
  linkedProjectId?: number | null;
  linkedProjectPhaseId?: number | null;
  linkedProjectTaskId?: number | null;
}) {
  return patch.sourceType !== undefined
    || patch.sourceKind !== undefined
    || patch.sourceMeetingId !== undefined
    || patch.sourceMeetingDecisionId !== undefined
    || patch.sourceMeetingActionCandidateId !== undefined
    || patch.linkedProjectId !== undefined
    || patch.linkedProjectPhaseId !== undefined
    || patch.linkedProjectTaskId !== undefined;
}
function effectiveRelationInput(
  existing: {
    itemType: string;
    sourceType: string;
    sourceKind: string | null;
    sourceMeetingId: number | null;
    sourceMeetingDecisionId: number | null;
    sourceMeetingActionCandidateId: number | null;
    linkedProjectId: number | null;
    linkedProjectPhaseId: number | null;
    linkedProjectTaskId: number | null;
    parentWorkItemId: number | null;
  },
  patch: {
    itemType?: string;
    sourceType?: string;
    sourceKind?: string | null;
    sourceMeetingId?: number | null;
    sourceMeetingDecisionId?: number | null;
    sourceMeetingActionCandidateId?: number | null;
    linkedProjectId?: number | null;
    linkedProjectPhaseId?: number | null;
    linkedProjectTaskId?: number | null;
    parentWorkItemId?: number | null;
  },
) {
  const sourceType = patch.sourceType === undefined ? existing.sourceType : patch.sourceType;
  const sourceMeetingId = patch.sourceMeetingId === undefined ? existing.sourceMeetingId : patch.sourceMeetingId;
  const sourceMeetingDecisionId = patch.sourceMeetingDecisionId === undefined ? existing.sourceMeetingDecisionId : patch.sourceMeetingDecisionId;
  const sourceMeetingActionCandidateId = patch.sourceMeetingActionCandidateId === undefined ? existing.sourceMeetingActionCandidateId : patch.sourceMeetingActionCandidateId;
  const linkedProjectId = patch.linkedProjectId === undefined ? existing.linkedProjectId : patch.linkedProjectId;
  const linkedProjectPhaseId = patch.linkedProjectPhaseId === undefined ? existing.linkedProjectPhaseId : patch.linkedProjectPhaseId;
  const linkedProjectTaskId = patch.linkedProjectTaskId === undefined ? existing.linkedProjectTaskId : patch.linkedProjectTaskId;
  const inferredSourceKind = sourceType !== "project"
    ? null
    : linkedProjectTaskId
      ? "project_task"
      : linkedProjectPhaseId
        ? "project_phase"
        : linkedProjectId
          ? "project"
          : null;
  return {
    itemType: patch.itemType === undefined ? existing.itemType : patch.itemType,
    sourceType,
    sourceKind: patch.sourceKind === undefined ? inferredSourceKind : patch.sourceKind,
    sourceMeetingId,
    sourceMeetingDecisionId,
    sourceMeetingActionCandidateId,
    linkedProjectId,
    linkedProjectPhaseId,
    linkedProjectTaskId,
    parentWorkItemId: patch.parentWorkItemId === undefined ? existing.parentWorkItemId : patch.parentWorkItemId,
  };
}

function buildStatusPatch(status?: string | null, isArchived?: boolean): Prisma.WorkItemUncheckedUpdateInput {
  if (status !== undefined) {
    if (status === null) return { status: null };
    return { status, isArchived: status === "archived" };
  }
  if (isArchived !== undefined) {
    return { isArchived, ...(isArchived ? { status: "archived" } : { status: "doing" }) };
  }
  return {};
}

function validateWorkItemPeriodPatch(
  existing: { periodType: string | null; periodStart: Date | null; periodEnd: Date | null },
  patch: {
    periodType?: string | null;
    periodStart?: Date | string | null;
    periodEnd?: Date | string | null;
  },
) {
  const periodType = patch.periodType === undefined ? existing.periodType : patch.periodType;
  const periodStart = patch.periodStart === undefined ? existing.periodStart : toDateOrNull(patch.periodStart);
  const periodEnd = patch.periodEnd === undefined ? existing.periodEnd : toDateOrNull(patch.periodEnd);
  if (!periodType) {
    if (periodStart || periodEnd) return "设置周期起止时必须选择周期类型";
    return null;
  }
  if (!periodStart || !periodEnd) return "计划周期起止不能为空";
  if (periodEnd < periodStart) return "周期结束不能早于周期开始";
  return null;
}

function toDateOrNull(value: Date | string | null | undefined) {
  return value ? value instanceof Date ? value : new Date(value) : null;
}

export async function deleteWorkItem(workId: number): Promise<DomainServiceResult<{ success: true }>> {
  const command = validateWorkItemDeleteCommand(workId);
  if (!command.ok) return { ok: false, error: command.issue.message, status: command.issue.status };
  await prisma.workItem.delete({ where: { id: command.data.workId } });
  return { ok: true, data: { success: true } };
}
