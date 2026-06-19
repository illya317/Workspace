import { Prisma, prisma } from "@workspace/platform/server/prisma";

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
  targetId: number,
): Promise<ReportItemInput[]> {
  const hasRoutine = items.some((item) => item.category === "routine");
  if (hasRoutine) return items;

  const works = await prisma.workItem.findMany({
    where: { targetType, targetId, category: "routine" },
    orderBy: { sortOrder: "asc" },
  });

  if (works.length === 0) return items;

  const routineItems = works.map((work, index) => ({
    category: "routine",
    plan: work.content,
    completion: "",
    nextGoal: "",
    sortOrder: index,
    workId: work.id,
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

export async function getReportAccessMetadata(reportId: number) {
  return prisma.report.findUnique({
    where: { id: reportId },
    select: {
      userId: true,
      targetType: true,
      targetId: true,
    },
  });
}

export async function updateReportWithHistory(
  reportId: number,
  data: {
    taskName: string;
    notes?: string | null;
    items: ReportItemInput[];
  },
) {
  const existing = await prisma.report.findUnique({
    where: { id: reportId },
  });
  if (!existing) return null;

  const currentItems = await prisma.reportItem.findMany({
    where: { reportId },
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
  });

  await prisma.$transaction([
    prisma.reportHistory.create({
      data: {
        reportId,
        version: existing.version,
        taskName: existing.taskName,
        notes: existing.notes,
        itemsJson: JSON.stringify(currentItems),
      },
    }),
    prisma.reportItem.deleteMany({ where: { reportId } }),
    prisma.report.update({
      where: { id: reportId },
      data: {
        taskName: data.taskName,
        notes: data.notes || null,
        version: { increment: 1 },
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
    }),
  ]);

  return prisma.report.findUnique({
    where: { id: reportId },
    include: {
      items: {
        orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
      },
    },
  });
}

export async function listReportHistory(reportId: number) {
  return prisma.reportHistory.findMany({
    where: { reportId },
    orderBy: { version: "desc" },
  });
}

export async function getReportVersion(reportId: number, version: number) {
  if (version === 0) {
    return prisma.report.findUnique({
      where: { id: reportId },
      include: {
        items: {
          orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
        },
        user: {
          select: { name: true },
        },
      },
    });
  }

  const snapshot = await prisma.reportHistory.findUnique({
    where: {
      reportId_version: {
        reportId,
        version,
      },
    },
  });
  if (!snapshot) return null;

  const items = JSON.parse(snapshot.itemsJson) as Array<{
    category: string;
    plan: string;
    completion?: string;
    nextGoal?: string;
    sortOrder: number;
  }>;

  return {
    id: reportId,
    taskName: snapshot.taskName,
    notes: snapshot.notes,
    version: snapshot.version,
    createdAt: snapshot.createdAt,
    items: items.map((item) => ({
      ...item,
      completion: item.completion || "",
      nextGoal: item.nextGoal || "",
    })),
  };
}

export function isDuplicateReportError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  return "code" in error && (error as Record<string, unknown>).code === "P2002";
}
