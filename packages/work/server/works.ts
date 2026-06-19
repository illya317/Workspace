import { Prisma, prisma } from "@workspace/platform/server/prisma";

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
}) {
  return prisma.workItem.create({
    data: {
      targetType: opts.targetType,
      targetId: opts.targetId,
      category: opts.category,
      content: opts.content,
      importance: opts.importance ?? 3,
      urgency: opts.urgency ?? 3,
      sortOrder: opts.sortOrder ?? 0,
      participants:
        opts.participants && opts.participants.length > 0
          ? { create: opts.participants.map((name) => ({ name })) }
          : undefined,
    },
    include: { participants: true },
  });
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
) {
  const data: Prisma.WorkItemUpdateInput = {
    ...(opts.category !== undefined && { category: opts.category }),
    ...(opts.content !== undefined && { content: opts.content }),
    ...(opts.importance !== undefined && { importance: opts.importance }),
    ...(opts.urgency !== undefined && { urgency: opts.urgency }),
    ...(opts.sortOrder !== undefined && { sortOrder: opts.sortOrder }),
    ...(opts.isArchived !== undefined && { isArchived: opts.isArchived }),
  };

  if (opts.participants !== undefined) {
    data.participants = {
      deleteMany: {},
      create: opts.participants.map((name) => ({ name })),
    };
  }

  return prisma.workItem.update({
    where: { id: workId },
    data,
    include: { participants: true },
  });
}

export async function deleteWorkItem(workId: number) {
  await prisma.workItem.delete({ where: { id: workId } });
}
