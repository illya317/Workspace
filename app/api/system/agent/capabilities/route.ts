/**
 * GET /api/system/agent/capabilities — 返回当前用户可用的能力清单。
 * 前端用于动态生成提示词，无权限的工具不会出现。
 */
import { NextResponse } from "next/server";
import { getCurrentUser } from "@workspace/platform/server/auth";
import { authorize } from "@workspace/platform/server/auth";
import { financeAgentTools } from "@workspace/finance/server/agent-tools";
import { hrAgentTools } from "@workspace/hr/server/agent-tools";
import { buildCapabilities } from "@workspace/platform/server/agent";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await authorize({ user: user.id, resourceKey: "system.agent", action: "access" }))) {
    return NextResponse.json({ error: "无权限使用智能体" }, { status: 403 });
  }

  const capabilities = buildCapabilities(user, [...hrAgentTools, ...financeAgentTools]);
  return NextResponse.json({ capabilities });
}
