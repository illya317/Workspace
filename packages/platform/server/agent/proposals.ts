/** Agent proposal lifecycle: create -> requester confirms -> live dual authorization -> execute. */
import { randomUUID } from "node:crypto";
import { prisma } from "@workspace/platform/server/prisma";
import type { SessionUser } from "@workspace/platform/types";

import { resolveAgentToolAccess } from "./capabilities";
import type { AgentExecutionContext } from "./execution";
import {
  AgentExecutionError,
  resolveStoredAgentExecutionContext,
} from "./execution-context";
import {
  AGENT_PROPOSAL_TTL_MS,
  createAgentProposalView,
  type AgentProposalView,
} from "./proposal-view";
import type { AgentTool, AgentToolPermissionRequirement } from "./tools";
import {
  agentProposalFailureResult,
  reconcileStaleAgentProposalExecutions,
  serializeAgentProposalExecutionResult,
  STALE_PROPOSAL_EXECUTION_MESSAGE,
} from "./proposal-execution-lease";

export interface ProposalInput {
  actionKey: string;
  toolKey: string;
  targetType: string;
  targetId?: string;
  payload: Record<string, unknown>;
  diff: Record<string, unknown>;
}

export interface ProposalResult {
  proposalId: number;
  status: string;
  message: string;
  result?: unknown;
}

export interface ProposalExecutor {
  toolKey: string;
  requiredPermissions: readonly AgentToolPermissionRequirement[];
  delegatedExecution?: boolean;
  requiresAgentProfile?: boolean;
  /** True when an exception can happen after an external side effect was accepted. */
  failureMayHaveSideEffects?: boolean;
  /** External effects stay known-safe until the executor explicitly reports its first dispatch. */
  uncertainFailureBoundary?: "executor_start" | "external_dispatch";
  execute: (
    payload: Record<string, unknown>,
    execution: AgentExecutionContext,
    control: ProposalExecutorControl,
  ) => Promise<unknown>;
}

export interface ProposalExecutorControl {
  markExternalDispatchStarted(): void;
}

export type ProposalExecutors = Record<string, ProposalExecutor>;

export class AgentProposalActionError extends Error {
  constructor(
    message: string,
    readonly status: 403 | 404 | 409 | 410,
  ) {
    super(message);
    this.name = "AgentProposalActionError";
  }
}

export function agentProposalActionErrorStatus(error: unknown) {
  return error instanceof AgentProposalActionError ? error.status : 500;
}

const FINALIZE_ATTEMPTS = 3;

async function finalizeClaimedProposal(
  proposalId: number,
  executionToken: string,
  data: {
    status: "confirmed" | "failed";
    resultJson: string;
    confirmedAt?: Date;
  },
) {
  let lastError: unknown;
  for (let attempt = 0; attempt < FINALIZE_ATTEMPTS; attempt += 1) {
    try {
      const finalized = await prisma.agentProposal.updateMany({
        where: { id: proposalId, status: "executing", executionToken },
        data,
      });
      if (finalized.count === 1) return;
      const current = await prisma.agentProposal.findUnique({
        where: { id: proposalId },
        select: { status: true, executionToken: true, resultJson: true },
      });
      if (
        current?.status === data.status
        && current.executionToken === executionToken
        && current.resultJson === data.resultJson
      ) return;
      throw new Error("Agent proposal execution claim was lost");
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(
    `执行结果无法写入审计记录；提案保持执行中并禁止自动重试：${String(lastError)}`,
  );
}

/** Read the requester's safe proposal view; execution payload and result stay server-side. */
export async function getAgentProposalForUser(
  proposalId: number,
  user: SessionUser,
): Promise<AgentProposalView | null> {
  const proposal = await prisma.agentProposal.findFirst({
    where: { id: proposalId, userId: user.id },
    select: {
      id: true,
      status: true,
      actionKey: true,
      targetType: true,
      targetId: true,
      diffJson: true,
      createdAt: true,
      confirmedAt: true,
    },
  });
  return proposal ? createAgentProposalView(proposal) : null;
}

/** Create an immutable requester/actor-bound proposal without performing the write. */
export async function createProposal(
  execution: AgentExecutionContext,
  input: ProposalInput,
): Promise<ProposalResult> {
  const proposal = await prisma.agentProposal.create({
    data: {
      userId: execution.requester.id,
      actorUserId: execution.actor.id,
      agentProfileId: execution.profile?.id ?? null,
      status: "pending",
      actionKey: input.actionKey,
      toolKey: input.toolKey,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      payloadJson: JSON.stringify(input.payload),
      diffJson: JSON.stringify(input.diff),
    },
  });

  return {
    proposalId: proposal.id,
    status: "pending",
    message: `变更已记录（#${proposal.id}），请确认后执行`,
  };
}

function executorAsTool(executor: ProposalExecutor): AgentTool {
  return {
    key: executor.toolKey,
    label: executor.toolKey,
    description: "Agent proposal confirmation authorization",
    requiredPermissions: executor.requiredPermissions,
    delegatedExecution: executor.delegatedExecution,
    requiresAgentProfile: executor.requiresAgentProfile,
    mutates: true,
    execute: async () => ({ type: "error", message: "proposal authorization sentinel" }),
  };
}

export async function confirmProposalAction(
  proposalId: number,
  requester: SessionUser,
  executors: ProposalExecutors,
): Promise<ProposalResult> {
  const proposal = await prisma.agentProposal.findFirst({
    where: { id: proposalId, userId: requester.id },
  });
  if (!proposal) throw new AgentProposalActionError("变更记录不存在", 404);
  if (proposal.status === "executing") {
    const reconciled = await reconcileStaleAgentProposalExecutions({ proposalId });
    if (reconciled.count === 1) {
      throw new AgentProposalActionError(STALE_PROPOSAL_EXECUTION_MESSAGE, 409);
    }
    throw new AgentProposalActionError("变更正在执行，无法重复确认", 409);
  }
  if (proposal.status === "expired") {
    throw new AgentProposalActionError("变更已过期（超过30分钟），请重新发起", 410);
  }
  if (proposal.status !== "pending") {
    throw new AgentProposalActionError("变更已处理，无法重复确认", 409);
  }

  const executor = executors[proposal.actionKey];
  if (!executor) throw new Error(`未知 actionKey: ${proposal.actionKey}`);
  if (proposal.toolKey && proposal.toolKey !== executor.toolKey) {
    throw new Error("变更记录的工具身份不一致");
  }

  const age = Date.now() - new Date(proposal.createdAt).getTime();
  if (age > AGENT_PROPOSAL_TTL_MS) {
    await prisma.agentProposal.updateMany({
      where: { id: proposalId, status: "pending" },
      data: { status: "expired" },
    });
    throw new AgentProposalActionError("变更已过期（超过30分钟），请重新发起", 410);
  }

  let execution: AgentExecutionContext;
  try {
    execution = await resolveStoredAgentExecutionContext(
      requester,
      proposal.actorUserId ?? proposal.userId,
      proposal.agentProfileId,
    );
  } catch (error) {
    if (error instanceof AgentExecutionError) {
      throw new AgentProposalActionError(error.message, 409);
    }
    throw error;
  }
  const access = await resolveAgentToolAccess(execution, [executorAsTool(executor)]);
  if (access.tools.length !== 1) {
    throw new AgentProposalActionError("请求人或虚拟员工的执行权限已失效", 403);
  }

  const executionToken = randomUUID();
  const claimed = await prisma.agentProposal.updateMany({
    where: { id: proposalId, userId: requester.id, status: "pending" },
    data: {
      status: "executing",
      executionToken,
      executionStartedAt: new Date(),
    },
  });
  if (claimed.count !== 1) {
    throw new AgentProposalActionError("变更已被处理，无法重复确认", 409);
  }

  let result: unknown;
  let sideEffectStarted = false;
  let serializedResult: string;
  try {
    const payload = JSON.parse(proposal.payloadJson) as Record<string, unknown>;
    sideEffectStarted = executor.failureMayHaveSideEffects === true
      && executor.uncertainFailureBoundary !== "external_dispatch";
    result = await executor.execute(payload, access.execution ?? execution, {
      markExternalDispatchStarted() {
        if (executor.failureMayHaveSideEffects === true) sideEffectStarted = true;
      },
    });
    serializedResult = serializeAgentProposalExecutionResult(result);
  } catch (error) {
    await finalizeClaimedProposal(proposalId, executionToken, {
      status: "failed",
      resultJson: JSON.stringify(agentProposalFailureResult(
        error,
        sideEffectStarted && executor.failureMayHaveSideEffects === true,
      )),
    });
    throw error;
  }
  await finalizeClaimedProposal(proposalId, executionToken, {
    status: "confirmed",
    resultJson: serializedResult,
    confirmedAt: new Date(),
  });
  return { proposalId, status: "confirmed", message: "变更已执行", result };
}

export async function cancelProposal(
  proposalId: number,
  user: SessionUser,
): Promise<ProposalResult> {
  const proposal = await prisma.agentProposal.findFirst({
    where: { id: proposalId, userId: user.id },
    select: { status: true, createdAt: true },
  });
  if (!proposal) throw new AgentProposalActionError("变更记录不存在", 404);
  if (proposal.status === "expired") {
    throw new AgentProposalActionError("变更已过期（超过30分钟），无法取消", 410);
  }
  if (proposal.status !== "pending") {
    throw new AgentProposalActionError("只能取消待确认的变更", 409);
  }

  const age = Date.now() - new Date(proposal.createdAt).getTime();
  if (age > AGENT_PROPOSAL_TTL_MS) {
    await prisma.agentProposal.updateMany({
      where: { id: proposalId, userId: user.id, status: "pending" },
      data: { status: "expired" },
    });
    throw new AgentProposalActionError("变更已过期（超过30分钟），无法取消", 410);
  }

  const cancelled = await prisma.agentProposal.updateMany({
    where: { id: proposalId, userId: user.id, status: "pending" },
    data: { status: "cancelled" },
  });
  if (cancelled.count !== 1) {
    throw new AgentProposalActionError("只能取消待确认的变更", 409);
  }
  return { proposalId, status: "cancelled", message: "变更已取消" };
}
