import { prisma } from "@workspace/platform/server/prisma";

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
