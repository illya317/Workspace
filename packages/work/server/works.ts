import { Prisma, prisma } from "@workspace/platform/server/prisma";
import type { DomainServiceResult } from "@workspace/platform/server/domain-validation";
import {
  buildWorkItemCreateCommand,
  buildWorkItemUpdateCommand,
  validateWorkItemDeleteCommand,
} from "./domain/work-item-validation";

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
    orderBy: [{ category: "asc" }, { periodStart: "asc" }, { sortOrder: "asc" }],
    include: workItemInclude,
  });
  return rows.map(toWorkItemDto);
}

const workItemInclude = {
  participants: true,
  owner: { select: { id: true, employeeId: true, name: true } },
  linkedProject: { select: { id: true, code: true, name: true } },
  linkedProjectTask: { select: { id: true, name: true, description: true, projectId: true } },
  parentWorkItem: { select: { id: true, content: true } },
} satisfies Prisma.WorkItemInclude;

function formatDate(value: Date | string | null | undefined) {
  if (!value) return null;
  return new Date(value).toISOString().slice(0, 10);
}

function toWorkItemDto(row: Prisma.WorkItemGetPayload<{ include: typeof workItemInclude }>) {
  const status = row.category === "routine" ? null : (row.isArchived ? "archived" : normalizeWorkStatus(row.status));
  return {
    id: row.id,
    targetType: row.targetType,
    targetId: row.targetId,
    category: row.category,
    content: row.content,
    description: row.description,
    importance: row.importance,
    urgency: row.urgency,
    status,
    ownerEmployeeId: row.ownerEmployeeId,
    ownerEmployeeNumber: row.owner?.employeeId ?? null,
    ownerEmployeeName: row.owner?.name ?? null,
    startDate: formatDate(row.startDate),
    dueDate: formatDate(row.dueDate),
    periodType: row.periodType,
    periodStart: formatDate(row.periodStart),
    periodEnd: formatDate(row.periodEnd),
    linkedProjectId: row.linkedProjectId,
    linkedProjectName: row.linkedProject?.name ?? null,
    linkedProjectCode: row.linkedProject?.code ?? null,
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
  category: string;
  content: string;
  description?: string;
  importance?: number;
  urgency?: number;
  status?: string | null;
  ownerEmployeeId?: number | null;
  startDate?: Date | string | null;
  dueDate?: Date | string | null;
  periodType?: string | null;
  periodStart?: Date | string | null;
  periodEnd?: Date | string | null;
  linkedProjectId?: number | null;
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
    content: command.data.content,
    description: command.data.description,
    importance: command.data.importance,
    urgency: command.data.urgency,
    status: command.data.status,
    ownerEmployeeId: command.data.ownerEmployeeId,
    startDate: command.data.startDate,
    dueDate: command.data.dueDate,
    periodType: command.data.periodType,
    periodStart: command.data.periodStart,
    periodEnd: command.data.periodEnd,
    linkedProjectId: command.data.linkedProjectId,
    linkedProjectTaskId: command.data.linkedProjectTaskId,
    parentWorkItemId: command.data.parentWorkItemId,
    isArchived: command.data.category !== "routine" && command.data.status === "archived",
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
    content?: string;
    description?: string;
    importance?: number;
    urgency?: number;
    status?: string | null;
    ownerEmployeeId?: number | null;
    startDate?: Date | string | null;
    dueDate?: Date | string | null;
    periodType?: string | null;
    periodStart?: Date | string | null;
    periodEnd?: Date | string | null;
    linkedProjectId?: number | null;
    linkedProjectTaskId?: number | null;
    parentWorkItemId?: number | null;
    participants?: string[];
    sortOrder?: number;
    isArchived?: boolean;
  },
): Promise<DomainServiceResult<unknown>> {
  const existing = await prisma.workItem.findUnique({
    where: { id: workId },
    select: { targetType: true, targetId: true, category: true, linkedProjectId: true, periodType: true, periodStart: true, periodEnd: true },
  });
  if (!existing?.targetId) return { ok: false, error: "工作项不存在", status: 404 };
  const command = buildWorkItemUpdateCommand(workId, opts, existing.category);
  if (!command.ok) return { ok: false, error: command.issue.message, status: command.issue.status };
  const relationError = await validateWorkItemRelations({
    targetType: existing.targetType,
    targetId: existing.targetId,
    currentWorkId: command.data.workId,
    linkedProjectId: command.data.data.linkedProjectId === undefined
      ? existing.linkedProjectId
      : command.data.data.linkedProjectId,
    ...command.data.data,
  });
  if (relationError) return { ok: false, error: relationError, status: 400 };
  const periodError = validateWorkItemPeriodPatch(existing, command.data.data);
  if (periodError) return { ok: false, error: periodError, status: 400 };
  const statusPatch = buildStatusPatch(command.data.data.status, command.data.data.isArchived);
  const data: Prisma.WorkItemUncheckedUpdateInput = {
    ...(command.data.data.category !== undefined && { category: command.data.data.category }),
    ...(command.data.data.content !== undefined && { content: command.data.data.content }),
    ...(command.data.data.description !== undefined && { description: command.data.data.description }),
    ...(command.data.data.importance !== undefined && { importance: command.data.data.importance }),
    ...(command.data.data.urgency !== undefined && { urgency: command.data.data.urgency }),
    ...(command.data.data.ownerEmployeeId !== undefined && { ownerEmployeeId: command.data.data.ownerEmployeeId }),
    ...(command.data.data.startDate !== undefined && { startDate: command.data.data.startDate }),
    ...(command.data.data.dueDate !== undefined && { dueDate: command.data.data.dueDate }),
    ...(command.data.data.periodType !== undefined && { periodType: command.data.data.periodType }),
    ...(command.data.data.periodStart !== undefined && { periodStart: command.data.data.periodStart }),
    ...(command.data.data.periodEnd !== undefined && { periodEnd: command.data.data.periodEnd }),
    ...(command.data.data.linkedProjectId !== undefined && { linkedProjectId: command.data.data.linkedProjectId }),
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
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}

export async function deleteWorkItem(workId: number): Promise<DomainServiceResult<{ success: true }>> {
  const command = validateWorkItemDeleteCommand(workId);
  if (!command.ok) return { ok: false, error: command.issue.message, status: command.issue.status };
  await prisma.workItem.delete({ where: { id: command.data.workId } });
  return { ok: true, data: { success: true } };
}

async function validateWorkItemRelations(input: {
  targetType: string;
  targetId: number;
  currentWorkId?: number;
  ownerEmployeeId?: number | null;
  linkedProjectId?: number | null;
  linkedProjectTaskId?: number | null;
  parentWorkItemId?: number | null;
}) {
  if (input.ownerEmployeeId) {
    const owner = await prisma.employee.findUnique({ where: { id: input.ownerEmployeeId }, select: { id: true } });
    if (!owner) return "负责人不存在";
  }
  if (input.linkedProjectId) {
    const project = await prisma.project.findUnique({ where: { id: input.linkedProjectId }, select: { id: true } });
    if (!project) return "关联项目不存在";
  }
  if (input.linkedProjectTaskId) {
    const task = await prisma.projectTask.findUnique({ where: { id: input.linkedProjectTaskId }, select: { id: true, projectId: true } });
    if (!task) return "关联项目任务不存在";
    if (input.linkedProjectId && task.projectId !== input.linkedProjectId) return "关联项目任务不属于所选项目";
  }
  if (input.parentWorkItemId) {
    if (input.currentWorkId && input.parentWorkItemId === input.currentWorkId) return "上级工作项不能选择自己";
    const parent = await prisma.workItem.findUnique({
      where: { id: input.parentWorkItemId },
      select: { targetType: true, targetId: true },
    });
    if (!parent) return "上级工作项不存在";
    if (parent.targetType !== input.targetType || parent.targetId !== input.targetId) return "上级工作项不属于当前空间";
  }
  return null;
}
