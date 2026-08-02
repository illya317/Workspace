import "server-only";

import type { SessionUser } from "@workspace/platform/types";

import {
  parseWecomAgentBridgeRequest,
  type WecomAgentBridgeInput,
} from "./wecom-bridge-input";
import { resolveWecomAgentUser } from "./wecom-user-resolver";

export {
  buildWecomAgentBridgeSignature,
  isWecomAgentBridgeRequestAuthorized,
} from "@workspace/platform/server/wecom-agent-bridge-auth";

export * from "./wecom-bridge-input";
export * from "./wecom-user-resolver";

export type WecomAgentBridgeHandler = (
  request: Request,
  input: WecomAgentBridgeInput,
  user: SessionUser,
) => Promise<Response>;

export function withWecomAgentBridgeAccess(handler: WecomAgentBridgeHandler) {
  return async (request: Request) => {
    const parsed = await parseWecomAgentBridgeRequest(request);
    if (!parsed.ok) return parsed.response;
    const resolved = await resolveWecomAgentUser(parsed.input.userId);
    if (!resolved.ok) return resolved.response;
    return handler(request, parsed.input, resolved.user);
  };
}
