import { matchesFkKeyword, type FkOption, type FkTargetRecord } from "@workspace/platform/server/relation-registry";
import { Prisma, prisma } from "@workspace/platform/server/prisma";
import { isAssignedWorkItemAlignmentSource, validateAssignedTaskAlignmentSource } from "./work-assigned-alignment-options";
type PeriodRelationKind = "parent" | "previous";

type PeriodRange = { startDate: Date; endDate: Date };

export async function validateWorkPlanPeriodRelations(input: {
  currentPlanId?: number | null;
  kind?: string | null;
  targetType?: string | null;
  targetId?: number | null;
  okrCycleId?: number | null;
  parentPeriodPlanId?: number | null;
  previousPeriodPlanId?: number | null;
}) {
  if (input.kind !== "okr") {
    if (input.parentPeriodPlanId || input.previousPeriodPlanId) return "只有 OKR 计划可以选择上级或前序计划";
    return null;
  }
  const currentCycle = await currentCycleForPlanInput(input.okrCycleId);
  const parentError = await validatePlanRelation({
    label: "上级计划",
    relation: "parent",
    candidateId: input.parentPeriodPlanId,
    currentPlanId: input.currentPlanId,
    currentCycle,
    targetType: input.targetType,
    targetId: input.targetId,
  });
  if (parentError) return parentError;
  return validatePlanRelation({
    label: "前序计划",
    relation: "previous",
    candidateId: input.previousPeriodPlanId,
    currentPlanId: input.currentPlanId,
    currentCycle,
    targetType: input.targetType,
    targetId: input.targetId,
  });
}

export async function validateWorkItemPeriodRelations(input: {
  actorUserId?: number | null;
  currentWorkId?: number | null;
  targetType: string;
  targetId: number;
  planId?: number | null;
  category?: string | null;
  itemType?: string | null;
  parentWorkItemId?: number | null;
  parentPeriodWorkItemId?: number | null;
  previousPeriodWorkItemId?: number | null;
}) {
  if (!input.parentPeriodWorkItemId && !input.previousPeriodWorkItemId) return null;
  if (input.itemType === "task") {
    if (await isInternalTaskScheduleSource(input)) return null;
    return validateAssignedTaskAlignmentSource(input);
  }
  if (input.itemType !== "objective" && input.itemType !== "key_result") return "只有目标和 KR 可以选择上级或前置节点";
  const currentPlan = input.planId ? await prisma.workPlan.findUnique({
    where: { id: input.planId },
    select: { kind: true, okrCycle: { select: { startDate: true, endDate: true } } },
  }) : null;
  if (!currentPlan || currentPlan.kind !== "okr" || !currentPlan.okrCycle) return "选择上级或前置节点前必须先选择所属周期";
  const currentCycle = currentPlan.okrCycle;
  const parentIsExternal = await isAssignedWorkItemAlignmentSource(input);
  if (!parentIsExternal) {
    const parentError = await validateItemRelation({
      label: input.itemType === "objective" ? "上级目标" : "上级 KR",
      relation: "parent",
      candidateId: input.parentPeriodWorkItemId,
      currentWorkId: input.currentWorkId,
      currentCycle,
      targetType: input.targetType,
      targetId: input.targetId,
      itemType: input.itemType,
    });
    if (parentError) return parentError;
  }
  return validateItemRelation({
    label: input.itemType === "objective" ? "前置目标" : "前置 KR",
    relation: "previous",
    candidateId: input.previousPeriodWorkItemId,
    currentWorkId: input.currentWorkId,
    currentCycle,
    targetType: input.targetType,
    targetId: input.targetId,
    itemType: input.itemType,
  });
}

async function isInternalTaskScheduleSource(input: {
  currentWorkId?: number | null;
  targetType: string;
  targetId: number;
  planId?: number | null;
  parentWorkItemId?: number | null;
  parentPeriodWorkItemId?: number | null;
}) {
  if (!input.planId || !input.parentWorkItemId || !input.parentPeriodWorkItemId) return false;
  const source = await prisma.workItem.findFirst({
    where: {
      id: input.currentWorkId
        ? { equals: input.parentPeriodWorkItemId, not: input.currentWorkId }
        : input.parentPeriodWorkItemId,
      planId: input.planId,
      targetType: input.targetType,
      targetId: input.targetId,
      isArchived: false,
    },
    select: { id: true, itemType: true, parentWorkItemId: true },
  });
  if (source?.itemType === "objective") return source.id === input.parentWorkItemId;
  if (source?.itemType === "key_result") return source.parentWorkItemId === input.parentWorkItemId;
  return false;
}

export async function listWorkPeriodPlanRelationOptions(input: {
  keyword: string;
  relation: PeriodRelationKind;
  targetType?: string | null;
  targetId?: number | null;
  okrCycleId?: number | null;
  currentPlanId?: number | null;
}) {
  const targetId = normalizePositive(input.targetId);
  if (!input.targetType || !targetId) return [];
  const currentCycle = await currentCycleForPlanInput(input.okrCycleId);
  if (!currentCycle) return [];
  const rows = await prisma.workPlan.findMany({
    where: {
      targetType: input.targetType,
      targetId,
      kind: "okr",
      isArchived: false,
      ...(input.currentPlanId ? { id: { not: input.currentPlanId } } : {}),
      okrCycle: cycleWhere(input.relation, currentCycle),
    },
    select: planOptionSelect,
    orderBy: [{ okrCycle: { startDate: "desc" } }, { id: "desc" }],
    take: input.keyword.trim() ? 120 : 50,
  });
  return rows
    .filter((row) => row.okrCycle && relationMatches(input.relation, row.okrCycle, currentCycle))
    .map(planRowToOption)
    .filter((option) => matchesFkKeyword([option.name, option.subtitle], input.keyword))
    .slice(0, 20);
}

export async function listWorkPlanAlignmentOptions(input: {
  userId?: number | null;
  keyword: string;
  targetType?: string | null;
  targetId?: number | null;
  okrCycleId?: number | null;
  currentPlanId?: number | null;
}) {
  const targetId = normalizePositive(input.targetId);
  if (!input.targetType || !targetId) return [];
  const itemRows = await listUnalignedAssignedAlignmentItemRows({
    userId: input.userId,
    targetType: input.targetType,
    targetId,
    currentPlanId: normalizePositive(input.currentPlanId),
    take: input.keyword.trim() ? 120 : 50,
  });
  const seenItems = new Set<number>();
  return itemRows
    .filter((row) => {
      if (seenItems.has(row.id)) return false;
      seenItems.add(row.id);
      return true;
    })
    .map(alignmentItemRowToOption)
    .filter((option) => matchesFkKeyword([option.name, option.subtitle], input.keyword))
    .slice(0, 20);
}

export async function listWorkPlanUpperAlignmentOptions(input: {
  keyword: string;
  targetType?: string | null;
  targetId?: number | null;
  okrCycleId?: number | null;
  currentPlanId?: number | null;
}) {
  const targetId = normalizePositive(input.targetId);
  if (!input.targetType || !targetId) return [];
  const currentCycle = await currentCycleForPlanInput(input.okrCycleId);
  if (!currentCycle) return [];
  const planRows = await prisma.workPlan.findMany({
    where: {
      targetType: input.targetType,
      targetId,
      kind: "okr",
      isArchived: false,
      ...(input.currentPlanId ? { id: { not: input.currentPlanId } } : {}),
      okrCycle: cycleWhere("parent", currentCycle),
    },
    select: planOptionSelect,
    orderBy: [{ okrCycle: { startDate: "desc" } }, { id: "desc" }],
    take: input.keyword.trim() ? 80 : 30,
  });
  const itemRows = await prisma.workItem.findMany({
    where: {
      targetType: input.targetType,
      targetId,
      itemType: { in: ["objective", "key_result"] },
      isArchived: false,
      plan: { kind: "okr", isArchived: false, okrCycle: cycleWhere("parent", currentCycle) },
    },
    select: alignmentItemOptionSelect,
    orderBy: [{ plan: { okrCycle: { startDate: "desc" } } }, { id: "desc" }],
    take: input.keyword.trim() ? 120 : 50,
  });
  return [
    ...planRows.filter((row) => row.okrCycle && relationMatches("parent", row.okrCycle, currentCycle)).map(alignmentPlanRowToOption),
    ...itemRows.filter((row) => row.plan?.okrCycle && relationMatches("parent", row.plan.okrCycle, currentCycle)).map(alignmentItemRowToOption),
  ].filter((option) => matchesFkKeyword([option.name, option.subtitle], input.keyword)).slice(0, 20);
}

export async function listWorkPeriodItemRelationOptions(input: {
  keyword: string;
  relation: PeriodRelationKind;
  targetType?: string | null;
  targetId?: number | null;
  planId?: number | null;
  currentWorkItemId?: number | null;
  itemType?: string | null;
}) {
  const targetId = normalizePositive(input.targetId);
  if (!input.targetType || !targetId || (input.itemType !== "objective" && input.itemType !== "key_result")) return [];
  const currentPlan = input.planId ? await prisma.workPlan.findUnique({
    where: { id: input.planId },
    select: { okrCycle: { select: { startDate: true, endDate: true } } },
  }) : null;
  if (!currentPlan?.okrCycle) return [];
  const currentCycle = currentPlan.okrCycle;
  const rows = await prisma.workItem.findMany({
    where: {
      targetType: input.targetType,
      targetId,
      itemType: input.itemType,
      isArchived: false,
      ...(input.currentWorkItemId ? { id: { not: input.currentWorkItemId } } : {}),
      plan: {
        kind: "okr",
        isArchived: false,
        okrCycle: cycleWhere(input.relation, currentCycle),
      },
    },
    select: itemOptionSelect,
    orderBy: [{ plan: { okrCycle: { startDate: "desc" } } }, { id: "desc" }],
    take: input.keyword.trim() ? 120 : 50,
  });
  const seen = new Set<number>();
  return rows
    .filter((row) => {
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    })
    .filter((row) => row.plan?.okrCycle && relationMatches(input.relation, row.plan.okrCycle, currentCycle))
    .map(itemRowToOption)
    .filter((option) => matchesFkKeyword([option.name, option.subtitle], input.keyword))
    .slice(0, 20);
}

export async function resolveWorkPlanRelationOption(id: number): Promise<FkTargetRecord | null> {
  const row = await prisma.workPlan.findUnique({
    where: { id },
    select: { id: true, title: true, isArchived: true },
  });
  if (!row) return null;
  return { id: row.id, label: row.title, lifecycleStatus: row.isArchived ? "archived" : "active" };
}

export async function resolveWorkPlanAlignmentOption(id: number): Promise<FkTargetRecord | null> {
  if (id < 0) return resolveWorkItemRelationOption(Math.abs(id));
  return resolveWorkPlanRelationOption(id);
}

export async function resolveWorkItemRelationOption(id: number): Promise<FkTargetRecord | null> {
  const row = await prisma.workItem.findUnique({
    where: { id },
    select: { id: true, content: true, isArchived: true },
  });
  if (!row) return null;
  return { id: row.id, label: row.content, lifecycleStatus: row.isArchived ? "archived" : "active" };
}

async function currentCycleForPlanInput(okrCycleId?: number | null) {
  const id = normalizePositive(okrCycleId);
  if (!id) return null;
  return prisma.workOkrCycle.findUnique({
    where: { id },
    select: { startDate: true, endDate: true },
  });
}

async function validatePlanRelation(input: {
  label: string;
  relation: PeriodRelationKind;
  candidateId?: number | null;
  currentPlanId?: number | null;
  currentCycle: PeriodRange | null;
  targetType?: string | null;
  targetId?: number | null;
}) {
  if (!input.candidateId) return null;
  if (!input.currentCycle) return `选择${input.label}前必须先选择所属周期`;
  if (input.currentPlanId && input.candidateId === input.currentPlanId) return `${input.label}不能选择自己`;
  const candidate = await prisma.workPlan.findUnique({
    where: { id: input.candidateId },
    select: { targetType: true, targetId: true, kind: true, isArchived: true, okrCycle: { select: { startDate: true, endDate: true } } },
  });
  if (!candidate) return `${input.label}不存在`;
  if (candidate.targetType !== input.targetType || candidate.targetId !== input.targetId) return `${input.label}不属于当前空间`;
  if (candidate.kind !== "okr" || candidate.isArchived) return `${input.label}必须是有效 OKR 计划`;
  if (!candidate.okrCycle) return `${input.label}必须设置所属周期`;
  return relationMatches(input.relation, candidate.okrCycle, input.currentCycle)
    ? null
    : relationError(input.label, input.relation);
}

async function validateItemRelation(input: {
  label: string;
  relation: PeriodRelationKind;
  candidateId?: number | null;
  currentWorkId?: number | null;
  currentCycle: PeriodRange;
  targetType: string;
  targetId: number;
  itemType: "objective" | "key_result";
}) {
  if (!input.candidateId) return null;
  if (input.currentWorkId && input.candidateId === input.currentWorkId) return `${input.label}不能选择自己`;
  const candidate = await prisma.workItem.findUnique({
    where: { id: input.candidateId },
    select: {
      targetType: true,
      targetId: true,
      itemType: true,
      ownerEmployeeId: true,
      status: true,
      isArchived: true,
      plan: { select: { kind: true, isArchived: true, okrCycle: { select: { startDate: true, endDate: true } } } },
    },
  });
  if (!candidate) return `${input.label}不存在`;
  if (candidate.targetType !== input.targetType || candidate.targetId !== input.targetId) return `${input.label}不属于当前空间`;
  if (candidate.itemType !== input.itemType) return `${input.label}类型不匹配`;
  if (candidate.isArchived || candidate.plan?.kind !== "okr" || candidate.plan.isArchived) return `${input.label}必须来自有效 OKR 计划`;
  if (!candidate.plan.okrCycle) return `${input.label}必须设置所属周期`;
  return relationMatches(input.relation, candidate.plan.okrCycle, input.currentCycle)
    ? null
    : relationError(input.label, input.relation);
}

function cycleWhere(relation: PeriodRelationKind, current: PeriodRange): Prisma.WorkOkrCycleWhereInput {
  return relation === "parent" ? { startDate: { lte: current.endDate }, endDate: { gte: current.startDate } } : { endDate: { lt: current.startDate } };
}

function relationMatches(relation: PeriodRelationKind, candidate: PeriodRange, current: PeriodRange) {
  return relation === "parent"
    ? periodRangesOverlap(candidate, current) && parentPeriodSizeMatches(candidate, current)
    : candidate.endDate < current.startDate;
}

function relationError(label: string, relation: PeriodRelationKind) {
  return relation === "parent" ? `${label}周期必须长于当前周期、与当前周期有交集，且不超过当前周期 5 倍` : `${label}周期必须早于当前周期`;
}

function periodRangesOverlap(left: PeriodRange, right: PeriodRange) { return left.startDate <= right.endDate && left.endDate >= right.startDate; }

function parentPeriodSizeMatches(parent: PeriodRange, child: PeriodRange) {
  const parentDays = periodDayCount(parent);
  const childDays = periodDayCount(child);
  return parentDays > childDays && parentDays <= childDays * 5;
}

function periodDayCount(period: PeriodRange) { return Math.floor((periodDateValue(period.endDate) - periodDateValue(period.startDate)) / 86_400_000) + 1; }

function periodDateValue(value: Date) { return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()); }

const planOptionSelect = {
  id: true,
  title: true,
  status: true,
  isArchived: true,
  okrCycle: { select: { label: true, startDate: true, endDate: true } },
} satisfies Prisma.WorkPlanSelect;

const itemOptionSelect = {
  id: true,
  content: true,
  targetType: true,
  targetId: true,
  ownerEmployeeId: true,
  krTargetValue: true,
  krUnit: true,
  plan: { select: { title: true, targetType: true, targetId: true, okrCycle: { select: { label: true, startDate: true, endDate: true } } } },
} satisfies Prisma.WorkItemSelect;

const alignmentItemOptionSelect = {
  id: true,
  content: true,
  itemType: true,
  targetType: true,
  targetId: true,
  ownerEmployeeId: true,
  krTargetValue: true,
  krCurrentValue: true,
  krUnit: true,
  plan: { select: { title: true, targetType: true, targetId: true, okrCycle: { select: { label: true, startDate: true, endDate: true } } } },
} satisfies Prisma.WorkItemSelect;

function planRowToOption(row: Prisma.WorkPlanGetPayload<{ select: typeof planOptionSelect }>): FkOption {
  return {
    id: row.id,
    name: row.title,
    subtitle: row.okrCycle?.label,
    lifecycleStatus: "active",
  };
}

type AlignmentFkOption = FkOption & { sourceType: "plan" | "objective" | "key_result"; sourcePlanId?: number | null; sourceWorkItemId?: number | null };

function alignmentPlanRowToOption(row: Prisma.WorkPlanGetPayload<{ select: typeof planOptionSelect }>): AlignmentFkOption {
  return {
    id: row.id,
    name: row.title,
    subtitle: ["上级计划", row.okrCycle?.label, row.status === "done" ? "已完成" : null].filter(Boolean).join(" · "),
    lifecycleStatus: row.isArchived ? "archived" : "active",
    sourceType: "plan",
    sourcePlanId: row.id,
    sourceWorkItemId: null,
  };
}

function alignmentItemRowToOption(row: Prisma.WorkItemGetPayload<{ select: typeof alignmentItemOptionSelect }>): AlignmentFkOption {
  const sourceType = row.itemType === "key_result" ? "key_result" : "objective";
  const typeLabel = sourceType === "key_result" ? "KR" : "目标";
  const targetText = row.krTargetValue === null ? null : `目标 ${row.krTargetValue}${row.krUnit ?? ""}`;
  const sourceLabel = row.targetType === "personal" ? "协作" : "承接";
  return {
    id: -row.id,
    name: row.content,
    subtitle: [sourceLabel, typeLabel, row.plan?.okrCycle?.label, row.plan?.title, targetText].filter(Boolean).join(" · "),
    lifecycleStatus: "active",
    sourceType,
    sourcePlanId: null,
    sourceWorkItemId: row.id,
  };
}

function itemRowToOption(row: Prisma.WorkItemGetPayload<{ select: typeof itemOptionSelect }>): FkOption {
  const targetText = row.krTargetValue === null ? null : `目标 ${row.krTargetValue}${row.krUnit ?? ""}`;
  return {
    id: row.id,
    name: row.content,
    subtitle: [row.plan?.okrCycle?.label, row.plan?.title, row.targetType === "department" ? "部门分配" : null, targetText].filter(Boolean).join(" · "),
    lifecycleStatus: "active",
  };
}

function normalizePositive(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function listUnalignedAssignedAlignmentItemRows(input: {
  userId?: number | null;
  targetType?: string | null;
  targetId: number;
  currentPlanId?: number | null;
  take: number;
}) {
  if (input.targetType !== "personal" || input.userId !== input.targetId) return [];
  const employeeIds = await employeeIdsForUser(input.targetId);
  if (employeeIds.length === 0) return [];
  return prisma.workItem.findMany({
    where: {
      ...unalignedAssignedWorkItemWhere({
        employeeIds,
        personalTargetId: input.targetId,
        currentWorkItemId: null,
      }),
      itemType: { in: ["objective", "key_result"] },
      sourcePlanAlignments: {
        none: {
          relationKind: "decompose",
          childPlan: {
            targetType: "personal",
            targetId: input.targetId,
            ...(input.currentPlanId ? { id: { not: input.currentPlanId } } : {}),
          },
        },
      },
    },
    select: alignmentItemOptionSelect,
    orderBy: [{ plan: { okrCycle: { startDate: "asc" } } }, { targetType: "asc" }, { targetId: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
    take: input.take,
  });
}

function unalignedAssignedWorkItemWhere(input: {
  employeeIds: number[];
  personalTargetId: number;
  currentWorkItemId?: number | null;
}): Prisma.WorkItemWhereInput {
  return {
    targetType: { in: ["department", "project", "personal"] },
    NOT: [{ targetType: "personal", targetId: input.personalTargetId }],
    ownerEmployeeId: { in: input.employeeIds },
    itemType: { in: ["objective", "key_result", "task"] },
    isArchived: false,
    OR: [{ status: null }, { status: { not: "done" } }],
    plan: { isArchived: false },
    childPeriodWorkItems: {
      none: {
        targetType: "personal",
        targetId: input.personalTargetId,
        ...(input.currentWorkItemId ? { id: { not: input.currentWorkItemId } } : {}),
      },
    },
  };
}

async function employeeIdsForUser(userId: number) {
  const rows = await prisma.employee.findMany({ where: { userId, employments: { some: { isActive: true } } }, select: { id: true } });
  return rows.map((row) => row.id); }
