import { NextResponse } from "next/server";
import { ensureEditHistoryBaseline, snapshotHistory } from "@workspace/platform/server/history";
import { prisma } from "@workspace/platform/server/prisma";
import { canEditProject, canViewProject, getProjectPermissionsById } from "./access";
import { isValidProjectPlanDateValue, normalizeProjectPlanText, validateProjectPlanCommand } from "./domain/project-plan-validation";
import { validateProjectTaskPlanBatch } from "./domain/project-task-validation";
import { deriveStatusFromActualDates, effectiveProjectDates } from "./project-dates";
import { formatDate, parseDate } from "./project-normalization";
import { jsonErrorResponse } from "@workspace/platform/server/api";

export const PLAN_ITEM_KINDS = ["project", "task", "phase"] as const;
export type PlanItemKind = (typeof PLAN_ITEM_KINDS)[number];

type PlanDateInput = {
  kind?: unknown;
  id?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  phaseId?: unknown;
};

type DependencyInput = { predecessorKind?: unknown; predecessorId?: unknown; successorKind?: unknown; successorId?: unknown; lagDays?: unknown };

type PlanPhaseInput = {
  sequenceNo?: unknown;
  name?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  note?: unknown;
};

type NormalizedPlanDate = {
  kind: Exclude<PlanItemKind, "phase">;
  id: number;
  phaseId: number | null;
  startDate: Date | null;
  endDate: Date | null;
};

type NormalizedDependency = { predecessorKind: Exclude<PlanItemKind, "phase">; predecessorId: number; successorKind: Exclude<PlanItemKind, "phase">; successorId: number; dependencyType: string; lagDays: number };

function normalizeKind(value: unknown): PlanItemKind | null {
  const kind = String(value ?? "");
  return PLAN_ITEM_KINDS.includes(kind as PlanItemKind) ? kind as PlanItemKind : null;
}

function normalizePositiveInt(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isInteger(number) && number > 0 ? number : Number.NaN;
}

function normalizeNullablePositiveInt(value: unknown) { return value === null || value === undefined || value === "" ? null : normalizePositiveInt(value); }

function normalizeNullableDate(value: unknown) {
  if (!isValidProjectPlanDateValue(value)) return Number.NaN;
  return parseDate(typeof value === "string" ? value : null);
}

function isInvalidDate(value: Date | null | number): value is number { return typeof value === "number" && Number.isNaN(value); }

function planKey(kind: string, id: number) { return `${kind}:${id}`; }

function serviceError(error: string, status = 400) { return { ok: false as const, error, status }; }

export async function listProjectPlanGantt(input: { userId: number; projectId: number }) {
  const permissions = await getProjectPermissionsById(input.userId, input.projectId);
  if (!permissions?.canView) return serviceError("无权限", 403);

  const project = await prisma.project.findUnique({
    where: { id: input.projectId },
    include: {
      planPhases: { orderBy: [{ sequenceNo: "asc" }, { id: "asc" }] },
      parentProjectTask: {
        select: {
          baselineStartDate: true,
          baselineEndDate: true,
          startDate: true,
          endDate: true,
        },
      },
      tasks: {
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        include: { owner: { select: { name: true } } },
      },
      planDependencies: { orderBy: [{ id: "asc" }] },
      planBaselines: {
        where: { isActive: true },
        orderBy: [{ id: "desc" }],
        take: 1,
        include: { items: true },
      },
      employees: {
        where: { role: { in: ["负责人", "项目负责人"] } },
        orderBy: { id: "asc" },
        include: { employee: { select: { name: true } } },
      },
    },
  });
  if (!project) return serviceError("项目不存在", 404);

  const activeBaseline = project.planBaselines[0] || null;
  const phaseBaseline = derivePhaseBaseline(project.planPhases);
  const projectDates = effectiveProjectDates(project);
  return {
    ok: true as const,
    data: {
      projectId: input.projectId,
      permissions,
      phases: project.planPhases.map((phase) => ({
        id: phase.id,
        projectId: phase.projectId,
        sequenceNo: phase.sequenceNo,
        name: phase.name,
        startDate: formatDate(phase.startDate),
        endDate: formatDate(phase.endDate),
        note: phase.note,
      })),
      items: [
        {
          kind: "project",
          id: project.id,
          name: project.name,
          parentKind: null,
          parentId: null,
          phaseId: null,
          status: deriveStatusFromActualDates(projectDates.startDate, projectDates.endDate),
          projectLevel: project.projectLevel,
          isMilestone: true,
          ownerNames: project.employees.map((entry) => entry.employee.name).filter(Boolean),
          startDate: formatDate(projectDates.startDate),
          endDate: formatDate(projectDates.endDate),
          baselineStartDate: formatDate(projectDates.baselineStartDate ?? phaseBaseline.startDate),
          baselineEndDate: formatDate(projectDates.baselineEndDate ?? phaseBaseline.endDate),
        },
        ...project.tasks.map((task) => ({
          kind: "task",
          id: task.id,
          name: task.name,
          parentKind: "project",
          parentId: project.id,
          phaseId: task.planPhaseId,
          status: null,
          projectLevel: null,
          isMilestone: task.isMilestone,
          ownerNames: task.owner?.name ? [task.owner.name] : [],
          startDate: formatDate(task.startDate),
          endDate: formatDate(task.endDate),
          baselineStartDate: formatDate(task.baselineStartDate),
          baselineEndDate: formatDate(task.baselineEndDate),
        })),
      ],
      dependencies: project.planDependencies.map((dependency) => ({
        id: dependency.id,
        predecessorKind: dependency.predecessorKind,
        predecessorId: dependency.predecessorId,
        successorKind: dependency.successorKind,
        successorId: dependency.successorId,
        dependencyType: dependency.dependencyType,
        lagDays: dependency.lagDays,
      })),
      activeBaseline: activeBaseline ? {
        id: activeBaseline.id,
        name: activeBaseline.name,
        note: activeBaseline.note,
        createdAt: activeBaseline.createdAt.toISOString(),
        items: activeBaseline.items.map((item) => ({
          id: item.id,
          itemKind: item.itemKind,
          itemId: item.itemId,
          parentKind: item.parentKind,
          parentId: item.parentId,
          phaseId: item.phaseId,
          name: item.name,
          status: item.status,
          isMilestone: item.isMilestone,
          startDate: formatDate(item.startDate),
          endDate: formatDate(item.endDate),
        })),
      } : null,
    },
  };
}

export async function saveProjectPlanGantt(input: { userId: number; projectId: number; body: { items?: PlanDateInput[] } }) {
  if (!(await canEditProject(input.userId, input.projectId))) return serviceError("无权限", 403);
  const items = Array.isArray(input.body.items) ? input.body.items : [];
  const normalized: NormalizedPlanDate[] = [];
  for (const item of items) {
    const kind = normalizeKind(item.kind);
    const id = normalizePositiveInt(item.id);
    const phaseId = normalizeNullablePositiveInt(item.phaseId);
    const startDate = normalizeNullableDate(item.startDate);
    const endDate = normalizeNullableDate(item.endDate);
    if (!kind || kind === "phase" || Number.isNaN(id)) return serviceError("计划节点无效");
    if (Number.isNaN(phaseId) || isInvalidDate(startDate) || isInvalidDate(endDate)) return serviceError("计划日期无效");
    if (startDate && endDate && endDate < startDate) return serviceError("结束日期不能早于开始日期");
    normalized.push({ kind, id, phaseId, startDate, endDate });
  }
  const scope = await loadPlanScope(input.projectId);
  for (const item of normalized) {
    if (item.kind === "task" && !scope.taskIds.has(item.id)) return serviceError("计划节点不属于当前项目");
    if (item.kind === "project" && !scope.projectIds.has(item.id)) return serviceError("计划节点不属于当前项目");
    if (item.kind === "project" && scope.childProjectIds.has(item.id)) return serviceError("子项目日期由上级任务控制");
  }
  const planError = await validateProjectTaskPlanBatch({
    projectId: input.projectId,
    tasks: normalized.filter((item) => item.kind === "task").map((item) => ({ id: item.id, startDate: item.startDate, endDate: item.endDate })),
  });
  if (planError) return serviceError(planError);
  await prisma.$transaction(async (tx) => {
    for (const item of normalized) {
      if (item.kind === "task") {
        await ensureEditHistoryBaseline("ProjectTask", item.id, input.userId, tx);
        await tx.projectTask.update({
          where: { id: item.id },
          data: { startDate: item.startDate, endDate: item.endDate, planPhaseId: item.phaseId, editedBy: input.userId, editedAt: new Date(), version: { increment: 1 } },
        });
        await snapshotHistory("ProjectTask", item.id, input.userId, tx);
      } else {
        await ensureEditHistoryBaseline("Project", item.id, input.userId, tx);
        await tx.project.update({
          where: { id: item.id },
          data: { startDate: item.startDate, endDate: item.endDate, editedBy: input.userId, editedAt: new Date(), version: { increment: 1 } },
        });
        await snapshotHistory("Project", item.id, input.userId, tx);
      }
    }
  });
  return { ok: true as const, data: { success: true } };
}

export async function syncProjectPlanDependencies(input: { userId: number; projectId: number; body: { dependencies?: DependencyInput[] } }) {
  const command = validateProjectPlanCommand("syncProjectPlanDependencies");
  if (!command.ok) return serviceError(command.issue.message, command.issue.status);
  if (!(await canEditProject(input.userId, input.projectId))) return serviceError("无权限", 403);
  const scope = await loadPlanScope(input.projectId);
  const dependencies: NormalizedDependency[] = [];
  for (const dependency of Array.isArray(input.body.dependencies) ? input.body.dependencies : []) {
    const predecessorKind = normalizeKind(dependency.predecessorKind);
    const successorKind = normalizeKind(dependency.successorKind);
    const predecessorId = normalizePositiveInt(dependency.predecessorId);
    const successorId = normalizePositiveInt(dependency.successorId);
    const lagDays = dependency.lagDays === undefined ? 1 : Number(dependency.lagDays);
    if (!predecessorKind || !successorKind || predecessorKind === "phase" || successorKind === "phase") return serviceError("依赖节点无效");
    if (Number.isNaN(predecessorId) || Number.isNaN(successorId) || !Number.isInteger(lagDays)) return serviceError("依赖节点无效");
    if (predecessorKind === successorKind && predecessorId === successorId) return serviceError("依赖不能指向自己");
    if (!scope.has(predecessorKind, predecessorId) || !scope.has(successorKind, successorId)) return serviceError("依赖节点不属于当前项目");
    dependencies.push({ predecessorKind, predecessorId, successorKind, successorId, dependencyType: "finish_start", lagDays });
  }
  const cycleError = findDependencyCycle(dependencies);
  if (cycleError) return serviceError("不能形成计划依赖循环");

  await prisma.$transaction(async (tx) => {
    await tx.projectPlanDependency.deleteMany({ where: { projectId: input.projectId } });
    if (dependencies.length) {
      await tx.projectPlanDependency.createMany({
        data: dependencies.map((dependency) => ({ ...dependency, projectId: input.projectId, createdBy: input.userId, editedBy: input.userId })),
      });
    }
  });
  return { ok: true as const, data: { success: true } };
}

export async function listProjectPlanPhases(input: { userId: number; projectId: number }) {
  if (!(await canViewProject(input.userId, input.projectId))) return serviceError("无权限", 403);
  const phases = await prisma.projectPlanPhase.findMany({
    where: { projectId: input.projectId },
    orderBy: [{ sequenceNo: "asc" }, { id: "asc" }],
  });
  return { ok: true as const, data: { phases: phases.map(mapPlanPhase) } };
}

export async function createProjectPlanPhase(input: { userId: number; projectId: number; body: PlanPhaseInput }) {
  const command = validateProjectPlanCommand("createProjectPlanPhase");
  if (!command.ok) return serviceError(command.issue.message, command.issue.status);
  if (!(await canEditProject(input.userId, input.projectId))) return serviceError("无权限", 403);
  const normalized = await normalizePlanPhaseInput(input.projectId, input.body, "create");
  if ("error" in normalized) return serviceError(String(normalized.error || "参数错误"));
  const createData = normalized.data;
  if (!createData.name || !createData.sequenceNo) return serviceError("项目阶段参数错误");
  const sequenceError = await validatePlanPhaseSequence(input.projectId, null, createData);
  if (sequenceError) return serviceError(sequenceError);
  const phase = await prisma.projectPlanPhase.create({
    data: { projectId: input.projectId, ...createData, name: createData.name, sequenceNo: createData.sequenceNo, createdBy: input.userId, editedBy: input.userId },
  });
  return { ok: true as const, data: { phase: mapPlanPhase(phase) } };
}

export async function updateProjectPlanPhase(input: { userId: number; projectId: number; phaseId: number; body: PlanPhaseInput }) {
  const command = validateProjectPlanCommand("updateProjectPlanPhase");
  if (!command.ok) return serviceError(command.issue.message, command.issue.status);
  if (!(await canEditProject(input.userId, input.projectId))) return serviceError("无权限", 403);
  const existing = await prisma.projectPlanPhase.findUnique({ where: { id: input.phaseId }, select: { projectId: true } });
  if (!existing || existing.projectId !== input.projectId) return serviceError("项目阶段不存在", 404);
  const normalized = await normalizePlanPhaseInput(input.projectId, input.body, "update");
  if ("error" in normalized) return serviceError(String(normalized.error || "参数错误"));
  const sequenceError = await validatePlanPhaseSequence(input.projectId, input.phaseId, normalized.data);
  if (sequenceError) return serviceError(sequenceError);
  const phase = await prisma.projectPlanPhase.update({
    where: { id: input.phaseId },
    data: { ...normalized.data, editedBy: input.userId, editedAt: new Date(), version: { increment: 1 } },
  });
  return { ok: true as const, data: { phase: mapPlanPhase(phase) } };
}

function derivePhaseBaseline(phases: Array<{ startDate: Date | null; endDate: Date | null }>) {
  const startDate = phases.find((phase) => phase.startDate)?.startDate ?? null;
  const endDate = [...phases].reverse().find((phase) => phase.endDate)?.endDate ?? null;
  return { startDate, endDate };
}

export async function deleteProjectPlanPhase(input: { userId: number; projectId: number; phaseId: number }) {
  const command = validateProjectPlanCommand("deleteProjectPlanPhase");
  if (!command.ok) return serviceError(command.issue.message, command.issue.status);
  if (!(await canEditProject(input.userId, input.projectId))) return serviceError("无权限", 403);
  const existing = await prisma.projectPlanPhase.findUnique({ where: { id: input.phaseId }, select: { projectId: true } });
  if (!existing || existing.projectId !== input.projectId) return serviceError("项目阶段不存在", 404);
  await prisma.projectPlanPhase.delete({ where: { id: input.phaseId } });
  return { ok: true as const, data: { success: true } };
}

function mapPlanPhase(phase: { id: number; projectId: number; sequenceNo: number; name: string; startDate: Date | null; endDate: Date | null; note: string | null }) {
  return {
    id: phase.id,
    projectId: phase.projectId,
    sequenceNo: phase.sequenceNo,
    name: phase.name,
    startDate: formatDate(phase.startDate),
    endDate: formatDate(phase.endDate),
    note: phase.note,
  };
}

async function normalizePlanPhaseInput(projectId: number, input: PlanPhaseInput, mode: "create" | "update") {
  const data: { sequenceNo?: number; name?: string; startDate?: Date | null; endDate?: Date | null; note?: string | null } = {};
  if (mode === "create" || input.name !== undefined) {
    const name = normalizeProjectPlanText(input.name);
    if (!name) return { error: "项目阶段名称不能为空" };
    data.name = name;
  }
  if (input.sequenceNo !== undefined) {
    const sequenceNo = normalizePositiveInt(input.sequenceNo);
    if (Number.isNaN(sequenceNo)) return { error: "阶段序号无效" };
    data.sequenceNo = sequenceNo;
  } else if (mode === "create") {
    data.sequenceNo = await nextPlanPhaseSequenceNo(projectId);
  }
  for (const field of ["startDate", "endDate"] as const) {
    if (input[field] === undefined) continue;
    const value = normalizeNullableDate(input[field]);
    if (isInvalidDate(value)) return { error: "日期格式错误" };
    data[field] = value;
  }
  if (input.note !== undefined) data.note = normalizeProjectPlanText(input.note) || null;
  if (data.startDate && data.endDate && data.endDate < data.startDate) return { error: "结束日期不能早于开始日期" };
  return { data };
}

async function validatePlanPhaseSequence(
  projectId: number,
  phaseId: number | null,
  data: { sequenceNo?: number; name?: string; startDate?: Date | null; endDate?: Date | null; note?: string | null },
) {
  const existing = await prisma.projectPlanPhase.findMany({
    where: { projectId },
    orderBy: [{ sequenceNo: "asc" }, { id: "asc" }],
  });
  const merged = existing.map((phase) => {
    if (phase.id !== phaseId) {
      return { id: phase.id, sequenceNo: phase.sequenceNo, startDate: phase.startDate, endDate: phase.endDate };
    }
    return {
      id: phase.id,
      sequenceNo: data.sequenceNo ?? phase.sequenceNo,
      startDate: "startDate" in data ? data.startDate ?? null : phase.startDate,
      endDate: "endDate" in data ? data.endDate ?? null : phase.endDate,
    };
  });
  if (!phaseId) {
    merged.push({ id: Number.MAX_SAFE_INTEGER, sequenceNo: data.sequenceNo ?? (merged.reduce((max, phase) => Math.max(max, phase.sequenceNo), 0) + 1), startDate: data.startDate ?? null, endDate: data.endDate ?? null });
  }
  merged.sort((left, right) => left.sequenceNo - right.sequenceNo || left.id - right.id);
  for (let index = 1; index < merged.length; index += 1) {
    const previous = merged[index - 1];
    const current = merged[index];
    if (previous.endDate && current.startDate && current.startDate < previous.endDate) return "后续阶段的开始日期不能早于前一阶段的结束日期";
  }
  return null;
}

async function nextPlanPhaseSequenceNo(projectId: number) {
  const last = await prisma.projectPlanPhase.findFirst({
    where: { projectId },
    orderBy: [{ sequenceNo: "desc" }, { id: "desc" }],
    select: { sequenceNo: true },
  });
  return (last?.sequenceNo ?? 0) + 1;
}

async function loadPlanScope(projectId: number) {
  const [projects, tasks, phases] = await Promise.all([
    prisma.project.findMany({ where: { id: projectId }, select: { id: true, parentProjectTaskId: true } }),
    prisma.projectTask.findMany({ where: { projectId }, select: { id: true } }),
    prisma.projectPlanPhase.findMany({ where: { projectId }, select: { id: true } }),
  ]);
  const projectIds = new Set(projects.map((project) => project.id));
  const childProjectIds = new Set(projects.filter((project) => project.parentProjectTaskId).map((project) => project.id));
  const taskIds = new Set(tasks.map((task) => task.id));
  const phaseIds = new Set(phases.map((phase) => phase.id));
  return {
    projectIds,
    childProjectIds,
    taskIds,
    phaseIds,
    has(kind: PlanItemKind, id: number) {
      if (kind === "project") return projectIds.has(id);
      if (kind === "task") return taskIds.has(id);
      return phaseIds.has(id);
    },
  };
}

function findDependencyCycle(dependencies: Array<{ predecessorKind: string; predecessorId: number; successorKind: string; successorId: number }>) {
  const nextByKey = new Map<string, string[]>();
  for (const dependency of dependencies) {
    const from = planKey(dependency.predecessorKind, dependency.predecessorId);
    const to = planKey(dependency.successorKind, dependency.successorId);
    nextByKey.set(from, [...nextByKey.get(from) || [], to]);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  function visit(key: string): boolean {
    if (visiting.has(key)) return true;
    if (visited.has(key)) return false;
    visiting.add(key);
    for (const next of nextByKey.get(key) || []) if (visit(next)) return true;
    visiting.delete(key);
    visited.add(key);
    return false;
  }
  return [...nextByKey.keys()].some(visit);
}


export function projectPlanServiceResponse<T>(result: { ok: true; data: T } | { ok: false; error: string; status?: number }) {
  return result.ok ? NextResponse.json(result.data) : jsonErrorResponse(result.error, result.status || 400);
}
