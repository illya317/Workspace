import {
  agentBusinessApiTools,
  handleParsedAgentMessageStreamRequest,
  toParsedAgentRequest,
  withWecomAgentBridgeAccess,
} from "@workspace/agent/server";
import { observeWecomManagedGroup } from "@workspace/platform/server/wecom-group-notifications";

export const runtime = "nodejs";
export const maxDuration = 900;

export const POST = withWecomAgentBridgeAccess(async (request, input, user) => {
  if (input.chatType === "group" && input.chatId) {
    await observeWecomManagedGroup(input.chatId);
  }
  return handleParsedAgentMessageStreamRequest(
    toParsedAgentRequest(input),
    user,
    input.chatType === "group" ? [] : agentBusinessApiTools,
    request.signal,
  );
});
