import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAccess } from "@workspace/platform/server/auth";
import { clearReadUserNotifications, listUserNotifications, markAllUserNotificationsRead } from "@workspace/platform/server/notifications";
import { jsonErrorResponse } from "@workspace/platform/server/api";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).catch(5),
  offset: z.coerce.number().int().min(0).catch(0),
}).passthrough();
const bodySchema = z.object({
  action: z.literal("markAllRead"),
});

export async function GET(request: Request) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(searchParams.entries()));
  if (!parsed.success) return jsonErrorResponse("参数错误", 400);
  return NextResponse.json(await listUserNotifications(auth.user.userId, parsed.data.limit, parsed.data.offset));
}

export async function DELETE(request: Request) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  return NextResponse.json(await clearReadUserNotifications(auth.user.userId));
}

export async function PATCH(request: Request) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return jsonErrorResponse("参数错误", 400);
  return NextResponse.json(await markAllUserNotificationsRead(auth.user.userId));
}
