import { NextResponse } from "next/server";
import { snapshotHistory } from "@workspace/platform/server/history";
import { authenticate } from "@workspace/platform/server/auth";
import { parseJson } from "@workspace/platform/server/api";
import { prisma } from "@workspace/platform/server/prisma";
import { matchAnyField } from "@workspace/platform/search";
import { ProjectCreateSchema } from "./schemas";
import {
  buildVisibleProjectWhere,
  getProjectPermissions,
} from "./access";
import {
  formatDate,
  normalizeProjectType,
} from "./project-normalization";
import {
  buildProjectCreateCommand,
  buildProjectFieldUpdateCommand,
  validateProjectDeleteCommand,
} from "./domain/project-validation";

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
      projectLevel: project.projectLevel,
      isMilestone: project.isMilestone,
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

export async function listProjectGantt(input: { userId: number; includeTasks?: boolean }) {
  const visibleWhere = await buildVisibleProjectWhere(input.userId);
  const projects = await prisma.project.findMany({
    where: { AND: [visibleWhere, { isArchived: false }] },
    orderBy: { id: "asc" },
    include: {
      leadingDepartment: { select: { id: true, code: true, name: true } },
    },
  });
  const projectIds = projects.map((project) => project.id);
  const tasks = input.includeTasks && projectIds.length
    ? await prisma.projectTask.findMany({
      where: { projectId: { in: projectIds } },
      orderBy: [{ projectId: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
      select: {
        id: true,
        projectId: true,
        description: true,
        isMilestone: true,
        startDate: true,
        endDate: true,
        predecessorTaskId: true,
        sortOrder: true,
      },
    })
    : [];

  return {
    projects: projects.map((project) => ({
      id: project.id,
      name: project.name,
      status: project.status,
      projectLevel: project.projectLevel,
      projectType: normalizeProjectType(project.type),
      isMilestone: project.isMilestone,
      parentId: project.parentId,
      leadingDepartmentId: project.leadingDepartmentId,
      leadingDepartmentCode: project.leadingDepartment?.code ?? null,
      leadingDepartmentName: project.leadingDepartment?.name ?? null,
      startDate: formatDate(project.startDate),
      endDate: formatDate(project.endDate),
    })),
    tasks: tasks.map((task) => ({
      id: task.id,
      projectId: task.projectId,
      description: task.description,
      isMilestone: task.isMilestone,
      startDate: formatDate(task.startDate),
      endDate: formatDate(task.endDate),
      predecessorTaskId: task.predecessorTaskId,
      sortOrder: task.sortOrder,
    })),
  };
}

export async function createProject(request: Request, userId: number) {
  const parsed = await parseJson(request, ProjectCreateSchema);
  if (!parsed.ok) return { ok: false as const, error: parsed.error };
  const command = await buildProjectCreateCommand(userId, parsed.data);
  if (!command.ok) return { ok: false as const, error: command.issue.message, status: command.issue.status };
  const record = await prisma.$transaction(async (tx) => {
    const created = await tx.project.create({
      data: command.data.data,
    });
    if (command.data.leaderEmployeeId) {
      await tx.employeeProject.create({
        data: {
          employeeId: command.data.leaderEmployeeId,
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
  const command = await buildProjectFieldUpdateCommand({
    userId: payload.userId,
    projectId,
    field: body.field,
    value: body.value,
  });
  if (!command.ok) return NextResponse.json({ error: command.issue.message }, { status: command.issue.status || 400 });
  if (command.data.kind === "children") {
    await syncProjectChildren(projectId, command.data.childIds, command.data.children, payload.userId);
    return NextResponse.json({ success: true });
  }

  await prisma.project.update({
    where: { id: projectId },
    data: {
      ...command.data.data,
      editedBy: payload.userId,
      editedAt: new Date(),
      version: { increment: 1 },
    },
  });
  await snapshotHistory("Project", projectId, payload.userId);
  return NextResponse.json({ success: true });
}

async function syncProjectChildren(
  projectId: number,
  childIds: number[],
  children: Array<{ id: number; parentId: number | null }>,
  userId: number,
) {
  const existingChildren = await prisma.project.findMany({
    where: { parentId: projectId, isArchived: false },
    select: { id: true, parentId: true },
  });
  const targetIds = new Set(childIds);
  const changedIds = new Set<number>();

  await prisma.$transaction(async (tx) => {
    for (const child of existingChildren) {
      if (targetIds.has(child.id)) continue;
      await tx.project.update({
        where: { id: child.id },
        data: {
          parentId: null,
          editedBy: userId,
          editedAt: new Date(),
          version: { increment: 1 },
        },
      });
      changedIds.add(child.id);
    }

    for (const child of children) {
      if (child.parentId === projectId) continue;
      await tx.project.update({
        where: { id: child.id },
        data: {
          parentId: projectId,
          editedBy: userId,
          editedAt: new Date(),
          version: { increment: 1 },
        },
      });
      changedIds.add(child.id);
    }
  });

  for (const changedId of changedIds) await snapshotHistory("Project", changedId, userId);
  if (changedIds.size > 0) await snapshotHistory("Project", projectId, userId);
}

export async function deleteProject(request: Request, params: Promise<{ id: string }>) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;
  const projectId = parseInt(id);
  if (!Number.isInteger(projectId)) return NextResponse.json({ error: "ID 无效" }, { status: 400 });
  const command = await validateProjectDeleteCommand(payload.userId, projectId);
  if (!command.ok) return NextResponse.json({ error: command.issue.message }, { status: command.issue.status || 400 });
  await snapshotHistory("Project", command.data.projectId, payload.userId);
  await prisma.project.delete({ where: { id: command.data.projectId } });
  return NextResponse.json({ success: true });
}
