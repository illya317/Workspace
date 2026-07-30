import type { SessionUser } from "@workspace/platform/types";

/** HR-backed virtual employee plus the Workspace runtime authorized for this turn. */
export interface AgentProfileIdentity {
  id: number;
  key: string;
  displayName: string;
  roleName: string;
  responsibilities: string;
  allowedToolKeys: string[];
  runtime: {
    bindingId: number;
    kind: "workspace";
    instructions: string;
  };
  actorEmployeeId: string;
  actorEmployeeName: string;
}

/**
 * One Agent turn always preserves both identities.
 * The requester owns the session and confirmation; the actor performs audited work.
 */
export interface AgentExecutionContext {
  requester: SessionUser;
  actor: SessionUser;
  profile: AgentProfileIdentity | null;
  runId?: string;
}

export type AgentExecutionPrincipal = AgentExecutionContext | SessionUser;

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
