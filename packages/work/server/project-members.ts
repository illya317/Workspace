import { NextResponse } from "next/server";
import { authenticate } from "@workspace/platform/server/auth";
import { snapshotHistory } from "@workspace/platform/server/history";
import { matchSearchFields } from "@workspace/platform/search";
import { prisma } from "@workspace/platform/server/prisma";
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

  await prisma.employeeProject.update({
    where: { id: command.data.recordId },
    data: { [command.data.field]: command.data.value ?? null, editedBy: payload.userId, editedAt: new Date(), version: { increment: 1 } },
  });
  await snapshotHistory("EmployeeProject", command.data.recordId, payload.userId);
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
  await snapshotHistory("EmployeeProject", command.data.recordId, payload.userId);
  await prisma.employeeProject.delete({ where: { id: command.data.recordId } });
  return NextResponse.json({ success: true });
}
