import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonErrorResponse, routeIdParamsSchema, updateFieldBodySchema } from "@workspace/platform/server/api";
import { requireAdminApiAccess, isSuperAdmin } from "@workspace/platform/server/auth";
import {
  resetAdminUserPassword,
  updateAdminUserField,
  updateAdminUserGrant,
  type AdminUserField,
} from "@workspace/platform/server/users";

const fieldUpdateSchema = updateFieldBodySchema.extend({
  field: z.enum(["canLogin", "nickname", "username", "employeeId"]),
  value: z.unknown(),
});

const grantUpdateSchema = z.object({
  resourceKey: z.string().min(1),
  roleKey: z.string().min(1),
  value: z.boolean(),
});

const selfAllowedFields = new Set<AdminUserField>(["username"]);
const adminAllowedFields = new Set<AdminUserField>(["canLogin", "nickname", "username", "employeeId"]);

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminApiAccess(request);
  if (!auth.ok) return auth.response;
  const payload = auth.user;

  const parsedParams = routeIdParamsSchema.safeParse(await params);
  if (!parsedParams.success) return jsonErrorResponse("用户ID无效", 400);

  const targetUserId = parsedParams.data.id;
  const isSelf = payload.userId === targetUserId;
  const canAdmin = await isSuperAdmin(payload.userId);

  if (!isSelf && !canAdmin) {
    return jsonErrorResponse("无权限", 403);
  }

  const body = await request.json().catch(() => null);

  // Single field update
  if (body && typeof body === "object" && "field" in body) {
    const parsed = fieldUpdateSchema.safeParse(body);
    if (!parsed.success) return jsonErrorResponse("参数无效", 400);

    const allowed = isSelf ? selfAllowedFields : adminAllowedFields;
    if (!allowed.has(parsed.data.field)) return jsonErrorResponse("非法字段", 400);

    return NextResponse.json(
      await updateAdminUserField({
        userId: targetUserId,
        field: parsed.data.field,
        value: parsed.data.value,
      }),
    );
  }

  if (!canAdmin) {
    return jsonErrorResponse("无权限", 403);
  }

  const parsed = grantUpdateSchema.safeParse(body);
  if (!parsed.success) return jsonErrorResponse("参数无效", 400);

  const result = await updateAdminUserGrant({ userId: targetUserId, ...parsed.data });
  if (!result.success) return jsonErrorResponse(result.error, result.status);
  return NextResponse.json(result);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminApiAccess(request);
  if (!auth.ok) return auth.response;
  const payload = auth.user;

  if (!(await isSuperAdmin(payload.userId))) {
    return jsonErrorResponse("无权限", 403);
  }

  const parsedParams = routeIdParamsSchema.safeParse(await params);
  if (!parsedParams.success) return jsonErrorResponse("用户ID无效", 400);

  return NextResponse.json(await resetAdminUserPassword(parsedParams.data.id));
}
