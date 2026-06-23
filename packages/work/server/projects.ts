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
import { formatDate } from "./project-normalization";
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

  const mapped = await Promise.all(projects.map(async (project) => {
    const leadingDepartment = project.leadingDepartment;
    const permissions = await getProjectPermissions(input.userId, project);
    return {
      id: project.id,
      code: project.code,
      name: project.name,
      createdBy: project.createdBy,
      permissions: {
        canEdit: permissions.canEdit,
        canManage: permissions.canManage,
        canDelete: permissions.canDelete,
      },
      description: project.description,
      status: deriveProjectStatus(project.endDate, project.closureType),
      projectLevel: project.projectLevel,
      plan: project.plan,
      goal: project.goal,
      milestones: project.milestones,
      budgetAmount: project.budgetAmount,
      budgetNote: project.budgetNote,
      riskNote: project.riskNote,
      remark: project.remark,
      isArchived: project.isArchived,
      archivedAt: project.archivedAt?.toISOString() || null,
      leadingDepartmentId: project.leadingDepartmentId,
      leadingDepartmentName: leadingDepartment?.name ?? null,
      leadingDepartmentCode: leadingDepartment?.code ?? null,
      startDate: formatDate(project.startDate),
      endDate: formatDate(project.endDate),
      closureType: project.closureType,
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
      employees: {
        where: { role: { in: ["负责人", "项目负责人"] } },
        orderBy: { id: "asc" },
        include: {
          employee: { select: { name: true } },
        },
      },
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
        name: true,
        description: true,
        isMilestone: true,
        baselineStartDate: true,
        baselineEndDate: true,
        startDate: true,
        endDate: true,
        sortOrder: true,
        owner: { select: { name: true } },
      },
    })
    : [];
  const baselines = projectIds.length
    ? await prisma.projectPlanBaseline.findMany({
      where: { projectId: { in: projectIds }, isActive: true },
      include: { items: true },
      orderBy: [{ id: "desc" }],
    })
    : [];
  const baselineByKey = new Map<string, { startDate: Date | null; endDate: Date | null }>();
  for (const baseline of baselines) {
    for (const item of baseline.items) {
      const key = `${item.itemKind}:${item.itemId}`;
      if (!baselineByKey.has(key)) baselineByKey.set(key, { startDate: item.startDate, endDate: item.endDate });
    }
  }

  return {
    projects: projects.map((project) => {
      const baseline = baselineByKey.get(`project:${project.id}`);
      return {
        id: project.id,
        name: project.name,
        status: deriveProjectStatus(project.endDate, project.closureType),
        projectLevel: project.projectLevel,
        leadingDepartmentId: project.leadingDepartmentId,
        leadingDepartmentCode: project.leadingDepartment?.code ?? null,
        leadingDepartmentName: project.leadingDepartment?.name ?? null,
        leaderNames: project.employees
          .map((entry) => entry.employee.name)
          .filter((name): name is string => Boolean(name)),
        stages: [],
        startDate: formatDate(project.startDate),
        endDate: formatDate(project.endDate),
        closureType: project.closureType,
        baselineStartDate: formatDate(baseline?.startDate ?? null),
        baselineEndDate: formatDate(baseline?.endDate ?? null),
      };
    }),
    tasks: tasks.map((task) => {
      const baseline = baselineByKey.get(`task:${task.id}`);
      return {
        id: task.id,
        projectId: task.projectId,
        name: task.name,
        description: task.description,
        isMilestone: task.isMilestone,
        startDate: formatDate(task.startDate),
        endDate: formatDate(task.endDate),
        baselineStartDate: formatDate(task.baselineStartDate ?? baseline?.startDate ?? null),
        baselineEndDate: formatDate(task.baselineEndDate ?? baseline?.endDate ?? null),
        sortOrder: task.sortOrder,
        ownerEmployeeName: task.owner?.name ?? null,
      };
    }),
  };
}

function deriveProjectStatus(endDate: Date | null, closureType: string | null) {
  if (endDate && closureType === "完成") return "已完成";
  if (endDate && closureType === "终止") return "已终止";
  return "进行中";
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
