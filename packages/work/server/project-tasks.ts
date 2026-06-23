import { NextResponse } from "next/server";
import { snapshotHistory } from "@workspace/platform/server/history";
import { Prisma, prisma } from "@workspace/platform/server/prisma";
import { canEditProject, canViewProject } from "./access";
import { formatDate } from "./project-normalization";
import {
  normalizeProjectTaskInput,
  type NormalizedProjectTaskInput,
  type NormalizedTaskAssignee,
  type ProjectTaskInput,
} from "./project-task-input";

async function validateOwner(ownerEmployeeId: number | null | undefined) {
  if (!ownerEmployeeId) return null;
  const owner = await prisma.employee.findUnique({ where: { id: ownerEmployeeId }, select: { id: true } });
  return owner ? null : "负责人不存在";
}

async function validateAssignees(assignees: NormalizedTaskAssignee[] | undefined) {
  if (!assignees || assignees.length === 0) return null;
  const employees = await prisma.employee.findMany({
    where: { id: { in: assignees.map((assignee) => assignee.employeeId) } },
    select: { id: true },
  });
  if (employees.length !== assignees.length) return "任务 RASCI 人员不存在";
  return null;
}

async function validatePlanPhase(projectId: number, planPhaseId: number | null | undefined) {
  if (!planPhaseId) return null;
  const phase = await prisma.projectPlanPhase.findUnique({
    where: { id: planPhaseId },
    select: { projectId: true },
  });
  if (!phase || phase.projectId !== projectId) return "计划阶段不存在";
  return null;
}

async function loadTaskDependencyContext(projectId: number) {
  const [tasks, dependencies] = await Promise.all([
    prisma.projectTask.findMany({
      where: { projectId },
      select: { id: true, name: true, endDate: true },
    }),
    prisma.projectPlanDependency.findMany({
      where: { projectId, predecessorKind: "task", successorKind: "task" },
      select: { predecessorId: true, successorId: true },
    }),
  ]);
  return {
    taskById: new Map(tasks.map((task) => [task.id, task])),
    dependencies,
  };
}

function validatePredecessorCycles(input: {
  taskId: number;
  predecessorTaskIds: number[];
  existingDependencies: Array<{ predecessorId: number; successorId: number }>;
}) {
  const edges = input.existingDependencies
    .filter((dependency) => dependency.successorId !== input.taskId)
    .map((dependency) => ({ predecessorId: dependency.predecessorId, successorId: dependency.successorId }));
  for (const predecessorId of input.predecessorTaskIds) {
    if (predecessorId === input.taskId) return "前置任务不能选择自己";
    edges.push({ predecessorId, successorId: input.taskId });
  }
  const nextByTaskId = new Map<number, number[]>();
  for (const edge of edges) {
    nextByTaskId.set(edge.predecessorId, [...(nextByTaskId.get(edge.predecessorId) || []), edge.successorId]);
  }
  const visiting = new Set<number>();
  const visited = new Set<number>();
  function visit(id: number): boolean {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const next of nextByTaskId.get(id) || []) {
      if (visit(next)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  }
  return [...nextByTaskId.keys()].some(visit) ? "不能形成任务依赖循环" : null;
}

async function validatePredecessors(input: {
  projectId: number;
  taskId: number;
  predecessorTaskIds: number[];
  startDate: Date | null | undefined;
}) {
  const context = await loadTaskDependencyContext(input.projectId);
  for (const predecessorTaskId of input.predecessorTaskIds) {
    if (!context.taskById.has(predecessorTaskId)) return "前置任务不存在";
  }
  const cycleError = validatePredecessorCycles({
    taskId: input.taskId,
    predecessorTaskIds: input.predecessorTaskIds,
    existingDependencies: context.dependencies,
  });
  if (cycleError) return cycleError;

  if (input.startDate) {
    for (const predecessorTaskId of input.predecessorTaskIds) {
      const predecessor = context.taskById.get(predecessorTaskId);
      if (!predecessor?.endDate) continue;
      if (input.startDate < predecessor.endDate) {
        return `实际开始时间不能早于前置任务「${predecessor.name}」的实际结束时间`;
      }
    }
  }
  return null;
}

async function nextSortOrder(projectId: number) {
  const last = await prisma.projectTask.findFirst({
    where: { projectId },
    orderBy: [{ sortOrder: "desc" }, { id: "desc" }],
    select: { sortOrder: true },
  });
  return (last?.sortOrder ?? 0) + 10;
}

async function listProjectTaskRows(projectId: number) {
  const [rows, planDependencies] = await Promise.all([
    prisma.projectTask.findMany({
      where: { projectId },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      include: {
        owner: { select: { id: true, employeeId: true, name: true } },
        planPhase: { select: { id: true, name: true } },
        assignees: {
          orderBy: { id: "asc" },
          include: { employee: { select: { id: true, employeeId: true, name: true } } },
        },
      },
    }),
    prisma.projectPlanDependency.findMany({
      where: { projectId, predecessorKind: "task", successorKind: "task" },
      orderBy: { id: "asc" },
    }),
  ]);
  const taskNameById = new Map(rows.map((task) => [task.id, task.name]));
  const predecessorsBySuccessorId = new Map<number, number[]>();
  const successorsByPredecessorId = new Map<number, number[]>();
  for (const dependency of planDependencies) {
    predecessorsBySuccessorId.set(dependency.successorId, [
      ...(predecessorsBySuccessorId.get(dependency.successorId) || []),
      dependency.predecessorId,
    ]);
    successorsByPredecessorId.set(dependency.predecessorId, [
      ...(successorsByPredecessorId.get(dependency.predecessorId) || []),
      dependency.successorId,
    ]);
  }
  return rows.map((task) => {
    const predecessorTaskIds = predecessorsBySuccessorId.get(task.id) || [];
    const successorTaskIds = successorsByPredecessorId.get(task.id) || [];
    return {
      id: task.id,
      projectId: task.projectId,
      planPhaseId: task.planPhaseId,
      planPhaseName: task.planPhase?.name ?? null,
      name: task.name,
      isMilestone: task.isMilestone,
      ownerEmployeeId: task.ownerEmployeeId,
      ownerEmployeeNumber: task.owner?.employeeId ?? null,
      ownerEmployeeName: task.owner?.name ?? null,
      description: task.description,
      baselineStartDate: formatDate(task.baselineStartDate),
      baselineEndDate: formatDate(task.baselineEndDate),
      startDate: formatDate(task.startDate),
      endDate: formatDate(task.endDate),
      predecessorTaskIds,
      predecessorTaskNames: predecessorTaskIds.map((id) => taskNameById.get(id)).filter((name): name is string => Boolean(name)),
      successorTasks: successorTaskIds.map((id) => ({
        id,
        name: taskNameById.get(id) || "",
      })).filter((task) => Boolean(task.name)),
      assignees: task.assignees.map((assignee) => ({
        id: assignee.id,
        employeeId: assignee.employeeId,
        employeeNumber: assignee.employee.employeeId,
        employeeName: assignee.employee.name,
        role: assignee.role,
      })),
      sortOrder: task.sortOrder,
    };
  });
}

export async function listProjectTasks(input: { userId: number; projectId: number }) {
  if (!(await canViewProject(input.userId, input.projectId))) {
    return { ok: false as const, error: "无权限", status: 403 };
  }
  return { ok: true as const, data: { tasks: await listProjectTaskRows(input.projectId) } };
}

export async function createProjectTask(input: { userId: number; projectId: number; body: ProjectTaskInput }) {
  if (!(await canEditProject(input.userId, input.projectId))) {
    return { ok: false as const, error: "无权限", status: 403 };
  }
  const normalized = normalizeProjectTaskInput(input.body, "create");
  if ("error" in normalized) return { ok: false as const, error: normalized.error ?? "参数错误" };

  const ownerError = await validateOwner(normalized.data.ownerEmployeeId);
  if (ownerError) return { ok: false as const, error: ownerError };
  const phaseError = await validatePlanPhase(input.projectId, normalized.data.planPhaseId);
  if (phaseError) return { ok: false as const, error: phaseError };
  const assigneeError = await validateAssignees(normalized.data.assignees);
  if (assigneeError) return { ok: false as const, error: assigneeError };
  const predecessorError = await validatePredecessors({
    projectId: input.projectId,
    taskId: 0,
    predecessorTaskIds: normalized.data.predecessorTaskIds || [],
    startDate: normalized.data.startDate ?? null,
  });
  if (predecessorError) return { ok: false as const, error: predecessorError };

  const sortOrder = normalized.data.sortOrder ?? await nextSortOrder(input.projectId);
  const task = await prisma.$transaction(async (tx) => {
    const created = await tx.projectTask.create({
      data: {
        projectId: input.projectId,
        planPhaseId: normalized.data.planPhaseId ?? null,
        name: normalized.data.name ?? "",
        description: normalized.data.description ?? "",
        isMilestone: normalized.data.isMilestone ?? false,
        ownerEmployeeId: normalized.data.ownerEmployeeId ?? null,
        baselineStartDate: normalized.data.baselineStartDate ?? null,
        baselineEndDate: normalized.data.baselineEndDate ?? null,
        startDate: normalized.data.startDate ?? null,
        endDate: normalized.data.endDate ?? null,
        sortOrder,
        createdBy: input.userId,
        editedBy: input.userId,
      },
    });
    await syncTaskAssignments(tx, created.id, normalized.data, input.userId);
    await syncTaskPredecessors(tx, input.projectId, created.id, normalized.data.predecessorTaskIds || [], input.userId);
    return created;
  });
  await snapshotHistory("ProjectTask", task.id, input.userId);
  return { ok: true as const, data: { task } };
}

export async function updateProjectTask(input: { userId: number; projectId: number; taskId: number; body: ProjectTaskInput }) {
  const existing = await prisma.projectTask.findUnique({
    where: { id: input.taskId },
    select: {
      id: true,
      projectId: true,
      startDate: true,
      endDate: true,
      baselineStartDate: true,
      baselineEndDate: true,
    },
  });
  if (!existing || existing.projectId !== input.projectId) {
    return { ok: false as const, error: "任务不存在", status: 404 };
  }
  if (!(await canEditProject(input.userId, input.projectId))) {
    return { ok: false as const, error: "无权限", status: 403 };
  }
  const normalized = normalizeProjectTaskInput(input.body, "update");
  if ("error" in normalized) return { ok: false as const, error: normalized.error ?? "参数错误" };

  const ownerError = await validateOwner(normalized.data.ownerEmployeeId);
  if (ownerError) return { ok: false as const, error: ownerError };
  const phaseError = await validatePlanPhase(input.projectId, normalized.data.planPhaseId);
  if (phaseError) return { ok: false as const, error: phaseError };
  const assigneeError = await validateAssignees(normalized.data.assignees);
  if (assigneeError) return { ok: false as const, error: assigneeError };

  const effectiveStartDate = normalized.data.startDate === undefined ? existing.startDate : normalized.data.startDate;
  const predecessorTaskIds = normalized.data.predecessorTaskIds === undefined
    ? await loadExistingPredecessorTaskIds(input.projectId, input.taskId)
    : normalized.data.predecessorTaskIds;
  const predecessorError = await validatePredecessors({
    projectId: input.projectId,
    taskId: input.taskId,
    predecessorTaskIds,
    startDate: effectiveStartDate,
  });
  if (predecessorError) return { ok: false as const, error: predecessorError };

  const task = await prisma.$transaction(async (tx) => {
    const updated = await tx.projectTask.update({
      where: { id: input.taskId },
      data: {
        ...taskUpdateData(normalized.data),
        editedBy: input.userId,
        editedAt: new Date(),
        version: { increment: 1 },
      },
    });
    if (normalized.data.assignees !== undefined || normalized.data.ownerEmployeeId !== undefined) {
      await syncTaskAssignments(tx, input.taskId, normalized.data, input.userId);
    }
    if (normalized.data.predecessorTaskIds !== undefined) {
      await syncTaskPredecessors(tx, input.projectId, input.taskId, normalized.data.predecessorTaskIds, input.userId);
    }
    return updated;
  });
  await snapshotHistory("ProjectTask", task.id, input.userId);
  return { ok: true as const, data: { task } };
}

function taskUpdateData(data: NormalizedProjectTaskInput) {
  const update: Record<string, unknown> = {};
  for (const field of [
    "name",
    "description",
    "isMilestone",
    "ownerEmployeeId",
    "baselineStartDate",
    "baselineEndDate",
    "startDate",
    "endDate",
    "planPhaseId",
    "sortOrder",
  ] as const) {
    if (data[field] !== undefined) update[field] = data[field];
  }
  return update;
}

async function loadExistingPredecessorTaskIds(projectId: number, taskId: number) {
  const dependencies = await prisma.projectPlanDependency.findMany({
    where: { projectId, predecessorKind: "task", successorKind: "task", successorId: taskId },
    select: { predecessorId: true },
  });
  return dependencies.map((dependency) => dependency.predecessorId);
}

async function syncTaskPredecessors(
  tx: Prisma.TransactionClient,
  projectId: number,
  taskId: number,
  predecessorTaskIds: number[],
  userId: number,
) {
  await tx.projectPlanDependency.deleteMany({
    where: { projectId, successorKind: "task", successorId: taskId },
  });
  for (const predecessorTaskId of predecessorTaskIds) {
    await tx.projectPlanDependency.create({
      data: {
        projectId,
        predecessorKind: "task",
        predecessorId: predecessorTaskId,
        successorKind: "task",
        successorId: taskId,
        dependencyType: "finish_start",
        lagDays: 0,
        createdBy: userId,
        editedBy: userId,
      },
    });
  }
}

async function syncTaskAssignments(
  tx: Prisma.TransactionClient,
  taskId: number,
  data: NormalizedProjectTaskInput,
  userId: number,
) {
  const incoming = data.assignees ?? [];
  const next = new Map<number, NormalizedTaskAssignee>();
  for (const assignee of incoming) next.set(assignee.employeeId, assignee);
  if (data.ownerEmployeeId) {
    next.set(data.ownerEmployeeId, { employeeId: data.ownerEmployeeId, role: "负责人" });
  }
  if (data.assignees === undefined && data.ownerEmployeeId === undefined) return;
  await tx.projectTaskAssignment.deleteMany({ where: { taskId } });
  for (const assignee of next.values()) {
    await tx.projectTaskAssignment.create({
      data: {
        taskId,
        employeeId: assignee.employeeId,
        role: assignee.role,
        editedBy: userId,
      },
    });
  }
}

export async function deleteProjectTask(input: { userId: number; projectId: number; taskId: number }) {
  const existing = await prisma.projectTask.findUnique({
    where: { id: input.taskId },
    select: { id: true, projectId: true },
  });
  if (!existing || existing.projectId !== input.projectId) {
    return { ok: false as const, error: "任务不存在", status: 404 };
  }
  if (!(await canEditProject(input.userId, input.projectId))) {
    return { ok: false as const, error: "无权限", status: 403 };
  }
  await snapshotHistory("ProjectTask", input.taskId, input.userId);
  await prisma.$transaction(async (tx) => {
    await tx.projectPlanDependency.deleteMany({
      where: {
        projectId: input.projectId,
        OR: [
          { predecessorKind: "task", predecessorId: input.taskId },
          { successorKind: "task", successorId: input.taskId },
        ],
      },
    });
    await tx.projectTask.delete({ where: { id: input.taskId } });
  });
  return { ok: true as const, data: { success: true } };
}

export function projectTaskServiceResponse<T>(result: { ok: true; data: T } | { ok: false; error: string; status?: number }) {
  if (result.ok) return NextResponse.json(result.data);
  return NextResponse.json({ error: result.error }, { status: result.status || 400 });
}
