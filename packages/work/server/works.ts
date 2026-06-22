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
  includeArchived?: boolean;
}) {
  const where: { targetType: string; targetId: number; category?: string; isArchived?: boolean } = {
    targetType: opts.targetType,
    targetId: opts.targetId,
  };
  if (opts.category) where.category = opts.category;
  if (!opts.includeArchived) where.isArchived = false;

  return prisma.workItem.findMany({
    where,
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
    include: { participants: true },
  });
}

export async function createWorkItem(opts: {
  targetType: string;
  targetId: number;
  category: string;
  content: string;
  importance?: number;
  urgency?: number;
  participants?: string[];
  sortOrder?: number;
}): Promise<DomainServiceResult<unknown>> {
  const command = buildWorkItemCreateCommand(opts);
  if (!command.ok) return { ok: false, error: command.issue.message, status: command.issue.status };
  const work = await prisma.workItem.create({
    data: {
      targetType: command.data.targetType,
      targetId: command.data.targetId,
      category: command.data.category,
      content: command.data.content,
      importance: command.data.importance,
      urgency: command.data.urgency,
      sortOrder: command.data.sortOrder,
      participants:
        command.data.participants.length > 0
          ? { create: command.data.participants.map((name) => ({ name })) }
          : undefined,
    },
    include: { participants: true },
  });
  return { ok: true, data: work };
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
    importance?: number;
    urgency?: number;
    participants?: string[];
    sortOrder?: number;
    isArchived?: boolean;
  },
): Promise<DomainServiceResult<unknown>> {
  const command = buildWorkItemUpdateCommand(workId, opts);
  if (!command.ok) return { ok: false, error: command.issue.message, status: command.issue.status };
  const data: Prisma.WorkItemUpdateInput = {
    ...(command.data.data.category !== undefined && { category: command.data.data.category }),
    ...(command.data.data.content !== undefined && { content: command.data.data.content }),
    ...(command.data.data.importance !== undefined && { importance: command.data.data.importance }),
    ...(command.data.data.urgency !== undefined && { urgency: command.data.data.urgency }),
    ...(command.data.data.sortOrder !== undefined && { sortOrder: command.data.data.sortOrder }),
    ...(command.data.data.isArchived !== undefined && { isArchived: command.data.data.isArchived }),
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
    include: { participants: true },
  });
  return { ok: true, data: work };
}

export async function deleteWorkItem(workId: number): Promise<DomainServiceResult<{ success: true }>> {
  const command = validateWorkItemDeleteCommand(workId);
  if (!command.ok) return { ok: false, error: command.issue.message, status: command.issue.status };
  await prisma.workItem.delete({ where: { id: command.data.workId } });
  return { ok: true, data: { success: true } };
}
