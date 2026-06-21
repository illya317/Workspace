/**
 * GET /api/agent/capabilities — 返回当前用户可用的能力清单。
 * 前端用于动态生成提示词，无权限的工具不会出现。
 */
import { NextResponse } from "next/server";
import { getSessionUserFromAuthPayload, requireApiAccess } from "@workspace/platform/server/auth";
import { financeAgentTools } from "@workspace/finance/server/agent-tools";
import { hrAgentTools } from "@workspace/hr/server/agent-tools";
import { buildCapabilities } from "@workspace/platform/server/agent";

export async function GET(request: Request) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;

  const user = await getSessionUserFromAuthPayload(auth.user);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const capabilities = buildCapabilities(user, [...hrAgentTools, ...financeAgentTools]);
  return NextResponse.json({ capabilities });
}
