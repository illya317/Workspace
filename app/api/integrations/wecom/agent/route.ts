import {
  agentBusinessApiTools,
  handleParsedAgentMessageStreamRequest,
  toParsedAgentRequest,
  withWecomAgentBridgeAccess,
} from "@workspace/agent/server";

export const runtime = "nodejs";
export const maxDuration = 900;

export const POST = withWecomAgentBridgeAccess(async (request, input, user) => {
  return handleParsedAgentMessageStreamRequest(
    toParsedAgentRequest(input),
    user,
    input.chatType === "group" ? [] : agentBusinessApiTools,
    request.signal,
  );
});
