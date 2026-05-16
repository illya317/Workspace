import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, isAnyGroupAdmin, requireGroupAccess } from "@/lib/auth";

async function requireAdminUser(userId: number) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isWorkListAdmin: true },
  });
  return user?.isWorkListAdmin === true;
}

async function requireAdmin(userId: number, departmentId: number) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isWorkListAdmin: true, departmentId: true },
  });
  if (user?.isWorkListAdmin === true && user?.departmentId === departmentId) return true;
  const groupAdmin = await isAnyGroupAdmin(userId);
  return groupAdmin && user?.departmentId === departmentId;
}

function parseParticipants(input?: string): string[] {
  if (!input) return [];
  return input
    .split(/,|，/)
    .map((n) => n.trim())
    .filter(Boolean);
}

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  const includeArchived = searchParams.get("includeArchived") === "true";
  const deptIdParam = searchParams.get("deptId");
  const reportGroupIdParam = searchParams.get("reportGroupId");

  let departmentId = payload.departmentId;
  if (deptIdParam) {
    const isAdmin = await requireAdminUser(payload.userId);
    if (!isAdmin) {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }
    departmentId = parseInt(deptIdParam);
  }
  if (reportGroupIdParam) {
    const rgId = parseInt(reportGroupIdParam);
    const { error, status } = await requireGroupAccess(request, rgId);
    if (error) return NextResponse.json({ error }, { status });

    const rg = await prisma.reportGroup.findUnique({
      where: { id: rgId },
      select: { departmentId: true },
    });
    if (rg?.departmentId) {
      departmentId = rg.departmentId;
    }
  }

  const where: { departmentId: number; category?: string; isArchived?: boolean } = {
    departmentId,
  };
  if (category) where.category = category;
  if (!includeArchived) where.isArchived = false;

  const works = await prisma.workItem.findMany({
    where,
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
    include: { participants: true },
  });

  return NextResponse.json({ works });
}

export async function POST(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const body = await request.json();
  const {
    category,
    content,
    importance,
    urgency,
    participants,
    sortOrder,
    deptId,
  } = body as {
    category: string;
    content: string;
    importance?: number;
    urgency?: number;
    participants?: string;
    sortOrder?: number;
    deptId?: number;
  };

  let targetDeptId = payload.departmentId;
  if (deptId !== undefined && deptId !== payload.departmentId) {
    const isAdmin = await requireAdminUser(payload.userId);
    if (!isAdmin) {
      return NextResponse.json({ error: "无权限编辑其他部门" }, { status: 403 });
    }
    targetDeptId = deptId;
  } else {
    const isAdmin = await requireAdmin(payload.userId, payload.departmentId);
    if (!isAdmin) {
      return NextResponse.json({ error: "无权限编辑工作清单" }, { status: 403 });
    }
  }

  if (!content || !category) {
    return NextResponse.json(
      { error: "工作内容和类别不能为空" },
      { status: 400 }
    );
  }

  const participantNames = parseParticipants(participants);

  const work = await prisma.workItem.create({
    data: {
      departmentId: targetDeptId,
      category,
      content,
      importance: importance ?? 3,
      urgency: urgency ?? 3,
      sortOrder: sortOrder ?? 0,
      participants:
        participantNames.length > 0
          ? { create: participantNames.map((name) => ({ name })) }
          : undefined,
    },
    include: { participants: true },
  });

  return NextResponse.json({ work });
}
