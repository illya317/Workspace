import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, authorize } from "@workspace/platform/server/auth";
import { canSubmitToTarget } from "@/lib/access";
import {
  getReportAccessMetadata,
  updateReportWithHistory,
} from "@workspace/work/server";

const paramsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const reportItemSchema = z.object({
  category: z.string().min(1),
  plan: z.string().min(1),
  completion: z.string().optional(),
  nextGoal: z.string().optional(),
  sortOrder: z.number().int().optional(),
  workId: z.number().int().positive().optional(),
});

const updateReportSchema = z.object({
  taskName: z.string().min(1),
  notes: z.string().optional(),
  items: z.array(reportItemSchema).min(1),
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "报告 ID 无效" }, { status: 400 });
  }

  const reportId = parsedParams.data.id;
  const existing = await getReportAccessMetadata(reportId);
  if (!existing) {
    return NextResponse.json(
      { error: "无权修改此报告" },
      { status: 403 }
    );
  }

  const userId = payload.userId;

  async function canEdit(report: NonNullable<typeof existing>) {
    if (await authorize({ user: userId, resourceKey: "system", action: "admin" })) return true;

    if (report.targetType && report.targetId != null) {
      return canSubmitToTarget(userId, report.targetType, report.targetId);
    }

    return report.userId === userId;
  }

  const editable = await canEdit(existing);
  if (!editable) {
    return NextResponse.json(
      { error: "无权修改此报告" },
      { status: 403 }
    );
  }

  const parsedBody = updateReportSchema.safeParse(await request.json());
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "请填写任务名称和至少一条工作项" },
      { status: 400 }
    );
  }

  const updated = await updateReportWithHistory(reportId, {
    taskName: parsedBody.data.taskName,
    notes: parsedBody.data.notes || null,
    items: parsedBody.data.items,
  });

  return NextResponse.json({ report: updated });
}
