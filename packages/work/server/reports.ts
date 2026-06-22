import { Prisma, prisma } from "@workspace/platform/server/prisma";
import type { DomainServiceResult } from "@workspace/platform/server/domain-validation";
import { canAccessTarget } from "./access";
import {
  buildCreateReportCommand,
  buildUpdateReportCommand,
  type ReportItemCommand,
} from "./domain/report-validation";

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

type ReportItemInput = ReportItemCommand;

interface CreateReportInput {
  userId: number;
  taskName: string;
  notes?: string | null;
  date: string;
  targetType?: string;
  targetId?: number;
  items: ReportItemInput[];
}

interface AuthenticatedWorkUser {
  userId: number;
  departmentId: number;
}

export async function listReportsForUser(
  user: Pick<AuthenticatedWorkUser, "userId">,
  filters: ReportFilters,
) {
  let targetType: string;
  let targetIds: string;
  let deniedTargetIds: number[] = [];

  if (filters.targetType && filters.targetIds) {
    const ids = filters.targetIds.split(",").map(Number);
    const checks = await Promise.all(ids.map(async (id) => ({
      id,
      allowed: await canAccessTarget(user.userId, filters.targetType as string, id),
    })));
    const accessible = checks.filter((result) => result.allowed).map((result) => result.id);
    deniedTargetIds = checks.filter((result) => !result.allowed).map((result) => result.id);
    if (accessible.length === 0) {
      return { ok: false as const, error: "无权限访问该目标", status: 403, deniedTargetIds };
    }
    targetType = filters.targetType;
    targetIds = accessible.join(",");
  } else {
    targetType = "user";
    targetIds = String(user.userId);
  }

  const reports = await listReports({ date: filters.date, targetType, targetIds });
  return { ok: true as const, reports, deniedTargetIds };
}

export async function createReportForUser(
  user: AuthenticatedWorkUser,
  input: Omit<CreateReportInput, "userId" | "date"> & {
    date?: string;
  },
) {
  const command = await buildCreateReportCommand(user, input);
  if (!command.ok) return { ok: false as const, error: command.issue.message, status: command.issue.status };

  try {
    const report = await createReport({
      userId: command.data.userId,
      taskName: command.data.taskName,
      notes: command.data.notes,
      date: command.data.date,
      targetType: command.data.targetType,
      targetId: command.data.targetId,
      items: command.data.items,
    });
    return { ok: true as const, report };
  } catch (error: unknown) {
    if (isDuplicateReportError(error)) {
      return { ok: false as const, error: "该目标该时段已提交过报告，请使用更新功能", status: 409 };
    }
    throw error;
  }
}

async function createReport(data: CreateReportInput) {
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
): Promise<DomainServiceResult<unknown>> {
  const command = await buildUpdateReportCommand(reportId, data);
  if (!command.ok) return { ok: false, error: command.issue.message, status: command.issue.status };

  await prisma.$transaction([
    prisma.reportHistory.create({
      data: {
        reportId: command.data.reportId,
        version: command.data.existing.version,
        taskName: command.data.existing.taskName,
        notes: command.data.existing.notes,
        itemsJson: JSON.stringify(command.data.currentItems),
      },
    }),
    prisma.reportItem.deleteMany({ where: { reportId: command.data.reportId } }),
    prisma.report.update({
      where: { id: command.data.reportId },
      data: {
        taskName: command.data.taskName,
        notes: command.data.notes,
        version: { increment: 1 },
        items: {
          create: command.data.items.map((item, index) => ({
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

  const report = await prisma.report.findUnique({
    where: { id: command.data.reportId },
    include: {
      items: {
        orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
      },
    },
  });
  return { ok: true, data: report };
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
