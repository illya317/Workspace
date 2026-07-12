import { financeAgentTools } from "@workspace/finance/server/agent-tools";
import { hrAgentTools } from "@workspace/hr/server/agent-tools";
import { libraryAgentTools } from "@workspace/library/server/agent-tools";
import {
  handleParsedAgentMessageRequest,
  sourceCodeAgentTools,
  toParsedAgentRequest,
  wecomGroupConversationTool,
} from "@workspace/platform/server/agent";
import { withWecomAgentBridgeAccess } from "@workspace/platform/server/with-auth";

export const runtime = "nodejs";

export const POST = withWecomAgentBridgeAccess(async (request, input, user) => {
  const tools = input.chatType === "group"
    ? [wecomGroupConversationTool]
    : [...sourceCodeAgentTools, ...hrAgentTools, ...financeAgentTools, ...libraryAgentTools];
  return handleParsedAgentMessageRequest(
    toParsedAgentRequest(input),
    user,
    tools,
    request.signal,
  );
});
