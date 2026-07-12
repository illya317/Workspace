/**
 * POST /api/agent — Agent 对话入口。
 * 只做认证、用户解析、调用 Platform agent handler。
 */
import { financeAgentTools } from "@workspace/finance/server/agent-tools";
import { hrAgentTools } from "@workspace/hr/server/agent-tools";
import { libraryAgentTools } from "@workspace/library/server/agent-tools";
import { getSessionUserFromAuthPayload, requireApiAccess } from "@workspace/platform/server/auth";
import { handleParsedAgentMessageRequest, parseAgentRequest, sourceCodeAgentTools } from "@workspace/platform/server/agent";
import { jsonErrorResponse } from "@workspace/platform/server/api";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;

  const user = await getSessionUserFromAuthPayload(auth.user);
  if (!user) return jsonErrorResponse("Unauthorized", 401);

  const parsed = await parseAgentRequest(request);
  if (!parsed.ok) return parsed.response;

  return handleParsedAgentMessageRequest(parsed, user, [...sourceCodeAgentTools, ...hrAgentTools, ...financeAgentTools, ...libraryAgentTools], request.signal);
}
