/**
 * POST /api/agent — Agent 对话入口。
 * 只做认证、用户解析、调用 Platform agent handler。
 */
import { financeAgentTools } from "@workspace/finance/server/agent-tools";
import { hrAgentTools } from "@workspace/hr/server/agent-tools";
import { libraryAgentTools } from "@workspace/library/server/agent-tools";
import { workAgentTools } from "@workspace/work/server/agent-tools";
import { getSessionUserFromAuthPayload, requireApiAccess } from "@workspace/platform/server/auth";
import { handleParsedAgentMessageStreamRequest, parseAgentRequest, sourceCodeAgentTools } from "@workspace/platform/server/agent";
import { jsonErrorResponse } from "@workspace/platform/server/api";
import { docsEditorAgentTools } from "@workspace/platform/server/docs-editor";

export const runtime = "nodejs";
export const maxDuration = 900;

export async function POST(request: Request) {
  const auth = await requireApiAccess(request);
  if (!auth.ok) return auth.response;

  const user = await getSessionUserFromAuthPayload(auth.user);
  if (!user) return jsonErrorResponse("Unauthorized", 401);

  const parsed = await parseAgentRequest(request);
  if (!parsed.ok) return parsed.response;

  return handleParsedAgentMessageStreamRequest(
    parsed,
    user,
    [...sourceCodeAgentTools, ...workAgentTools, ...hrAgentTools, ...financeAgentTools, ...libraryAgentTools, ...docsEditorAgentTools],
    request.signal,
  );
}
