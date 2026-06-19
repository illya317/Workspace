import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, authorize } from "@workspace/platform/server/auth";
import {
  resetAdminUserPassword,
  updateAdminUserField,
  updateAdminUserGrant,
  type AdminUserField,
} from "@workspace/platform/server/users";

const paramsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const fieldUpdateSchema = z.object({
  field: z.enum(["canLogin", "name", "username", "employeeId"]),
  value: z.unknown(),
});

const grantUpdateSchema = z.object({
  resourceKey: z.string().min(1),
  roleKey: z.string().min(1),
  value: z.boolean(),
});

const selfAllowedFields = new Set<AdminUserField>(["username"]);
const adminAllowedFields = new Set<AdminUserField>(["canLogin", "name", "username", "employeeId"]);

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) return NextResponse.json({ error: "用户ID无效" }, { status: 400 });

  const targetUserId = parsedParams.data.id;
  const isSelf = payload.userId === targetUserId;
  const canAdmin = await authorize({ user: payload.userId, resourceKey: "system", action: "admin" });

  if (!isSelf && !canAdmin) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);

  // Single field update
  if (body && typeof body === "object" && "field" in body) {
    const parsed = fieldUpdateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "参数无效" }, { status: 400 });

    const allowed = isSelf ? selfAllowedFields : adminAllowedFields;
    if (!allowed.has(parsed.data.field)) return NextResponse.json({ error: "非法字段" }, { status: 400 });

    return NextResponse.json(
      await updateAdminUserField({
        userId: targetUserId,
        field: parsed.data.field,
        value: parsed.data.value,
      }),
    );
  }

  if (!canAdmin) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const parsed = grantUpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "参数无效" }, { status: 400 });

  const result = await updateAdminUserGrant({ userId: targetUserId, ...parsed.data });
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  if (!(await authorize({ user: payload.userId, resourceKey: "system", action: "admin" }))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) return NextResponse.json({ error: "用户ID无效" }, { status: 400 });

  return NextResponse.json(await resetAdminUserPassword(parsedParams.data.id));
}
