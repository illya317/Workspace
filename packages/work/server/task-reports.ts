import { Prisma, prisma } from "@workspace/platform/server/prisma";
import {
  canAccessTarget,
  canEditWorkTask,
  workSpaceRoleAllows,
  type WorkSpaceTargetType,
} from "./access";
import { normalizeWorkReportText, validateWorkReportCommand } from "./domain/work-report-validation";
import { listWorkTaskSpaces } from "./task-spaces";

export type WorkReportPeriod = {
  periodType: "weekly";
  periodStart: string;
  periodEnd: string;
};

export type WorkReportItemInput = {
  workItemId?: number | null;
  title?: string | null;
  previousPlanSnapshot?: string | null;
  doneThisWeek?: string | null;
  planNextWeek?: string | null;
  sortOrder?: number | null;
};

const reportInclude = {
  items: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
  submitter: { select: { id: true, nickname: true, username: true, employees: { select: { name: true }, take: 1 } } },
} satisfies Prisma.WorkReportInclude;

type ReportRow = Prisma.WorkReportGetPayload<{ include: typeof reportInclude }>;

export async function getWorkReportDraft(input: {
  userId: number;
  targetType: WorkSpaceTargetType;
  targetId: number;
  periodStart?: string | null;
}) {
  if (!(await canAccessTarget(input.userId, input.targetType, input.targetId))) {
    return { ok: false as const, error: "无权限访问该工作空间", status: 403 };
  }
  const period = normalizeWeeklyPeriod(input.periodStart);
  const report = await findUserReport(input.userId, input.targetType, input.targetId, period.startDate);
  const previous = await findUserReport(input.userId, input.targetType, input.targetId, addDays(period.startDate, -7));
  const workItems = await listReportWorkItems(input.targetType, input.targetId);
  const canEdit = await canEditWorkTask(input.userId, input.targetType, input.targetId);
  return {
    ok: true as const,
    data: {
      period: period.dto,
      canEdit,
      report: report ? toReportDto(report) : null,
      items: mergeReportItems(workItems, report, previous),
    },
  };
}

export async function saveWorkReport(input: {
  userId: number;
  targetType: WorkSpaceTargetType;
  targetId: number;
  periodStart?: string | null;
  items: WorkReportItemInput[];
}) {
  const command = validateWorkReportCommand("saveWorkReport");
  if (!command.ok) return { ok: false as const, error: command.issue.message, status: command.issue.status };
  if (!(await canEditWorkTask(input.userId, input.targetType, input.targetId))) {
    return { ok: false as const, error: "无权限填写工作汇报", status: 403 };
  }
  const period = normalizeWeeklyPeriod(input.periodStart);
  const workItems = await listReportWorkItems(input.targetType, input.targetId);
  const workItemIds = new Set(workItems.map((work) => work.id));
  const previous = await findUserReport(input.userId, input.targetType, input.targetId, addDays(period.startDate, -7));
  const previousLookup = buildPreviousLookup(previous);
  const rows = input.items
    .map((item, index) => normalizeReportItemInput(item, index, previousLookup))
    .filter((item) => item.title || item.doneThisWeek || item.planNextWeek || item.workItemId);

  for (const row of rows) {
    if (row.workItemId && !workItemIds.has(row.workItemId)) {
      return { ok: false as const, error: "汇报事项不属于当前工作空间", status: 400 };
    }
  }

  const report = await prisma.$transaction(async (tx) => {
    const saved = await tx.workReport.upsert({
      where: {
        targetType_targetId_periodType_periodStart_submittedBy: {
          targetType: input.targetType,
          targetId: input.targetId,
          periodType: "weekly",
          periodStart: period.startDate,
          submittedBy: input.userId,
        },
      },
      create: {
        targetType: input.targetType,
        targetId: input.targetId,
        periodType: "weekly",
        periodStart: period.startDate,
        periodEnd: period.endDate,
        submittedBy: input.userId,
        submittedAt: new Date(),
      },
      update: {
        periodEnd: period.endDate,
        submittedAt: new Date(),
      },
    });
    await tx.workReportItem.deleteMany({ where: { reportId: saved.id } });
    for (const row of rows) {
      await tx.workReportItem.create({
        data: {
          reportId: saved.id,
          workItemId: row.workItemId,
          title: row.title || workItems.find((work) => work.id === row.workItemId)?.content || "未命名事项",
          previousPlanSnapshot: row.previousPlanSnapshot,
          doneThisWeek: row.doneThisWeek,
          planNextWeek: row.planNextWeek,
          sortOrder: row.sortOrder,
        },
      });
    }
    return tx.workReport.findUniqueOrThrow({ where: { id: saved.id }, include: reportInclude });
  });

  return { ok: true as const, data: { report: toReportDto(report), items: mergeReportItems(workItems, report, previous), period: period.dto } };
}

export async function listWorkReportCollection(input: {
  userId: number;
  periodStart?: string | null;
}) {
  const period = normalizeWeeklyPeriod(input.periodStart);
  const { spaces } = await listWorkTaskSpaces(input.userId);
  const visibleSpaces = spaces.filter((space) => workSpaceRoleAllows(space.role, "viewer"));
  const rows = await Promise.all(visibleSpaces.map(async (space) => {
    const reports = await prisma.workReport.findMany({
      where: {
        targetType: space.targetType,
        targetId: space.targetId,
        periodType: "weekly",
        periodStart: period.startDate,
      },
      include: reportInclude,
      orderBy: [{ submittedAt: "desc" }, { id: "asc" }],
    });
    return {
      targetType: space.targetType,
      targetId: space.targetId,
      name: space.name,
      subtitle: space.subtitle,
      role: space.role,
      status: reports.length > 0 ? "submitted" : "missing",
      reports: reports.map(toReportDto),
    };
  }));
  return { ok: true as const, data: { period: period.dto, spaces: rows } };
}

function normalizeReportItemInput(
  item: WorkReportItemInput,
  index: number,
  previousLookup: ReturnType<typeof buildPreviousLookup>,
) {
  const workItemId = toNullableInt(item.workItemId);
  const title = normalizeWorkReportText(item.title);
  const previousPlanSnapshot = normalizeWorkReportText(item.previousPlanSnapshot || lookupPreviousPlan(previousLookup, workItemId, title));
  return {
    workItemId,
    title,
    previousPlanSnapshot,
    doneThisWeek: normalizeWorkReportText(item.doneThisWeek),
    planNextWeek: normalizeWorkReportText(item.planNextWeek),
    sortOrder: Number.isFinite(Number(item.sortOrder)) ? Number(item.sortOrder) : (index + 1) * 10,
  };
}

async function findUserReport(
  userId: number,
  targetType: WorkSpaceTargetType,
  targetId: number,
  periodStart: Date,
) {
  return prisma.workReport.findUnique({
    where: {
      targetType_targetId_periodType_periodStart_submittedBy: {
        targetType,
        targetId,
        periodType: "weekly",
        periodStart,
        submittedBy: userId,
      },
    },
    include: reportInclude,
  });
}

async function listReportWorkItems(targetType: WorkSpaceTargetType, targetId: number) {
  return prisma.workItem.findMany({
    where: { targetType, targetId, itemType: "task", isArchived: false },
    select: { id: true, content: true, sortOrder: true },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
}

function mergeReportItems(
  workItems: Array<{ id: number; content: string; sortOrder: number }>,
  report: ReportRow | null,
  previous: ReportRow | null,
) {
  const currentItems = report?.items || [];
  const currentByWorkId = new Map(currentItems.filter((item) => item.workItemId).map((item) => [item.workItemId!, item]));
  const activeWorkIds = new Set(workItems.map((work) => work.id));
  const previousLookup = buildPreviousLookup(previous);
  const rows = workItems.map((work, index) => {
    const item = currentByWorkId.get(work.id);
    return {
      id: item?.id ?? null,
      workItemId: work.id,
      title: item?.title || work.content,
      previousPlanSnapshot: item?.previousPlanSnapshot || lookupPreviousPlan(previousLookup, work.id, work.content),
      doneThisWeek: item?.doneThisWeek || "",
      planNextWeek: item?.planNextWeek || "",
      sortOrder: item?.sortOrder ?? (work.sortOrder || (index + 1) * 10),
      source: "work" as const,
    };
  });
  const extraRows = currentItems
    .filter((item) => !item.workItemId || !activeWorkIds.has(item.workItemId))
    .map((item) => ({
      id: item.id,
      workItemId: item.workItemId,
      title: item.title,
      previousPlanSnapshot: item.previousPlanSnapshot || lookupPreviousPlan(previousLookup, item.workItemId, item.title),
      doneThisWeek: item.doneThisWeek,
      planNextWeek: item.planNextWeek,
      sortOrder: item.sortOrder,
      source: item.workItemId ? "stale" as const : "adHoc" as const,
    }));
  return [...rows, ...extraRows].sort((a, b) => (a.sortOrder - b.sortOrder) || ((a.id || 0) - (b.id || 0)));
}

function buildPreviousLookup(report: ReportRow | null) {
  const byWorkId = new Map<number, string>();
  const byTitle = new Map<string, string>();
  for (const item of report?.items || []) {
    if (item.workItemId && item.planNextWeek.trim()) byWorkId.set(item.workItemId, item.planNextWeek);
    if (item.title.trim() && item.planNextWeek.trim()) byTitle.set(item.title.trim(), item.planNextWeek);
  }
  return { byWorkId, byTitle };
}

function lookupPreviousPlan(
  lookup: ReturnType<typeof buildPreviousLookup>,
  workItemId: number | null | undefined,
  title: string,
) {
  if (workItemId && lookup.byWorkId.has(workItemId)) return lookup.byWorkId.get(workItemId) || "";
  return lookup.byTitle.get(title.trim()) || "";
}

function toReportDto(report: ReportRow) {
  return {
    id: report.id,
    targetType: report.targetType,
    targetId: report.targetId,
    periodType: report.periodType,
    periodStart: formatDate(report.periodStart),
    periodEnd: formatDate(report.periodEnd),
    submittedBy: report.submittedBy,
    submitterName: userName(report.submitter),
    submittedAt: report.submittedAt?.toISOString() || null,
    updatedAt: report.updatedAt.toISOString(),
    items: report.items.map((item) => ({
      id: item.id,
      workItemId: item.workItemId,
      title: item.title,
      previousPlanSnapshot: item.previousPlanSnapshot,
      doneThisWeek: item.doneThisWeek,
      planNextWeek: item.planNextWeek,
      sortOrder: item.sortOrder,
    })),
  };
}

function normalizeWeeklyPeriod(input?: string | null) {
  const base = parseDateOnly(input) || todayUtc();
  const day = base.getUTCDay() || 7;
  const startDate = addDays(base, 1 - day);
  const endDate = addDays(startDate, 6);
  return {
    startDate,
    endDate,
    dto: {
      periodType: "weekly" as const,
      periodStart: formatDate(startDate),
      periodEnd: formatDate(endDate),
    },
  };
}

function parseDateOnly(input?: string | null) {
  if (!input) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function todayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function formatDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function toNullableInt(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function userName(user: ReportRow["submitter"]) {
  return user.employees[0]?.name || user.nickname || user.username || `用户 ${user.id}`;
}
