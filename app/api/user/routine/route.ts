import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate } from "@workspace/platform/server/auth";
import {
  getUserRoutineItems,
  updateUserRoutineItems,
} from "@workspace/platform/server/user-preferences";

const routineItemSchema = z.object({
  plan: z.string(),
  nextGoal: z.string().optional(),
});

const updateRoutineSchema = z.object({
  routineItems: z.array(routineItemSchema),
});

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const routineItems = await getUserRoutineItems(payload.userId);
  return NextResponse.json({ routineItems });
}

export async function PUT(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateRoutineSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "参数错误" }, { status: 400 });
  }

  await updateUserRoutineItems(payload.userId, parsed.data.routineItems);
  return NextResponse.json({ success: true });
}
