import { serviceError } from "@workspace/platform/server/api";
import type { DomainServiceResult } from "@workspace/platform/server/domain-validation";
import { ensureEditHistoryBaseline, snapshotHistory } from "@workspace/platform/server/history";
import { matchSearchFields } from "@workspace/platform/search";
import { prisma } from "@workspace/platform/server/prisma";
import { sendNotification } from "@workspace/platform/server/notifications";
import { buildVisibleProjectWhere, canViewProject } from "./access";
import {
  buildProjectMemberCreateCommand,
  buildProjectMemberFieldUpdateCommand,
  validateProjectMemberDeleteCommand,
} from "./domain/project-member-validation";

const EMPLOYEE_PROJECT_CONFIG = {
  entityType: "EmployeeProject",
  modelKey: "employeeProject" as const,
  allowedFields: ["employeeId", "projectId", "role", "startDate", "endDate"],
};

const PROJECT_MEMBER_ACTIONS = {
  added: {
    key: "work.project.member.added",
    notificationType: "work.project.member.added",
  },
  roleChanged: {
    key: "work.project.member.roleChanged",
    notificationType: "work.project.member.roleChanged",
  },
} as const;

type ProjectMemberActionName = keyof typeof PROJECT_MEMBER_ACTIONS;

export function listProjectMemberActionDefinitions() {
  return Object.values(PROJECT_MEMBER_ACTIONS).map((action) => ({
    key: action.key,
    notificationType: action.notificationType,
  }));
}

async function notifyProjectMember(input: {
  actionName: ProjectMemberActionName;
  employeeId: number;
  projectId: number;
  role: string | null;
  actorUserId: number;
  changedFromRole?: string | null;
}) {
  const [employee, project] = await Promise.all([
    prisma.employee.findUnique({
      where: { id: input.employeeId },
      select: { userId: true, name: true },
    }),
    prisma.project.findUnique({
      where: { id: input.projectId },
      select: { name: true },
    }),
  ]);
  if (!employee?.userId || !project) return;

  const action = PROJECT_MEMBER_ACTIONS[input.actionName];
  const role = input.role || "执行负责";
  try {
    await sendNotification({
      recipientUserId: employee.userId,
      actorUserId: input.actorUserId,
      type: action.notificationType,
      payload: {
        projectId: input.projectId,
        employeeId: input.employeeId,
        projectName: project.name,
        role,
        changedFromRole: input.changedFromRole ?? null,
      },
    });
  } catch (error) {
    console.error("Failed to create project member notification", error);
  }
}

export async function listProjectMembers(input: {
  userId: number;
  projectId?: number | null;
  keyword: string;
  page: number;
  pageSize: number;
}) {
  if (input.projectId && !(await canViewProject(input.userId, input.projectId))) {
    return { entries: [], total: 0 };
  }
  const visibleProjectWhere = await buildVisibleProjectWhere(input.userId);
  const where = input.projectId
    ? { projectId: input.projectId }
    : { project: visibleProjectWhere };

  const entries = await prisma.employeeProject.findMany({
    where,
    include: {
      employee: { select: { id: true, employeeId: true, name: true } },
      project: { select: { id: true, name: true } },
    },
    orderBy: { id: "asc" },
  });
  const pendingNotifications = await prisma.notification.findMany({
    where: {
      type: { in: ["work.project.member.added", "work.project.member.roleChanged"] },
      acknowledgedAt: null,
      rejectedAt: null,
    },
    select: { payloadJson: true },
  });
  const pendingKeys = new Set<string>();
  for (const notification of pendingNotifications) {
    if (!notification.payloadJson) continue;
    try {
      const payload = JSON.parse(notification.payloadJson) as Record<string, unknown>;
      const projectId = Number(payload.projectId);
      const employeeId = Number(payload.employeeId);
      if (Number.isInteger(projectId) && Number.isInteger(employeeId)) pendingKeys.add(`${projectId}:${employeeId}`);
    } catch {
      // Ignore legacy malformed payloads; they should not affect roster coloring.
    }
  }

  const mapped = entries.map((entry) => ({
    id: entry.id,
    employeeId: entry.employeeId,
    employeeNumber: entry.employee?.employeeId || "",
    employeeName: entry.employee?.name || "",
    projectId: entry.projectId,
    projectName: entry.project?.name || "",
    role: entry.role,
    startDate: entry.startDate,
    endDate: entry.endDate,
    confirmationStatus: pendingKeys.has(`${entry.projectId}:${entry.employeeId}`) ? "pending" : "confirmed",
  }));

  let result = mapped;
  if (input.keyword) {
    result = mapped.filter((entry) =>
      matchSearchFields(entry, input.keyword, ["employeeName", "employeeNumber", "projectName", "role"]),
    );
  }

  const total = result.length;
  const start = (input.page - 1) * input.pageSize;
  return { entries: result.slice(start, start + input.pageSize), total };
}

export async function createProjectMemberAction(input: {
  userId: number;
  body: Record<string, unknown>;
}): Promise<DomainServiceResult<{ success: true; record: unknown }>> {
  const command = await buildProjectMemberCreateCommand(input.userId, input.body);
  if (!command.ok) return serviceError(command.issue.message, command.issue.status || 400);
  const record = await prisma.employeeProject.create({
    data: {
      employeeId: command.data.employeeId,
      projectId: command.data.projectId,
      role: command.data.role,
      startDate: command.data.startDate,
      endDate: command.data.endDate,
      editedBy: command.data.editorUserId,
    },
  });
  await snapshotHistory("EmployeeProject", record.id, command.data.editorUserId);
  await notifyProjectMember({
    actionName: "added",
    employeeId: record.employeeId,
    projectId: record.projectId,
    role: record.role,
    actorUserId: command.data.editorUserId,
  });
  return { ok: true, data: { success: true, record } };
}

export async function updateProjectMemberFieldAction(input: {
  userId: number;
  recordId: number;
  body: { field: string; value?: unknown };
}): Promise<DomainServiceResult<{ success: true }>> {
  if (!Number.isInteger(input.recordId)) return serviceError("ID 无效");
  const command = await buildProjectMemberFieldUpdateCommand(input.userId, input.recordId, input.body.field, input.body.value);
  if (!command.ok) return serviceError(command.issue.message, command.issue.status || 400);
  if (!EMPLOYEE_PROJECT_CONFIG.allowedFields.includes(command.data.field)) return serviceError("非法字段");

  const previous = command.data.field === "role"
    ? await prisma.employeeProject.findUnique({
        where: { id: command.data.recordId },
        select: { employeeId: true, projectId: true, role: true },
      })
    : null;

  await prisma.$transaction(async (tx) => {
    await ensureEditHistoryBaseline("EmployeeProject", command.data.recordId, input.userId, tx);
    await tx.employeeProject.update({
      where: { id: command.data.recordId },
      data: { [command.data.field]: command.data.value ?? null, editedBy: input.userId, editedAt: new Date(), version: { increment: 1 } },
    });
    await snapshotHistory("EmployeeProject", command.data.recordId, input.userId, tx);
  });
  if (previous && previous.role !== command.data.value) {
    await notifyProjectMember({
      actionName: "roleChanged",
      employeeId: previous.employeeId,
      projectId: previous.projectId,
      role: String(command.data.value || ""),
      changedFromRole: previous.role,
      actorUserId: input.userId,
    });
  }
  return { ok: true, data: { success: true } };
}

export async function deleteProjectMemberAction(input: {
  userId: number;
  recordId: number;
}): Promise<DomainServiceResult<{ success: true }>> {
  if (!Number.isInteger(input.recordId)) return serviceError("ID 无效");
  const command = await validateProjectMemberDeleteCommand(input.userId, input.recordId);
  if (!command.ok) return serviceError(command.issue.message, command.issue.status || 400);
  await prisma.$transaction(async (tx) => {
    await ensureEditHistoryBaseline("EmployeeProject", command.data.recordId, input.userId, tx);
    await snapshotHistory("EmployeeProject", command.data.recordId, input.userId, tx);
    await tx.employeeProject.delete({ where: { id: command.data.recordId } });
  });
  return { ok: true, data: { success: true } };
}
