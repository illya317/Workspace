import { NextResponse } from "next/server";
import { authenticate } from "@/lib/auth";
import { getUserTargets } from "@workspace/platform/server/user-targets";
import { z } from "zod";

const myTargetsQuerySchema = z.object({}).passthrough();

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  myTargetsQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams.entries()));

  const targets = await getUserTargets(payload.userId);
  return NextResponse.json(targets);
}
