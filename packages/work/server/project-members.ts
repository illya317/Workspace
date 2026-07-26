import { serviceError, serviceOk } from "@workspace/platform/server/api";
import type { DomainServiceResult } from "@workspace/platform/server/domain-validation";
import { matchSearchFields } from "@workspace/platform/search";
import { prisma } from "@workspace/platform/server/prisma";
import { sendNotification } from "@workspace/platform/server/notifications";
import { workspaceBusinessDate } from "@workspace/platform/server/business-date";
import { buildVisibleProjectWhere, canViewProject } from "./access";
import {
  ProjectMembershipConcurrentUpdateError,
  changeProjectMembershipRole,
  endProjectMembership,
  scheduleProjectMembership,
} from "./project-membership-lifecycle-service";
import {
  ProjectMembershipLifecycleError,
  projectMembershipTemporalState,
} from "./domain/project-membership-lifecycle";
import {
  buildProjectMemberCreateCommand,
  buildProjectMemberFieldUpdateCommand,
  validateProjectMemberDeleteCommand,
} from "./domain/project-member-validation";

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
  recordId: number;
  changeUid: string;
}) {
  const [employee, project, actor] = await Promise.all([
    prisma.employee.findUnique({
      where: { id: input.employeeId },
      select: { userId: true, name: true },
    }),
    prisma.project.findUnique({
      where: { id: input.projectId },
      select: { name: true },
    }),
    prisma.user.findUnique({
      where: { id: input.actorUserId },
      select: { username: true, employees: { select: { name: true }, take: 1 } },
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
        inviterName: actor?.employees[0]?.name || actor?.username || "项目负责人",
        changedFromRole: input.changedFromRole ?? null,
        recordId: input.recordId,
        changeUid: input.changeUid,
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
  lifecycleScope?: "current" | "all";
  asOfDate?: string;
}) {
  const asOfDate = input.asOfDate || workspaceBusinessDate(new Date());
  if (input.projectId && !(await canViewProject(input.userId, input.projectId))) {
    return { entries: [], total: 0, asOfDate };
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
      const recordId = Number(payload.recordId);
      if (Number.isInteger(recordId) && recordId > 0) pendingKeys.add(`record:${recordId}`);
      else if (Number.isInteger(projectId) && Number.isInteger(employeeId)) pendingKeys.add(`${projectId}:${employeeId}`);
    } catch {
      // Ignore legacy malformed payloads; they should not affect roster coloring.
    }
  }

  const mapped = entries.map((entry) => ({
    id: entry.id,
    version: entry.version,
    employeeId: entry.employeeId,
    employeeNumber: entry.employee?.employeeId || "",
    employeeName: entry.employee?.name || "",
    projectId: entry.projectId,
    projectName: entry.project?.name || "",
    role: entry.role,
    startDate: entry.startDate,
    endDate: entry.endDate,
    recordState: entry.recordState,
    temporalState: projectMembershipTemporalState(entry, asOfDate),
    membershipUid: entry.membershipUid,
    sequence: entry.sequence,
    confirmationStatus: pendingKeys.has(`record:${entry.id}`) || pendingKeys.has(`${entry.projectId}:${entry.employeeId}`) ? "pending" : "confirmed",
  }));

  let result = input.lifecycleScope === "all"
    ? mapped
    : mapped.filter((entry) => entry.recordState === "confirmed" && entry.temporalState === "current");
  if (input.keyword) {
    result = result.filter((entry) =>
      matchSearchFields(entry, input.keyword, ["employeeName", "employeeNumber", "projectName", "role"]),
    );
  }

  const total = result.length;
  const start = (input.page - 1) * input.pageSize;
  return { entries: result.slice(start, start + input.pageSize), total, asOfDate };
}

export async function createProjectMemberAction(input: {
  userId: number;
  body: Record<string, unknown>;
  idempotencyKey: string;
}): Promise<DomainServiceResult<{ success: true; record: unknown }>> {
  const command = await buildProjectMemberCreateCommand(input.userId, input.body);
  if (!command.ok) return serviceError(command.issue.message, command.issue.status || 400);
  const result = await captureMembershipLifecycleError(() => scheduleProjectMembership({
    employeeId: command.data.employeeId,
    projectId: command.data.projectId,
    role: command.data.role,
    startDate: command.data.startDate,
    endDate: command.data.endDate,
    userId: command.data.editorUserId,
    idempotencyKey: input.idempotencyKey,
  }));
  if (!result.ok) return result;
  const recordId = result.data.createdVersionId;
  if (!recordId) return serviceError("项目成员版本创建失败", 409);
  const record = await prisma.employeeProject.findUnique({ where: { id: recordId } });
  if (!record) return serviceError("项目成员版本创建失败", 409);
  await notifyProjectMember({
    actionName: "added",
    employeeId: record.employeeId,
    projectId: record.projectId,
    role: record.role,
    actorUserId: command.data.editorUserId,
    recordId,
    changeUid: result.data.changeUid,
  });
  return serviceOk({ success: true, record });
}

export async function updateProjectMemberFieldAction(input: {
  userId: number;
  recordId: number;
  body: { field: string; value?: unknown };
  expectedVersion: number | undefined;
  idempotencyKey: string;
}): Promise<DomainServiceResult<{ success: true }>> {
  if (!Number.isInteger(input.recordId)) return serviceError("ID 无效");
  if (input.expectedVersion === undefined) return serviceError("缺少项目成员版本，请刷新后重试", 428);
  const command = await buildProjectMemberFieldUpdateCommand(input.userId, input.recordId, input.body.field, input.body.value);
  if (!command.ok) return serviceError(command.issue.message, command.issue.status || 400);
  const previous = await prisma.employeeProject.findUnique({
    where: { id: command.data.recordId },
    select: { employeeId: true, projectId: true, role: true },
  });
  if (!previous) return serviceError("项目成员记录不存在", 404);
  const result = await captureMembershipLifecycleError(() => changeProjectMembershipRole({
    recordId: command.data.recordId,
    nextRole: command.data.value,
    expectedVersion: input.expectedVersion as number,
    userId: input.userId,
    idempotencyKey: input.idempotencyKey,
  }));
  if (!result.ok) return result;
  if (previous.role !== command.data.value && result.data.createdVersionId) {
    await notifyProjectMember({
      actionName: "roleChanged",
      employeeId: previous.employeeId,
      projectId: previous.projectId,
      role: command.data.value,
      changedFromRole: previous.role,
      actorUserId: input.userId,
      recordId: result.data.createdVersionId,
      changeUid: result.data.changeUid,
    });
  }
  return serviceOk({ success: true });
}

export async function deleteProjectMemberAction(input: {
  userId: number;
  recordId: number;
  expectedVersion: number | undefined;
  idempotencyKey: string;
}): Promise<DomainServiceResult<{ success: true }>> {
  if (!Number.isInteger(input.recordId)) return serviceError("ID 无效");
  if (input.expectedVersion === undefined) return serviceError("缺少项目成员版本，请刷新后重试", 428);
  const command = await validateProjectMemberDeleteCommand(input.userId, input.recordId);
  if (!command.ok) return serviceError(command.issue.message, command.issue.status || 400);
  const result = await captureMembershipLifecycleError(() => endProjectMembership({
    recordId: command.data.recordId,
    expectedVersion: input.expectedVersion as number,
    userId: input.userId,
    idempotencyKey: input.idempotencyKey,
    reason: "从项目当前成员中移除",
  }));
  if (!result.ok) return result;
  return serviceOk({ success: true });
}

async function captureMembershipLifecycleError<T>(operation: () => Promise<T>): Promise<DomainServiceResult<T>> {
  try {
    return serviceOk(await operation());
  } catch (error) {
    if (error instanceof ProjectMembershipLifecycleError || error instanceof ProjectMembershipConcurrentUpdateError) {
      return serviceError(error.message, 409);
    }
    throw error;
  }
}
