import { Prisma, prisma } from "@workspace/platform/server/prisma";
import type { DomainServiceResult } from "@workspace/platform/server/domain-validation";
import { validateWorkPlanCommand } from "./domain/work-plan-validation";
import {
  inferSourceKind,
  normalizeSourceKind,
  normalizeSourceType,
  stripMeetingSourceFields,
  stripProjectSourceFields,
} from "./domain/work-item-source-validation";

const PLAN_STATUSES = new Set(["active", "closed", "archived"]);
const PLAN_KINDS = new Set(["okr"]);
const PERIOD_TYPES = new Set(["daily", "weekly", "monthly", "quarterly", "yearly"]);

type WorkPlanCommandInput = {
  targetType: string;
  targetId: number;
  kind?: string;
  title?: string;
  description?: string;
  status?: string;
  ownerEmployeeId?: number | null;
  periodType?: string | null;
  periodStart?: Date | string | null;
  periodEnd?: Date | string | null;
  sourceType?: string;
  sourceKind?: string | null;
  sourceMeetingId?: number | null;
  sourceMeetingDecisionId?: number | null;
  sourceMeetingActionCandidateId?: number | null;
  linkedProjectId?: number | null;
  linkedProjectPhaseId?: number | null;
  linkedProjectTaskId?: number | null;
  sortOrder?: number;
};

const workPlanInclude = {
  owner: { select: { id: true, employeeId: true, name: true } },
  linkedProject: { select: { id: true, code: true, name: true } },
  linkedProjectPhase: { select: { id: true, name: true, projectId: true } },
  linkedProjectTask: { select: { id: true, name: true, description: true, projectId: true } },
  sourceMeeting: { select: { id: true, title: true, startAt: true } },
  sourceMeetingDecision: { select: { id: true, title: true, kind: true } },
  sourceMeetingActionCandidate: { select: { id: true, title: true } },
  _count: { select: { items: true } },
} satisfies Prisma.WorkPlanInclude;

function formatDate(value: Date | string | null | undefined) {
  if (!value) return null;
  return new Date(value).toISOString().slice(0, 10);
}

function toDateOrNull(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizePositiveId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function normalizeNullablePositiveId(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return normalizePositiveId(value);
}

function normalizePeriod(input: { periodType?: string | null; periodStart?: Date | string | null; periodEnd?: Date | string | null }) {
  const periodType = input.periodType ? String(input.periodType) : null;
  const periodStart = toDateOrNull(input.periodStart);
  const periodEnd = toDateOrNull(input.periodEnd);
  if (!periodType) {
    if (periodStart || periodEnd) return { ok: false as const, error: "设置周期起止时必须选择周期类型" };
    return { ok: true as const, data: { periodType: null, periodStart: null, periodEnd: null } };
  }
  if (!PERIOD_TYPES.has(periodType)) return { ok: false as const, error: "计划周期类型无效" };
  if (!periodStart || !periodEnd) return { ok: false as const, error: "计划周期起止不能为空" };
  if (periodEnd < periodStart) return { ok: false as const, error: "周期结束不能早于周期开始" };
  return { ok: true as const, data: { periodType, periodStart, periodEnd } };
}

function normalizeSource(input: {
  sourceType?: string;
  sourceKind?: string | null;
  linkedProjectId?: number | null;
  linkedProjectPhaseId?: number | null;
  linkedProjectTaskId?: number | null;
  sourceMeetingId?: number | null;
  sourceMeetingDecisionId?: number | null;
  sourceMeetingActionCandidateId?: number | null;
}) {
  const sourceType = normalizeSourceType(input.sourceType);
  if (!sourceType.ok) return { ok: false as const, error: sourceType.issue.message };
  const sourceKind = normalizeSourceKind(input.sourceKind);
  if (!sourceKind.ok) return { ok: false as const, error: sourceKind.issue.message };
  const data = {
    sourceType: sourceType.data,
    sourceKind: inferSourceKind({
      sourceType: sourceType.data,
      sourceKind: sourceKind.data,
      linkedProjectId: input.linkedProjectId,
      linkedProjectPhaseId: input.linkedProjectPhaseId,
      linkedProjectTaskId: input.linkedProjectTaskId,
    }),
    linkedProjectId: input.linkedProjectId ?? null,
    linkedProjectPhaseId: input.linkedProjectPhaseId ?? null,
    linkedProjectTaskId: input.linkedProjectTaskId ?? null,
    sourceMeetingId: input.sourceMeetingId ?? null,
    sourceMeetingDecisionId: input.sourceMeetingDecisionId ?? null,
    sourceMeetingActionCandidateId: input.sourceMeetingActionCandidateId ?? null,
  };
  if (data.sourceType !== "project") stripProjectSourceFields(data);
  if (data.sourceType !== "meeting") stripMeetingSourceFields(data);
  return { ok: true as const, data };
}

function toWorkPlanDto(row: Prisma.WorkPlanGetPayload<{ include: typeof workPlanInclude }>) {
  return {
    id: row.id,
    targetType: row.targetType,
    targetId: row.targetId,
    kind: row.kind,
    title: row.title,
    description: row.description,
    status: row.status,
    ownerEmployeeId: row.ownerEmployeeId,
    ownerEmployeeNumber: row.owner?.employeeId ?? null,
    ownerEmployeeName: row.owner?.name ?? null,
    periodType: row.periodType,
    periodStart: formatDate(row.periodStart),
    periodEnd: formatDate(row.periodEnd),
    sourceType: row.sourceType,
    sourceKind: row.sourceKind,
    sourceMeetingId: row.sourceMeetingId,
    sourceMeetingTitle: row.sourceMeeting?.title ?? null,
    sourceMeetingStartAt: formatDate(row.sourceMeeting?.startAt),
    sourceMeetingDecisionId: row.sourceMeetingDecisionId,
    sourceMeetingDecisionTitle: row.sourceMeetingDecision?.title ?? null,
    sourceMeetingDecisionKind: row.sourceMeetingDecision?.kind ?? null,
    sourceMeetingActionCandidateId: row.sourceMeetingActionCandidateId,
    sourceMeetingActionCandidateTitle: row.sourceMeetingActionCandidate?.title ?? null,
    linkedProjectId: row.linkedProjectId,
    linkedProjectName: row.linkedProject?.name ?? null,
    linkedProjectCode: row.linkedProject?.code ?? null,
    linkedProjectPhaseId: row.linkedProjectPhaseId,
    linkedProjectPhaseName: row.linkedProjectPhase?.name ?? null,
    linkedProjectTaskId: row.linkedProjectTaskId,
    linkedProjectTaskName: row.linkedProjectTask?.name || row.linkedProjectTask?.description || null,
    itemCount: row._count.items,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listWorkPlans(opts: {
  targetType: string;
  targetId: number;
  kind?: string;
  includeArchived?: boolean;
}) {
  const where: Prisma.WorkPlanWhereInput = {
    targetType: opts.targetType,
    targetId: opts.targetId,
    kind: opts.kind || "okr",
  };
  if (!opts.includeArchived) where.status = { not: "archived" };
  const rows = await prisma.workPlan.findMany({
    where,
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    include: workPlanInclude,
  });
  return rows.map(toWorkPlanDto);
}

export async function getWorkPlanAccessMetadata(planId: number) {
  return prisma.workPlan.findUnique({
    where: { id: planId },
    select: { targetType: true, targetId: true, status: true },
  });
}

export async function createWorkPlan(opts: {
  targetType: string;
  targetId: number;
  kind?: string;
  title: string;
  description?: string;
  status?: string;
  ownerEmployeeId?: number | null;
  periodType?: string | null;
  periodStart?: Date | string | null;
  periodEnd?: Date | string | null;
  sourceType?: string;
  sourceKind?: string | null;
  sourceMeetingId?: number | null;
  sourceMeetingDecisionId?: number | null;
  sourceMeetingActionCandidateId?: number | null;
  linkedProjectId?: number | null;
  linkedProjectPhaseId?: number | null;
  linkedProjectTaskId?: number | null;
  sortOrder?: number;
}): Promise<DomainServiceResult<unknown>> {
  const guard = validateWorkPlanCommand("createWorkPlan");
  if (!guard.ok) return { ok: false, error: guard.issue.message, status: guard.issue.status };
  const command = normalizeWorkPlanInput(opts, true);
  if (!command.ok) return { ok: false, error: command.error, status: 400 };
  const relationError = await validateWorkPlanRelations(command.data);
  if (relationError) return { ok: false, error: relationError, status: 400 };
  const row = await prisma.workPlan.create({
    data: command.data,
    include: workPlanInclude,
  });
  return { ok: true, data: toWorkPlanDto(row) };
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
      ownerEmployeeId: true,
      periodType: true,
      periodStart: true,
      periodEnd: true,
      sourceType: true,
      sourceKind: true,
      sourceMeetingId: true,
      sourceMeetingDecisionId: true,
      sourceMeetingActionCandidateId: true,
      linkedProjectId: true,
      linkedProjectPhaseId: true,
      linkedProjectTaskId: true,
      sortOrder: true,
    },
  });
  if (!existing) return { ok: false, error: "工作计划不存在", status: 404 };
  const command = normalizeWorkPlanInput({ ...existing, ...opts, targetType: existing.targetType, targetId: existing.targetId }, false);
  if (!command.ok) return { ok: false, error: command.error, status: 400 };
  const relationError = await validateWorkPlanRelations(command.data);
  if (relationError) return { ok: false, error: relationError, status: 400 };
  const row = await prisma.workPlan.update({
    where: { id },
    data: command.data,
    include: workPlanInclude,
  });
  return { ok: true, data: toWorkPlanDto(row) };
}

export async function archiveWorkPlan(planId: number): Promise<DomainServiceResult<{ success: true }>> {
  const guard = validateWorkPlanCommand("archiveWorkPlan");
  if (!guard.ok) return { ok: false, error: guard.issue.message, status: guard.issue.status };
  const id = normalizePositiveId(planId);
  if (!id) return { ok: false, error: "工作计划 ID 无效", status: 400 };
  await prisma.workPlan.update({ where: { id }, data: { status: "archived" } });
  return { ok: true, data: { success: true } };
}

export async function deleteWorkPlan(planId: number): Promise<DomainServiceResult<{ success: true }>> {
  const guard = validateWorkPlanCommand("deleteWorkPlan");
  if (!guard.ok) return { ok: false, error: guard.issue.message, status: guard.issue.status };
  const id = normalizePositiveId(planId);
  if (!id) return { ok: false, error: "工作计划 ID 无效", status: 400 };
  await prisma.workPlan.delete({ where: { id } });
  return { ok: true, data: { success: true } };
}

function normalizeWorkPlanInput(input: WorkPlanCommandInput, _creating: boolean): { ok: true; data: Prisma.WorkPlanUncheckedCreateInput } | { ok: false; error: string } {
  const targetId = normalizePositiveId(input.targetId);
  if (!targetId) return { ok: false as const, error: "工作计划目标无效" };
  const title = String(input.title ?? "").trim();
  if (!title) return { ok: false as const, error: "工作计划名称不能为空" };
  const kind = input.kind || "okr";
  if (kind && !PLAN_KINDS.has(kind)) return { ok: false as const, error: "工作计划类型无效" };
  const status = input.status || "active";
  if (status && !PLAN_STATUSES.has(status)) return { ok: false as const, error: "工作计划状态无效" };
  const ownerEmployeeId = normalizeNullablePositiveId(input.ownerEmployeeId);
  const period = normalizePeriod(input);
  if (!period.ok) return period;
  const source = normalizeSource({
    sourceType: input.sourceType,
    sourceKind: input.sourceKind,
    linkedProjectId: normalizeNullablePositiveId(input.linkedProjectId),
    linkedProjectPhaseId: normalizeNullablePositiveId(input.linkedProjectPhaseId),
    linkedProjectTaskId: normalizeNullablePositiveId(input.linkedProjectTaskId),
    sourceMeetingId: normalizeNullablePositiveId(input.sourceMeetingId),
    sourceMeetingDecisionId: normalizeNullablePositiveId(input.sourceMeetingDecisionId),
    sourceMeetingActionCandidateId: normalizeNullablePositiveId(input.sourceMeetingActionCandidateId),
  });
  if (!source.ok) return source;
	  return {
	    ok: true as const,
	    data: {
	      targetType: input.targetType || "department",
	      targetId,
	      kind,
	      title,
	      ...(input.description !== undefined && { description: String(input.description ?? "").trim() }),
	      status,
      ownerEmployeeId,
      ...period.data,
      ...source.data,
      sortOrder: Number.isFinite(Number(input.sortOrder)) ? Number(input.sortOrder) : 0,
    },
  };
}

async function validateWorkPlanRelations(input: {
  ownerEmployeeId?: number | null;
  sourceType?: string;
  sourceKind?: string | null;
  linkedProjectId?: number | null;
  linkedProjectPhaseId?: number | null;
  linkedProjectTaskId?: number | null;
  sourceMeetingId?: number | null;
  sourceMeetingDecisionId?: number | null;
  sourceMeetingActionCandidateId?: number | null;
}) {
  if (input.ownerEmployeeId) {
    const owner = await prisma.employee.findUnique({ where: { id: input.ownerEmployeeId }, select: { id: true } });
    if (!owner) return "负责人不存在";
  }
  if (input.sourceType === "project" && !input.linkedProjectId) return "项目来源计划必须关联项目";
  if (input.linkedProjectId) {
    const project = await prisma.project.findUnique({ where: { id: input.linkedProjectId }, select: { id: true } });
    if (!project) return "关联项目不存在";
  }
  if (input.linkedProjectPhaseId) {
    const phase = await prisma.projectPlanPhase.findUnique({ where: { id: input.linkedProjectPhaseId }, select: { id: true, projectId: true } });
    if (!phase) return "关联项目阶段不存在";
    if (input.linkedProjectId && phase.projectId !== input.linkedProjectId) return "关联项目阶段不属于所选项目";
  }
  if (input.linkedProjectTaskId) {
    const task = await prisma.projectTask.findUnique({ where: { id: input.linkedProjectTaskId }, select: { id: true, projectId: true } });
    if (!task) return "关联项目任务不存在";
    if (input.linkedProjectId && task.projectId !== input.linkedProjectId) return "关联项目任务不属于所选项目";
  }
  if (input.sourceType === "project" && input.sourceKind === "project_phase" && !input.linkedProjectPhaseId) return "项目阶段来源必须关联项目阶段";
  if (input.sourceType === "project" && input.sourceKind === "project_task" && !input.linkedProjectTaskId) return "项目任务来源必须关联项目任务";
  if (input.sourceType === "meeting" && !input.sourceMeetingId && !input.sourceMeetingDecisionId && !input.sourceMeetingActionCandidateId) {
    return "会议来源计划必须关联会议、决议或行动候选";
  }
  return validateMeetingSource(input);
}

async function validateMeetingSource(input: Pick<Parameters<typeof validateWorkPlanRelations>[0], "sourceType" | "sourceMeetingId" | "sourceMeetingDecisionId" | "sourceMeetingActionCandidateId">) {
  if (input.sourceType !== "meeting") return null;
  let meetingId = input.sourceMeetingId ?? null;
  if (meetingId) {
    const meeting = await prisma.meeting.findUnique({ where: { id: meetingId }, select: { id: true } });
    if (!meeting) return "来源会议不存在";
  }
  if (input.sourceMeetingDecisionId) {
    const decision = await prisma.meetingDecision.findUnique({ where: { id: input.sourceMeetingDecisionId }, select: { meetingId: true } });
    if (!decision) return "来源会议决议不存在";
    if (meetingId && decision.meetingId !== meetingId) return "来源会议决议不属于所选会议";
    meetingId = decision.meetingId;
  }
  if (input.sourceMeetingActionCandidateId) {
    const candidate = await prisma.meetingActionCandidate.findUnique({ where: { id: input.sourceMeetingActionCandidateId }, select: { meetingId: true } });
    if (!candidate) return "来源会议行动候选不存在";
    if (meetingId && candidate.meetingId !== meetingId) return "来源会议行动候选不属于所选会议";
  }
  return null;
}
