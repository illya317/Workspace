import type { SessionUser } from "@workspace/platform/types";

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

export interface AgentExecutionContext {
  requester: SessionUser;
  actor: SessionUser;
  profile: AgentProfileIdentity | null;
  runId?: string;
}

export type AgentExecutionPrincipal = AgentExecutionContext | SessionUser;
