/**
 * POST /api/agent — Agent 对话入口。
 * 只做认证、参数校验、调用 orchestrator、返回 DTO。
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserFromAuthPayload, requireApiAccess } from "@workspace/platform/server/auth";
import { financeAgentTools } from "@workspace/finance/server/agent-tools";
import { hrAgentTools } from "@workspace/hr/server/agent-tools";
import { processMessage, type HistoryMessage } from "@workspace/platform/server/agent";

const agentMessageSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  history: z.array(z.object({
    role: z.enum(["user", "agent"]),
    content: z.string(),
  })).optional(),
});

export async function POST(request: Request) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;

  const user = await getSessionUserFromAuthPayload(auth.user);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: z.infer<typeof agentMessageSchema>;
  try {
    const parsedBody = agentMessageSchema.safeParse(await request.json());
    if (!parsedBody.success) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }
    body = parsedBody.data;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const history: HistoryMessage[] = [];
  if (Array.isArray(body.history)) {
    for (const h of body.history) {
      history.push({ role: h.role, content: h.content.slice(0, 1000) });
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
