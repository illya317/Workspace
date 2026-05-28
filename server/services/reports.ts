import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

interface ReportFilters {
  date?: string;
  targetType?: string;
  targetIds?: string;
}

export async function listReports(filters: ReportFilters) {
  const where: Prisma.ReportWhereInput = {};

  if (filters.targetType && filters.targetIds) {
    where.targetType = filters.targetType;
    where.targetId = { in: filters.targetIds.split(",").map(Number) };
  }

  if (filters.date) where.date = filters.date;

  return prisma.report.findMany({
    where,
    include: {
      items: {
        orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
      },
      user: { select: { name: true } },
    },
    orderBy: { date: "desc" },
  });
}

interface ReportItemInput {
  category: string;
  plan: string;
  completion?: string;
  nextGoal?: string;
  sortOrder?: number;
  workId?: number;
}

interface CreateReportInput {
  userId: number;
  taskName: string;
  notes?: string | null;
  date: string;
  targetType?: string;
  targetId?: number;
  items: ReportItemInput[];
}

export async function enrichWithRoutineItems(
  items: ReportItemInput[],
  targetType: string,
  targetId: number
): Promise<ReportItemInput[]> {
  const hasRoutine = items.some((i) => i.category === "routine");
  if (hasRoutine) return items;

  const works = await prisma.workItem.findMany({
    where: { targetType, targetId, category: "routine" },
    orderBy: { sortOrder: "asc" },
  });

  if (works.length === 0) return items;

  const routineItems = works.map((w, idx) => ({
    category: "routine",
    plan: w.content,
    completion: "",
    nextGoal: "",
    sortOrder: idx,
    workId: w.id,
  }));

  return [...routineItems, ...items];
}

export async function createReport(data: CreateReportInput) {
  return prisma.report.create({
    data: {
      userId: data.userId,
      date: data.date,
      targetType: data.targetType,
      targetId: data.targetId,
      taskName: data.taskName,
      notes: data.notes || null,
      version: 1,
      items: {
        create: data.items.map((item, index) => ({
          category: item.category,
          workItemId: item.workId ?? null,
          plan: item.plan,
          completion: item.completion || null,
          nextGoal: item.nextGoal || null,
          sortOrder: item.sortOrder ?? index,
        })),
      },
    },
    include: {
      items: {
        orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
      },
      user: { select: { name: true } },
    },
  });
}

export function isDuplicateReportError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  return "code" in error && (error as Record<string, unknown>).code === "P2002";
}
