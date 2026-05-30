/**
 * POST /api/agent — Agent 对话入口。
 * 只做认证、参数校验、调用 orchestrator、返回 DTO。
 */
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { processMessage } from "@/server/services/agent/orchestrator";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { message?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.message || typeof body.message !== "string") {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  if (body.message.length > 2000) {
    return NextResponse.json({ error: "message too long (max 2000)" }, { status: 400 });
  }

  const response = await processMessage(body.message.trim(), user);

  return NextResponse.json(response);
}
