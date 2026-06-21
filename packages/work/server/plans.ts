import { NextResponse } from "next/server";
import { snapshotHistory } from "@workspace/platform/server/history";
import { authenticate, checkWorkWrite } from "@workspace/platform/server/auth";
import { validateFkValue } from "@workspace/platform/server/fk-registry";
import {
  isValidDateValue,
  parseJson,
  rejectInvalidDateField,
} from "@workspace/platform/server/api";
import { prisma } from "@workspace/platform/server/prisma";
import { handleDelete, handleUpdateField } from "./work-crud";
import { matchAnyField } from "@workspace/platform/search";
import { WorkPlanCreateSchema } from "./schemas";
import { WORK_FK_REGISTRY } from "./fk-registry";
import { guardProjectArchive } from "./reference-guards";

const DATE_FIELDS = ["startDate", "endDate"];
const NUMBER_FIELDS = ["budgetAmount"];
const NUMBER_OR_NULL_FIELDS = ["parentId"];
const PROJECT_STATUSES = ["规划中", "进行中", "暂停", "已完成", "已取消"];
const PROJECT_PRIORITIES = ["高", "中", "低"];
const PROJECT_STAGES = ["立项", "规划", "执行", "验收", "收尾"];
type ParentIdResult = { value: number | null } | { error: string };
type LeadingDepartmentResult =
  | { value: number; department: { id: number; code: string; name: string } }
  | { error: string };
type ProjectFieldUpdateResult = { field: string; value: unknown } | { error: string } | null;

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
    "parentId",
    "leadingDepartmentId",
    "isArchived",
    "archivedAt",
  ],
  onBeforeUpdate: normalizeProjectFieldUpdate,
  onBeforeDelete: async (id: number) => {
    const blockMessage = await guardProjectArchive(id, "删除工作计划");
    return blockMessage ? { error: blockMessage, status: 409 } : { ok: true as const };
  },
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

function normalizeNullablePositiveInt(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(number) || number <= 0) return Number.NaN;
  return number;
}

function isAllowedOption(value: unknown, options: readonly string[]) {
  return value === null || value === undefined || value === "" || (typeof value === "string" && options.includes(value));
}

async function normalizeProjectParentId(value: unknown, currentProjectId?: number): Promise<ParentIdResult> {
  const parentId = normalizeNullablePositiveInt(value);
  if (Number.isNaN(parentId)) return { error: "上级计划无效" };
  if (!parentId) return { value: null };
  if (currentProjectId && parentId === currentProjectId) return { error: "上级计划不能选择自己" };
  const validation = await validateFkValue(WORK_FK_REGISTRY, {
    fkKey: "work.plan.parent",
    value: parentId,
    requiredLabel: "上级计划",
  });
  if (!validation.ok) return { error: validation.error };

  let cursor: number | null = parentId;
  while (cursor) {
    const parent: { id: number; parentId: number | null } | null = await prisma.project.findUnique({
      where: { id: cursor },
      select: { id: true, parentId: true },
    });
    if (!parent) return { error: "上级计划不存在" };
    if (currentProjectId && parent.parentId === currentProjectId) return { error: "不能形成计划层级循环" };
    cursor = parent.parentId;
  }

  return { value: parentId };
}

async function normalizeLeadingDepartmentId(value: unknown): Promise<LeadingDepartmentResult> {
  const leadingDepartmentId = normalizeNullablePositiveInt(value);
  if (Number.isNaN(leadingDepartmentId) || !leadingDepartmentId) return { error: "主导部门不能为空" };
  const validation = await validateFkValue(WORK_FK_REGISTRY, {
    fkKey: "work.plan.leadingDepartment",
    value: leadingDepartmentId,
    requiredLabel: "主导部门",
  });
  if (!validation.ok) return { error: validation.error };
  const department = await prisma.department.findUnique({
    where: { id: leadingDepartmentId },
    select: { id: true, code: true, name: true },
  });
  if (!department) return { error: "主导部门不存在" };
  return { value: leadingDepartmentId, department };
}

function planCodePrefix(departmentCode: string, dateValue?: Date | string | null) {
  const date = dateValue ? new Date(dateValue) : new Date();
  const year = Number.isNaN(date.getTime()) ? new Date().getFullYear() : date.getFullYear();
  return `${departmentCode.trim()}-${String(year % 100).padStart(2, "0")}`;
}

async function generateWorkPlanCode(departmentCode: string, dateValue?: Date | string | null) {
  const prefix = planCodePrefix(departmentCode, dateValue);
  const existing = await prisma.project.findMany({
    where: { code: { startsWith: `${prefix}-` } },
    select: { code: true },
  });
  let maxSequence = 0;
  for (const project of existing) {
    const match = project.code?.match(new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-(\\d+)$`));
    if (!match) continue;
    maxSequence = Math.max(maxSequence, Number(match[1]));
  }
  return `${prefix}-${String(maxSequence + 1).padStart(2, "0")}`;
}

async function normalizeProjectFieldUpdate(field: string, value: unknown, id?: number): Promise<ProjectFieldUpdateResult> {
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
  if (NUMBER_OR_NULL_FIELDS.includes(field)) {
    const result = await normalizeProjectParentId(value, id);
    if ("error" in result) return { error: result.error };
    return { field, value: result.value };
  }
  if (field === "leadingDepartmentId") {
    const result = await normalizeLeadingDepartmentId(value);
    if ("error" in result) return { error: result.error };
    return { field, value: result.value };
  }
  if (field === "isArchived") {
    return { field, value: Boolean(value) };
  }
  if (field === "status" && !isAllowedOption(value, PROJECT_STATUSES)) return null;
  if (field === "priority" && !isAllowedOption(value, PROJECT_PRIORITIES)) return null;
  if (field === "stage" && !isAllowedOption(value, PROJECT_STAGES)) return null;
  if (field !== "name" && typeof value === "string" && value.trim() === "") return { field, value: null };
  return { field, value };
}

export async function listWorkPlans(input: { keyword: string; page: number; pageSize: number; archived?: boolean }) {
  const projects = await prisma.project.findMany({
    where: { isArchived: Boolean(input.archived) },
    orderBy: input.archived ? [{ archivedAt: "desc" }, { id: "desc" }] : { id: "asc" },
    include: {
      _count: { select: { employees: true } },
    },
  });

  const projectNameById = new Map(projects.map((project) => [project.id, project.name]));
  const departmentIds = Array.from(new Set(projects.map((project) => project.leadingDepartmentId).filter((id): id is number => Boolean(id))));
  const departments = departmentIds.length
    ? await prisma.department.findMany({
        where: { id: { in: departmentIds } },
        select: { id: true, code: true, name: true },
      })
    : [];
  const departmentById = new Map(departments.map((department) => [department.id, department]));
  const childPlansByParentId = new Map<number, { id: number; name: string }[]>();
  for (const project of projects) {
    if (!project.parentId) continue;
    const children = childPlansByParentId.get(project.parentId) || [];
    children.push({ id: project.id, name: project.name });
    childPlansByParentId.set(project.parentId, children);
  }

  const mapped = projects.map((project) => {
    const leadingDepartment = project.leadingDepartmentId ? departmentById.get(project.leadingDepartmentId) : null;
    return {
    id: project.id,
    code: project.code,
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
    parentId: project.parentId,
    parentName: project.parentId ? projectNameById.get(project.parentId) ?? null : null,
    childPlans: childPlansByParentId.get(project.id) || [],
    isArchived: project.isArchived,
    archivedAt: project.archivedAt?.toISOString() || null,
    leadingDepartmentId: project.leadingDepartmentId,
    leadingDepartmentName: leadingDepartment?.name ?? null,
    leadingDepartmentCode: leadingDepartment?.code ?? null,
    startDate: formatDate(project.startDate),
    endDate: formatDate(project.endDate),
    employeeCount: project._count.employees,
    };
  });

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
  const parentResult = await normalizeProjectParentId(parsed.data.parentId);
  if ("error" in parentResult) return { ok: false as const, error: parentResult.error };
  const leadingDepartmentResult = await normalizeLeadingDepartmentId(parsed.data.leadingDepartmentId);
  if ("error" in leadingDepartmentResult) return { ok: false as const, error: leadingDepartmentResult.error };
  const startDate = parseDate(parsed.data.startDate);
  const code = await generateWorkPlanCode(leadingDepartmentResult.department.code, startDate);
  const record = await prisma.project.create({
    data: {
      code,
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
      parentId: parentResult.value,
      leadingDepartmentId: leadingDepartmentResult.value,
      startDate,
      endDate: parseDate(parsed.data.endDate),
      editedBy: userId,
    },
  });
  await snapshotHistory("Project", record.id, userId);
  return { ok: true as const, data: { success: true, record } };
}

export async function updateWorkPlanField(request: Request, params: Promise<{ id: string }>) {
  const body = (await request.clone().json()) as { field: string; value: unknown };
  if (body.field === "isArchived") {
    const payload = await authenticate(request);
    if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
    if (!(await checkWorkWrite(payload.userId))) return NextResponse.json({ error: "无权限" }, { status: 403 });

    const { id } = await params;
    const projectId = parseInt(id);
    const archived = Boolean(body.value);
    if (archived) {
      const blockMessage = await guardProjectArchive(projectId);
      if (blockMessage) return NextResponse.json({ error: blockMessage }, { status: 409 });
    }
    await prisma.project.update({
      where: { id: projectId },
      data: {
        isArchived: archived,
        archivedAt: archived ? new Date() : null,
        editedBy: payload.userId,
        editedAt: new Date(),
        version: { increment: 1 },
      },
    });
    await snapshotHistory("Project", projectId, payload.userId);
    return NextResponse.json({ success: true });
  }
  if (body.field === "leadingDepartmentId") {
    const payload = await authenticate(request);
    if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
    if (!(await checkWorkWrite(payload.userId))) return NextResponse.json({ error: "无权限" }, { status: 403 });

    const { id } = await params;
    const projectId = parseInt(id);
    const result = await normalizeLeadingDepartmentId(body.value);
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, startDate: true },
    });
    if (!project) return NextResponse.json({ error: "记录不存在" }, { status: 404 });
    const code = await generateWorkPlanCode(result.department.code, project.startDate);
    await prisma.project.update({
      where: { id: projectId },
      data: {
        leadingDepartmentId: result.value,
        code,
        editedBy: payload.userId,
        editedAt: new Date(),
        version: { increment: 1 },
      },
    });
    await snapshotHistory("Project", projectId, payload.userId);
    return NextResponse.json({ success: true });
  }
  return handleUpdateField(request, params, PROJECT_CONFIG);
}

export async function deleteWorkPlan(request: Request, params: Promise<{ id: string }>) {
  return handleDelete(request, params, PROJECT_CONFIG);
}

export const listProjects = listWorkPlans;
export const createProject = createWorkPlan;
export const updateProjectField = updateWorkPlanField;
export const deleteProject = deleteWorkPlan;
