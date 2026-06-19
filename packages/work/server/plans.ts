import { snapshotHistory } from "@workspace/platform/server/history";
import {
  isValidDateValue,
  parseJson,
  rejectInvalidDateField,
} from "@workspace/platform/server/api";
import { prisma } from "@workspace/platform/server/prisma";
import { handleDelete, handleUpdateField } from "./work-crud";
import { matchAnyField } from "./search";
import { WorkPlanCreateSchema } from "./schemas";

const DATE_FIELDS = ["startDate", "endDate"];
const NUMBER_FIELDS = ["budgetAmount"];
const PROJECT_STATUSES = ["规划中", "进行中", "暂停", "已完成", "已取消"];
const PROJECT_PRIORITIES = ["高", "中", "低"];
const PROJECT_STAGES = ["立项", "规划", "执行", "验收", "收尾"];
const PROJECT_CONFIG = {
  entityType: "Project",
  modelKey: "project" as const,
  allowedFields: [
    "name",
    "description",
    "status",
    "priority",
    "stage",
    "plan",
    "goal",
    "milestones",
    "budgetAmount",
    "budgetNote",
    "riskNote",
    "remark",
    "startDate",
    "endDate",
  ],
  onBeforeUpdate: normalizeProjectFieldUpdate,
};

function formatDate(value: Date | string | null | undefined) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function parseDate(value: string | null | undefined) {
  return value ? new Date(`${value}T00:00:00`) : null;
}

function nullableString(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

function normalizeBudgetAmount(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
  return Number.isFinite(number) ? number : Number.NaN;
}

function isAllowedOption(value: unknown, options: readonly string[]) {
  return value === null || value === undefined || value === "" || (typeof value === "string" && options.includes(value));
}

async function normalizeProjectFieldUpdate(field: string, value: unknown) {
  const dateResult = rejectInvalidDateField(field, value, DATE_FIELDS);
  if (!dateResult) return null;
  if (DATE_FIELDS.includes(field)) {
    return { field, value: value ? new Date(`${value}T00:00:00`) : null };
  }
  if (NUMBER_FIELDS.includes(field)) {
    const number = normalizeBudgetAmount(value);
    if (Number.isNaN(number)) return null;
    return { field, value: number };
  }
  if (field === "status" && !isAllowedOption(value, PROJECT_STATUSES)) return null;
  if (field === "priority" && !isAllowedOption(value, PROJECT_PRIORITIES)) return null;
  if (field === "stage" && !isAllowedOption(value, PROJECT_STAGES)) return null;
  if (field !== "name" && typeof value === "string" && value.trim() === "") return { field, value: null };
  return { field, value };
}

export async function listWorkPlans(input: { keyword: string; page: number; pageSize: number }) {
  const projects = await prisma.project.findMany({
    orderBy: { id: "asc" },
    include: {
      _count: { select: { employees: true } },
    },
  });

  const mapped = projects.map((project) => ({
    id: project.id,
    name: project.name,
    description: project.description,
    status: project.status,
    priority: project.priority,
    stage: project.stage,
    plan: project.plan,
    goal: project.goal,
    milestones: project.milestones,
    budgetAmount: project.budgetAmount,
    budgetNote: project.budgetNote,
    riskNote: project.riskNote,
    remark: project.remark,
    startDate: formatDate(project.startDate),
    endDate: formatDate(project.endDate),
    employeeCount: project._count.employees,
  }));

  const result = input.keyword ? mapped.filter((project) => matchAnyField(project, input.keyword)) : mapped;
  const total = result.length;
  const start = (input.page - 1) * input.pageSize;
  return { projects: result.slice(start, start + input.pageSize), total };
}

export async function createWorkPlan(request: Request, userId: number) {
  const parsed = await parseJson(request, WorkPlanCreateSchema);
  if (!parsed.ok) return { ok: false as const, error: parsed.error };
  if (!isValidDateValue(parsed.data.startDate) || !isValidDateValue(parsed.data.endDate)) {
    return { ok: false as const, error: "日期格式错误" };
  }
  if (!isAllowedOption(parsed.data.status, PROJECT_STATUSES)) return { ok: false as const, error: "计划状态无效" };
  if (!isAllowedOption(parsed.data.priority, PROJECT_PRIORITIES)) return { ok: false as const, error: "优先级无效" };
  if (!isAllowedOption(parsed.data.stage, PROJECT_STAGES)) return { ok: false as const, error: "计划阶段无效" };
  const record = await prisma.project.create({
    data: {
      name: parsed.data.name,
      description: nullableString(parsed.data.description),
      status: nullableString(parsed.data.status),
      priority: nullableString(parsed.data.priority),
      stage: nullableString(parsed.data.stage),
      plan: nullableString(parsed.data.plan),
      goal: nullableString(parsed.data.goal),
      milestones: nullableString(parsed.data.milestones),
      budgetAmount: parsed.data.budgetAmount ?? null,
      budgetNote: nullableString(parsed.data.budgetNote),
      riskNote: nullableString(parsed.data.riskNote),
      remark: nullableString(parsed.data.remark),
      startDate: parseDate(parsed.data.startDate),
      endDate: parseDate(parsed.data.endDate),
      editedBy: userId,
    },
  });
  await snapshotHistory("Project", record.id, userId);
  return { ok: true as const, data: { success: true, record } };
}

export async function updateWorkPlanField(request: Request, params: Promise<{ id: string }>) {
  return handleUpdateField(request, params, PROJECT_CONFIG);
}

export async function deleteWorkPlan(request: Request, params: Promise<{ id: string }>) {
  return handleDelete(request, params, PROJECT_CONFIG);
}

export const listProjects = listWorkPlans;
export const createProject = createWorkPlan;
export const updateProjectField = updateWorkPlanField;
export const deleteProject = deleteWorkPlan;
