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
  description: z.string().optional(),
  importance: z.coerce.number().optional(),
  urgency: z.coerce.number().optional(),
  status: z.string().nullable().optional(),
  ownerEmployeeId: z.coerce.number().nullable().optional(),
  startDate: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  linkedProjectId: z.coerce.number().nullable().optional(),
  linkedProjectTaskId: z.coerce.number().nullable().optional(),
  parentWorkItemId: z.coerce.number().nullable().optional(),
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
  if (targetType === "personal" || targetType === "user") {
    finalTargetId = targetIdParam ? parseInt(targetIdParam) : payload.userId;
  } else if (targetIdParam != null) {
    const targetId = parseInt(targetIdParam);
    const allowed = await canAccessTarget(payload.userId, targetType, targetId);
    if (!allowed) return NextResponse.json({ error: "无权限访问该目标" }, { status: 403 });
    finalTargetId = targetId;
  }

  const allowed = await canAccessTarget(payload.userId, targetType, finalTargetId);
  if (!allowed) return NextResponse.json({ error: "无权限访问该目标" }, { status: 403 });

  const works = await getWorkItems({ targetType: targetType === "user" ? "personal" : targetType, targetId: finalTargetId, category, includeArchived });
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
  const {
    category,
    content,
    description,
    importance,
    urgency,
    status,
    ownerEmployeeId,
    startDate,
    dueDate,
    linkedProjectId,
    linkedProjectTaskId,
    parentWorkItemId,
    participants,
    sortOrder,
    targetType,
    targetId,
    deptId,
  } = parsedBody.data;

  const finalTargetType = targetType || "department";
  const finalTargetId = finalTargetType === "personal" || finalTargetType === "user"
    ? targetId ?? payload.userId
    : targetId ?? (finalTargetType === "department" ? deptId : null) ?? payload.departmentId;

  const allowed = await canEditWorkTask(payload.userId, finalTargetType, finalTargetId);
  if (!allowed) return NextResponse.json({ error: "无权限编辑工作计划" }, { status: 403 });

  const work = await createWorkItem({
    targetType: finalTargetType === "user" ? "personal" : finalTargetType,
    targetId: finalTargetId,
    category,
    content,
    description,
    importance,
    urgency,
    status,
    ownerEmployeeId,
    startDate,
    dueDate,
    linkedProjectId,
    linkedProjectTaskId,
    parentWorkItemId,
    participants: parseParticipants(participants),
    sortOrder,
  });
  if (!work.ok) return NextResponse.json({ error: work.error }, { status: work.status || 400 });
  return NextResponse.json({ work: work.data });
}
