import { Prisma, prisma } from "@workspace/platform/server/prisma";
import type { DomainServiceResult } from "@workspace/platform/server/domain-validation";
import { guardedDelete } from "@workspace/platform/server/delete-guard";
import { isCompletedStatus, validateCompletionSchedule } from "@workspace/platform/completion-date-policy";
import { validateWorkPlanCommand } from "./domain/work-plan-validation";
import { normalizeSourceType } from "./domain/work-item-source-validation";
import {
  assertWorkPlanHeaderStageAllowed,
  openKrReview,
  syncDueKrReviewForPlan,
  syncDueKrReviewsForTarget,
} from "./work-okr-stage";
import { getWorkOkrControlSettings, resolveWorkOkrControlScopeForPlan } from "./work-okr-control";
import { ensureSystemOkrPeriodPlans, isWorkPlanVisibleInCurrentWindow, resolveDefaultPlanOwnerEmployeeId, standardOkrPlanTitle } from "./work-plan-system-periods";
import {
  normalizeWorkPlanAlignmentInput,
  replaceWorkPlanDecomposeAlignment,
  validateWorkPlanAlignmentSource,
  type WorkPlanAlignmentInput,
} from "./work-plan-alignments";
import { validateWorkPlanPeriodRelations } from "./work-period-relations";
import { validateWorkOwnerAssignment } from "./work-owner-eligibility";
import { validateWorkCollaborationReference } from "./work-collaboration-references";
import { toWorkPlanDto, workPlanInclude, type WorkPlanRow } from "./work-plan-dto";
const PLAN_STATUSES = new Set(["active", "done"]);
const PLAN_KINDS = new Set(["okr", "routine"]);
const PLAN_PERIOD_TYPES = new Set(["yearly", "half_year", "quarterly", "monthly"]);
type WorkPlanCommandInput = {
  isSystemGenerated?: boolean;
  actorUserId?: number | null;
  ownerEligibilityUserId?: number | null;
  updateGuard?: "direct" | "workflow-approved";
  targetType: string;
  targetId: number;
  kind?: string;
  title?: string;
  description?: string;
  status?: string;
  krReviewOpensAt?: Date | string | null;
  ownerEmployeeId?: number | null;
  collaborationId?: number | null;
  okrCycleId?: number | null;
  sourcePlanId?: number | null;
  parentPeriodPlanId?: number | null;
  previousPeriodPlanId?: number | null;
  alignmentSourceType?: string | null;
  alignmentSourcePlanId?: number | null;
  alignmentSourceWorkItemId?: number | null;
  periodType?: string | null;
  actualStartDate?: Date | string | null;
  actualEndDate?: Date | string | null;
  plannedStartDate?: Date | string | null;
  plannedEndDate?: Date | string | null;
  isMilestone?: boolean;
  milestoneDate?: Date | string | null;
  sourceType?: string;
  sourceKind?: string | null;
  sourceMeetingId?: number | null;
  sourceMeetingDecisionId?: number | null;
  sourceMeetingActionCandidateId?: number | null;
  sourceDepartmentId?: number | null;
  linkedProjectId?: number | null;
  linkedProjectPhaseId?: number | null;
  sortOrder?: number;
};
function toDateOrNull(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
function dateOnly(value: Date | null | undefined) { return value ? value.toISOString().slice(0, 10) : null; }
function normalizePositiveId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function normalizeNullablePositiveId(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return normalizePositiveId(value);
}

async function normalizeOkrWindow(input: { isSystemGenerated?: boolean; okrCycleId?: number | null; periodType?: string | null; actualStartDate?: Date | string | null; actualEndDate?: Date | string | null }) {
  const okrCycleId = normalizeNullablePositiveId(input.okrCycleId);
  const cycle = okrCycleId ? await prisma.workOkrCycle.findUnique({ where: { id: okrCycleId }, select: { periodType: true, label: true, year: true, sequence: true, startDate: true, endDate: true } }) : null;
  if (okrCycleId && !cycle) return { ok: false as const, error: "OKR 周期不存在" };
  const periodType = normalizePlanPeriodType(cycle?.periodType ?? input.periodType);
  if (!periodType.ok) return periodType;
  const actualStartDate = input.isSystemGenerated ? null : toDateOrNull(input.actualStartDate);
  const actualEndDate = input.isSystemGenerated ? null : toDateOrNull(input.actualEndDate);
  return { ok: true as const, data: { periodType: periodType.data, actualStartDate, actualEndDate, okrCycleId, cycle } };
}

function normalizeMilestone(input: { isMilestone?: boolean; milestoneDate?: Date | string | null }, enabled: boolean) {
  const isMilestone = enabled && input.isMilestone === true;
  return { ok: true as const, data: { isMilestone, milestoneDate: isMilestone ? toDateOrNull(input.milestoneDate) : null } };
}

function normalizePlannedWindow(input: { plannedStartDate?: Date | string | null; plannedEndDate?: Date | string | null }, enabled: boolean) {
  const plannedStartDate = enabled ? toDateOrNull(input.plannedStartDate) : null;
  const plannedEndDate = enabled ? toDateOrNull(input.plannedEndDate) : null;
  if (enabled && (!plannedStartDate || !plannedEndDate)) return { ok: false as const, error: "OKR 计划的计划时间不能为空" };
  if (plannedStartDate && plannedEndDate && plannedEndDate < plannedStartDate) return { ok: false as const, error: "计划结束不能早于计划开始" };
  return { ok: true as const, data: { plannedStartDate, plannedEndDate } };
}

function emptyPlanWindow() {
  return { ok: true as const, data: { periodType: null, actualStartDate: null, actualEndDate: null, okrCycleId: null, cycle: null } };
}

function normalizePlanPeriodType(value: string | null | undefined) {
  if (value === null || value === undefined || value === "") return { ok: true as const, data: null };
  if (PLAN_PERIOD_TYPES.has(value)) return { ok: true as const, data: value };
  return { ok: false as const, error: "工作计划周期无效" };
}

function normalizeSource(input: {
  sourceType?: string;
  sourceKind?: string | null;
  linkedProjectId?: number | null;
  linkedProjectPhaseId?: number | null;
  sourceMeetingId?: number | null;
  sourceMeetingDecisionId?: number | null;
  sourceMeetingActionCandidateId?: number | null;
  sourceDepartmentId?: number | null;
  sourcePlanId?: number | null;
}) {
  const sourceType = normalizeSourceType(input.sourceType);
  if (!sourceType.ok) return { ok: false as const, error: sourceType.issue.message };
  if (sourceType.data !== "other" || input.sourcePlanId || input.sourceKind || input.linkedProjectId || input.linkedProjectPhaseId || input.sourceDepartmentId || input.sourceMeetingId || input.sourceMeetingDecisionId || input.sourceMeetingActionCandidateId) {
    return { ok: false as const, error: "工作计划不再选择部门、项目或会议来源；请在个人工作项上引用来源" };
  }
  return {
    ok: true as const,
    data: {
      sourceType: "other",
      sourceKind: null,
      linkedProjectId: null,
      linkedProjectPhaseId: null,
      sourceMeetingId: null,
      sourceMeetingDecisionId: null,
      sourceMeetingActionCandidateId: null,
      sourceDepartmentId: null,
    },
  };
}

export async function listWorkPlans(opts: {
  targetType: string;
  targetId: number;
  kind?: string;
  includeArchived?: boolean;
}) {
  await syncDueKrReviewsForTarget({ targetType: opts.targetType, targetId: opts.targetId });
  if (!opts.kind || opts.kind === "routine") {
    await ensureRoutineWorkPlan(opts.targetType, opts.targetId);
  }
  const visibleOkrCycleIds = (!opts.kind || opts.kind === "okr")
    ? await ensureSystemOkrPeriodPlans(opts.targetType, opts.targetId)
    : null;
  const where: Prisma.WorkPlanWhereInput = {
    targetType: opts.targetType,
    targetId: opts.targetId,
  };
  if (opts.kind) where.kind = opts.kind;
  if (!opts.includeArchived) where.isArchived = false;
  const [rows, { enabled: timeControlEnabled }] = await Promise.all([
    prisma.workPlan.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      include: workPlanInclude,
    }),
    getWorkOkrControlSettings(),
  ]);
  return normalizeRoutinePlanRows(rows)
    .filter((row) => isWorkPlanVisibleInCurrentWindow(row, visibleOkrCycleIds))
    .map((row) => toWorkPlanDto(row, { timeControlEnabled }));
}

async function ensureRoutineWorkPlan(targetType: string, targetId: number) {
  const normalizedTargetId = normalizePositiveId(targetId);
  if (!normalizedTargetId) return null;
  const ownerEmployeeId = targetType === "personal" ? await resolveDefaultPlanOwnerEmployeeId(targetType, normalizedTargetId) : null;
  const existing = await prisma.workPlan.findFirst({
    where: { targetType, targetId: normalizedTargetId, kind: "routine", isArchived: false },
    select: { id: true, ownerEmployeeId: true },
  });
  if (existing) {
    if (!existing.ownerEmployeeId && ownerEmployeeId) await prisma.workPlan.update({ where: { id: existing.id }, data: { ownerEmployeeId } });
    return existing.id;
  }
  const created = await prisma.workPlan.create({
    data: {
      targetType,
      targetId: normalizedTargetId,
      kind: "routine",
      title: "日常工作",
      description: "",
      status: "active",
      okrStage: "closed",
      sourceType: "other",
      sourceKind: null,
      ownerEmployeeId,
      periodType: null,
      actualStartDate: null,
      actualEndDate: null,
      okrCycleId: null,
      sortOrder: 0,
    },
    select: { id: true },
  });
  return created.id;
}
function normalizeRoutinePlanRows(rows: WorkPlanRow[]) {
  let routineSeen = false;
  return rows.filter((row) => {
    if (row.kind !== "routine") return true;
    if (row.isArchived) return false;
    if (routineSeen) return false;
    routineSeen = true;
    return true;
  });
}

export async function getWorkPlanTargetMetadata(planId: number) {
  await syncDueKrReviewForPlan(planId);
  return prisma.workPlan.findUnique({
    where: { id: planId },
    select: { targetType: true, targetId: true, status: true, okrStage: true, okrCycleId: true, okrControlScopeType: true, okrControlScopeId: true, krReviewOpensAt: true },
  });
}

export async function createWorkPlan(opts: WorkPlanCommandInput & { title?: string }): Promise<DomainServiceResult<unknown>> {
  const guard = validateWorkPlanCommand("createWorkPlan");
  if (!guard.ok) return { ok: false, error: guard.issue.message, status: guard.issue.status };
  const command = await normalizeWorkPlanInput(opts);
  if (!command.ok) return { ok: false, error: command.error, status: 400 };
  if (command.data.kind === "routine") return { ok: false, error: "日常工作由系统为每个空间预留，无需新建", status: 400 };
  const relationError = await validateWorkPlanRelations({
    ...command.data,
    actorUserId: opts.actorUserId,
    ownerEligibilityUserId: opts.ownerEligibilityUserId,
    ownerEmployeeId: opts.ownerEmployeeId === undefined ? undefined : command.data.ownerEmployeeId,
  });
  if (relationError) return { ok: false, error: relationError, status: 400 };
  const periodRelationError = await validateWorkPlanPeriodRelations(command.data);
  if (periodRelationError) return { ok: false, error: periodRelationError, status: 400 };
  const singleCyclePlanError = await validateSingleOkrPlanPerCycle(command.data);
  if (singleCyclePlanError) return { ok: false, error: singleCyclePlanError, status: 400 };
  const alignmentError = await validateWorkPlanAlignmentSource({
    actorUserId: opts.actorUserId,
    targetType: command.data.targetType ?? opts.targetType,
    targetId: Number(command.data.targetId ?? opts.targetId),
    okrCycleId: command.data.okrCycleId ?? null,
    alignment: command.alignment ?? null,
  });
  if (alignmentError) return { ok: false, error: alignmentError, status: 400 };
  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.workPlan.create({
      data: command.data,
      select: { id: true },
    });
    await replaceWorkPlanDecomposeAlignment(tx, created.id, command.alignment ?? null);
    return tx.workPlan.findUniqueOrThrow({ where: { id: created.id }, include: workPlanInclude });
  });
  const timeControlEnabled = (await getWorkOkrControlSettings()).enabled;
  return { ok: true, data: toWorkPlanDto(row, { timeControlEnabled }) };
}

export async function updateWorkPlan(planId: number, opts: Partial<Parameters<typeof createWorkPlan>[0]>): Promise<DomainServiceResult<unknown>> {
  const guard = validateWorkPlanCommand("updateWorkPlan");
  if (!guard.ok) return { ok: false, error: guard.issue.message, status: guard.issue.status };
  const id = normalizePositiveId(planId);
  if (!id) return { ok: false, error: "工作计划 ID 无效", status: 400 };
  const existing = await prisma.workPlan.findUnique({
    where: { id },
    select: {
      targetType: true,
      targetId: true,
      kind: true,
      title: true,
      description: true,
      status: true,
      okrStage: true,
      krReviewOpensAt: true,
      ownerEmployeeId: true,
      collaborationId: true,
      isSystemGenerated: true,
      okrCycleId: true,
      sourcePlanId: true,
      parentPeriodPlanId: true,
      previousPeriodPlanId: true,
      okrControlScopeType: true,
      okrControlScopeId: true,
      periodType: true,
      actualStartDate: true,
      actualEndDate: true,
      plannedStartDate: true,
      plannedEndDate: true,
      sourceType: true,
      sourceKind: true,
      sourceMeetingId: true,
      sourceMeetingDecisionId: true,
      sourceMeetingActionCandidateId: true,
      sourceDepartmentId: true,
      linkedProjectId: true,
      linkedProjectPhaseId: true,
      isMilestone: true,
      milestoneDate: true,
      sortOrder: true,
    },
  });
  if (!existing) return { ok: false, error: "工作计划不存在", status: 404 };
  if (opts.kind && String(opts.kind) !== existing.kind) return { ok: false, error: "工作计划类型不能修改", status: 400 };
  if (existing.kind === "okr" && existing.okrCycleId && opts.okrCycleId !== undefined && normalizeNullablePositiveId(opts.okrCycleId) !== existing.okrCycleId) return { ok: false, error: "周期规划的所属周期不能修改", status: 400 };
  if (existing.kind === "okr" && existing.okrCycleId && opts.periodType !== undefined && String(opts.periodType || "") !== String(existing.periodType || "")) return { ok: false, error: "周期规划的所属周期类型不能修改", status: 400 };
  if (existing.kind === "okr" && existing.isSystemGenerated && opts.plannedStartDate !== undefined && dateOnly(toDateOrNull(opts.plannedStartDate)) !== dateOnly(existing.plannedStartDate)) return { ok: false, error: "系统生成计划的计划开始不能修改", status: 400 };
  if (existing.kind === "okr" && existing.isSystemGenerated && opts.plannedEndDate !== undefined && dateOnly(toDateOrNull(opts.plannedEndDate)) !== dateOnly(existing.plannedEndDate)) return { ok: false, error: "系统生成计划的计划结束不能修改", status: 400 };
  if (opts.status !== undefined && !isCompletedStatus(opts.status) && opts.actualEndDate) {
    return { ok: false, error: "请先选择已完成，再填写实际结束", status: 400 };
  }
  const command = await normalizeWorkPlanInput({
    ...existing,
    ...opts,
    ...(opts.status !== undefined && !isCompletedStatus(opts.status) ? { actualEndDate: null } : {}),
    targetType: existing.targetType,
    targetId: existing.targetId,
  });
  if (!command.ok) return { ok: false, error: command.error, status: 400 };
  const nextKind = String(command.data.kind ?? existing.kind);
  if (nextKind === "okr" && opts.updateGuard !== "workflow-approved") {
    const stageGuard = await assertWorkPlanHeaderStageAllowed(id);
    if (!stageGuard.ok) return stageGuard;
  }
  const relationError = await validateWorkPlanRelations({
    ...command.data,
    actorUserId: opts.actorUserId,
    ownerEligibilityUserId: opts.ownerEligibilityUserId,
    ownerEmployeeId: opts.ownerEmployeeId === undefined ? undefined : command.data.ownerEmployeeId,
  });
  if (relationError) return { ok: false, error: relationError, status: 400 };
  const periodRelationError = await validateWorkPlanPeriodRelations({ ...command.data, currentPlanId: id });
  if (periodRelationError) return { ok: false, error: periodRelationError, status: 400 };
  const singleCyclePlanError = await validateSingleOkrPlanPerCycle({ ...command.data, currentPlanId: id });
  if (singleCyclePlanError) return { ok: false, error: singleCyclePlanError, status: 400 };
  const alignmentError = await validateWorkPlanAlignmentSource({
    actorUserId: opts.actorUserId,
    currentPlanId: id,
    targetType: command.data.targetType ?? existing.targetType,
    targetId: Number(command.data.targetId ?? existing.targetId),
    okrCycleId: command.data.okrCycleId ?? null,
    alignment: command.alignment,
  });
  if (alignmentError) return { ok: false, error: alignmentError, status: 400 };
  const row = await prisma.$transaction(async (tx) => {
    await tx.workPlan.update({
      where: { id },
      data: command.data,
    });
    await replaceWorkPlanDecomposeAlignment(tx, id, command.alignment);
    return tx.workPlan.findUniqueOrThrow({ where: { id }, include: workPlanInclude });
  });
  const timeControlEnabled = (await getWorkOkrControlSettings()).enabled;
  return { ok: true, data: toWorkPlanDto(row, { timeControlEnabled }) };
}

export async function adjustWorkPlanKrReviewOpensAt(planId: number, opensAt: Date | string | null): Promise<DomainServiceResult<unknown>> {
  const id = normalizePositiveId(planId);
  if (!id) return { ok: false, error: "工作计划 ID 无效", status: 400 };
  const date = toDateOrNull(opensAt);
  if (!date) return { ok: false, error: "KR 开放日期无效", status: 400 };
  const result = await openKrReview(id, date);
  if (!result.ok) return result;
  const row = await prisma.workPlan.findUnique({ where: { id }, include: workPlanInclude });
  if (!row) return { ok: false, error: "工作计划不存在", status: 404 };
  const timeControlEnabled = (await getWorkOkrControlSettings()).enabled;
  return { ok: true, data: toWorkPlanDto(row, { timeControlEnabled }) };
}

export async function archiveWorkPlan(planId: number, actorUserId: number): Promise<DomainServiceResult<{ success: true }>> {
  const guard = validateWorkPlanCommand("archiveWorkPlan");
  if (!guard.ok) return { ok: false, error: guard.issue.message, status: guard.issue.status };
  const id = normalizePositiveId(planId);
  if (!id) return { ok: false, error: "工作计划 ID 无效", status: 400 };
  const plan = await prisma.workPlan.findUnique({ where: { id }, select: { kind: true, isArchived: true } });
  if (!plan) return { ok: false, error: "工作计划不存在", status: 404 };
  if (plan?.kind === "routine") return { ok: false, error: "日常工作是空间预留入口，不能归档", status: 400 };
  if (plan.isArchived) {
    await prisma.workPlan.update({ where: { id }, data: { isArchived: false } });
    return { ok: true, data: { success: true } };
  }
  const archiveResult = await guardedDelete({
    entityType: "WorkPlan",
    modelKey: "workPlan",
    id,
    userId: actorUserId,
    actionLabel: "归档工作计划",
    deleteMode: "archive",
    archiveField: { field: "isArchived", value: true },
    referencePolicy: "retained",
  });
  if (!archiveResult.ok) return archiveResult;
  return { ok: true, data: { success: true } };
}

export async function deleteWorkPlan(planId: number): Promise<DomainServiceResult<{ success: true }>> {
  const guard = validateWorkPlanCommand("deleteWorkPlan");
  if (!guard.ok) return { ok: false, error: guard.issue.message, status: guard.issue.status };
  const id = normalizePositiveId(planId);
  if (!id) return { ok: false, error: "工作计划 ID 无效", status: 400 };
  const plan = await prisma.workPlan.findUnique({ where: { id }, select: { kind: true, isSystemGenerated: true } });
  if (plan?.kind === "routine") return { ok: false, error: "日常工作是空间预留入口，不能删除", status: 400 };
  if (plan?.kind === "okr" && plan.isSystemGenerated) return { ok: false, error: "固定周期计划由系统维护，不能删除", status: 400 };
  await prisma.workPlan.delete({ where: { id } });
  return { ok: true, data: { success: true } };
}

async function normalizeWorkPlanInput(input: WorkPlanCommandInput): Promise<{
  ok: true;
  data: Prisma.WorkPlanUncheckedCreateInput;
  alignment: WorkPlanAlignmentInput | undefined;
} | { ok: false; error: string }> {
  const targetId = normalizePositiveId(input.targetId);
  if (!targetId) return { ok: false as const, error: "工作计划目标无效" };
  const kind = input.kind || "okr";
  if (kind && !PLAN_KINDS.has(kind)) return { ok: false as const, error: "工作计划类型无效" };
  const rawTitle = String(input.title ?? "").trim();
  const status = input.status || "active";
  if (status && !PLAN_STATUSES.has(status)) return { ok: false as const, error: "工作计划状态无效" };
  const ownerEmployeeId = normalizeNullablePositiveId(input.ownerEmployeeId);
  const collaborationId = normalizeNullablePositiveId(input.collaborationId);
  const sourcePlanId = kind === "okr" ? normalizeNullablePositiveId(input.sourcePlanId) : null;
  const parentPeriodPlanId = kind === "okr" ? normalizeNullablePositiveId(input.parentPeriodPlanId) : null;
  const previousPeriodPlanId = kind === "okr" ? normalizeNullablePositiveId(input.previousPeriodPlanId) : null;
  const alignment = normalizeWorkPlanAlignmentInput(input, kind === "okr");
  if (!alignment.ok) return alignment;
  const effectiveParentPeriodPlanId = alignment.data?.sourceType === "plan"
    ? alignment.data.sourcePlanId
    : alignment.data === null
      ? null
      : parentPeriodPlanId;
  const period = kind === "okr" ? await normalizeOkrWindow(input) : emptyPlanWindow();
  if (!period.ok) return period;
  const title = kind === "okr" ? rawTitle || (period.data.cycle ? standardOkrPlanTitle(period.data.cycle) : "") : rawTitle || "日常工作";
  if (!title) return { ok: false as const, error: "工作计划名称不能为空" };
  const { cycle: _cycle, ...periodData } = period.data;
  const plannedWindow = normalizePlannedWindow(input, kind === "okr");
  if (!plannedWindow.ok) return plannedWindow;
  const scheduleError = validateCompletionSchedule({ status, ...periodData, ...plannedWindow.data });
  if (scheduleError) return { ok: false as const, error: scheduleError };
  const milestone = normalizeMilestone(input, kind === "okr");
  const source = normalizeSource({
    sourceType: input.sourceType,
    sourceKind: input.sourceKind,
    linkedProjectId: normalizeNullablePositiveId(input.linkedProjectId),
    linkedProjectPhaseId: normalizeNullablePositiveId(input.linkedProjectPhaseId),
    sourceMeetingId: normalizeNullablePositiveId(input.sourceMeetingId),
    sourceMeetingDecisionId: normalizeNullablePositiveId(input.sourceMeetingDecisionId),
    sourceMeetingActionCandidateId: normalizeNullablePositiveId(input.sourceMeetingActionCandidateId),
    sourceDepartmentId: normalizeNullablePositiveId(input.sourceDepartmentId),
    sourcePlanId,
  });
  if (!source.ok) return source;
  const controlScope = kind === "okr"
    ? await resolveWorkOkrControlScopeForPlan({
        targetType: input.targetType || "department",
        targetId,
        okrCycleId: "okrCycleId" in period.data ? period.data.okrCycleId ?? null : null,
      })
    : null;
  const scoped = controlScope?.ok && controlScope.data.type !== "global" ? controlScope.data : null;
  return {
    ok: true as const,
    data: {
      targetType: input.targetType || "department",
      targetId,
      kind,
      isSystemGenerated: input.isSystemGenerated === true,
      title,
      ...(input.description !== undefined && { description: String(input.description ?? "").trim() }),
      status,
      krReviewOpensAt: null,
      ownerEmployeeId,
      collaborationId,
      sourcePlanId,
      parentPeriodPlanId: effectiveParentPeriodPlanId,
      previousPeriodPlanId,
      okrControlScopeType: scoped?.type ?? null,
      okrControlScopeId: scoped?.id ?? null,
      ...periodData,
      ...plannedWindow.data,
      ...milestone.data,
      ...source.data,
      sortOrder: Number.isFinite(Number(input.sortOrder)) ? Number(input.sortOrder) : 0,
    },
    alignment: alignment.data,
  };
}

async function validateWorkPlanRelations(input: {
  actorUserId?: number | null;
  ownerEligibilityUserId?: number | null;
  targetType?: string | null;
  targetId?: number | null;
  ownerEmployeeId?: number | null;
  collaborationId?: number | null;
}) {
  const collaborationError = await validateWorkCollaborationReference({
    ...input,
    actorUserId: input.ownerEligibilityUserId ?? input.actorUserId,
  });
  if (collaborationError) return collaborationError;
  if (input.ownerEmployeeId) {
    const ownerError = await validateWorkOwnerAssignment({
      actorUserId: input.ownerEligibilityUserId ?? input.actorUserId,
      targetType: input.targetType,
      targetId: input.targetId,
      collaborationId: input.collaborationId,
      ownerEmployeeId: input.ownerEmployeeId,
    });
    if (ownerError) return ownerError;
  }
  return null;
}

async function validateSingleOkrPlanPerCycle(input: {
  targetType?: string | null;
  targetId?: number | string | null;
  kind?: string | null;
  status?: string | null;
  okrCycleId?: number | null;
  currentPlanId?: number | null;
}) {
  const kind = input.kind || "okr";
  const okrCycleId = normalizeNullablePositiveId(input.okrCycleId);
  const targetId = normalizePositiveId(input.targetId);
  if (kind !== "okr" || !okrCycleId || !targetId) return null;
  const duplicate = await prisma.workPlan.findFirst({
    where: {
      targetType: input.targetType || "department",
      targetId,
      kind: "okr",
      okrCycleId,
      isArchived: false,
      ...(input.currentPlanId ? { id: { not: input.currentPlanId } } : {}),
    },
    select: { title: true },
  });
  return duplicate ? `该周期已存在计划：${duplicate.title}` : null;
}
