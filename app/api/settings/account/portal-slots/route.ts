import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonErrorResponse } from "@workspace/platform/server/api";
import { getSessionUserFromAuthPayload, requireApiAccess } from "@workspace/platform/server/auth";
import {
  getUserPortalSlots,
  updateUserPortalSlots,
} from "@workspace/platform/server/user-preferences";

const portalSlotSchema = z.object({
  key: z.string().trim().min(1).nullable(),
  pinned: z.boolean().optional(),
});

const updatePortalSlotsSchema = z.object({
  slots: z.array(portalSlotSchema).max(9),
});

async function requireSessionUser(request: Request) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return { ok: false as const, response: auth.response };
  const user = await getSessionUserFromAuthPayload(auth.user);
  if (!user) return { ok: false as const, response: jsonErrorResponse("未登录", 401) };
  return { ok: true as const, user };
}

export async function GET(request: Request) {
  const auth = await requireSessionUser(request);
  if (!auth.ok) return auth.response;
  return NextResponse.json({
    slots: await getUserPortalSlots(auth.user.id, auth.user.visibleResourceKeys ?? []),
  });
}

export async function PUT(request: Request) {
  const auth = await requireSessionUser(request);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = updatePortalSlotsSchema.safeParse(body);
  if (!parsed.success) return jsonErrorResponse("参数错误", 400);

  const slots = await updateUserPortalSlots(
    auth.user.id,
    parsed.data.slots.map((slot) => ({ key: slot.key, pinned: slot.pinned ?? false })),
    auth.user.visibleResourceKeys ?? [],
  );
  return NextResponse.json({ success: true, slots });
}
