import { prisma } from "@workspace/platform/server/prisma";
import type { DomainServiceResult } from "@workspace/platform/server/domain-validation";
import { validateCompletionSchedule } from "@workspace/platform/completion-date-policy";
import { canCreateWorkTaskAction } from "./access";
import { validateWorkPeriodScheduleCommand } from "./domain/work-period-schedule-validation";
import { toWorkItemDto, workItemInclude } from "./work-item-dto";
import { toWorkPlanDto, workPlanInclude } from "./work-plan-dto";
import { createWorkPlan } from "./work-plans";
import { createWorkItem } from "./works";
import { assertWorkItemMutationCommitAllowed, type WorkItemMutationAuthorization } from "./work-item-mutation-guard";

const SCHEDULE_ITEM_TYPES = new Set(["objective", "key_result"]);

type ScheduleItemType = "objective" | "key_result";
type CreatedPlanResult = { id?: number };

export type CreateWorkPeriodScheduleItemCommand = {
  actorUserId: number;
  mutationAuthorization?: WorkItemMutationAuthorization;
  rootPlanId: number;
  cycleId: number;
  sourceItemId: number;
  itemType: ScheduleItemType;
  content: string;
  description?: string | null;
  status?: string | null;
  importance?: number | null;
  urgency?: number | null;
  ownerEmployeeId?: number | null;
  actualStartDate?: Date | string | null;
  actualEndDate?: Date | string | null;
  plannedStartDate?: Date | string | null;
  plannedEndDate?: Date | string | null;
  responsibilityPositionId?: number | null;
  responsibilityNodeId?: number | null;
  krUnit?: string | null;
};

export async function createWorkPeriodScheduleItem(command: CreateWorkPeriodScheduleItemCommand): Promise<DomainServiceResult<{
  planId: number;
  workId: number;
  plan: ReturnType<typeof toWorkPlanDto>;
  item: ReturnType<typeof toWorkItemDto>;
  planCycleId: number;
  planCycleLabel: string;
  overlapCycleIds: number[];
  planOverlapCycleIds: number[];
}>> {
  const guard = validateWorkPeriodScheduleCommand("createWorkPeriodScheduleItem");
  if (!guard.ok) return { ok: false, error: guard.issue.message, status: guard.issue.status };
  const normalized = normalizeCreateScheduleCommand(command);
  if (!normalized.ok) return normalized;
  const rootPlan = await prisma.workPlan.findUnique({
    where: { id: normalized.data.rootPlanId },
    select: {
      id: true,
      targetType: true,
      targetId: true,
      kind: true,
      status: true,
      isArchived: true,
      ownerEmployeeId: true,
      okrCycle: { select: { id: true, label: true, periodType: true, startDate: true, endDate: true } },
    },
  });
  if (!rootPlan || rootPlan.kind !== "okr" || rootPlan.isArchived) return { ok: false, error: "上级计划不存在", status: 404 };
  const workflowGuard = await assertWorkItemMutationCommitAllowed({
    operation: "create",
    actorUserId: normalized.data.actorUserId,
    targetType: rootPlan.targetType,
    targetId: rootPlan.targetId,
    authorization: normalized.data.mutationAuthorization,
  });
  if (!workflowGuard.ok) return workflowGuard;
  if (normalized.data.mutationAuthorization !== "workflow-approved" && !(await canCreateWorkTaskAction(normalized.data.actorUserId, rootPlan.targetType, rootPlan.targetId))) {
    return { ok: false, error: "无权限编辑工作计划", status: 403 };
  }
  const cycle = await prisma.workOkrCycle.findUnique({
    where: { id: normalized.data.cycleId },
    select: { id: true, label: true, periodType: true, startDate: true, endDate: true },
  });
  if (!cycle) return { ok: false, error: "OKR 周期不存在", status: 404 };
  const sourceItem = await prisma.workItem.findUnique({
    where: { id: normalized.data.sourceItemId },
    select: {
      id: true,
      planId: true,
      itemType: true,
      content: true,
      ownerEmployeeId: true,
      krUnit: true,
      parentWorkItemId: true,
      responsibilityReferences: {
        where: { referenceRole: "execution" },
        select: { responsibilityNodeId: true, lockedPositionId: true },
        take: 1,
      },
    },
  });
  if (!sourceItem || sourceItem.planId !== rootPlan.id || sourceItem.itemType !== normalized.data.itemType) {
    return { ok: false, error: "上级节点不存在", status: 404 };
  }
  if (!isTaskScheduleCycle(rootPlan.okrCycle, cycle)) {
    const targetPlanId = await ensureSchedulePlan({
      actorUserId: normalized.data.actorUserId,
      rootPlan,
      cycle,
    });
    if (!targetPlanId.ok) return targetPlanId;
    const parentWorkItemId = normalized.data.itemType === "key_result"
      ? await findChildObjectiveId({
          planId: targetPlanId.data,
          parentObjectiveId: sourceItem.parentWorkItemId,
        })
      : null;
    if (normalized.data.itemType === "key_result" && !parentWorkItemId) {
      return { ok: false, error: "请先在本期创建对应目标，再拆 KR", status: 400 };
    }
    const isObjective = normalized.data.itemType === "objective";
    const ownerEmployeeId = withFallback(normalized.data.ownerEmployeeId, sourceItem.ownerEmployeeId ?? rootPlan.ownerEmployeeId);
    const responsibilityNodeId = withFallback(normalized.data.responsibilityNodeId, sourceItem.responsibilityReferences[0]?.responsibilityNodeId ?? null);
    const responsibilityPositionId = withFallback(normalized.data.responsibilityPositionId, sourceItem.responsibilityReferences[0]?.lockedPositionId ?? null);
    const work = await createWorkItem({
      actorUserId: normalized.data.actorUserId,
      planId: targetPlanId.data,
      targetType: rootPlan.targetType,
      targetId: rootPlan.targetId,
      category: "non-routine",
      itemType: normalized.data.itemType,
      content: normalized.data.content,
      ownerEmployeeId,
      plannedStartDate: isObjective ? withFallback(normalized.data.plannedStartDate, cycle.startDate) : null,
      plannedEndDate: isObjective ? withFallback(normalized.data.plannedEndDate, cycle.endDate) : null,
      periodType: cycle.periodType,
      periodStart: cycle.startDate,
      periodEnd: cycle.endDate,
      parentWorkItemId,
      parentPeriodWorkItemId: sourceItem.id,
      sourceType: "other",
      krUnit: normalized.data.itemType === "key_result" ? withFallback(normalized.data.krUnit, sourceItem.krUnit ?? "") : "",
      responsibilityNodeId: isObjective ? responsibilityNodeId : null,
      responsibilityPositionId: isObjective ? responsibilityPositionId : null,
      sortOrder: await nextWorkItemSortOrder(targetPlanId.data),
      mutationAuthorization: normalized.data.mutationAuthorization,
    });
    if (!work.ok) return { ok: false, error: work.error, status: work.status };
    const workId = Number((work.data as { id?: number }).id);
    const [createdWork, targetPlan] = await Promise.all([
      prisma.workItem.findUnique({ where: { id: workId }, include: workItemInclude }),
      prisma.workPlan.findUnique({ where: { id: targetPlanId.data }, include: workPlanInclude }),
    ]);
    if (!createdWork || !targetPlan) return { ok: false, error: "新增时间安排失败", status: 500 };
    return {
      ok: true,
      data: {
        planId: targetPlanId.data,
        workId,
        plan: toWorkPlanDto(targetPlan),
        item: toWorkItemDto(createdWork),
        planCycleId: cycle.id,
        planCycleLabel: cycle.label,
        overlapCycleIds: [cycle.id],
        planOverlapCycleIds: [cycle.id],
      },
    };
  }
  const ownerEmployeeId = withFallback(normalized.data.ownerEmployeeId, sourceItem.ownerEmployeeId ?? rootPlan.ownerEmployeeId);
  const responsibilityNodeId = normalized.data.responsibilityNodeId ?? null;
  const responsibilityPositionId = withFallback(normalized.data.responsibilityPositionId, sourceItem.responsibilityReferences[0]?.lockedPositionId ?? null);
  const plannedStartDate = withFallback(normalized.data.plannedStartDate, cycle.startDate);
  const plannedEndDate = withFallback(normalized.data.plannedEndDate, cycle.endDate);
  const parentWorkItemId = sourceItem.itemType === "objective" ? sourceItem.id : sourceItem.parentWorkItemId;
  if (!parentWorkItemId) return { ok: false, error: "关联目标不存在", status: 400 };
  const work = await createWorkItem({
    actorUserId: normalized.data.actorUserId,
    planId: rootPlan.id,
    targetType: rootPlan.targetType,
    targetId: rootPlan.targetId,
    category: "non-routine",
    itemType: "task",
    content: normalized.data.content,
    description: normalized.data.description ?? "",
    status: normalized.data.status,
    importance: normalized.data.importance == null ? undefined : normalized.data.importance,
    urgency: normalized.data.urgency == null ? undefined : normalized.data.urgency,
    ownerEmployeeId,
    actualStartDate: normalized.data.actualStartDate,
    actualEndDate: normalized.data.actualEndDate,
    plannedStartDate,
    plannedEndDate,
    periodType: cycle.periodType,
    periodStart: cycle.startDate,
    periodEnd: cycle.endDate,
    parentWorkItemId,
    parentPeriodWorkItemId: sourceItem.itemType === "key_result" ? sourceItem.id : null,
    sourceType: "other",
    responsibilityNodeId,
    responsibilityPositionId,
    sortOrder: await nextWorkItemSortOrder(rootPlan.id),
    mutationAuthorization: normalized.data.mutationAuthorization,
  });
  if (!work.ok) return { ok: false, error: work.error, status: work.status };
  const workId = Number((work.data as { id?: number }).id);
  const [createdWork, targetPlan] = await Promise.all([
    prisma.workItem.findUnique({ where: { id: workId }, include: workItemInclude }),
    prisma.workPlan.findUnique({ where: { id: rootPlan.id }, include: workPlanInclude }),
  ]);
  if (!createdWork || !targetPlan) return { ok: false, error: "新增时间安排失败", status: 500 };
  const range = dateRange(dateOrNull(plannedStartDate), dateOrNull(plannedEndDate)) ?? dateRange(cycle.startDate, cycle.endDate);
  const itemOverlapCycleIds = range ? await overlapCycleIdsForRange(cycle, rootPlan.okrCycle, range) : [cycle.id];
  const planOverlapCycleIds = rootPlan.okrCycle ? await overlapCycleIdsForRange(cycle, rootPlan.okrCycle, rootPlan.okrCycle) : itemOverlapCycleIds;
  return {
    ok: true,
    data: {
      planId: rootPlan.id,
      workId,
      plan: toWorkPlanDto(targetPlan),
      item: toWorkItemDto(createdWork),
      planCycleId: rootPlan.okrCycle?.id ?? cycle.id,
      planCycleLabel: rootPlan.okrCycle?.label ?? cycle.label,
      overlapCycleIds: itemOverlapCycleIds,
      planOverlapCycleIds,
    },
  };
}

function normalizeCreateScheduleCommand(command: CreateWorkPeriodScheduleItemCommand): DomainServiceResult<CreateWorkPeriodScheduleItemCommand> {
  const rootPlanId = normalizePositiveId(command.rootPlanId);
  const cycleId = normalizePositiveId(command.cycleId);
  const sourceItemId = normalizePositiveId(command.sourceItemId);
  const actorUserId = normalizePositiveId(command.actorUserId);
  const itemType = String(command.itemType ?? "") as ScheduleItemType;
  const content = String(command.content ?? "").trim();
  const description = command.description == null ? "" : String(command.description);
  const status = normalizeStatus(command.status);
  const importance = normalizeRating(command.importance);
  const urgency = normalizeRating(command.urgency);
  const ownerEmployeeId = normalizeOptionalPositiveId(command.ownerEmployeeId);
  const responsibilityPositionId = normalizeOptionalPositiveId(command.responsibilityPositionId);
  const responsibilityNodeId = normalizeOptionalPositiveId(command.responsibilityNodeId);
  const actualStartDate = normalizeOptionalDate(command.actualStartDate);
  const actualEndDate = normalizeOptionalDate(command.actualEndDate);
  const plannedStartDate = normalizeOptionalDate(command.plannedStartDate);
  const plannedEndDate = normalizeOptionalDate(command.plannedEndDate);
  if (!actorUserId || !rootPlanId || !cycleId || !sourceItemId) return { ok: false, error: "时间安排参数无效", status: 400 };
  if (!SCHEDULE_ITEM_TYPES.has(itemType)) return { ok: false, error: "时间安排节点类型无效", status: 400 };
  if (!content) return { ok: false, error: "节点内容不能为空", status: 400 };
  if (actualStartDate === false || actualEndDate === false || plannedStartDate === false || plannedEndDate === false) return { ok: false, error: "任务日期无效", status: 400 };
  const scheduleError = validateCompletionSchedule({ status, actualStartDate, actualEndDate, plannedStartDate, plannedEndDate });
  if (scheduleError) return { ok: false, error: scheduleError, status: 400 };
  if (importance === false || urgency === false) return { ok: false, error: "任务评分无效", status: 400 };
  return {
    ok: true,
    data: {
      actorUserId,
      rootPlanId,
      cycleId,
      sourceItemId,
      itemType,
      content,
      description,
      status,
      importance,
      urgency,
      ownerEmployeeId,
      actualStartDate,
      actualEndDate,
      plannedStartDate,
      plannedEndDate,
      responsibilityPositionId,
      responsibilityNodeId,
      krUnit: command.krUnit === undefined ? undefined : command.krUnit == null ? null : String(command.krUnit),
    },
  };
}

function isTaskScheduleCycle(rootCycle: { periodType: string } | null, cycle: { periodType: string }) {
  return rootCycle?.periodType === "monthly" && cycle.periodType === "weekly";
}

async function ensureSchedulePlan({
  actorUserId,
  rootPlan,
  cycle,
}: {
  actorUserId: number;
  rootPlan: {
    id: number;
    targetType: string;
    targetId: number;
    ownerEmployeeId: number | null;
    okrCycle: { label: string | null } | null;
  };
  cycle: { id: number; label: string; periodType: string; startDate: Date; endDate: Date };
}): Promise<DomainServiceResult<number>> {
  const existing = await prisma.workPlan.findFirst({
    where: {
      targetType: rootPlan.targetType,
      targetId: rootPlan.targetId,
      kind: "okr",
      okrCycleId: cycle.id,
      isArchived: false,
    },
    select: { id: true },
  });
  if (existing) return { ok: true, data: existing.id };
  const created = await createWorkPlan({
    actorUserId,
    isSystemGenerated: true,
    targetType: rootPlan.targetType,
    targetId: rootPlan.targetId,
    kind: "okr",
    ownerEmployeeId: rootPlan.ownerEmployeeId,
    okrCycleId: cycle.id,
    periodType: cycle.periodType,
    plannedStartDate: cycle.startDate,
    plannedEndDate: cycle.endDate,
    alignmentSourceType: "plan",
    alignmentSourcePlanId: rootPlan.id,
    parentPeriodPlanId: rootPlan.id,
    sortOrder: await nextWorkPlanSortOrder(rootPlan.targetType, rootPlan.targetId),
  });
  if (!created.ok) return { ok: false, error: created.error, status: created.status };
  const planId = Number((created.data as CreatedPlanResult).id);
  if (Number.isInteger(planId) && planId > 0) return { ok: true, data: planId };
  const fallback = await prisma.workPlan.findFirst({
    where: { targetType: rootPlan.targetType, targetId: rootPlan.targetId, kind: "okr", okrCycleId: cycle.id, isArchived: false },
    select: { id: true },
  });
  return fallback ? { ok: true, data: fallback.id } : { ok: false, error: "创建下级周期计划失败", status: 500 };
}

async function findChildObjectiveId({
  planId,
  parentObjectiveId,
}: {
  planId: number;
  parentObjectiveId: number | null;
}) {
  if (!parentObjectiveId) return null;
  const childObjective = await prisma.workItem.findFirst({
    where: {
      planId,
      itemType: "objective",
      parentPeriodWorkItemId: parentObjectiveId,
      isArchived: false,
    },
    select: { id: true },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
  return childObjective?.id ?? null;
}

async function nextWorkPlanSortOrder(targetType: string, targetId: number) {
  const max = await prisma.workPlan.aggregate({
    where: { targetType, targetId },
    _max: { sortOrder: true },
  });
  return (max._max.sortOrder ?? 0) + 1;
}

async function nextWorkItemSortOrder(planId: number) {
  const max = await prisma.workItem.aggregate({
    where: { planId },
    _max: { sortOrder: true },
  });
  return (max._max.sortOrder ?? 0) + 1;
}

async function overlapCycleIdsForRange(
  displayCycle: { periodType: string },
  rootCycle: { startDate: Date; endDate: Date } | null,
  range: { startDate: Date; endDate: Date },
) {
  const cycles = await prisma.workOkrCycle.findMany({
    where: {
      periodType: displayCycle.periodType,
      startDate: { lte: rootCycle?.endDate ?? range.endDate },
      endDate: { gte: rootCycle?.startDate ?? range.startDate },
    },
    select: { id: true, startDate: true, endDate: true },
  });
  return cycles
    .filter((item) => item.startDate <= range.endDate && item.endDate >= range.startDate)
    .map((item) => item.id);
}

function dateRange(start: Date | null | undefined, end: Date | null | undefined) {
  return start && end ? { startDate: start, endDate: end } : null;
}

function dateOrNull(value: Date | string | null | undefined) {
  return value ? value instanceof Date ? value : new Date(value) : null;
}

function normalizePositiveId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function normalizeOptionalPositiveId(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return normalizePositiveId(value);
}

function normalizeOptionalDate(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? false : date;
}

function normalizeStatus(value: unknown) {
  if (value === undefined || value === null || value === "") return "active";
  const status = String(value);
  return status === "paused" || status === "done" ? status : "active";
}

function normalizeRating(value: unknown) {
  if (value === undefined || value === null || value === "") return 3;
  const number = Number(value);
  return Number.isFinite(number) ? number : false;
}

function withFallback<T>(value: T | null | undefined, fallback: T | null): T | null {
  return value === undefined ? fallback : value;
}
