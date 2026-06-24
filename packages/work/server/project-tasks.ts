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
import { validateAssignees, validateOwner, validateProjectTaskCommand, validateTaskPlanConstraints } from "./domain/project-task-validation";

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
  const assigneeError = await validateAssignees(normalized.data.assignees);
  if (assigneeError) return { ok: false as const, error: assigneeError };
  const planError = await validateTaskPlanConstraints({
    projectId: input.projectId,
    taskId: 0,
    planPhaseId: normalized.data.planPhaseId,
    predecessorTaskIds: normalized.data.predecessorTaskIds || [],
    baselineStartDate: normalized.data.baselineStartDate ?? null,
    baselineEndDate: normalized.data.baselineEndDate ?? null,
    startDate: normalized.data.startDate ?? null,
    endDate: normalized.data.endDate ?? null,
  });
  if (planError) return { ok: false as const, error: planError };

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
      planPhaseId: true,
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
  const effectivePlanPhaseId = normalized.data.planPhaseId === undefined ? existing.planPhaseId : normalized.data.planPhaseId;
  const assigneeError = await validateAssignees(normalized.data.assignees);
  if (assigneeError) return { ok: false as const, error: assigneeError };

  const effectiveBaselineStartDate = normalized.data.baselineStartDate === undefined ? existing.baselineStartDate : normalized.data.baselineStartDate;
  const effectiveBaselineEndDate = normalized.data.baselineEndDate === undefined ? existing.baselineEndDate : normalized.data.baselineEndDate;
  const effectiveStartDate = normalized.data.startDate === undefined ? existing.startDate : normalized.data.startDate;
  const effectiveEndDate = normalized.data.endDate === undefined ? existing.endDate : normalized.data.endDate;
  const predecessorTaskIds = normalized.data.predecessorTaskIds === undefined
    ? await loadExistingPredecessorTaskIds(input.projectId, input.taskId)
    : normalized.data.predecessorTaskIds;
  const planError = await validateTaskPlanConstraints({
    projectId: input.projectId,
    taskId: input.taskId,
    planPhaseId: effectivePlanPhaseId,
    predecessorTaskIds,
    baselineStartDate: effectiveBaselineStartDate,
    baselineEndDate: effectiveBaselineEndDate,
    startDate: effectiveStartDate,
    endDate: effectiveEndDate,
  });
  if (planError) return { ok: false as const, error: planError };

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
  const command = validateProjectTaskCommand("deleteProjectTask");
  if (!command.ok) return { ok: false as const, error: command.issue.message, status: command.issue.status };
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
