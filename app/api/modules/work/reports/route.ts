import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate } from "@workspace/platform/server/auth";
import {
  canAccessTarget,
  canSubmitToTarget,
  createReport,
  enrichWithRoutineItems,
  isDuplicateReportError,
  listReports,
} from "@workspace/work/server";

const reportItemSchema = z.object({
  category: z.string(),
  plan: z.string(),
  completion: z.string().optional(),
  nextGoal: z.string().optional(),
  sortOrder: z.coerce.number().optional(),
  workId: z.coerce.number().optional(),
}).passthrough();

const createReportSchema = z.object({
  taskName: z.string().min(1),
  notes: z.string().optional(),
  items: z.array(reportItemSchema).min(1),
  date: z.string().optional(),
  targetType: z.string().optional(),
  targetId: z.coerce.number().optional(),
}).passthrough();

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date") || undefined;
  const targetType = searchParams.get("targetType") || undefined;
  const targetIds = searchParams.get("targetIds") || undefined;

  // Batch 5.1: scoped access with explicit denied target IDs
  let qType: string;
  let qIds: string;
  let denied: number[] = [];
  if (targetType && targetIds) {
    const ids = targetIds.split(",").map(Number);
    const checks = await Promise.all(ids.map(async (id) => ({
      id, allowed: await canAccessTarget(payload.userId, targetType, id),
    })));
    const accessible = checks.filter((r) => r.allowed).map((r) => r.id);
    denied = checks.filter((r) => !r.allowed).map((r) => r.id);
    if (accessible.length === 0) {
      return NextResponse.json(
        { error: "无权限访问该目标", deniedTargetIds: denied },
        { status: 403 },
      );
    }
    qType = targetType;
    qIds = accessible.join(",");
  } else {
    qType = "user";
    qIds = String(payload.userId);
  }

  const reports = await listReports({ date, targetType: qType, targetIds: qIds });
  const meta = denied.length > 0 ? { deniedTargetIds: denied } : {};
  return NextResponse.json({ reports, ...meta });
}

export async function POST(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsedBody = createReportSchema.safeParse(body);
  if (!parsedBody.success && parsedBody.error.issues.some((issue) => issue.path[0] === "items")) {
    return NextResponse.json({ error: "请填写至少一条工作项" }, { status: 400 });
  }
  if (!parsedBody.success) {
    return NextResponse.json({ error: "请填写任务名称" }, { status: 400 });
  }
  const { taskName, notes, items, date, targetType, targetId } = parsedBody.data;

  // Batch 5: resolve final target first, then check against it
  const finalTargetType = targetType ?? "department";
  const finalTargetId = targetId ?? payload.departmentId;

  const allowed = await canSubmitToTarget(payload.userId, finalTargetType, finalTargetId);
  if (!allowed) {
    return NextResponse.json({ error: "无权限提交该目标周报" }, { status: 403 });
  }

  const reportDate = date ?? new Date().toISOString().slice(0, 10);
  const allItems = await enrichWithRoutineItems([...items], finalTargetType, finalTargetId);

  try {
    const report = await createReport({
      userId: payload.userId, taskName, notes: notes || null,
      date: reportDate, targetType: finalTargetType, targetId: finalTargetId, items: allItems,
    });
    return NextResponse.json({ report });
  } catch (error: unknown) {
    if (isDuplicateReportError(error)) {
      return NextResponse.json(
        { error: "该目标该时段已提交过报告，请使用更新功能" },
        { status: 409 },
      );
    }
    throw error;
  }
}
