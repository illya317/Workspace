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
import {
  appendAgentSessionMessageForUser,
  type AgentStoredProposalStatus,
} from "./sessions";

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
  policyActions?: AgentTool["policyActions"];
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

type ProposalSettlementRecord = {
  id: number;
  sessionId: string | null;
  actionKey: string;
  targetType: string;
  targetId: string | null;
  diffJson: string | null;
  createdAt: Date;
  confirmedAt: Date | null;
};

function storedProposalStatus(status: string): AgentStoredProposalStatus {
  if (
    status === "pending"
    || status === "executing"
    || status === "confirmed"
    || status === "cancelled"
    || status === "failed"
    || status === "expired"
  ) return status;
  return "failed";
}

function isTerminalProposalStatus(
  status: AgentStoredProposalStatus | null,
): status is Extract<AgentStoredProposalStatus, "confirmed" | "cancelled" | "failed" | "expired"> {
  return status === "confirmed" || status === "cancelled" || status === "failed" || status === "expired";
}

async function readAuthoritativeProposalStatus(
  proposalId: number,
  requester: SessionUser,
): Promise<AgentStoredProposalStatus | null> {
  try {
    const current = await prisma.agentProposal.findFirst({
      where: { id: proposalId, userId: requester.id },
      select: { status: true },
    });
    return current ? storedProposalStatus(current.status) : null;
  } catch (error) {
    // A failed recovery read must not replace the original CAS conflict or append stale state.
    console.error("Agent proposal status could not be refreshed after a lost race", error);
    return null;
  }
}

function confirmConflict(status: AgentStoredProposalStatus | null) {
  if (status === "expired") {
    return new AgentProposalActionError("变更已过期（超过30分钟），请重新发起", 410);
  }
  if (status === "executing") {
    return new AgentProposalActionError("变更正在执行，无法重复确认", 409);
  }
  return new AgentProposalActionError("变更已被处理，无法重复确认", 409);
}

function cancelConflict(status: AgentStoredProposalStatus | null) {
  if (status === "expired") {
    return new AgentProposalActionError("变更已过期（超过30分钟），无法取消", 410);
  }
  return new AgentProposalActionError("只能取消待确认的变更", 409);
}

function proposalSettlementMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : "提案处理失败";
}

function confirmedProposalMessage(result: unknown) {
  if (typeof result !== "object" || result === null || Array.isArray(result)) return "变更已执行";
  const executionMode = (result as { executionMode?: unknown }).executionMode;
  if (executionMode === "direct") return "已保存";
  if (executionMode === "workflow") return "已提交审批";
  return "变更已执行";
}

async function persistProposalSettlement(
  proposal: ProposalSettlementRecord,
  requester: SessionUser,
  input: {
    status: AgentStoredProposalStatus;
    message: string;
    responseType: "answer" | "error";
  },
) {
  if (!proposal.sessionId) return;
  try {
    const view = createAgentProposalView({
      id: proposal.id,
      status: input.status,
      actionKey: proposal.actionKey,
      targetType: proposal.targetType,
      targetId: proposal.targetId,
      diffJson: proposal.diffJson,
      createdAt: proposal.createdAt,
      confirmedAt: input.status === "confirmed" ? new Date() : proposal.confirmedAt,
    });
    await appendAgentSessionMessageForUser(proposal.sessionId, {
      role: "agent",
      content: input.message,
      responseType: input.responseType,
      proposal: {
        id: view.id,
        actionKey: view.actionKey,
        targetType: view.targetType,
        targetId: view.targetId ?? undefined,
        diff: view.diff,
      },
      proposalStatus: storedProposalStatus(view.status),
    }, requester);
  } catch (error) {
    // The proposal's database state and original executor error are authoritative.
    // Session transcript persistence is best-effort and must never replace them.
    console.error("Agent proposal settlement could not be appended to its session", error);
  }
}

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
    policyActions: executor.policyActions,
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
  let settlementStatus = storedProposalStatus(proposal.status);
  try {
    if (proposal.status === "executing") {
      const reconciled = await reconcileStaleAgentProposalExecutions({ proposalId });
      if (reconciled.count === 1) {
        settlementStatus = "failed";
        throw new AgentProposalActionError(STALE_PROPOSAL_EXECUTION_MESSAGE, 409);
      }
      const currentStatus = await readAuthoritativeProposalStatus(proposalId, requester);
      if (currentStatus) settlementStatus = currentStatus;
      throw confirmConflict(currentStatus);
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
      const expired = await prisma.agentProposal.updateMany({
        where: { id: proposalId, userId: requester.id, status: "pending" },
        data: { status: "expired" },
      });
      if (expired.count !== 1) {
        const currentStatus = await readAuthoritativeProposalStatus(proposalId, requester);
        if (currentStatus) settlementStatus = currentStatus;
        throw confirmConflict(currentStatus);
      }
      settlementStatus = "expired";
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
      const currentStatus = await readAuthoritativeProposalStatus(proposalId, requester);
      if (currentStatus) settlementStatus = currentStatus;
      throw confirmConflict(currentStatus);
    }
    settlementStatus = "executing";

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
      try {
        await finalizeClaimedProposal(proposalId, executionToken, {
          status: "failed",
          resultJson: JSON.stringify(agentProposalFailureResult(
            error,
            sideEffectStarted && executor.failureMayHaveSideEffects === true,
          )),
        });
        settlementStatus = "failed";
      } catch (finalizationError) {
        console.error("Agent proposal failure could not be finalized", finalizationError);
      }
      throw error;
    }
    await finalizeClaimedProposal(proposalId, executionToken, {
      status: "confirmed",
      resultJson: serializedResult,
      confirmedAt: new Date(),
    });
    settlementStatus = "confirmed";
    const message = confirmedProposalMessage(result);
    await persistProposalSettlement(proposal, requester, {
      status: settlementStatus,
      message,
      responseType: "answer",
    });
    return { proposalId, status: settlementStatus, message, result };
  } catch (error) {
    const currentStatus = await readAuthoritativeProposalStatus(proposalId, requester);
    if (isTerminalProposalStatus(currentStatus)) {
      await persistProposalSettlement(proposal, requester, {
        status: currentStatus,
        message: proposalSettlementMessage(error),
        responseType: "error",
      });
    }
    throw error;
  }
}

export async function cancelProposal(
  proposalId: number,
  user: SessionUser,
): Promise<ProposalResult> {
  const proposal = await prisma.agentProposal.findFirst({
    where: { id: proposalId, userId: user.id },
    select: {
      id: true,
      sessionId: true,
      status: true,
      actionKey: true,
      targetType: true,
      targetId: true,
      diffJson: true,
      createdAt: true,
      confirmedAt: true,
    },
  });
  if (!proposal) throw new AgentProposalActionError("变更记录不存在", 404);
  let settlementStatus = storedProposalStatus(proposal.status);
  try {
    if (proposal.status === "expired") {
      throw new AgentProposalActionError("变更已过期（超过30分钟），无法取消", 410);
    }
    if (proposal.status !== "pending") {
      throw new AgentProposalActionError("只能取消待确认的变更", 409);
    }

    const age = Date.now() - new Date(proposal.createdAt).getTime();
    if (age > AGENT_PROPOSAL_TTL_MS) {
      const expired = await prisma.agentProposal.updateMany({
        where: { id: proposalId, userId: user.id, status: "pending" },
        data: { status: "expired" },
      });
      if (expired.count !== 1) {
        const currentStatus = await readAuthoritativeProposalStatus(proposalId, user);
        if (currentStatus) settlementStatus = currentStatus;
        throw cancelConflict(currentStatus);
      }
      settlementStatus = "expired";
      throw new AgentProposalActionError("变更已过期（超过30分钟），无法取消", 410);
    }

    const cancelled = await prisma.agentProposal.updateMany({
      where: { id: proposalId, userId: user.id, status: "pending" },
      data: { status: "cancelled" },
    });
    if (cancelled.count !== 1) {
      const currentStatus = await readAuthoritativeProposalStatus(proposalId, user);
      if (currentStatus) settlementStatus = currentStatus;
      throw cancelConflict(currentStatus);
    }
    settlementStatus = "cancelled";
    const message = "变更已取消";
    await persistProposalSettlement(proposal, user, {
      status: settlementStatus,
      message,
      responseType: "answer",
    });
    return { proposalId, status: settlementStatus, message };
  } catch (error) {
    const currentStatus = await readAuthoritativeProposalStatus(proposalId, user);
    if (isTerminalProposalStatus(currentStatus)) {
      await persistProposalSettlement(proposal, user, {
        status: currentStatus,
        message: proposalSettlementMessage(error),
        responseType: "error",
      });
    }
    throw error;
  }
}
