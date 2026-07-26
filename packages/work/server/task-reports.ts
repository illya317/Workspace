import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { workspaceBusinessDate } from "@workspace/platform/server/business-date";
import { Prisma, prisma } from "@workspace/platform/server/prisma";
import { normalizeWorkReportWeekStart } from "../work-report-periods";
import { canViewWorkTaskTarget, canUpdateWorkTaskAction, type WorkSpaceTargetType } from "./access";
import { normalizeWorkReportText, validateWorkReportCommand } from "./domain/work-report-validation";
import { evaluateWorkReportingPolicy, workReportingPolicyError } from "./domain/work-reporting-policy";
import { workPerformanceSubmissionPeriodIssue } from "./domain/work-performance-submission-period";
import { listReportWorkItems, type ReportSourceItem, type ReportWorkItemsStage } from "./report-work-items";
import { listWorkTaskSpaces } from "./task-spaces";
import { assertWorkReportDirectCommitAllowed, resolveWorkReportActionRuntime } from "./work-report-action-runtime";
import {
  normalizeWorkReportItemKind,
  normalizeWorkReportItemType,
  normalizeWorkReportPlanKind,
  normalizeWorkReportScore,
} from "./work-report-normalization";
import type { WorkReportItemInput } from "./work-report-types";
import { getWorkOkrControlSettings } from "./work-okr-control-config";
import { listWorkOkrCycleOptions } from "./work-okr-cycles";
export type { WorkReportItemInput } from "./work-report-types";
export type WorkReportPeriod = {
  periodType: "weekly" | "monthly" | "quarterly" | "half_year" | "yearly";
  periodStart: string;
  periodEnd: string;
};
export type WorkReportStage = ReportWorkItemsStage;
const reportInclude = {
  items: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
  submitter: { select: { id: true, employees: { select: { name: true }, take: 1 } } },
} satisfies Prisma.WorkReportInclude;
type ReportRow = Prisma.WorkReportGetPayload<{ include: typeof reportInclude }>;
export async function getWorkReportDraft(input: {
  userId: number;
  actorUserId?: number | null;
  targetType: WorkSpaceTargetType;
  targetId: number;
  periodType?: string | null;
  periodStart?: string | null;
  reportStage?: string | null;
}) {
  if (!(await canViewWorkTaskTarget(input.actorUserId ?? input.userId, input.targetType, input.targetId))) {
    return serviceError("无权限访问该工作空间", 403);
  }
  const period = normalizeReportPeriod(input.periodType, input.periodStart);
  const [controlSettings, cycleOptions] = await Promise.all([
    getWorkOkrControlSettings(),
    listWorkOkrCycleOptions({ keyword: "", limit: 240 }),
  ]);
  const reportingPolicy = evaluateWorkReportingPolicy(controlSettings, period);
  const reportStage = normalizeReportStage(input.reportStage);
  const report = await findSpaceReport(input.targetType, input.targetId, period.type, period.startDate, reportStage);
  const previous = await findSpaceReport(input.targetType, input.targetId, period.type, previousPeriodStart(period), reportStage);
  const workItems = await listReportWorkItems(input.targetType, input.targetId, period, reportStage, { userId: input.userId, periodType: period.type });
  const actorUserId = input.actorUserId ?? input.userId;
  const actionRuntime = await resolveWorkReportActionRuntime({
    actorUserId,
    targetType: input.targetType,
    targetId: input.targetId,
    periodType: period.type,
    periodStart: period.startDate,
    reportStage,
    confirmed: Boolean(report),
  });
  if (!actionRuntime.ok) return actionRuntime;
  const items = mergeReportItems(workItems, report, previous);
  return serviceOk({
      period: period.dto,
      reportingPolicy,
      reportingSettings: controlSettings.reporting,
      cycleOptions,
      reportStage,
      canEdit: actionRuntime.data.editability === "editable",
      actionRuntime: actionRuntime.data,
      report: report ? toReportDto(report) : null,
      items,
      groups: groupReportItems(items),
  });
}

export async function saveWorkReport(input: {
  userId: number;
  actorUserId?: number | null;
  updateGuard?: "direct" | "workflow-approved";
  targetType: WorkSpaceTargetType;
  targetId: number;
  periodType?: string | null;
  periodStart?: string | null;
  reportStage?: string | null;
  items: WorkReportItemInput[];
}) {
  const command = validateWorkReportCommand("saveWorkReport");
  if (!command.ok) return serviceError(command.issue.message, command.issue.status);
  if (input.updateGuard !== "workflow-approved" && !(await canUpdateWorkTaskAction(input.actorUserId ?? input.userId, input.targetType, input.targetId))) {
    return serviceError("无权限填写目标/考核表", 403);
  }
  const period = normalizeReportPeriod(input.periodType, input.periodStart);
  const reportingPolicy = evaluateWorkReportingPolicy(await getWorkOkrControlSettings(), period);
  const reportingPolicyIssue = reportingPolicy && workReportingPolicyError(reportingPolicy);
  if (reportingPolicyIssue) return serviceError(reportingPolicyIssue, 409);
  const reportStage = normalizeReportStage(input.reportStage);
  const futurePerformanceIssue = workPerformanceSubmissionPeriodIssue({
    reportStage,
    periodStart: period.startDate,
    businessDate: workspaceBusinessDate(new Date()),
  });
  if (futurePerformanceIssue) return serviceError(futurePerformanceIssue.message, futurePerformanceIssue.status);
  const existingReport = await findSpaceReport(input.targetType, input.targetId, period.type, period.startDate, reportStage);
  if (input.updateGuard !== "workflow-approved") {
    const workflowGuard = await assertWorkReportDirectCommitAllowed({
      actorUserId: input.actorUserId ?? input.userId,
      targetType: input.targetType,
      targetId: input.targetId,
      periodType: period.type,
      periodStart: period.startDate,
      reportStage,
      confirmed: Boolean(existingReport),
    });
    if (!workflowGuard.ok) return workflowGuard;
  }
  const workItems = await listReportWorkItems(input.targetType, input.targetId, period, reportStage, { userId: input.userId, periodType: period.type });
  const workItemIds = new Set(workItems.map((work) => work.id));
  const workPlanIds = new Set(workItems.map((work) => work.planId));
  for (const item of existingReport?.items ?? []) {
    if (item.workItemId) workItemIds.add(item.workItemId);
    if (item.workPlanId) workPlanIds.add(item.workPlanId);
  }
  const previous = await findSpaceReport(input.targetType, input.targetId, period.type, previousPeriodStart(period), reportStage);
  const previousLookup = buildPreviousLookup(previous);
  const rows = input.items
    .map((item, index) => normalizeReportItemInput(item, index, previousLookup))
    .filter((item) => item.title || item.currentKeyResult || item.nextObjective || item.workItemId);

  for (const row of rows) {
    if (row.workItemId && !workItemIds.has(row.workItemId)) {
      return serviceError("汇报事项不属于当前工作空间", 400);
    }
    if (row.workPlanId && !workPlanIds.has(row.workPlanId)) {
      return serviceError("汇报计划不属于当前工作空间", 400);
    }
  }

  const submittedBy = input.updateGuard === "workflow-approved"
    ? input.userId
    : input.actorUserId ?? input.userId;
  const report = await prisma.$transaction(async (tx) => {
    const saved = await tx.workReport.upsert({
      where: {
        targetType_targetId_periodType_periodStart_reportStage: {
          targetType: input.targetType,
          targetId: input.targetId,
          periodType: period.type,
          periodStart: period.startDate,
          reportStage,
        },
      },
      create: {
        targetType: input.targetType,
        targetId: input.targetId,
        periodType: period.type,
        reportStage,
        periodStart: period.startDate,
        periodEnd: period.endDate,
        submittedBy,
        submittedAt: new Date(),
      },
      update: {
        periodEnd: period.endDate,
        reportStage,
        submittedBy,
        submittedAt: new Date(),
      },
    });
    await tx.workReportItem.deleteMany({ where: { reportId: saved.id } });
    for (const row of rows) {
      const source = workItems.find((work) => work.id === row.workItemId && work.reportItemKind === row.reportItemKind) ?? workItems.find((work) => work.id === row.workItemId);
      await tx.workReportItem.create({
        data: {
          reportId: saved.id,
          workPlanId: row.workPlanId ?? source?.planId ?? null,
          workItemId: row.workItemId,
          title: row.title || source?.content || "未命名事项",
          workPlanTitleSnapshot: row.workPlanTitle || source?.planTitle || "",
          workPlanKindSnapshot: row.workPlanKind || source?.planKind || "",
          workItemTypeSnapshot: row.workItemType || source?.itemType || "",
          parentWorkItemIdSnapshot: row.parentWorkItemId ?? source?.parentWorkItemId ?? null,
          parentTitleSnapshot: row.parentTitle || source?.parentTitle || "",
          objectiveTitleSnapshot: source?.objectiveTitleSnapshot || row.objectiveTitleSnapshot,
          keyResultTitleSnapshot: source?.keyResultTitleSnapshot || row.keyResultTitleSnapshot,
          reportItemKindSnapshot: source?.reportItemKind || row.reportItemKind,
          workItemStatusSnapshot: source?.workItemStatusSnapshot || row.workItemStatusSnapshot,
          snapshotPlannedStartDate: source?.snapshotPlannedStartDate ?? row.snapshotPlannedStartDate,
          snapshotPlannedEndDate: source?.snapshotPlannedEndDate ?? row.snapshotPlannedEndDate,
          snapshotActualEndDate: source?.snapshotActualEndDate ?? row.snapshotActualEndDate,
          snapshotCompletedAt: source?.snapshotCompletedAt ?? row.snapshotCompletedAt,
          previousPlanSnapshot: row.previousPlanSnapshot,
          doneThisWeek: row.currentKeyResult || source?.currentKeyResult || "",
          planNextWeek: row.nextObjective || source?.nextObjective || "",
          note: row.note,
          selfScore: row.selfScore,
          performanceScore: row.performanceScore,
          sortOrder: row.sortOrder,
        },
      });
    }
    return tx.workReport.findUniqueOrThrow({ where: { id: saved.id }, include: reportInclude });
  });

  const items = mergeReportItems(workItems, report, previous);
  return serviceOk({ report: toReportDto(report), items, groups: groupReportItems(items), period: period.dto, reportStage, reportingPolicy });
}

export async function listWorkReportCollection(input: {
  userId: number;
  periodType?: string | null;
  periodStart?: string | null;
}) {
  const period = normalizeReportPeriod(input.periodType, input.periodStart);
  const { spaces } = await listWorkTaskSpaces(input.userId);
  const visibleSpaces = spaces.filter((space) => space.actionPermissions.canRead);
  const rows = await Promise.all(visibleSpaces.map(async (space) => {
    const reports = await prisma.workReport.findMany({
      where: {
        targetType: space.targetType,
        targetId: space.targetId,
        periodType: period.type,
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
      status: reports.length > 0 ? "submitted" : "missing",
      reports: reports.map(toReportDto),
    };
  }));
  return serviceOk({ period: period.dto, spaces: rows });
}

function normalizeReportItemInput(
  item: WorkReportItemInput,
  index: number,
  previousLookup: ReturnType<typeof buildPreviousLookup>,
) {
  const workPlanId = toNullableInt(item.workPlanId);
  const workItemId = toNullableInt(item.workItemId);
  const title = normalizeWorkReportText(item.title);
  const previousPlanSnapshot = normalizeWorkReportText(item.previousPlanSnapshot || lookupPreviousPlan(previousLookup, workItemId, title));
  return {
    workPlanId,
    workItemId,
    title,
    workPlanTitle: normalizeWorkReportText(item.workPlanTitle),
    workPlanKind: normalizeWorkReportPlanKind(item.workPlanKind),
    workItemType: normalizeWorkReportItemType(item.workItemType),
    parentWorkItemId: toNullableInt(item.parentWorkItemId),
    parentTitle: normalizeWorkReportText(item.parentTitle),
    objectiveTitleSnapshot: normalizeWorkReportText(item.objectiveTitleSnapshot),
    keyResultTitleSnapshot: normalizeWorkReportText(item.keyResultTitleSnapshot),
    reportItemKind: normalizeWorkReportItemKind(item.reportItemKind),
    workItemStatusSnapshot: normalizeWorkReportText(item.workItemStatusSnapshot),
    snapshotPlannedStartDate: parseDateOnly(item.snapshotPlannedStartDate),
    snapshotPlannedEndDate: parseDateOnly(item.snapshotPlannedEndDate),
    snapshotActualEndDate: parseDateOnly(item.snapshotActualEndDate),
    snapshotCompletedAt: parseDateOnly(item.snapshotCompletedAt),
    previousPlanSnapshot,
    currentKeyResult: normalizeWorkReportText(item.currentKeyResult),
    nextObjective: normalizeWorkReportText(item.nextObjective),
    note: normalizeWorkReportText(item.note),
    selfScore: normalizeWorkReportScore(item.selfScore),
    performanceScore: normalizeWorkReportScore(item.performanceScore),
    sortOrder: Number.isFinite(Number(item.sortOrder)) ? Number(item.sortOrder) : (index + 1) * 10,
  };
}

async function findSpaceReport(
  targetType: WorkSpaceTargetType,
  targetId: number,
  periodType: WorkReportPeriod["periodType"],
  periodStart: Date,
  reportStage: WorkReportStage,
) {
  return prisma.workReport.findUnique({
    where: {
      targetType_targetId_periodType_periodStart_reportStage: {
        targetType,
        targetId,
        periodType,
        periodStart,
        reportStage,
      },
    },
    include: reportInclude,
  });
}

function mergeReportItems(
  workItems: ReportSourceItem[],
  report: ReportRow | null,
  previous: ReportRow | null,
) {
  const currentItems = report?.items || [];
  const sourceKey = (workItemId: number, reportItemKind: unknown) => `${workItemId}:${normalizeWorkReportItemKind(reportItemKind)}`;
  const currentBySourceKey = new Map(currentItems.filter((item) => item.workItemId)
    .map((item) => [sourceKey(item.workItemId!, item.reportItemKindSnapshot), item]));
  const activeWorkItemIds = new Set(workItems.map((work) => work.id));
  const previousLookup = buildPreviousLookup(previous);
  const rows = workItems.map((work, index) => {
    const item = currentBySourceKey.get(sourceKey(work.id, work.reportItemKind));
    return {
      id: item?.id ?? null,
      workPlanId: work.planId,
      workItemId: work.id,
      title: item?.title || work.content,
      workPlanTitle: item?.workPlanTitleSnapshot || work.planTitle,
      workPlanKind: normalizeWorkReportPlanKind(item?.workPlanKindSnapshot || work.planKind),
      workItemType: normalizeWorkReportItemType(item?.workItemTypeSnapshot || work.itemType),
      parentWorkItemId: item?.parentWorkItemIdSnapshot ?? work.parentWorkItemId,
      parentTitle: item?.parentTitleSnapshot || work.parentTitle,
      objectiveTitleSnapshot: item?.objectiveTitleSnapshot || work.objectiveTitleSnapshot,
      keyResultTitleSnapshot: item?.keyResultTitleSnapshot || work.keyResultTitleSnapshot,
      reportItemKind: normalizeWorkReportItemKind(item?.reportItemKindSnapshot || work.reportItemKind),
      workItemStatusSnapshot: item?.workItemStatusSnapshot || work.workItemStatusSnapshot,
      snapshotPlannedStartDate: formatNullableDate(item?.snapshotPlannedStartDate ?? work.snapshotPlannedStartDate),
      snapshotPlannedEndDate: formatNullableDate(item?.snapshotPlannedEndDate ?? work.snapshotPlannedEndDate),
      snapshotActualEndDate: formatNullableDate(item?.snapshotActualEndDate ?? work.snapshotActualEndDate),
      snapshotCompletedAt: formatNullableDate(item?.snapshotCompletedAt ?? work.snapshotCompletedAt),
      previousPlanSnapshot: item?.previousPlanSnapshot || lookupPreviousPlan(previousLookup, work.id, work.content),
      currentKeyResult: item?.doneThisWeek || work.currentKeyResult,
      nextObjective: item?.planNextWeek || work.nextObjective,
      note: item?.note || "",
      selfScore: item?.selfScore ?? null,
      performanceScore: item?.performanceScore ?? null,
      sortOrder: item?.sortOrder ?? (work.sortOrder || (index + 1) * 10),
      source: "work" as const,
    };
  });
  const extraRows = currentItems
    .filter((item) => !item.workItemId || !activeWorkItemIds.has(item.workItemId))
    .map((item) => ({
      id: item.id,
      workPlanId: item.workPlanId,
      workItemId: item.workItemId,
      title: item.title,
      workPlanTitle: item.workPlanTitleSnapshot,
      workPlanKind: normalizeWorkReportPlanKind(item.workPlanKindSnapshot),
      workItemType: normalizeWorkReportItemType(item.workItemTypeSnapshot),
      parentWorkItemId: item.parentWorkItemIdSnapshot,
      parentTitle: item.parentTitleSnapshot,
      objectiveTitleSnapshot: item.objectiveTitleSnapshot,
      keyResultTitleSnapshot: item.keyResultTitleSnapshot,
      reportItemKind: normalizeWorkReportItemKind(item.reportItemKindSnapshot),
      workItemStatusSnapshot: item.workItemStatusSnapshot,
      snapshotPlannedStartDate: formatNullableDate(item.snapshotPlannedStartDate),
      snapshotPlannedEndDate: formatNullableDate(item.snapshotPlannedEndDate),
      snapshotActualEndDate: formatNullableDate(item.snapshotActualEndDate),
      snapshotCompletedAt: formatNullableDate(item.snapshotCompletedAt),
      previousPlanSnapshot: item.previousPlanSnapshot || lookupPreviousPlan(previousLookup, item.workItemId, item.title),
      currentKeyResult: item.doneThisWeek,
      nextObjective: item.planNextWeek,
      note: item.note,
      selfScore: item.selfScore,
      performanceScore: item.performanceScore,
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
  const items = report.items.map((item) => ({
    id: item.id,
    workPlanId: item.workPlanId,
    workItemId: item.workItemId,
    title: item.title,
    workPlanTitle: item.workPlanTitleSnapshot,
    workPlanKind: normalizeWorkReportPlanKind(item.workPlanKindSnapshot),
    workItemType: normalizeWorkReportItemType(item.workItemTypeSnapshot),
    parentWorkItemId: item.parentWorkItemIdSnapshot,
    parentTitle: item.parentTitleSnapshot,
    objectiveTitleSnapshot: item.objectiveTitleSnapshot,
    keyResultTitleSnapshot: item.keyResultTitleSnapshot,
    reportItemKind: normalizeWorkReportItemKind(item.reportItemKindSnapshot),
    workItemStatusSnapshot: item.workItemStatusSnapshot,
    snapshotPlannedStartDate: formatNullableDate(item.snapshotPlannedStartDate),
    snapshotPlannedEndDate: formatNullableDate(item.snapshotPlannedEndDate),
    snapshotActualEndDate: formatNullableDate(item.snapshotActualEndDate),
    snapshotCompletedAt: formatNullableDate(item.snapshotCompletedAt),
    previousPlanSnapshot: item.previousPlanSnapshot,
    currentKeyResult: item.doneThisWeek,
    nextObjective: item.planNextWeek,
    note: item.note,
    selfScore: item.selfScore,
    performanceScore: item.performanceScore,
    sortOrder: item.sortOrder,
  }));
  return {
    id: report.id,
    targetType: report.targetType,
    targetId: report.targetId,
    periodType: report.periodType,
    reportStage: normalizeReportStage(report.reportStage),
    periodStart: formatDate(report.periodStart),
    periodEnd: formatDate(report.periodEnd),
    submittedBy: report.submittedBy,
    submitterName: userName(report.submitter),
    submittedAt: report.submittedAt?.toISOString() || null,
    updatedAt: report.updatedAt.toISOString(),
    items,
    groups: groupReportItems(items),
  };
}

function groupReportItems<T extends {
  workPlanId: number | null;
  workPlanTitle: string;
  workPlanKind: "okr" | "routine" | null;
  sortOrder: number;
}>(items: T[]) {
  const groups = new Map<string, {
    key: string;
    title: string;
    kind: "okr" | "routine";
    workPlanId: number | null;
    items: T[];
  }>();
  for (const item of items) {
    const kind = item.workPlanKind === "okr" ? "okr" : "routine";
    const workPlanId = item.workPlanId;
    const key = kind === "okr" && workPlanId ? `okr:${workPlanId}` : "routine";
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        title: kind === "okr" ? item.workPlanTitle || "目标计划" : "日常工作",
        kind,
        workPlanId: kind === "okr" ? workPlanId : null,
        items: [],
      });
    }
    groups.get(key)?.items.push(item);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    items: group.items.sort((a, b) => a.sortOrder - b.sortOrder),
  }));
}

function normalizeReportPeriod(typeInput?: string | null, startInput?: string | null) {
  const periodType = normalizeReportPeriodType(typeInput);
  const base = parseDateOnly(startInput) || todayUtc();
  if (periodType === "weekly") return normalizeWeeklyPeriod(startInput);
  const startDate = periodStartFor(base, periodType);
  const endDate = addDays(periodStartFor(addPeriod(startDate, periodType), periodType), -1);
  return periodResult(periodType, startDate, endDate);
}

function normalizeWeeklyPeriod(input?: string | null) {
  const startDate = parseDateOnly(normalizeWorkReportWeekStart(input, formatDate(todayUtc()))) || todayUtc();
  return periodResult("weekly", startDate, addDays(startDate, 6));
}

function periodResult(type: WorkReportPeriod["periodType"], startDate: Date, endDate: Date) {
  return { type, startDate, endDate, dto: { periodType: type, periodStart: formatDate(startDate), periodEnd: formatDate(endDate) } };
}

function normalizeReportPeriodType(value: string | null | undefined): WorkReportPeriod["periodType"] {
  return value === "monthly" || value === "quarterly" || value === "half_year" || value === "yearly" ? value : "weekly";
}

function normalizeReportStage(value: string | null | undefined): WorkReportStage {
  return value === "kr" ? "kr" : "final";
}
function periodStartFor(date: Date, periodType: WorkReportPeriod["periodType"]) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  if (periodType === "yearly") return utcDate(year, 0, 1);
  if (periodType === "half_year") return utcDate(year, month < 6 ? 0 : 6, 1);
  if (periodType === "quarterly") return utcDate(year, Math.floor(month / 3) * 3, 1);
  return utcDate(year, month, 1);
}
function addPeriod(date: Date, periodType: WorkReportPeriod["periodType"]) {
  if (periodType === "yearly") return utcDate(date.getUTCFullYear() + 1, 0, 1);
  if (periodType === "half_year") return utcDate(date.getUTCFullYear(), date.getUTCMonth() + 6, 1);
  if (periodType === "quarterly") return utcDate(date.getUTCFullYear(), date.getUTCMonth() + 3, 1);
  if (periodType === "monthly") return utcDate(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
  return addDays(date, 7);
}
function previousPeriodStart(period: ReturnType<typeof normalizeReportPeriod>) {
  if (period.type === "weekly") return addDays(period.startDate, -7);
  const months = period.type === "yearly" ? -12 : period.type === "half_year" ? -6 : period.type === "quarterly" ? -3 : -1;
  return utcDate(period.startDate.getUTCFullYear(), period.startDate.getUTCMonth() + months, 1);
}
function parseDateOnly(input?: string | null) {
  if (!input) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}
function todayUtc() {
  const now = new Date();
  return utcDate(now.getFullYear(), now.getMonth(), now.getDate());
}
function utcDate(year: number, monthIndex: number, day: number) {
  return new Date(Date.UTC(year, monthIndex, day));
}
function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}
function formatDate(value: Date) {
  return value.toISOString().slice(0, 10);
}
function formatNullableDate(value: Date | null | undefined) {
  return value ? formatDate(value) : null;
}
function toNullableInt(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
function userName(user: ReportRow["submitter"]) {
  return user.employees[0]?.name || "未绑定员工";
}
