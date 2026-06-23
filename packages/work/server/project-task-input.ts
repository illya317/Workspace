import { isValidDateValue } from "@workspace/platform/server/api";
import { PROJECT_ROLES } from "../constants/field-options";
import { parseDate } from "./project-normalization";

export type ProjectTaskAssigneeInput = {
  employeeId?: unknown;
  role?: unknown;
};

export type ProjectTaskInput = {
  name?: unknown;
  description?: unknown;
  isMilestone?: unknown;
  ownerEmployeeId?: unknown;
  baselineStartDate?: unknown;
  baselineEndDate?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  predecessorTaskIds?: unknown;
  planPhaseId?: unknown;
  assignees?: unknown;
  sortOrder?: unknown;
};

export type NormalizedProjectTaskInput = {
  name?: string;
  description?: string;
  isMilestone?: boolean;
  ownerEmployeeId?: number | null;
  baselineStartDate?: Date | null;
  baselineEndDate?: Date | null;
  startDate?: Date | null;
  endDate?: Date | null;
  predecessorTaskIds?: number[];
  planPhaseId?: number | null;
  assignees?: NormalizedTaskAssignee[];
  sortOrder?: number;
};

export type NormalizedTaskAssignee = {
  employeeId: number;
  role: string | null;
};

export function normalizeProjectTaskInput(input: ProjectTaskInput, mode: "create" | "update") {
  const data: NormalizedProjectTaskInput = {};

  if (mode === "create" || input.name !== undefined) {
    const name = String(input.name ?? input.description ?? "").trim();
    if (!name) return { error: "任务名称不能为空" };
    data.name = name;
  }
  if (input.description !== undefined) data.description = String(input.description ?? "").trim();
  if (input.isMilestone !== undefined) data.isMilestone = Boolean(input.isMilestone);

  if (input.ownerEmployeeId !== undefined) {
    const ownerEmployeeId = normalizeNullablePositiveInt(input.ownerEmployeeId);
    if (isInvalidNumber(ownerEmployeeId)) return { error: "负责人无效" };
    data.ownerEmployeeId = ownerEmployeeId;
  }

  for (const field of ["baselineStartDate", "baselineEndDate", "startDate", "endDate"] as const) {
    if (input[field] === undefined) continue;
    const value = normalizeNullableDateField(input[field]);
    if (isInvalidNumber(value)) return { error: "日期格式错误" };
    data[field] = value;
  }
  if (data.baselineStartDate && data.baselineEndDate && data.baselineEndDate < data.baselineStartDate) {
    return { error: "基线结束时间不能早于基线开始时间" };
  }
  if (data.startDate && data.endDate && data.endDate < data.startDate) {
    return { error: "实际结束时间不能早于实际开始时间" };
  }

  if (input.predecessorTaskIds !== undefined) {
    const predecessorTaskIds = normalizePredecessorTaskIds(input.predecessorTaskIds);
    if (isInvalidNumber(predecessorTaskIds)) return { error: "前置任务无效" };
    data.predecessorTaskIds = predecessorTaskIds;
  }

  if (input.planPhaseId !== undefined) {
    const planPhaseId = normalizeNullablePositiveInt(input.planPhaseId);
    if (isInvalidNumber(planPhaseId)) return { error: "项目阶段无效" };
    data.planPhaseId = planPhaseId;
  }

  if (input.assignees !== undefined) {
    const assignees = normalizeAssignees(input.assignees);
    if (isInvalidNumber(assignees)) return { error: "任务 RASCI 无效" };
    data.assignees = assignees;
  }

  if (input.sortOrder !== undefined) {
    const sortOrder = normalizeSortOrder(input.sortOrder);
    if (isInvalidNumber(sortOrder)) return { error: "排序无效" };
    if (sortOrder !== undefined) data.sortOrder = sortOrder;
  }

  return { data };
}

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

function normalizeNullableDateField(value: unknown) {
  if (!isValidDateValue(value)) return Number.NaN;
  return parseDate(typeof value === "string" ? value : null);
}

function isInvalidNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isNaN(value);
}

function normalizePredecessorTaskIds(value: unknown) {
  if (value === null || value === undefined || value === "") return [];
  if (!Array.isArray(value)) return Number.NaN;
  const next: number[] = [];
  const seen = new Set<number>();
  for (const item of value) {
    const id = normalizeNullablePositiveInt(item);
    if (!id || isInvalidNumber(id)) return Number.NaN;
    if (seen.has(id)) continue;
    seen.add(id);
    next.push(id);
  }
  return next;
}

function normalizeRole(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const role = String(value);
  return PROJECT_ROLES.includes(role as (typeof PROJECT_ROLES)[number]) ? role : null;
}

function normalizeAssignees(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return [];
  if (!Array.isArray(value)) return Number.NaN;
  const assignees: NormalizedTaskAssignee[] = [];
  const seen = new Set<number>();
  for (const item of value) {
    if (!item || typeof item !== "object") return Number.NaN;
    const employeeId = normalizeNullablePositiveInt((item as ProjectTaskAssigneeInput).employeeId);
    if (!employeeId || isInvalidNumber(employeeId)) return Number.NaN;
    const role = normalizeRole((item as ProjectTaskAssigneeInput).role);
    if ((item as ProjectTaskAssigneeInput).role && !role) return Number.NaN;
    if (seen.has(employeeId)) continue;
    seen.add(employeeId);
    assignees.push({ employeeId, role });
  }
  return assignees;
}
