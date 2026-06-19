/**
 * POST /api/agent — Agent 对话入口。
 * 只做认证、参数校验、调用 orchestrator、返回 DTO。
 */
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { checkPermission } from "@/lib/auth";
import { financeAgentTools } from "@workspace/finance/server/agent-tools";
import { hrAgentTools } from "@workspace/hr/server/agent-tools";
import { processMessage, type HistoryMessage } from "@workspace/platform/server/agent";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await checkPermission(user.id, "system.agent", "access"))) {
    return NextResponse.json({ error: "无权限使用智能体" }, { status: 403 });
  }

  let body: { message?: string; history?: HistoryMessage[] };
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

  // 校验 history 格式
  const history: HistoryMessage[] = [];
  if (Array.isArray(body.history)) {
    for (const h of body.history) {
      if (h && typeof h.role === "string" && typeof h.content === "string"
        && (h.role === "user" || h.role === "agent")) {
        history.push({ role: h.role, content: h.content.slice(0, 1000) });
      }
    }
  }

  try {
    const response = await processMessage(body.message.trim(), user, [...hrAgentTools, ...financeAgentTools], history);
    return NextResponse.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[agent] processMessage error:", message);
    return NextResponse.json(
      { type: "error", message: `处理请求时出错：${message}` },
      { status: 200 },
    );
  }
}
