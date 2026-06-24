import { prisma } from "@workspace/platform/server/prisma";
import type { NormalizedTaskAssignee } from "./project-task-input";

export async function validateOwner(ownerEmployeeId: number | null | undefined) {
  if (!ownerEmployeeId) return null;
  const owner = await prisma.employee.findUnique({ where: { id: ownerEmployeeId }, select: { id: true } });
  return owner ? null : "负责人不存在";
}

export async function validateAssignees(assignees: NormalizedTaskAssignee[] | undefined) {
  if (!assignees || assignees.length === 0) return null;
  const employees = await prisma.employee.findMany({
    where: { id: { in: assignees.map((assignee) => assignee.employeeId) } },
    select: { id: true },
  });
  if (employees.length !== assignees.length) return "任务 RASCI 人员不存在";
  return null;
}

type TaskPlanPhase = {
  id: number;
  name: string;
  projectId: number;
  startDate: Date | null;
  endDate: Date | null;
};
type TaskPlanRuleTask = {
  id: number;
  name: string;
  baselineStartDate: Date | null;
  baselineEndDate: Date | null;
  startDate: Date | null;
  endDate: Date | null;
};
type TaskDependencyEdge = { predecessorId: number; successorId: number };

async function loadOptionalPlanPhase(projectId: number, planPhaseId: number | null | undefined): Promise<{ phase: TaskPlanPhase | null } | { error: string }> {
  if (!planPhaseId) return { phase: null };
  const phase = await prisma.projectPlanPhase.findUnique({
    where: { id: planPhaseId },
    select: { id: true, name: true, projectId: true, startDate: true, endDate: true },
  });
  if (!phase || phase.projectId !== projectId) return { error: "项目阶段不存在" };
  return { phase };
}

function validateDateRangeWithinPhase(input: {
  label: string;
  startDate: Date | null | undefined;
  endDate: Date | null | undefined;
  phase: TaskPlanPhase;
}) {
  const { label, startDate, endDate, phase } = input;
  if (!startDate && !endDate) return null;
  if (!phase.startDate || !phase.endDate) return `项目阶段「${phase.name}」需要先设置起止日期`;
  if (startDate && startDate < phase.startDate) return `${label}开始时间不能早于项目阶段「${phase.name}」的开始日期`;
  if (startDate && startDate > phase.endDate) return `${label}开始时间不能晚于项目阶段「${phase.name}」的结束日期`;
  if (endDate && endDate < phase.startDate) return `${label}结束时间不能早于项目阶段「${phase.name}」的开始日期`;
  if (endDate && endDate > phase.endDate) return `${label}结束时间不能晚于项目阶段「${phase.name}」的结束日期`;
  return null;
}

async function loadTaskDependencyContext(projectId: number) {
  const [tasks, dependencies] = await Promise.all([
    prisma.projectTask.findMany({
      where: { projectId },
      select: { id: true, name: true, baselineStartDate: true, baselineEndDate: true, startDate: true, endDate: true },
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

function validatePredecessorCycles(input: { taskId: number; predecessorTaskIds: number[]; existingDependencies: TaskDependencyEdge[] }) {
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

function validateTaskDependencyDateRules(taskById: Map<number, TaskPlanRuleTask>, dependencies: TaskDependencyEdge[]) {
  for (const dependency of dependencies) {
    const predecessor = taskById.get(dependency.predecessorId);
    const successor = taskById.get(dependency.successorId);
    if (!predecessor || !successor) continue;
    if (successor.baselineStartDate && predecessor.baselineEndDate && successor.baselineStartDate < predecessor.baselineEndDate) {
      return `基线开始时间不能早于前置任务「${predecessor.name}」的基线结束时间`;
    }
    if (successor.startDate && predecessor.endDate && successor.startDate < predecessor.endDate) {
      return `实际开始时间不能早于前置任务「${predecessor.name}」的实际结束时间`;
    }
  }
  return null;
}

export async function validateTaskPlanConstraints(input: {
  projectId: number;
  taskId: number;
  planPhaseId: number | null | undefined;
  predecessorTaskIds: number[];
  baselineStartDate: Date | null | undefined;
  baselineEndDate: Date | null | undefined;
  startDate: Date | null | undefined;
  endDate: Date | null | undefined;
}) {
  const phaseResult = await loadOptionalPlanPhase(input.projectId, input.planPhaseId);
  if ("error" in phaseResult) return phaseResult.error;
  const phase = phaseResult.phase;
  if (phase) {
    const phaseError = validateDateRangeWithinPhase({
      label: "基线",
      startDate: input.baselineStartDate,
      endDate: input.baselineEndDate,
      phase,
    }) || validateDateRangeWithinPhase({
      label: "实际",
      startDate: input.startDate,
      endDate: input.endDate,
      phase,
    });
    if (phaseError) return phaseError;
  }

  const context = await loadTaskDependencyContext(input.projectId);
  for (const predecessorTaskId of input.predecessorTaskIds) {
    if (!context.taskById.has(predecessorTaskId)) return "前置任务不存在";
  }
  const dependencies = [
    ...context.dependencies.filter((dependency) => dependency.successorId !== input.taskId),
    ...input.predecessorTaskIds.map((predecessorId) => ({ predecessorId, successorId: input.taskId })),
  ];
  const cycleError = validatePredecessorCycles({
    taskId: input.taskId,
    predecessorTaskIds: input.predecessorTaskIds,
    existingDependencies: context.dependencies,
  });
  if (cycleError) return cycleError;
  const current = context.taskById.get(input.taskId);
  if (current) context.taskById.set(input.taskId, { ...current, baselineStartDate: input.baselineStartDate ?? null, baselineEndDate: input.baselineEndDate ?? null, startDate: input.startDate ?? null, endDate: input.endDate ?? null });
  return validateTaskDependencyDateRules(context.taskById, dependencies);
}

export async function validateProjectTaskPlanBatch(input: {
  projectId: number;
  tasks: Array<{ id: number; startDate: Date | null; endDate: Date | null; baselineStartDate?: Date | null; baselineEndDate?: Date | null }>;
}) {
  const context = await loadTaskDependencyContext(input.projectId);
  const taskById = new Map(context.taskById);
  for (const task of input.tasks) {
    const existing = taskById.get(task.id);
    if (existing) taskById.set(task.id, { ...existing, baselineStartDate: task.baselineStartDate ?? existing.baselineStartDate, baselineEndDate: task.baselineEndDate ?? existing.baselineEndDate, startDate: task.startDate, endDate: task.endDate });
  }
  return validateTaskDependencyDateRules(taskById, context.dependencies);
}
