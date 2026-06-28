import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAccess } from "@workspace/platform/server/auth";
import {
  listWorkSpacePermissions,
  normalizeWorkTargetType,
  updateWorkSpacePermissions,
} from "@workspace/work/server";
import { jsonErrorResponse } from "@workspace/platform/server/api";

const paramsSchema = z.object({
  targetType: z.string().min(1),
  targetId: z.coerce.number().int().positive(),
});

const permissionSchema = z.object({
  permissions: z.array(z.object({
    userId: z.coerce.number().int().positive(),
    role: z.enum(["viewer", "editor", "delete", "manager"]),
    kind: z.literal("task").optional(),
  })),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ targetType: string; targetId: string }> },
) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;

  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) return jsonErrorResponse("工作空间参数无效", 400);

  const result = await listWorkSpacePermissions({
    userId: auth.user.userId,
    targetType: normalizeWorkTargetType(parsed.data.targetType),
    targetId: parsed.data.targetId,
  });
  if (!result.ok) return jsonErrorResponse(result.error, result.status || 400);
  return NextResponse.json(result.data);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ targetType: string; targetId: string }> },
) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;

  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) return jsonErrorResponse("工作空间参数无效", 400);

  const body = permissionSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return jsonErrorResponse("权限参数无效", 400);

  const result = await updateWorkSpacePermissions({
    actorUserId: auth.user.userId,
    targetType: normalizeWorkTargetType(parsed.data.targetType),
    targetId: parsed.data.targetId,
    permissions: body.data.permissions,
  });
  if (!result.ok) return jsonErrorResponse(result.error, result.status || 400);
  return NextResponse.json(result.data);
}
