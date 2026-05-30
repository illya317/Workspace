import { NextResponse } from "next/server";
import { authenticate, isAdmin, checkPermission } from "@/lib/auth";
import { parseParticipants, getWorkItems, createWorkItem } from "@/server/services/works";

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category") || undefined;
  const includeArchived = searchParams.get("includeArchived") === "true";
  const deptIdParam = searchParams.get("deptId");
  const targetType = searchParams.get("targetType");
  const targetIdParam = searchParams.get("targetId");

  let departmentId = payload.departmentId;

  if (deptIdParam) {
    if (!(await isAdmin(request))) return NextResponse.json({ error: "无权限" }, { status: 403 });
    departmentId = parseInt(deptIdParam);
  }

  let finalTargetType = "department";
  let finalTargetId = departmentId;

  if (targetType && targetIdParam != null) {
    const targetId = parseInt(targetIdParam);
    // Batch 5.1: work.task keeps membership-based access until scoped UI is built
    // Allow access to own department, or if user has work.task.access
    const hasAccess = await checkPermission(payload.userId, "work.task", "access");
    const isOwnDept = targetType === "department" && targetId === payload.departmentId;
    if (!hasAccess && !isOwnDept) {
      return NextResponse.json({ error: "无权限访问该目标" }, { status: 403 });
    }
    finalTargetType = targetType;
    finalTargetId = targetId;
  }

  const works = await getWorkItems({
    targetType: finalTargetType,
    targetId: finalTargetId,
    category,
    includeArchived,
  });
  return NextResponse.json({ works });
}

export async function POST(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const body = await request.json();
  const { category, content, importance, urgency, participants, sortOrder, deptId } = body;

  let targetDeptId = payload.departmentId;
  if (deptId !== undefined && deptId !== payload.departmentId) {
    if (!(await isAdmin(request))) {
      return NextResponse.json({ error: "无权限编辑其他部门" }, { status: 403 });
    }
    targetDeptId = deptId;
  } else {
    const hasAdmin = await checkPermission(payload.userId, "system", "admin");
    if (!hasAdmin) return NextResponse.json({ error: "无权限编辑工作清单" }, { status: 403 });
  }

  if (!content || !category) {
    return NextResponse.json({ error: "工作内容和类别不能为空" }, { status: 400 });
  }

  const work = await createWorkItem({
    targetType: "department",
    targetId: targetDeptId,
    category,
    content,
    importance,
    urgency,
    participants: parseParticipants(participants),
    sortOrder,
  });

  return NextResponse.json({ work });
}
