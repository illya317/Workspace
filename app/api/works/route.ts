import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, isAdmin, checkPermission } from "@/lib/auth";
import { canAccessTarget } from "@/lib/access";

// Check if user has admin rights for a department's works
async function requireAdmin(userId: number, _departmentId: number) {
  return checkPermission(userId, "system", "admin");
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
  const targetType = searchParams.get("targetType");
  const targetIdParam = searchParams.get("targetId");

  let departmentId = payload.departmentId;

  // deptId override (admin only)
  if (deptIdParam) {
    const isUserAdmin = await isAdmin(request);
    if (!isUserAdmin) {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }
    departmentId = parseInt(deptIdParam);
  }

  // targetType + targetId override (with access check)
  let finalTargetType = "department";
  let finalTargetId = departmentId;

  if (targetType && targetIdParam != null) {
    const targetId = parseInt(targetIdParam);
    const allowed = await canAccessTarget(payload.userId, targetType, targetId);
    if (!allowed) {
      return NextResponse.json({ error: "无权限访问该目标" }, { status: 403 });
    }
    finalTargetType = targetType;
    finalTargetId = targetId;
  }

  const where: { targetType: string; targetId: number; category?: string; isArchived?: boolean } = {
    targetType: finalTargetType,
    targetId: finalTargetId,
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
    const isUserAdmin = await isAdmin(request);
    if (!isUserAdmin) {
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
      targetType: "department",
      targetId: targetDeptId,
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
