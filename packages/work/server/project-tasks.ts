import { NextResponse } from "next/server";
import { snapshotHistory } from "@workspace/platform/server/history";
import { isValidDateValue } from "@workspace/platform/server/api";
import { prisma } from "@workspace/platform/server/prisma";
import { canEditProject, canViewProject } from "./access";
import { formatDate, parseDate } from "./project-normalization";

export type ProjectTaskInput = {
  description?: unknown;
  isMilestone?: unknown;
  ownerEmployeeId?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  predecessorTaskId?: unknown;
  sortOrder?: unknown;
};

type NormalizedProjectTaskInput = {
  description?: string;
  isMilestone?: boolean;
  ownerEmployeeId?: number | null;
  startDate?: Date | null;
  endDate?: Date | null;
  predecessorTaskId?: number | null;
  sortOrder?: number;
};

function normalizeNullablePositiveInt(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isInteger(number) && number > 0 ? number : Number.NaN;
}

function normalizeSortOrder(value: unknown) {
  if (value === null || value === undefined || value === "") return undefined;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isInteger(number) ? number : Number.NaN;
}

function normalizeProjectTaskInput(input: ProjectTaskInput, mode: "create" | "update") {
  const data: NormalizedProjectTaskInput = {};

  if (mode === "create" || input.description !== undefined) {
    const description = String(input.description ?? "").trim();
    if (!description) return { error: "任务描述不能为空" };
    data.description = description;
  }
  if (input.isMilestone !== undefined) data.isMilestone = Boolean(input.isMilestone);

  if (input.ownerEmployeeId !== undefined) {
    const ownerEmployeeId = normalizeNullablePositiveInt(input.ownerEmployeeId);
    if (Number.isNaN(ownerEmployeeId)) return { error: "负责人无效" };
    data.ownerEmployeeId = ownerEmployeeId;
  }

  for (const field of ["startDate", "endDate"] as const) {
    if (input[field] === undefined) continue;
    if (!isValidDateValue(input[field])) return { error: "日期格式错误" };
    data[field] = parseDate(typeof input[field] === "string" ? input[field] : null);
  }

  if (input.predecessorTaskId !== undefined) {
    const predecessorTaskId = normalizeNullablePositiveInt(input.predecessorTaskId);
    if (Number.isNaN(predecessorTaskId)) return { error: "前置任务无效" };
    data.predecessorTaskId = predecessorTaskId;
  }

  if (input.sortOrder !== undefined) {
    const sortOrder = normalizeSortOrder(input.sortOrder);
    if (Number.isNaN(sortOrder)) return { error: "排序无效" };
    if (sortOrder !== undefined) data.sortOrder = sortOrder;
  }

  return { data };
}

async function validateOwner(ownerEmployeeId: number | null | undefined) {
  if (!ownerEmployeeId) return null;
  const owner = await prisma.employee.findUnique({ where: { id: ownerEmployeeId }, select: { id: true } });
  return owner ? null : "负责人不存在";
}

async function validatePredecessor(input: {
  projectId: number;
  taskId?: number;
  predecessorTaskId: number | null | undefined;
}) {
  if (!input.predecessorTaskId) return null;
  if (input.taskId && input.predecessorTaskId === input.taskId) return "前置任务不能选择自己";

  const predecessor = await prisma.projectTask.findUnique({
    where: { id: input.predecessorTaskId },
    select: { id: true, projectId: true, predecessorTaskId: true },
  });
  if (!predecessor || predecessor.projectId !== input.projectId) return "前置任务不存在";

  if (!input.taskId) return null;
  let cursor = predecessor.predecessorTaskId;
  const visited = new Set<number>([predecessor.id]);
  while (cursor) {
    if (cursor === input.taskId) return "不能形成任务依赖循环";
    if (visited.has(cursor)) return "不能形成任务依赖循环";
    visited.add(cursor);
    const next = await prisma.projectTask.findUnique({
      where: { id: cursor },
      select: { id: true, predecessorTaskId: true, projectId: true },
    });
    if (!next || next.projectId !== input.projectId) return "前置任务不存在";
    cursor = next.predecessorTaskId;
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
  const rows = await prisma.projectTask.findMany({
    where: { projectId },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    include: {
      owner: { select: { id: true, employeeId: true, name: true } },
      predecessor: { select: { id: true, description: true } },
      successors: { select: { id: true, description: true } },
    },
  });
  return rows.map((task) => ({
    id: task.id,
    projectId: task.projectId,
    isMilestone: task.isMilestone,
    ownerEmployeeId: task.ownerEmployeeId,
    ownerEmployeeNumber: task.owner?.employeeId ?? null,
    ownerEmployeeName: task.owner?.name ?? null,
    description: task.description,
    startDate: formatDate(task.startDate),
    endDate: formatDate(task.endDate),
    predecessorTaskId: task.predecessorTaskId,
    predecessorTaskName: task.predecessor?.description ?? null,
    successorTasks: task.successors.map((successor) => ({
      id: successor.id,
      description: successor.description,
    })),
    sortOrder: task.sortOrder,
  }));
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
  const predecessorError = await validatePredecessor({
    projectId: input.projectId,
    predecessorTaskId: normalized.data.predecessorTaskId,
  });
  if (predecessorError) return { ok: false as const, error: predecessorError };

  const task = await prisma.projectTask.create({
    data: {
      projectId: input.projectId,
      description: normalized.data.description ?? "",
      isMilestone: normalized.data.isMilestone ?? false,
      ownerEmployeeId: normalized.data.ownerEmployeeId ?? null,
      startDate: normalized.data.startDate ?? null,
      endDate: normalized.data.endDate ?? null,
      predecessorTaskId: normalized.data.predecessorTaskId ?? null,
      sortOrder: normalized.data.sortOrder ?? await nextSortOrder(input.projectId),
      createdBy: input.userId,
      editedBy: input.userId,
    },
  });
  await snapshotHistory("ProjectTask", task.id, input.userId);
  return { ok: true as const, data: { task } };
}

export async function updateProjectTask(input: { userId: number; projectId: number; taskId: number; body: ProjectTaskInput }) {
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
  const normalized = normalizeProjectTaskInput(input.body, "update");
  if ("error" in normalized) return { ok: false as const, error: normalized.error ?? "参数错误" };

  const ownerError = await validateOwner(normalized.data.ownerEmployeeId);
  if (ownerError) return { ok: false as const, error: ownerError };
  const predecessorError = await validatePredecessor({
    projectId: input.projectId,
    taskId: input.taskId,
    predecessorTaskId: normalized.data.predecessorTaskId,
  });
  if (predecessorError) return { ok: false as const, error: predecessorError };

  const task = await prisma.projectTask.update({
    where: { id: input.taskId },
    data: {
      ...normalized.data,
      editedBy: input.userId,
      editedAt: new Date(),
      version: { increment: 1 },
    },
  });
  await snapshotHistory("ProjectTask", task.id, input.userId);
  return { ok: true as const, data: { task } };
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
  await prisma.projectTask.delete({ where: { id: input.taskId } });
  return { ok: true as const, data: { success: true } };
}

export function projectTaskServiceResponse<T>(result: { ok: true; data: T } | { ok: false; error: string; status?: number }) {
  if (result.ok) return NextResponse.json(result.data);
  return NextResponse.json({ error: result.error }, { status: result.status || 400 });
}
