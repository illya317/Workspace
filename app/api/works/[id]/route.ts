import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, checkPermission } from "@/lib/auth";

function parseParticipants(input?: string): string[] {
  if (!input) return [];
  return input
    .split(/,|，/)
    .map((n) => n.trim())
    .filter(Boolean);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await params;
  const workId = parseInt(id);

  const existing = await prisma.workItem.findUnique({
    where: { id: workId },
  });

  if (!existing) {
    return NextResponse.json({ error: "工作项不存在" }, { status: 404 });
  }

  // Check department-level scope access (targetType=department + targetId must match user's department)
  if (existing.targetType !== "department" || existing.targetId !== payload.departmentId) {
    return NextResponse.json({ error: "无权操作" }, { status: 403 });
  }

  const isWorkAdmin = await checkPermission(payload.userId, "system", "admin");
  if (!isWorkAdmin) {
    return NextResponse.json({ error: "无权限编辑工作清单" }, { status: 403 });
  }

  const body = await request.json();
  const {
    category,
    content,
    importance,
    urgency,
    participants,
    sortOrder,
    isArchived,
  } = body as {
    category?: string;
    content?: string;
    importance?: number;
    urgency?: number;
    participants?: string;
    sortOrder?: number;
    isArchived?: boolean;
  };

  const updateData: Record<string, unknown> = {
    ...(category !== undefined && { category }),
    ...(content !== undefined && { content }),
    ...(importance !== undefined && { importance }),
    ...(urgency !== undefined && { urgency }),
    ...(sortOrder !== undefined && { sortOrder }),
    ...(isArchived !== undefined && { isArchived }),
  };

  if (participants !== undefined) {
    const participantNames = parseParticipants(participants);
    updateData.participants = {
      deleteMany: {},
      create: participantNames.map((name) => ({ name })),
    };
  }

  const work = await prisma.workItem.update({
    where: { id: workId },
    data: updateData,
    include: { participants: true },
  });

  return NextResponse.json({ work });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await params;
  const workId = parseInt(id);

  const existing = await prisma.workItem.findUnique({
    where: { id: workId },
  });

  if (!existing) {
    return NextResponse.json({ error: "工作项不存在" }, { status: 404 });
  }

  // Check department-level scope access
  if (existing.targetType !== "department" || existing.targetId !== payload.departmentId) {
    return NextResponse.json({ error: "无权操作" }, { status: 403 });
  }

  const isWorkAdmin = await checkPermission(payload.userId, "system", "admin");
  if (!isWorkAdmin) {
    return NextResponse.json({ error: "无权限编辑工作清单" }, { status: 403 });
  }

  await prisma.workItem.delete({
    where: { id: workId },
  });

  return NextResponse.json({ success: true });
}
