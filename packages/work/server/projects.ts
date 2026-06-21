import { NextResponse } from "next/server";
import { snapshotHistory } from "@workspace/platform/server/history";
import { authenticate } from "@workspace/platform/server/auth";
import { parseJson } from "@workspace/platform/server/api";
import { prisma } from "@workspace/platform/server/prisma";
import { matchAnyField } from "@workspace/platform/search";
import { ProjectCreateSchema } from "./schemas";
import { guardProjectArchive } from "./reference-guards";
import {
  buildVisibleProjectWhere,
  canDeleteProject,
  canEditProject,
  canManageProject,
  getProjectPermissions,
  isSystemAdminUser,
} from "./access";
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
  normalizeProjectType,
  nullableString,
  parseDate,
} from "./project-normalization";

const PROJECT_MANAGE_FIELDS = new Set(["name", "parentId", "leadingDepartmentId", "isArchived"]);
const PROJECT_EDIT_FIELDS = new Set([
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
]);

export async function listProjects(input: { userId: number; keyword: string; page: number; pageSize: number; archived?: boolean }) {
  const visibleWhere = await buildVisibleProjectWhere(input.userId);
  const projects = await prisma.project.findMany({
    where: { AND: [visibleWhere, { isArchived: Boolean(input.archived) }] },
    orderBy: input.archived ? [{ archivedAt: "desc" }, { id: "desc" }] : { id: "asc" },
    include: {
      _count: { select: { employees: true } },
      employees: { select: { employeeId: true, role: true } },
      leadingDepartment: { select: { id: true, code: true, name: true, managerUserId: true } },
    },
  });

  const projectNameById = new Map(projects.map((project) => [project.id, project.name]));
  const childProjectsByParentId = new Map<number, { id: number; name: string }[]>();
  for (const project of projects) {
    if (!project.parentId) continue;
    const children = childProjectsByParentId.get(project.parentId) || [];
    children.push({ id: project.id, name: project.name });
    childProjectsByParentId.set(project.parentId, children);
  }

  const mapped = await Promise.all(projects.map(async (project) => {
    const leadingDepartment = project.leadingDepartment;
    const permissions = await getProjectPermissions(input.userId, project);
    return {
      id: project.id,
      code: project.code,
      name: project.name,
      projectType: normalizeProjectType(project.type),
      createdBy: project.createdBy,
      permissions: {
        canEdit: permissions.canEdit,
        canManage: permissions.canManage,
        canDelete: permissions.canDelete,
      },
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
  }));

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
  const projectType = normalizeProjectType(parsed.data.projectType);
  const parentResult = await normalizeProjectParentId(parsed.data.parentId);
  if ("error" in parentResult) return { ok: false as const, error: parentResult.error };
  const leadingDepartmentResult = parsed.data.leadingDepartmentId
    ? await normalizeLeadingDepartmentId(parsed.data.leadingDepartmentId)
    : null;
  if (projectType === "department" && !leadingDepartmentResult) return { ok: false as const, error: "部门项目必须选择主导部门" };
  if (leadingDepartmentResult && "error" in leadingDepartmentResult) return { ok: false as const, error: leadingDepartmentResult.error };
  if (
    projectType === "department" &&
    leadingDepartmentResult &&
    !("error" in leadingDepartmentResult) &&
    leadingDepartmentResult.department.managerUserId !== userId &&
    !(await isSystemAdminUser(userId))
  ) {
    return { ok: false as const, error: "只有当前部门负责人可以发起部门项目", status: 403 };
  }
  const startDate = parseDate(parsed.data.startDate);
  const code = projectType === "department" && leadingDepartmentResult && !("error" in leadingDepartmentResult)
    ? await generateProjectCode(leadingDepartmentResult.department.code, startDate)
    : null;
  const userEmployee = await prisma.employee.findFirst({
    where: { userId },
    select: { id: true },
  });
  const record = await prisma.$transaction(async (tx) => {
    const created = await tx.project.create({
      data: {
        type: projectType,
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
        leadingDepartmentId: leadingDepartmentResult && !("error" in leadingDepartmentResult) ? leadingDepartmentResult.value : null,
        startDate,
        endDate: parseDate(parsed.data.endDate),
        editedBy: userId,
      },
    });
    if (userEmployee) {
      await tx.employeeProject.create({
        data: {
          employeeId: userEmployee.id,
          projectId: created.id,
          role: "负责人",
          editedBy: userId,
        },
      });
    }
    return created;
  });
  await snapshotHistory("Project", record.id, userId);
  return { ok: true as const, data: { success: true, record } };
}

export async function updateProjectField(request: Request, params: Promise<{ id: string }>) {
  const body = (await request.clone().json()) as { field: string; value: unknown };
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;
  const projectId = parseInt(id);
  if (!Number.isInteger(projectId)) return NextResponse.json({ error: "ID 无效" }, { status: 400 });
  const canManage = await canManageProject(payload.userId, projectId);
  const canEdit = canManage || await canEditProject(payload.userId, projectId);

  if (body.field === "isArchived") {
    if (!(await canDeleteProject(payload.userId, projectId))) return NextResponse.json({ error: "无权限" }, { status: 403 });
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
    if (!canManage) return NextResponse.json({ error: "无权限" }, { status: 403 });
    const result = await normalizeLeadingDepartmentId(body.value);
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
    if (result.department.managerUserId !== payload.userId && !(await isSystemAdminUser(payload.userId))) {
      return NextResponse.json({ error: "只有目标部门负责人可以设置主导部门" }, { status: 403 });
    }
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, startDate: true, type: true },
    });
    if (!project) return NextResponse.json({ error: "记录不存在" }, { status: 404 });
    const code = normalizeProjectType(project.type) === "department"
      ? await generateProjectCode(result.department.code, project.startDate)
      : null;
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

  if (PROJECT_MANAGE_FIELDS.has(body.field) && !canManage) return NextResponse.json({ error: "无权限" }, { status: 403 });
  if (PROJECT_EDIT_FIELDS.has(body.field) && !canEdit) return NextResponse.json({ error: "无权限" }, { status: 403 });
  if (!PROJECT_MANAGE_FIELDS.has(body.field) && !PROJECT_EDIT_FIELDS.has(body.field)) {
    return NextResponse.json({ error: "非法字段" }, { status: 400 });
  }

  const result = await PROJECT_CONFIG.onBeforeUpdate?.(body.field, body.value, projectId);
  if (!result) return NextResponse.json({ error: "非法字段" }, { status: 400 });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  if (!PROJECT_CONFIG.allowedFields.includes(result.field)) return NextResponse.json({ error: "非法字段" }, { status: 400 });
  await prisma.project.update({
    where: { id: projectId },
    data: {
      [result.field]: result.value ?? null,
      editedBy: payload.userId,
      editedAt: new Date(),
      version: { increment: 1 },
    },
  });
  await snapshotHistory("Project", projectId, payload.userId);
  return NextResponse.json({ success: true });
}

export async function deleteProject(request: Request, params: Promise<{ id: string }>) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;
  const projectId = parseInt(id);
  if (!Number.isInteger(projectId)) return NextResponse.json({ error: "ID 无效" }, { status: 400 });
  if (!(await canDeleteProject(payload.userId, projectId))) return NextResponse.json({ error: "无权限" }, { status: 403 });
  const beforeDelete = await PROJECT_CONFIG.onBeforeDelete?.(projectId);
  if (beforeDelete && "error" in beforeDelete) {
    return NextResponse.json({ error: beforeDelete.error }, { status: beforeDelete.status || 400 });
  }
  await snapshotHistory("Project", projectId, payload.userId);
  await prisma.project.delete({ where: { id: projectId } });
  return NextResponse.json({ success: true });
}
