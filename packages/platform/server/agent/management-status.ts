import type { AgentReportStatus } from "@workspace/platform/types";

import { AGENT_PROPOSAL_TTL_MS } from "./proposal-view";

export type AgentReportRunState = {
  status: string;
  resultType: string | null;
};

export type AgentReportProposalState = {
  status: string;
  createdAt: Date;
};

export function effectiveAgentProposalStatus(
  proposal: AgentReportProposalState,
  now = Date.now(),
) {
  if (
    proposal.status === "pending"
    && now > proposal.createdAt.getTime() + AGENT_PROPOSAL_TTL_MS
  ) {
    return "expired";
  }
  return proposal.status;
}

export function deriveAgentReportStatus(
  run: AgentReportRunState,
  proposal?: AgentReportProposalState | null,
  now = Date.now(),
): AgentReportStatus {
  if (run.status === "running") return "running";
  if (run.status === "aborted") return "aborted";
  if (run.status === "failed" || run.resultType === "error") return "failed";

  if (run.resultType === "proposal") {
    if (!proposal) return "awaiting_confirmation";
    const proposalStatus = effectiveAgentProposalStatus(proposal, now);
    if (proposalStatus === "executing") return "running";
    if (proposalStatus === "confirmed") return "completed";
    if (proposalStatus === "cancelled") return "aborted";
    if (proposalStatus === "failed" || proposalStatus === "expired") return "failed";
    return "awaiting_confirmation";
  }

  if (run.resultType === "clarification") return "awaiting_input";
  return "completed";
}

/** Active work in the session must not be hidden by a later informational turn. */
export function mergeAgentSessionReportStatus(
  latestStatus: AgentReportStatus,
  activeProposalStatus?: "pending" | "executing" | null,
): AgentReportStatus {
  if (latestStatus === "running" || activeProposalStatus === "executing") return "running";
  if (activeProposalStatus === "pending") return "awaiting_confirmation";
  return latestStatus;
}
