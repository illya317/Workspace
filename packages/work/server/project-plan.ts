import { NextResponse } from "next/server";
import { guardedDelete } from "@workspace/platform/server/delete-guard";
import { ensureEditHistoryBaseline, snapshotHistory } from "@workspace/platform/server/history";
import { prisma } from "@workspace/platform/server/prisma";
import { canCreateProjectAction, canDeleteProjectSubresourceAction, canViewProject, canUpdateProjectAction, getProjectPermissionsById } from "./access";
import { isValidProjectPlanDateValue, normalizeProjectPlanText, validateProjectPlanCommand } from "./domain/project-plan-validation";
import { formatDate, parseDate } from "./project-normalization";
import { jsonErrorResponse, serviceError, serviceOk } from "@workspace/platform/server/api";
import { validateCompletionSchedule } from "@workspace/platform/completion-date-policy";

export const PLAN_ITEM_KINDS = ["project", "phase"] as const;
export type PlanItemKind = (typeof PLAN_ITEM_KINDS)[number];

type PlanDateInput = {
  kind?: unknown;
  id?: unknown;
  actualStartDate?: unknown;
  actualEndDate?: unknown;
  phaseId?: unknown;
};

type DependencyInput = { predecessorKind?: unknown; predecessorId?: unknown; successorKind?: unknown; successorId?: unknown; lagDays?: unknown };

type PlanPhaseInput = {
  sequenceNo?: unknown;
  name?: unknown;
  plannedStartDate?: unknown;
  plannedEndDate?: unknown;
  note?: unknown;
};

type NormalizedPlanDate = {
  kind: "project";
  id: number;
  phaseId: number | null;
  actualStartDate: Date | null;
  actualEndDate: Date | null;
};

type NormalizedDependency = { predecessorKind: "project"; predecessorId: number; successorKind: "project"; successorId: number; dependencyType: string; lagDays: number };

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

export async function listProjectPlanGantt(input: { userId: number; projectId: number }) {
  const permissions = await getProjectPermissionsById(input.userId, input.projectId);
  if (!permissions?.canView) return serviceError("无权限", 403);

  const project = await prisma.project.findUnique({
    where: { id: input.projectId },
    include: {
      planPhases: { orderBy: [{ sequenceNo: "asc" }, { id: "asc" }] },
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
  return serviceOk({
      projectId: input.projectId,
      permissions,
      phases: project.planPhases.map((phase) => ({
        id: phase.id,
        version: phase.version,
        projectId: phase.projectId,
        sequenceNo: phase.sequenceNo,
        name: phase.name,
        plannedStartDate: formatDate(phase.plannedStartDate),
        plannedEndDate: formatDate(phase.plannedEndDate),
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
          status: project.status,
          projectLevel: project.projectLevel,
          isMilestone: true,
          ownerNames: project.employees.map((entry) => entry.employee.name).filter(Boolean),
          actualStartDate: formatDate(project.actualStartDate),
          actualEndDate: formatDate(project.actualEndDate),
          plannedStartDate: formatDate(project.plannedStartDate ?? phaseBaseline.plannedStartDate),
          plannedEndDate: formatDate(project.plannedEndDate ?? phaseBaseline.plannedEndDate),
        },
      ],
      dependencies: project.planDependencies.filter((dependency) => (
        dependency.predecessorKind !== "task" && dependency.successorKind !== "task"
      )).map((dependency) => ({
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
        items: activeBaseline.items.filter((item) => item.itemKind !== "task").map((item) => ({
          id: item.id,
          itemKind: item.itemKind,
          itemId: item.itemId,
          parentKind: item.parentKind,
          parentId: item.parentId,
          phaseId: item.phaseId,
          name: item.name,
          status: item.status,
          isMilestone: item.isMilestone,
          plannedStartDate: formatDate(item.plannedStartDate),
          plannedEndDate: formatDate(item.plannedEndDate),
        })),
      } : null,
  });
}

export async function saveProjectPlanGantt(input: { userId: number; projectId: number; body: { items?: PlanDateInput[] } }) {
  const command = validateProjectPlanCommand("saveProjectPlanGantt");
  if (!command.ok) return serviceError(command.issue.message, command.issue.status);
  if (!(await canCreateProjectAction(input.userId, input.projectId))) return serviceError("无权限", 403);
  const items = Array.isArray(input.body.items) ? input.body.items : [];
  const normalized: NormalizedPlanDate[] = [];
  for (const item of items) {
    const kind = normalizeKind(item.kind);
    const id = normalizePositiveInt(item.id);
    const phaseId = normalizeNullablePositiveInt(item.phaseId);
    const actualStartDate = normalizeNullableDate(item.actualStartDate);
    const actualEndDate = normalizeNullableDate(item.actualEndDate);
    if (!kind || kind === "phase" || Number.isNaN(id)) return serviceError("计划节点无效");
    if (Number.isNaN(phaseId) || isInvalidDate(actualStartDate) || isInvalidDate(actualEndDate)) return serviceError("计划日期无效");
    normalized.push({ kind, id, phaseId, actualStartDate, actualEndDate });
  }
  const scope = await loadPlanScope(input.projectId);
  for (const item of normalized) {
    if (item.kind === "project" && !scope.projectIds.has(item.id)) return serviceError("计划节点不属于当前项目");
  }
  const currentProject = await prisma.project.findUnique({
    where: { id: input.projectId },
    select: { status: true, plannedStartDate: true, plannedEndDate: true },
  });
  if (!currentProject) return serviceError("项目不存在", 404);
  for (const item of normalized) {
    const scheduleError = validateCompletionSchedule({ ...currentProject, actualStartDate: item.actualStartDate, actualEndDate: item.actualEndDate });
    if (scheduleError) return serviceError(scheduleError);
  }
  await prisma.$transaction(async (tx) => {
    for (const item of normalized) {
      await ensureEditHistoryBaseline("Project", item.id, input.userId, tx);
      await tx.project.update({
        where: { id: item.id },
        data: { actualStartDate: item.actualStartDate, actualEndDate: item.actualEndDate, editedBy: input.userId, editedAt: new Date(), version: { increment: 1 } },
      });
      await snapshotHistory("Project", item.id, input.userId, tx);
    }
  });
  return serviceOk({ success: true });
}

export async function syncProjectPlanDependencies(input: { userId: number; projectId: number; body: { dependencies?: DependencyInput[] } }) {
  const command = validateProjectPlanCommand("syncProjectPlanDependencies");
  if (!command.ok) return serviceError(command.issue.message, command.issue.status);
  if (!(await canUpdateProjectAction(input.userId, input.projectId))) return serviceError("无权限", 403);
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
  return serviceOk({ success: true });
}

export async function listProjectPlanPhases(input: { userId: number; projectId: number }) {
  if (!(await canViewProject(input.userId, input.projectId))) return serviceError("无权限", 403);
  const phases = await prisma.projectPlanPhase.findMany({
    where: { projectId: input.projectId },
    orderBy: [{ sequenceNo: "asc" }, { id: "asc" }],
  });
  return serviceOk({ phases: phases.map(mapPlanPhase) });
}

export async function createProjectPlanPhase(input: { userId: number; projectId: number; body: PlanPhaseInput }) {
  const command = validateProjectPlanCommand("createProjectPlanPhase");
  if (!command.ok) return serviceError(command.issue.message, command.issue.status);
  if (!(await canDeleteProjectSubresourceAction(input.userId, input.projectId))) return serviceError("无权限", 403);
  const normalized = await normalizePlanPhaseInput(input.projectId, input.body, "create");
  if ("error" in normalized) return serviceError(String(normalized.error || "参数错误"));
  const createData = normalized.data;
  if (!createData.name || !createData.sequenceNo) return serviceError("项目阶段参数错误");
  const sequenceError = await validatePlanPhaseSequence(input.projectId, null, createData);
  if (sequenceError) return serviceError(sequenceError);
  const phase = await prisma.projectPlanPhase.create({
    data: { projectId: input.projectId, ...createData, name: createData.name, sequenceNo: createData.sequenceNo, createdBy: input.userId, editedBy: input.userId },
  });
  return serviceOk({ phase: mapPlanPhase(phase) });
}

export async function updateProjectPlanPhase(input: { userId: number; projectId: number; phaseId: number; body: PlanPhaseInput }) {
  const command = validateProjectPlanCommand("updateProjectPlanPhase");
  if (!command.ok) return serviceError(command.issue.message, command.issue.status);
  if (!(await canUpdateProjectAction(input.userId, input.projectId))) return serviceError("无权限", 403);
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
  return serviceOk({ phase: mapPlanPhase(phase) });
}

function derivePhaseBaseline(phases: Array<{ plannedStartDate: Date | null; plannedEndDate: Date | null }>) {
  const plannedStartDate = phases.find((phase) => phase.plannedStartDate)?.plannedStartDate ?? null;
  const plannedEndDate = [...phases].reverse().find((phase) => phase.plannedEndDate)?.plannedEndDate ?? null;
  return { plannedStartDate, plannedEndDate };
}

export async function deleteProjectPlanPhase(input: {
  userId: number;
  projectId: number;
  phaseId: number;
  expectedVersion: number | undefined;
}) {
  const command = validateProjectPlanCommand("deleteProjectPlanPhase");
  if (!command.ok) return serviceError(command.issue.message, command.issue.status);
  if (!(await canDeleteProjectSubresourceAction(input.userId, input.projectId))) return serviceError("无权限", 403);
  const existing = await prisma.projectPlanPhase.findUnique({ where: { id: input.phaseId }, select: { projectId: true } });
  if (!existing || existing.projectId !== input.projectId) return serviceError("项目阶段不存在", 404);
  const result = await guardedDelete({
    entityType: "ProjectPlanPhase",
    modelKey: "projectPlanPhase",
    id: input.phaseId,
    expectedVersion: input.expectedVersion,
    userId: input.userId,
    actionLabel: "删除项目阶段",
    deleteMode: "hard",
    references: [
      { label: "关联工作项", count: (tx) => tx.workItem.count({ where: { linkedProjectPhaseId: input.phaseId } }) },
      { label: "关联工作计划", count: (tx) => tx.workPlan.count({ where: { linkedProjectPhaseId: input.phaseId } }) },
      { label: "计划基线条目", count: (tx) => tx.projectPlanBaselineItem.count({ where: { phaseId: input.phaseId } }) },
      {
        label: "项目阶段依赖",
        count: (tx) => tx.projectPlanDependency.count({
          where: {
            OR: [
              { predecessorKind: "phase", predecessorId: input.phaseId },
              { successorKind: "phase", successorId: input.phaseId },
            ],
          },
        }),
      },
    ],
    referencePolicy: "checked",
  });
  if (!result.ok) return serviceError(result.error, result.status || 400);
  return serviceOk({ success: true });
}

function mapPlanPhase(phase: { id: number; version: number; projectId: number; sequenceNo: number; name: string; plannedStartDate: Date | null; plannedEndDate: Date | null; note: string | null }) {
  return {
    id: phase.id,
    version: phase.version,
    projectId: phase.projectId,
    sequenceNo: phase.sequenceNo,
    name: phase.name,
    plannedStartDate: formatDate(phase.plannedStartDate),
    plannedEndDate: formatDate(phase.plannedEndDate),
    note: phase.note,
  };
}

async function normalizePlanPhaseInput(projectId: number, input: PlanPhaseInput, mode: "create" | "update") {
  const data: { sequenceNo?: number; name?: string; plannedStartDate?: Date | null; plannedEndDate?: Date | null; note?: string | null } = {};
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
  for (const field of ["plannedStartDate", "plannedEndDate"] as const) {
    if (input[field] === undefined) continue;
    const value = normalizeNullableDate(input[field]);
    if (isInvalidDate(value)) return { error: "日期格式错误" };
    data[field] = value;
  }
  if (input.note !== undefined) data.note = normalizeProjectPlanText(input.note) || null;
  if (data.plannedStartDate && data.plannedEndDate && data.plannedEndDate < data.plannedStartDate) return { error: "结束日期不能早于开始日期" };
  return { data };
}

async function validatePlanPhaseSequence(
  projectId: number,
  phaseId: number | null,
  data: { sequenceNo?: number; name?: string; plannedStartDate?: Date | null; plannedEndDate?: Date | null; note?: string | null },
) {
  const existing = await prisma.projectPlanPhase.findMany({
    where: { projectId },
    orderBy: [{ sequenceNo: "asc" }, { id: "asc" }],
  });
  const merged = existing.map((phase) => {
    if (phase.id !== phaseId) {
      return { id: phase.id, sequenceNo: phase.sequenceNo, plannedStartDate: phase.plannedStartDate, plannedEndDate: phase.plannedEndDate };
    }
    return {
      id: phase.id,
      sequenceNo: data.sequenceNo ?? phase.sequenceNo,
      plannedStartDate: "plannedStartDate" in data ? data.plannedStartDate ?? null : phase.plannedStartDate,
      plannedEndDate: "plannedEndDate" in data ? data.plannedEndDate ?? null : phase.plannedEndDate,
    };
  });
  if (!phaseId) {
    merged.push({ id: Number.MAX_SAFE_INTEGER, sequenceNo: data.sequenceNo ?? (merged.reduce((max, phase) => Math.max(max, phase.sequenceNo), 0) + 1), plannedStartDate: data.plannedStartDate ?? null, plannedEndDate: data.plannedEndDate ?? null });
  }
  merged.sort((left, right) => left.sequenceNo - right.sequenceNo || left.id - right.id);
  for (let index = 1; index < merged.length; index += 1) {
    const previous = merged[index - 1];
    const current = merged[index];
    if (previous.plannedEndDate && current.plannedStartDate && current.plannedStartDate < previous.plannedEndDate) return "后续阶段的开始日期不能早于前一阶段的结束日期";
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
  const [projects, phases] = await Promise.all([
    prisma.project.findMany({ where: { id: projectId }, select: { id: true } }),
    prisma.projectPlanPhase.findMany({ where: { projectId }, select: { id: true } }),
  ]);
  const projectIds = new Set(projects.map((project) => project.id));
  const phaseIds = new Set(phases.map((phase) => phase.id));
  return {
    projectIds,
    phaseIds,
    has(kind: PlanItemKind, id: number) {
      if (kind === "project") return projectIds.has(id);
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
