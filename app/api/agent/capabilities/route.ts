/**
 * GET /api/agent/capabilities — 返回当前用户可用的能力清单。
 * 前端用于动态生成提示词，无权限的工具不会出现。
 */
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { buildCapabilities } from "@/server/services/agent/capabilities";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const capabilities = buildCapabilities(user);
  return NextResponse.json({ capabilities });
}
