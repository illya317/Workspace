import "server-only";

import { prisma } from "../prisma";
import { effectiveAgentProposalStatus } from "./management-status";

async function loadProposalStatusById(proposalIds: Array<number | null>) {
  const ids = [...new Set(proposalIds.filter((id): id is number => id != null))];
  if (ids.length === 0) return new Map<number, { status: string; createdAt: Date }>();
  const proposals = await prisma.agentProposal.findMany({
    where: { id: { in: ids } },
    select: { id: true, status: true, createdAt: true },
  });
  return new Map(proposals.map((proposal) => [proposal.id, proposal]));
}

export async function loadSessionProposalStates(input: {
  sessionIds: string[];
  latestProposalIds: Array<number | null>;
  fromDate: Date;
  now: Date;
}) {
  const links = input.sessionIds.length > 0
    ? await prisma.agentRun.findMany({
        where: {
          sessionId: { in: input.sessionIds },
          proposalId: { not: null },
          startedAt: { gte: input.fromDate, lte: input.now },
        },
        distinct: ["sessionId", "proposalId"],
        select: { sessionId: true, proposalId: true },
      })
    : [];
  const proposalStatusById = await loadProposalStatusById([
    ...input.latestProposalIds,
    ...links.map((link) => link.proposalId),
  ]);
  const activeProposalStatusBySession = new Map<string, "pending" | "executing">();
  for (const link of links) {
    if (link.proposalId == null) continue;
    const proposal = proposalStatusById.get(link.proposalId);
    if (!proposal) continue;
    const status = effectiveAgentProposalStatus(proposal, input.now.getTime());
    if (status === "executing") {
      activeProposalStatusBySession.set(link.sessionId, "executing");
    } else if (status === "pending" && !activeProposalStatusBySession.has(link.sessionId)) {
      activeProposalStatusBySession.set(link.sessionId, "pending");
    }
  }
  return { proposalStatusById, activeProposalStatusBySession };
}
