import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAccess } from "@workspace/platform/server/auth";
import {
  canAccessTarget,
  canEditWorkTask,
  createWorkItem,
  getWorkItems,
  parseParticipants,
} from "@workspace/work/server";

const createWorkItemSchema = z.object({
  category: z.string().min(1),
  content: z.string().min(1),
  importance: z.coerce.number().optional(),
  urgency: z.coerce.number().optional(),
  participants: z.string().optional(),
  sortOrder: z.coerce.number().optional(),
  targetType: z.string().optional(),
  targetId: z.coerce.number().optional(),
  deptId: z.coerce.number().optional(),
}).passthrough();

export async function GET(request: Request) {

  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  const payload = auth.user;

  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category") || undefined;
  const includeArchived = searchParams.get("includeArchived") === "true";
  const targetType = searchParams.get("targetType") || "department";
  // deptId is legacy compat; only used for department targets
  const targetIdParam = searchParams.get("targetId")
    || (targetType === "department" ? searchParams.get("deptId") : null);

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

  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  const payload = auth.user;

  const body = await request.json().catch(() => null);
  const parsedBody = createWorkItemSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json({ error: "工作内容和类别不能为空" }, { status: 400 });
  }
  const { category, content, importance, urgency, participants, sortOrder, targetType, targetId, deptId } = parsedBody.data;

  const finalTargetType = targetType || "department";
  const finalTargetId = targetId ?? (finalTargetType === "department" ? deptId : null) ?? payload.departmentId;

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
