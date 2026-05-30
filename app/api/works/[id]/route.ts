import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, checkPermission } from "@/lib/auth";

function parseParticipants(input?: string): string[] {
  if (!input) return [];
  return input.split(/,|，/).map((n) => n.trim()).filter(Boolean);
}

async function verifyWorkAccess(payload: Awaited<ReturnType<typeof authenticate>>, workId: number) {
  if (!payload) return { error: "未登录", status: 401 };
  const existing = await prisma.workItem.findUnique({ where: { id: workId } });
  if (!existing) return { error: "工作项不存在", status: 404 };
  if (existing.targetType !== "department" || existing.targetId !== payload.departmentId) {
    return { error: "无权操作", status: 403 };
  }
  if (!(await checkPermission(payload.userId, "system", "admin"))) {
    return { error: "无权限编辑工作清单", status: 403 };
  }
  return { existing };
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const payload = await authenticate(request);
  const { id } = await params;
  const workId = parseInt(id);
  const access = await verifyWorkAccess(payload, workId);
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });

  const body = await request.json();
  const { category, content, importance, urgency, participants, sortOrder, isArchived } = body;
  const updateData: Record<string, unknown> = {
    ...(category !== undefined && { category }),
    ...(content !== undefined && { content }),
    ...(importance !== undefined && { importance }),
    ...(urgency !== undefined && { urgency }),
    ...(sortOrder !== undefined && { sortOrder }),
    ...(isArchived !== undefined && { isArchived }),
  };
  if (participants !== undefined) {
    updateData.participants = { deleteMany: {}, create: parseParticipants(participants).map((name) => ({ name })) };
  }

  const work = await prisma.workItem.update({ where: { id: workId }, data: updateData, include: { participants: true } });
  return NextResponse.json({ work });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const payload = await authenticate(request);
  const { id } = await params;
  const workId = parseInt(id);
  const access = await verifyWorkAccess(payload, workId);
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });

  await prisma.workItem.delete({ where: { id: workId } });
  return NextResponse.json({ success: true });
}
