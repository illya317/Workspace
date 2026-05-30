import { NextResponse } from "next/server";
import { authenticate } from "@/lib/auth";
import { canAccessTarget, canSubmitToTarget } from "@/lib/access";
import { listReports, createReport, enrichWithRoutineItems, isDuplicateReportError } from "@/server/services/reports";

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date") || undefined;
  const targetType = searchParams.get("targetType") || undefined;
  const targetIds = searchParams.get("targetIds") || undefined;

  // Batch 5: scoped access — resolve accessible targets, default to own reports
  let qType: string;
  let qIds: string;
  if (targetType && targetIds) {
    const ids = targetIds.split(",").map(Number);
    const checks = await Promise.all(ids.map(async (id) => ({
      id, allowed: await canAccessTarget(payload.userId, targetType, id),
    })));
    const accessible = checks.filter((r) => r.allowed).map((r) => r.id);
    if (accessible.length === 0) {
      return NextResponse.json({ error: "无权限访问该目标" }, { status: 403 });
    }
    qType = targetType;
    qIds = accessible.join(",");
  } else {
    qType = "user";
    qIds = String(payload.userId);
  }

  const reports = await listReports({ date, targetType: qType, targetIds: qIds });

  return NextResponse.json({ reports });
}

export async function POST(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const body = await request.json();

  const {
    taskName,
    notes,
    items,
    date,
    targetType,
    targetId,
  } = body as {
    taskName: string;
    notes?: string;
    items: Array<{
      category: string;
      plan: string;
      completion?: string;
      nextGoal?: string;
      sortOrder?: number;
      workId?: number;
    }>;
    date?: string;
    targetType?: string;
    targetId?: number;
  };

  if (!items || items.length === 0) {
    return NextResponse.json({ error: "请填写至少一条工作项" }, { status: 400 });
  }

  if (!taskName) {
    return NextResponse.json({ error: "请填写任务名称" }, { status: 400 });
  }

  // Batch 5: resolve final target first, then check against it
  const finalTargetType = targetType ?? "department";
  const finalTargetId = targetId ?? payload.departmentId;

  const allowed = await canSubmitToTarget(payload.userId, finalTargetType, finalTargetId);
  if (!allowed) {
    return NextResponse.json({ error: "无权限提交该目标周报" }, { status: 403 });
  }

  const reportDate = date ?? new Date().toISOString().slice(0, 10);

  const allItems = await enrichWithRoutineItems(
    [...items],
    finalTargetType,
    finalTargetId
  );

  try {
    // Batch 5: create with final (resolved) target, not original
    const report = await createReport({
      userId: payload.userId,
      taskName,
      notes: notes || null,
      date: reportDate,
      targetType: finalTargetType,
      targetId: finalTargetId,
      items: allItems,
    });

    return NextResponse.json({ report });
  } catch (error: unknown) {
    if (isDuplicateReportError(error)) {
      return NextResponse.json({ error: "该目标该时段已提交过报告，请使用更新功能" }, { status: 409 });
    }
    throw error;
  }
}
