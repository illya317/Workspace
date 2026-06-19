import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate } from "@workspace/platform/server/auth";
import { routeIdParamsSchema } from "@workspace/platform/server/api";
import { canEditWorkTask } from "@/lib/access";
import {
  deleteWorkItem,
  getWorkItemAccessMetadata,
  parseParticipants,
  updateWorkItem,
} from "@workspace/work/server";

const updateWorkItemSchema = z.object({
  category: z.string().optional(),
  content: z.string().optional(),
  importance: z.number().int().optional(),
  urgency: z.number().int().optional(),
  participants: z.string().optional(),
  sortOrder: z.number().int().optional(),
  isArchived: z.boolean().optional(),
});

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const parsedParams = routeIdParamsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "工作项 ID 无效" }, { status: 400 });
  }

  const workId = parsedParams.data.id;
  const existing = await getWorkItemAccessMetadata(workId);
  if (!existing) return NextResponse.json({ error: "工作项不存在" }, { status: 404 });

  const allowed = await canEditWorkTask(payload.userId, existing.targetType, existing.targetId ?? 0);
  if (!allowed) return NextResponse.json({ error: "无权限编辑工作清单" }, { status: 403 });

  const parsedBody = updateWorkItemSchema.safeParse(await request.json());
  if (!parsedBody.success) {
    return NextResponse.json({ error: "工作项参数无效" }, { status: 400 });
  }

  const { participants, ...data } = parsedBody.data;
  const work = await updateWorkItem(workId, {
    ...data,
    ...(participants !== undefined && { participants: parseParticipants(participants) }),
  });
  return NextResponse.json({ work });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const parsedParams = routeIdParamsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "工作项 ID 无效" }, { status: 400 });
  }

  const workId = parsedParams.data.id;
  const existing = await getWorkItemAccessMetadata(workId);
  if (!existing) return NextResponse.json({ error: "工作项不存在" }, { status: 404 });

  const allowed = await canEditWorkTask(payload.userId, existing.targetType, existing.targetId ?? 0);
  if (!allowed) return NextResponse.json({ error: "无权限删除工作清单" }, { status: 403 });

  await deleteWorkItem(workId);
  return NextResponse.json({ success: true });
}
