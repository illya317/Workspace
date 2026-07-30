import "server-only";

import { prisma } from "@workspace/platform/server/prisma";

/**
 * A confirmation may call an external system. An abandoned claim is never
 * retried automatically because the external outcome cannot be inferred from
 * the local transaction alone.
 */
export const AGENT_PROPOSAL_EXECUTION_LEASE_MS = 30 * 60 * 1000;

export const STALE_PROPOSAL_EXECUTION_MESSAGE =
  "上次执行已超出审计租约，本地无法确认外部结果；已停止自动重试，请人工核对后重新发起。";

export function isAgentProposalExecutionStale(
  executionStartedAt: Date | null,
  now = Date.now(),
) {
  return executionStartedAt == null
    || now - executionStartedAt.getTime() > AGENT_PROPOSAL_EXECUTION_LEASE_MS;
}

export function agentProposalFailureResult(error: unknown, outcomeUnknown: boolean) {
  return {
    error: error instanceof Error ? error.message : String(error),
    outcomeUnknown,
    requiresManualReconciliation: outcomeUnknown,
  };
}

export function serializeAgentProposalExecutionResult(result: unknown) {
  const serialized = JSON.stringify(result);
  if (serialized === undefined) {
    throw new Error("执行器返回了不可审计的 undefined 结果");
  }
  return serialized;
}

export async function reconcileStaleAgentProposalExecutions(input: {
  requesterUserId?: number;
  proposalId?: number;
  now?: Date;
} = {}) {
  const now = input.now ?? new Date();
  const cutoff = new Date(now.getTime() - AGENT_PROPOSAL_EXECUTION_LEASE_MS);
  return prisma.agentProposal.updateMany({
    where: {
      status: "executing",
      ...(input.requesterUserId == null ? {} : { userId: input.requesterUserId }),
      ...(input.proposalId == null ? {} : { id: input.proposalId }),
      OR: [
        { executionStartedAt: null },
        { executionStartedAt: { lt: cutoff } },
      ],
    },
    data: {
      status: "failed",
      resultJson: JSON.stringify(agentProposalFailureResult(
        STALE_PROPOSAL_EXECUTION_MESSAGE,
        true,
      )),
    },
  });
}
