import { NextResponse } from "next/server";
import { authenticate } from "@workspace/platform/server/auth";
import { ensureEditHistoryBaseline, snapshotHistory } from "@workspace/platform/server/history";
import { matchSearchFields } from "@workspace/platform/search";
import { prisma } from "@workspace/platform/server/prisma";
import { createNotification } from "@workspace/platform/server/notifications";
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

async function notifyProjectMember(input: {
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

  const role = input.role || "执行负责";
  const changed = input.changedFromRole && input.changedFromRole !== role;
  try {
    await createNotification({
      recipientUserId: employee.userId,
      actorUserId: input.actorUserId,
      type: changed ? "work.project.member.roleChanged" : "work.project.member.added",
      title: changed ? "项目角色已调整" : "你已被加入项目",
      body: changed
        ? `你在项目「${project.name}」中的角色已由「${input.changedFromRole}」调整为「${role}」，请确认知悉。`
        : `你已被加入项目「${project.name}」，角色：${role}。请确认知悉。`,
      href: `/work/projects?projectId=${input.projectId}`,
      isImportant: true,
      payload: {
        projectId: input.projectId,
        employeeId: input.employeeId,
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

export async function createProjectMember(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const body = (await request.json()) as Record<string, unknown>;
  const command = await buildProjectMemberCreateCommand(payload.userId, body);
  if (!command.ok) return NextResponse.json({ error: command.issue.message }, { status: command.issue.status || 400 });
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
    employeeId: record.employeeId,
    projectId: record.projectId,
    role: record.role,
    actorUserId: command.data.editorUserId,
  });
  return NextResponse.json({ success: true, record });
}

export async function updateProjectMemberField(request: Request, params: Promise<{ id: string }>) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;
  const recordId = parseInt(id);
  if (!Number.isInteger(recordId)) return NextResponse.json({ error: "ID 无效" }, { status: 400 });
  const body = (await request.json()) as { field: string; value: unknown };
  const command = await buildProjectMemberFieldUpdateCommand(payload.userId, recordId, body.field, body.value);
  if (!command.ok) return NextResponse.json({ error: command.issue.message }, { status: command.issue.status || 400 });
  if (!EMPLOYEE_PROJECT_CONFIG.allowedFields.includes(command.data.field)) return NextResponse.json({ error: "非法字段" }, { status: 400 });

  const previous = command.data.field === "role"
    ? await prisma.employeeProject.findUnique({
        where: { id: command.data.recordId },
        select: { employeeId: true, projectId: true, role: true },
      })
    : null;

  await prisma.$transaction(async (tx) => {
    await ensureEditHistoryBaseline("EmployeeProject", command.data.recordId, payload.userId, tx);
    await tx.employeeProject.update({
      where: { id: command.data.recordId },
      data: { [command.data.field]: command.data.value ?? null, editedBy: payload.userId, editedAt: new Date(), version: { increment: 1 } },
    });
    await snapshotHistory("EmployeeProject", command.data.recordId, payload.userId, tx);
  });
  if (previous && previous.role !== command.data.value) {
    await notifyProjectMember({
      employeeId: previous.employeeId,
      projectId: previous.projectId,
      role: String(command.data.value || ""),
      changedFromRole: previous.role,
      actorUserId: payload.userId,
    });
  }
  return NextResponse.json({ success: true });
}

export async function deleteProjectMember(request: Request, params: Promise<{ id: string }>) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;
  const recordId = parseInt(id);
  if (!Number.isInteger(recordId)) return NextResponse.json({ error: "ID 无效" }, { status: 400 });
  const command = await validateProjectMemberDeleteCommand(payload.userId, recordId);
  if (!command.ok) return NextResponse.json({ error: command.issue.message }, { status: command.issue.status || 400 });
  await prisma.$transaction(async (tx) => {
    await ensureEditHistoryBaseline("EmployeeProject", command.data.recordId, payload.userId, tx);
    await snapshotHistory("EmployeeProject", command.data.recordId, payload.userId, tx);
    await tx.employeeProject.delete({ where: { id: command.data.recordId } });
  });
  return NextResponse.json({ success: true });
}
