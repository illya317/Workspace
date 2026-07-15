import { ensureEditHistoryBaseline, snapshotHistory } from "@workspace/platform/server/history";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { guardedDelete } from "@workspace/platform/server/delete-guard";
import { prisma } from "@workspace/platform/server/prisma";
import { matchAnyField } from "@workspace/platform/search";
import type { ProjectCreateInput } from "./schemas";
import {
  buildVisibleProjectWhere,
  getWorkProjectScopedActionPermissions,
  getProjectPermissions,
  getProjectPermissionsById,
} from "./access";
import { formatDate } from "./project-normalization";
import {
  buildProjectCreateCommand,
  buildProjectFieldUpdateCommand,
  validateProjectDeleteCommand,
} from "./domain/project-validation";
import type { ProjectType } from "./project-normalization";

export async function listProjects(input: { userId: number; keyword: string; page: number; pageSize: number; archived?: boolean }) {
  const visibleWhere = await buildVisibleProjectWhere(input.userId);
  const projects = await prisma.project.findMany({
    where: { AND: [visibleWhere, { isArchived: Boolean(input.archived) }] },
    orderBy: input.archived ? [{ archivedAt: "desc" }, { id: "desc" }] : { id: "asc" },
    include: {
      _count: { select: { employees: true } },
      employees: { select: { employeeId: true, role: true } },
      leadingDepartment: { select: { id: true, code: true, name: true } },
      enablingDepartments: {
        include: { department: { select: { id: true, code: true, name: true } } },
        orderBy: { id: "asc" },
      },
      owningDepartment: { select: { id: true, code: true, name: true } },
    },
  });

  const mapped = await Promise.all(projects.map(async (project) => {
    const leadingDepartment = project.leadingDepartment;
    const enablingDepartments = project.enablingDepartments.map((entry) => entry.department);
    const owningDepartment = project.owningDepartment;
    const permissions = await getProjectPermissions(input.userId, project);
    const actionPermissions = await getWorkProjectScopedActionPermissions(input.userId, project.id);
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
      actionPermissions,
      description: project.description,
      projectType: project.projectType as ProjectType,
      status: project.status,
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
      enablingDepartments: enablingDepartments.length ? enablingDepartments : (leadingDepartment ? [leadingDepartment] : []),
      enablingDepartmentIds: enablingDepartments.length ? enablingDepartments.map((department) => department.id) : (project.leadingDepartmentId ? [project.leadingDepartmentId] : []),
      owningDepartmentId: project.owningDepartmentId,
      owningDepartmentName: owningDepartment?.name ?? null,
      owningDepartmentCode: owningDepartment?.code ?? null,
      workspaceEnabled: project.workspaceEnabled,
      plannedStartDate: formatDate(project.plannedStartDate),
      plannedEndDate: formatDate(project.plannedEndDate),
      actualStartDate: formatDate(project.actualStartDate),
      actualEndDate: formatDate(project.actualEndDate),
      completionPercent: project.completionPercent,
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
      owningDepartment: { select: { id: true, code: true, name: true } },
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
  const baselines = projectIds.length
    ? await prisma.projectPlanBaseline.findMany({
      where: { projectId: { in: projectIds }, isActive: true },
      include: { items: true },
      orderBy: [{ id: "desc" }],
    })
    : [];
  const baselineByKey = new Map<string, { plannedStartDate: Date | null; plannedEndDate: Date | null }>();
  for (const baseline of baselines) {
    for (const item of baseline.items) {
      const key = `${item.itemKind}:${item.itemId}`;
      if (!baselineByKey.has(key)) baselineByKey.set(key, { plannedStartDate: item.plannedStartDate, plannedEndDate: item.plannedEndDate });
    }
  }

  return {
    projects: projects.map((project) => {
      const baseline = baselineByKey.get(`project:${project.id}`);
      return {
        id: project.id,
        name: project.name,
        status: project.status,
        projectType: project.projectType,
        projectLevel: project.projectLevel,
        leadingDepartmentId: project.leadingDepartmentId,
        leadingDepartmentCode: project.leadingDepartment?.code ?? null,
        leadingDepartmentName: project.leadingDepartment?.name ?? null,
        owningDepartmentId: project.owningDepartmentId,
        owningDepartmentCode: project.owningDepartment?.code ?? null,
        owningDepartmentName: project.owningDepartment?.name ?? null,
        workspaceEnabled: project.workspaceEnabled,
        leaderNames: project.employees
          .map((entry) => entry.employee.name)
          .filter((name): name is string => Boolean(name)),
        stages: [],
        actualStartDate: formatDate(project.actualStartDate),
        actualEndDate: formatDate(project.actualEndDate),
        completionPercent: project.completionPercent,
        plannedStartDate: formatDate(project.plannedStartDate ?? baseline?.plannedStartDate ?? null),
        plannedEndDate: formatDate(project.plannedEndDate ?? baseline?.plannedEndDate ?? null),
      };
    }),
    tasks: [],
  };
}

export async function createProject(input: { userId: number; body: ProjectCreateInput }) {
  const command = await buildProjectCreateCommand(input.userId, input.body);
  if (!command.ok) return serviceError(command.issue.message, command.issue.status || 400);
  const record = await prisma.$transaction(async (tx) => {
    const created = await tx.project.create({
      data: command.data.data,
    });
    if (command.data.enablingDepartmentIds.length) {
      await tx.projectEnablingDepartment.createMany({
        data: command.data.enablingDepartmentIds.map((departmentId) => ({ projectId: created.id, departmentId })),
      });
    }
    if (command.data.leaderEmployeeId) {
      await tx.employeeProject.create({
        data: {
          employeeId: command.data.leaderEmployeeId,
          projectId: created.id,
          role: "负责人",
          editedBy: input.userId,
        },
      });
    }
    return created;
  });
  await snapshotHistory("Project", record.id, input.userId);
  return serviceOk({ success: true, record });
}

export async function getProjectWorkspaceEntry(input: { userId: number; projectId: number }) {
  if (!Number.isInteger(input.projectId) || input.projectId <= 0) {
    return { ok: false as const, reason: "项目无效" };
  }
  const permissions = await getProjectPermissionsById(input.userId, input.projectId);
  if (!permissions?.canView) return { ok: false as const, reason: "无权限访问该项目空间" };
  const project = await prisma.project.findUnique({
    where: { id: input.projectId },
    select: { id: true, isArchived: true, workspaceEnabled: true },
  });
  if (!project || project.isArchived) return { ok: false as const, reason: "项目不存在或已归档" };
  if (!project.workspaceEnabled) return { ok: false as const, reason: "该项目尚未开启项目空间" };
  return { ok: true as const, projectId: project.id };
}

export async function updateProjectField(input: {
  userId: number;
  projectId: number;
  field: string;
  value: unknown;
}) {
  const projectId = input.projectId;
  if (!Number.isInteger(projectId) || projectId <= 0) return serviceError("ID 无效", 400);
  const command = await buildProjectFieldUpdateCommand({
    userId: input.userId,
    projectId,
    field: input.field,
    value: input.value,
  });
  if (!command.ok) return serviceError(command.issue.message, command.issue.status || 400);
  await prisma.$transaction(async (tx) => {
    await ensureEditHistoryBaseline("Project", projectId, input.userId, tx);
    await tx.project.update({
      where: { id: projectId },
      data: {
        ...command.data.data,
        editedBy: input.userId,
        editedAt: new Date(),
        version: { increment: 1 },
      },
    });
    if (command.data.enablingDepartmentIds) {
      await tx.projectEnablingDepartment.deleteMany({ where: { projectId } });
      await tx.projectEnablingDepartment.createMany({
        data: command.data.enablingDepartmentIds.map((departmentId) => ({ projectId, departmentId })),
      });
    }
    await snapshotHistory("Project", projectId, input.userId, tx);
  });
  return serviceOk({ success: true });
}

export async function deleteProject(input: { userId: number; projectId: number }) {
  if (!Number.isInteger(input.projectId) || input.projectId <= 0) return serviceError("ID 无效", 400);
  const command = await validateProjectDeleteCommand(input.userId, input.projectId);
  if (!command.ok) return serviceError(command.issue.message, command.issue.status || 400);
  const result = await guardedDelete({
    entityType: "Project",
    modelKey: "project",
    id: command.data.projectId,
    userId: input.userId,
    actionLabel: "删除项目",
    deleteMode: "hard",
    references: [
      { label: "项目成员", count: (tx) => tx.employeeProject.count({ where: { projectId: command.data.projectId } }) },
      { label: "赋能部门", count: (tx) => tx.projectEnablingDepartment.count({ where: { projectId: command.data.projectId } }) },
      { label: "项目阶段", count: (tx) => tx.projectPlanPhase.count({ where: { projectId: command.data.projectId } }) },
      { label: "项目依赖", count: (tx) => tx.projectPlanDependency.count({ where: { projectId: command.data.projectId } }) },
      { label: "计划基线", count: (tx) => tx.projectPlanBaseline.count({ where: { projectId: command.data.projectId } }) },
      { label: "项目任务责任人", count: (tx) => tx.projectWorkAssignee.count({ where: { projectId: command.data.projectId } }) },
      { label: "关联工作项", count: (tx) => tx.workItem.count({ where: { linkedProjectId: command.data.projectId } }) },
      { label: "关联工作计划", count: (tx) => tx.workPlan.count({ where: { linkedProjectId: command.data.projectId } }) },
    ],
    referencePolicy: "checked",
  });
  if (!result.ok) return serviceError(result.error, result.status || 400);
  return serviceOk({ success: true });
}
