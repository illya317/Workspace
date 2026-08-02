import type { SessionUser } from "@workspace/platform/types";
import type { AgentExecutionContext, AgentExecutionPrincipal } from "./execution-contract";

export type {
  AgentExecutionContext,
  AgentExecutionPrincipal,
  AgentProfileIdentity,
} from "./execution-contract";

export function createHumanAgentExecutionContext(user: SessionUser): AgentExecutionContext {
  return { requester: user, actor: user, profile: null };
}

export function normalizeAgentExecutionContext(
  principal: AgentExecutionPrincipal,
): AgentExecutionContext {
  return "requester" in principal
    ? principal
    : createHumanAgentExecutionContext(principal);
}
