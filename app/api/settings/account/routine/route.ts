import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAccess } from "@workspace/platform/server/auth";
import {
  getUserRoutineItems,
  updateUserRoutineItems,
} from "@workspace/platform/server/user-preferences";
import { jsonErrorResponse } from "@workspace/platform/server/api";

const routineItemSchema = z.object({
  plan: z.string(),
  nextGoal: z.string().optional(),
});

const updateRoutineSchema = z.object({
  routineItems: z.array(routineItemSchema),
});

export async function GET(request: Request) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  const payload = auth.user;

  const routineItems = await getUserRoutineItems(payload.userId);
  return NextResponse.json({ routineItems });
}

export async function PUT(request: Request) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;
  const payload = auth.user;

  const body = await request.json().catch(() => null);
  const parsed = updateRoutineSchema.safeParse(body);
  if (!parsed.success) {
    return jsonErrorResponse("参数错误", 400);
  }

  await updateUserRoutineItems(payload.userId, parsed.data.routineItems);
  return NextResponse.json({ success: true });
}
