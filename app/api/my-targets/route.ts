import { NextResponse } from "next/server";
import { authenticate } from "@/lib/auth";
import { getUserTargets } from "@/lib/access";

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const targets = await getUserTargets(payload.userId);
  return NextResponse.json(targets);
}
