export const AGENT_PROPOSAL_TTL_MS = 30 * 60 * 1000;

export interface AgentProposalView {
  id: number;
  status: string;
  actionKey: string;
  targetType: string;
  targetId: string | null;
  diff: Record<string, unknown>;
  createdAt: string;
  expiresAt: string;
  confirmedAt: string | null;
}

export interface AgentProposalViewRecord {
  id: number;
  status: string;
  actionKey: string;
  targetType: string;
  targetId: string | null;
  diffJson: string | null;
  createdAt: Date;
  confirmedAt: Date | null;
}

function parseDiff(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

export function createAgentProposalView(
  proposal: AgentProposalViewRecord,
  now = Date.now(),
): AgentProposalView {
  const expiresAt = proposal.createdAt.getTime() + AGENT_PROPOSAL_TTL_MS;
  return {
    id: proposal.id,
    status: proposal.status === "pending" && now > expiresAt ? "expired" : proposal.status,
    actionKey: proposal.actionKey,
    targetType: proposal.targetType,
    targetId: proposal.targetId,
    diff: parseDiff(proposal.diffJson),
    createdAt: proposal.createdAt.toISOString(),
    expiresAt: new Date(expiresAt).toISOString(),
    confirmedAt: proposal.confirmedAt?.toISOString() ?? null,
  };
}
