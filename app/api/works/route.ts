import { NextResponse } from "next/server";
import { authenticate } from "@/lib/auth";
import { canAccessTarget, canEditWorkTask } from "@/lib/access";
import { parseParticipants, getWorkItems, createWorkItem } from "@/server/services/works";

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category") || undefined;
  const includeArchived = searchParams.get("includeArchived") === "true";
  const targetType = searchParams.get("targetType") || "department";
  const targetIdParam = searchParams.get("targetId");

  let finalTargetId = payload.departmentId;
  if (targetIdParam != null) {
    const targetId = parseInt(targetIdParam);
    const allowed = await canAccessTarget(payload.userId, targetType, targetId);
    if (!allowed) return NextResponse.json({ error: "无权限访问该目标" }, { status: 403 });
    finalTargetId = targetId;
  }

  const works = await getWorkItems({
    targetType, targetId: finalTargetId, category, includeArchived,
  });
  return NextResponse.json({ works });
}

export async function POST(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const body = await request.json();
  const { category, content, importance, urgency, participants, sortOrder, targetType, targetId } = body;

  if (!content || !category) {
    return NextResponse.json({ error: "工作内容和类别不能为空" }, { status: 400 });
  }

  const finalTargetType = targetType || "department";
  const finalTargetId = targetId ?? payload.departmentId;

  const allowed = await canEditWorkTask(payload.userId, finalTargetType, finalTargetId);
  if (!allowed) return NextResponse.json({ error: "无权限编辑工作清单" }, { status: 403 });

  const work = await createWorkItem({
    targetType: finalTargetType,
    targetId: finalTargetId,
    category, content, importance, urgency,
    participants: parseParticipants(participants),
    sortOrder,
  });

  return NextResponse.json({ work });
}
