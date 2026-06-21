import { NextResponse } from "next/server";
import { snapshotHistory } from "@workspace/platform/server/history";
import { authenticate, checkWorkWrite } from "@workspace/platform/server/auth";
import { parseJson } from "@workspace/platform/server/api";
import { prisma } from "@workspace/platform/server/prisma";
import { handleDelete, handleUpdateField } from "./work-crud";
import { matchAnyField } from "@workspace/platform/search";
import { ProjectCreateSchema } from "./schemas";
import { guardProjectArchive } from "./reference-guards";
import {
  PROJECT_CONFIG,
  PROJECT_PRIORITIES,
  PROJECT_STAGES,
  PROJECT_STATUSES,
  formatDate,
  generateProjectCode,
  hasValidProjectDates,
  isAllowedProjectOption,
  normalizeLeadingDepartmentId,
  normalizeProjectParentId,
  nullableString,
  parseDate,
} from "./project-normalization";

export async function listProjects(input: { keyword: string; page: number; pageSize: number; archived?: boolean }) {
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
  const childProjectsByParentId = new Map<number, { id: number; name: string }[]>();
  for (const project of projects) {
    if (!project.parentId) continue;
    const children = childProjectsByParentId.get(project.parentId) || [];
    children.push({ id: project.id, name: project.name });
    childProjectsByParentId.set(project.parentId, children);
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
    childProjects: childProjectsByParentId.get(project.id) || [],
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

export async function createProject(request: Request, userId: number) {
  const parsed = await parseJson(request, ProjectCreateSchema);
  if (!parsed.ok) return { ok: false as const, error: parsed.error };
  if (!hasValidProjectDates(parsed.data.startDate, parsed.data.endDate)) {
    return { ok: false as const, error: "日期格式错误" };
  }
  if (!isAllowedProjectOption(parsed.data.status, PROJECT_STATUSES)) return { ok: false as const, error: "项目状态无效" };
  if (!isAllowedProjectOption(parsed.data.priority, PROJECT_PRIORITIES)) return { ok: false as const, error: "优先级无效" };
  if (!isAllowedProjectOption(parsed.data.stage, PROJECT_STAGES)) return { ok: false as const, error: "项目阶段无效" };
  const parentResult = await normalizeProjectParentId(parsed.data.parentId);
  if ("error" in parentResult) return { ok: false as const, error: parentResult.error };
  const leadingDepartmentResult = await normalizeLeadingDepartmentId(parsed.data.leadingDepartmentId);
  if ("error" in leadingDepartmentResult) return { ok: false as const, error: leadingDepartmentResult.error };
  const startDate = parseDate(parsed.data.startDate);
  const code = await generateProjectCode(leadingDepartmentResult.department.code, startDate);
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

export async function updateProjectField(request: Request, params: Promise<{ id: string }>) {
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
    const code = await generateProjectCode(result.department.code, project.startDate);
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

export async function deleteProject(request: Request, params: Promise<{ id: string }>) {
  return handleDelete(request, params, PROJECT_CONFIG);
}
